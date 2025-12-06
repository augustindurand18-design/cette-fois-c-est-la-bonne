import db from "../db.server";

export async function loader() {
    return new Response("Method Not Allowed", { status: 405 });
}

export async function action({ request }) {
    console.log("Negotiate API: Request Received", request.method);
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
        const body = await request.json();
        console.log("Negotiate API: Body Parsed", body);
        const { productId, offerPrice, shopUrl } = body;

        if (!productId || !offerPrice || !shopUrl) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // 1. Verify Shop & Get Token
        const shop = await db.shop.findUnique({ where: { shopUrl } });
        if (!shop || !shop.isActive) {
            return new Response(JSON.stringify({ error: "Shop not found or inactive" }), { status: 404 });
        }

        // 2. Fetch Rule
        const rule = await db.rule.findFirst({
            where: {
                shopId: shop.id,
                collectionId: null,
                productId: null,
            },
        });

        const minDiscountMultiplier = rule ? rule.minDiscount : 0.8;

        // 3. Logic
        // Fetch Real Price from Shopify
        const price = await getProductPrice(shop.shopUrl, shop.accessToken, productId);
        if (!price) {
            return { status: "ERROR", error: "Could not fetch product price" };
        }
        const originalPrice = parseFloat(price);

        // Fix floating point precision issues comparison
        const rawMinPrice = originalPrice * minDiscountMultiplier;
        const minAcceptedPrice = Math.round(rawMinPrice * 100) / 100;
        const offerValue = parseFloat(offerPrice);

        if (offerValue >= minAcceptedPrice) {
            // ACCEPT OFFER

            // Calculate discount amount needed to reach offer price
            // Original: 100, Offer: 85 -> Discount: 15
            const discountAmount = originalPrice - offerValue;

            // 4. Generate REAL Discount Code via Shopify GraphGL
            const code = `OFFER-${Math.floor(Math.random() * 1000000)}`;

            // Determine GID
            const productGid = `gid://shopify/Product/${productId}`;
            console.log("Negotiate API: Attempting to create discount", { code, discountAmount, productGid });

            if (!shop.accessToken) {
                console.error("Negotiate API: Missing Access Token for shop", shop.shopUrl);
                return { status: "ERROR", error: "Missing Access Token. Please reinstall app." };
            }

            // Create Discount
            const createdCode = await createShopifyDiscount(
                shop.shopUrl,
                shop.accessToken,
                code,
                discountAmount,
                productGid
            );

            if (!createdCode) {
                // It failed but handled inside helper
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

            return { status: "ACCEPTED", code, message: "Offre acceptée !" };
        } else {
            // REJECT / COUNTER for Iterative Negotiation

            const attempt = body.round || 1;
            const maxAttempts = 3;

            if (attempt > maxAttempts) {
                return {
                    status: "REJECTED",
                    counterPrice: minAcceptedPrice.toFixed(2),
                    message: `Désolé, je ne peux pas descendre plus bas que ${minAcceptedPrice.toFixed(2)} €. C'est mon dernier prix.`
                };
            }

            // Strategy: Close the gap progressively
            // Attempt 1: Very conservative.
            // Attempt 2: Middle ground.
            // Attempt 3: Max discount (MinAccepted).

            let targetPrice;
            const priceGap = originalPrice - minAcceptedPrice; // The margin slack

            if (attempt === 1) {
                // Give 30% of slack
                targetPrice = originalPrice - (priceGap * 0.3);
            } else if (attempt === 2) {
                // Give 60% of slack
                targetPrice = originalPrice - (priceGap * 0.6);
            } else {
                // Give 100% of slack (Floor)
                targetPrice = minAcceptedPrice;
            }

            // Ensure we don't go below floor (redundant but safe)
            if (targetPrice < minAcceptedPrice) targetPrice = minAcceptedPrice;

            // Apply configurable rounding rule
            const roundingEnding = shop.priceRounding !== undefined ? shop.priceRounding : 0.85;
            let basePrice = Math.floor(targetPrice);
            let counterPriceVal = basePrice + roundingEnding;

            // If rounding pushed it below calc price (unlikely for +0.85) or below min
            if (counterPriceVal < minAcceptedPrice) {
                counterPriceVal += 1.0;
            }
            // If rounding pushed it above original (unlikely)
            if (counterPriceVal > originalPrice) {
                counterPriceVal = originalPrice - 0.15; // fallback
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
                message: `C'est un peu juste... Je peux vous le faire à ${counterPrice} €.`
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
                        amount: Math.abs(amount).toFixed(2), // Ensure positive value
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

async function getProductPrice(shopDomain, accessToken, productId) {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          priceRangeV2 {
            minVariantPrice {
              amount
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
        return json.data?.product?.priceRangeV2?.minVariantPrice?.amount;
    } catch (e) {
        console.error("Error fetching price", e);
        return null;
    }
}
