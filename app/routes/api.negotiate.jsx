import db from "../db.server";

export async function loader({ request }) {
    const url = new URL(request.url);
    const shopUrl = url.searchParams.get("shop");

    if (!shopUrl) {
        return new Response(JSON.stringify({ error: "Missing shop param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    const shop = await db.shop.findUnique({ where: { shopUrl } });

    if (!shop) {
        return new Response(JSON.stringify({ error: "Shop not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({
        botWelcomeMsg: shop.botWelcomeMsg,
        botRejectMsg: shop.botRejectMsg,
        botSuccessMsg: shop.botSuccessMsg,
        widgetColor: shop.widgetColor,
        isActive: shop.isActive
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

export async function action({ request }) {
    console.log("Negotiate API: Request Received", request.method);
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
        const body = await request.json();
        const { productId, offerPrice, shopUrl } = body;

        if (!productId || !offerPrice || !shopUrl) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // 1. Verify Shop & Get Token
        const shop = await db.shop.findUnique({ where: { shopUrl } });
        if (!shop || !shop.isActive) {
            return new Response(JSON.stringify({ error: "Shop negotiation is disabled." }), { status: 403 });
        }

        // 2. Fetch Product Data (Price + Collections)
        // We require this early to check Collection Rules if needed
        const productData = await getProductData(shop.shopUrl, shop.accessToken, productId);
        if (!productData) {
            return { status: "ERROR", error: "Could not fetch product price" };
        }

        const originalPrice = parseFloat(productData.price);
        const compareAtPrice = productData.compareAtPrice ? parseFloat(productData.compareAtPrice) : null;

        // 3. Determine Rule
        const productGid = `gid://shopify/Product/${productId}`;

        // Prioritize Specific Product Rule (Active Only)
        let rule = await db.rule.findFirst({
            where: {
                shopId: shop.id,
                productId: productGid,
                isEnabled: true
            },
        });

        // Check Collection Rules if no Specific Product Rule found
        if (!rule) {
            const collectionRules = await db.rule.findMany({
                where: {
                    shopId: shop.id,
                    collectionId: { not: null },
                    isEnabled: true
                }
            });

            if (collectionRules.length > 0 && productData.collections) {
                // Find first rule where product's collections include the rule's collectionId
                // Note: productData.collections are GIDs
                rule = collectionRules.find(r => productData.collections.includes(r.collectionId));
            }
        }

        // Fallback or Global Rule if we had one (but we removed global generic rule earlier)
        // Default to minDiscount 1.0 (no discount) if no rule matches
        const minDiscountMultiplier = rule ? rule.minDiscount : 1.0;

        // Check Sale Items Restriction
        if (!shop.allowSaleItems && compareAtPrice && compareAtPrice > originalPrice) {
            return {
                status: "REJECTED",
                counterPrice: originalPrice.toFixed(2),
                message: "Désolé, je ne peux pas négocier sur les articles déjà soldés."
            };
        }

        const rawMinPrice = originalPrice * minDiscountMultiplier;
        const minAcceptedPrice = Math.round(rawMinPrice * 100) / 100;
        const offerValue = parseFloat(offerPrice);

        if (offerValue >= minAcceptedPrice) {
            // ACCEPT OFFER
            const discountAmount = originalPrice - offerValue;
            const code = `OFFER-${Math.floor(Math.random() * 1000000)}`;

            console.log("Negotiate API: Attempting to create discount", { code, discountAmount, productGid });

            if (!shop.accessToken) {
                console.error("Negotiate API: Missing Access Token for shop", shop.shopUrl);
                return { status: "ERROR", error: "Missing Access Token. Please reinstall app." };
            }

            const createdCode = await createShopifyDiscount(
                shop.shopUrl,
                shop.accessToken,
                code,
                discountAmount,
                productGid
            );

            if (!createdCode) {
                return { status: "ERROR", error: "Failed to create discount in Shopify. Check console." };
            }

            await db.offer.create({
                data: {
                    shopId: shop.id,
                    offeredPrice: offerValue,
                    status: "ACCEPTED",
                    code: code,
                },
            });

            return { status: "ACCEPTED", code, message: shop.botSuccessMsg.replace("{price}", offerValue.toFixed(2)) };
        } else {
            // REJECT / COUNTER for Iterative Negotiation

            const attempt = body.round || 1;
            const maxAttempts = shop.maxRounds || 3;

            if (attempt > maxAttempts) {
                return {
                    status: "REJECTED",
                    counterPrice: minAcceptedPrice.toFixed(2),
                    message: `Désolé, je ne peux pas descendre plus bas que ${minAcceptedPrice.toFixed(2)} €. C'est mon dernier prix.`
                };
            }

            // Strategy logic
            let targetPrice;
            const priceGap = originalPrice - minAcceptedPrice;
            const strategy = shop.strategy || 'moderate';

            let concessionPercent = 0;

            if (strategy === 'conciliatory') {
                if (attempt === 1) concessionPercent = 0.50;
                else if (attempt === 2) concessionPercent = 0.80;
                else concessionPercent = 1.0;
            } else if (strategy === 'aggressive') { // 'Ferme'
                if (attempt === 1) concessionPercent = 0.10;
                else if (attempt === 2) concessionPercent = 0.25;
                else if (attempt === 3) concessionPercent = 0.40;
                else concessionPercent = 0.50 + ((attempt - 3) * 0.1);

                if (attempt >= maxAttempts) concessionPercent = 0.8;
            } else { // Moderate
                if (attempt === 1) concessionPercent = 0.30;
                else if (attempt === 2) concessionPercent = 0.60;
                else concessionPercent = 1.0;
            }

            targetPrice = originalPrice - (priceGap * concessionPercent);

            if (targetPrice < minAcceptedPrice) targetPrice = minAcceptedPrice;

            const roundingEnding = shop.priceRounding !== undefined ? shop.priceRounding : 0.85;
            let basePrice = Math.floor(targetPrice);
            let counterPriceVal = basePrice + roundingEnding;

            // Ensure sensible rounding
            if (counterPriceVal < minAcceptedPrice) {
                // If rounding pushes below min, just define behavior, maybe slightly above min?
                // Or stick to minAcceptedPrice if gap is tiny.
                counterPriceVal = minAcceptedPrice;
            }
            if (counterPriceVal > originalPrice) {
                counterPriceVal = originalPrice - 0.15;
            }

            const counterPrice = counterPriceVal.toFixed(2);

            await db.offer.create({
                data: {
                    shopId: shop.id,
                    offeredPrice: offerValue,
                    status: "REJECTED",
                },
            });

            return {
                status: "COUNTER",
                counterPrice,
                message: shop.botRejectMsg.replace("{price}", counterPrice)
            };
        }

    } catch (error) {
        console.error("Negotiation Error", error);
        return new Response(JSON.stringify({ error: "Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

async function createShopifyDiscount(shopDomain, accessToken, code, amount, productGid) {
    const query = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
        basicCodeDiscount: {
            title: `SmartOffer ${code}`,
            code: code,
            startsAt: new Date().toISOString(),
            usageLimit: 1,
            appliesOncePerCustomer: true,
            customerSelection: {
                all: true
            },
            customerGets: {
                value: {
                    discountAmount: {
                        amount: Math.abs(amount).toFixed(2),
                        appliesOnEachItem: false
                    }
                },
                items: {
                    products: {
                        productsToAdd: [productGid]
                    }
                }
            }
        }
    };

    try {
        const response = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({ query, variables })
        });

        const responseJson = await response.json();

        if (responseJson.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
            console.error("Discount Creation Errors:", JSON.stringify(responseJson.data.discountCodeBasicCreate.userErrors, null, 2));
            return null;
        }

        return code;
    } catch (e) {
        console.error("Network or parsing error", e);
        return null;
    }
}

async function getProductData(shopDomain, accessToken, productId) {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          priceRangeV2 {
            minVariantPrice {
              amount
            }
          }
          collections(first: 10) {
            nodes {
              id
            }
          }
          compareAtPriceRange {
            minVariantPrice {
                amount
            }
          }
          variants(first: 1) {
            nodes {
                compareAtPrice
                price
            }
          }
        }
      }
    `;

    const variables = {
        id: `gid://shopify/Product/${productId}`
    };

    try {
        const response = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await response.json();

        const variant = json.data?.product?.variants?.nodes?.[0];
        const collections = json.data?.product?.collections?.nodes?.map(n => n.id) || [];

        if (variant) {
            return {
                price: variant.price,
                compareAtPrice: variant.compareAtPrice,
                collections
            };
        }

        return null;
    } catch (e) {
        console.error("Error fetching price", e);
        return null;
    }
}
