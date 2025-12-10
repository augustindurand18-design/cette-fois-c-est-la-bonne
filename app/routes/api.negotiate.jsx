import db from "../db.server";
import { NegotiationService } from "../services/negotiation.server";
import { authenticate } from "../shopify.server";
import { GoogleGenerativeAI } from "@google/generative-ai";


export async function loader({ request }) {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const shopUrl = url.searchParams.get("shop");
    const productId = url.searchParams.get("productId");
    const collectionIds = url.searchParams.get("collectionIds")?.split(",") || [];

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

    // Check Eligibility
    let isEligible = false;
    if (productId) {
        // 1. Specific Product Rule
        const productRule = await db.rule.findFirst({
            where: {
                shopId: shop.id,
                productId: `gid://shopify/Product/${productId}`,
                isEnabled: true
            }
        });

        if (productRule) {
            isEligible = true;
        } else {
            // 2. Collection Rules
            if (collectionIds.length > 0) {
                // Construct potential GIDs for DB search if DB stores GIDs
                const collectionGids = collectionIds.map(id => `gid://shopify/Collection/${id}`);

                const collectionRule = await db.rule.findFirst({
                    where: {
                        shopId: shop.id,
                        collectionId: { in: collectionGids },
                        isEnabled: true
                    }
                });

                if (collectionRule) isEligible = true;
            }
        }
    }

    return new Response(JSON.stringify({
        botWelcomeMsg: shop.botWelcomeMsg,
        botRejectMsg: shop.botRejectMsg,
        botSuccessMsg: shop.botSuccessMsg,
        widgetColor: shop.widgetColor,
        botIcon: shop.botIcon,
        isActive: shop.isActive,
        enableExitIntent: shop.enableExitIntent,
        isEligible
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

export async function action({ request }) {
    console.log("Negotiate API: Request Received", request.method);
    await authenticate.public.appProxy(request);

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
        const body = await request.json();
        const { productId, offerPrice, shopUrl, sessionId } = body;

        if (!productId || !offerPrice || !shopUrl) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // 1. Verify Shop & Get Token
        const shop = await db.shop.findUnique({ where: { shopUrl } });
        if (!shop || !shop.isActive) {
            return new Response(JSON.stringify({ error: "Shop negotiation is disabled." }), { status: 403 });
        }

        if (!shop.accessToken) {
            console.error("Negotiate API: Missing Access Token for shop", shop.shopUrl);
            return { status: "ERROR", error: "Le jeton d'accès est manquant. Veuillez réinstaller l'application." };
        }

        // 2. Rate Limit Check (New)
        if (sessionId) {
            await NegotiationService.checkRateLimit(sessionId, shop.id);
        }

        // 3. Fetch Product Data (Price + Collections)
        console.log(`Negotiate API: Fetching data for product ${productId} on ${shop.shopUrl}`);
        const productData = await getProductData(shop.shopUrl, shop.accessToken, productId);

        if (!productData || productData.error) {
            console.error(`Negotiate API: Product data fetch failed for ${productId} on ${shop.shopUrl}`);
            const errorMsg = productData?.error || "Impossible de récupérer les infos du produit.";
            return { status: "ERROR", error: errorMsg };
        }

        const originalPrice = parseFloat(productData.price);
        const compareAtPrice = productData.compareAtPrice ? parseFloat(productData.compareAtPrice) : null;

        // 4. Determine Rule
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
                rule = collectionRules.find(r => productData.collections.includes(r.collectionId));
            }
        }

        // Fallback or Global Rule logic
        let minAcceptedPrice;

        if (rule && rule.minPrice !== null && rule.minPrice !== undefined) {
            minAcceptedPrice = rule.minPrice;
        } else {
            // Fallback to percentage
            const minDiscountMultiplier = rule ? rule.minDiscount : 1.0;
            const rawMinPrice = originalPrice * minDiscountMultiplier;
            minAcceptedPrice = Math.round(rawMinPrice * 100) / 100;
        }

        // Check Sale Items Restriction
        if (!shop.allowSaleItems && compareAtPrice && compareAtPrice > originalPrice) {
            return {
                status: "REJECTED",
                counterPrice: originalPrice.toFixed(2),
                message: "Désolé, je ne peux pas négocier sur les articles déjà soldés."
            };
        }

        // SMART PARSING (AI or Regex)
        let offerValue = null;
        let chatResponse = null;

        const apiKey = process.env.GEMINI_API_KEY;

        if (apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
                console.log("Negotiate API: Model initialized gemini-flash-latest");

                const minPriceForContext = minAcceptedPrice || (originalPrice * 0.8);

                const prompt = `
                Context: You are a negotiation bot for a shop. Product: "${productData.title}". Original Price: ${originalPrice}. Minimum acceptable price (secret): ${minPriceForContext}.
                User says: "${offerPrice}"
                
                Goal: Extract the offer amount if the user is making an offer. If the user is just asking a question or chatting, generate a helpful, short (max 1 sentence) reply in FRENCH.
                IMPORTANT: If the offer is invalid (e.g. 0 or negative), reply in FRENCH explaining why.
                
                Output JSON ONLY:
                {
                    "type": "OFFER" or "CHAT",
                    "price": number or null, 
                    "message": "string" or null
                }
                `;

                console.log("Negotiate API: Sending request to Gemini...");
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                // Clean markdown code blocks if any
                const jsonStr = text.replace(/```json|```/g, "").trim();
                const aiData = JSON.parse(jsonStr);

                if (aiData.type === 'OFFER' && aiData.price) {
                    offerValue = parseFloat(aiData.price);
                } else if (aiData.type === 'CHAT') {
                    chatResponse = aiData.message;
                }

            } catch (e) {
                console.error("Gemini Error (Falling back to Regex)", e);
                // Silent fallback
            }
        } else {
            // Silent fallback
        }

        // Fallback or explicit regex
        if (offerValue === null && chatResponse === null) {
            const priceMatch = String(offerPrice).match(/(\d+(?:[.,]\d{1,2})?)/);
            if (priceMatch) {
                offerValue = parseFloat(priceMatch[0].replace(',', '.'));
            }
        }

        if (chatResponse) {
            return {
                status: "CHAT",
                message: chatResponse
            };
        }

        if (offerValue === null || isNaN(offerValue)) {
            return {
                status: "REJECTED",
                counterPrice: null,
                message: "Je n'ai pas compris votre prix. Pouvez-vous me donner un montant (ex: 45) ?"
            };
        }

        if (offerValue > originalPrice) {
            return {
                status: "REJECTED",
                counterPrice: originalPrice.toFixed(2),
                message: NegotiationService.getMessage('HIGH', originalPrice.toFixed(2))
            };
        }

        if (offerValue >= minAcceptedPrice) {
            // ACCEPT OFFER
            let discountAmount = originalPrice - offerValue;
            if (discountAmount < 0) discountAmount = 0; // Safety net

            const code = `OFFER-${Math.floor(Math.random() * 1000000)}`;

            console.log("Negotiate API: Attempting to create discount", { code, discountAmount, productGid });

            const createdCode = await createShopifyDiscount(
                shop.shopUrl,
                shop.accessToken,
                code,
                discountAmount,
                productGid
            );

            if (!createdCode) {
                return { status: "ERROR", error: "Échec de la création de la remise. Veuillez réessayer." };
            }

            await db.offer.create({
                data: {
                    shopId: shop.id,
                    offeredPrice: offerValue,
                    status: "ACCEPTED",
                    code: code,
                    productTitle: productData.title,
                    productId: productId,
                    originalPrice: originalPrice,
                    sessionId: sessionId // Track session
                },
            });

            // Random Success Message
            const successMsg = NegotiationService.getMessage('SUCCESS', offerValue.toFixed(2));
            return { status: "ACCEPTED", code, message: successMsg };

        } else {
            // REJECT / COUNTER Logic
            const attempt = body.round || 1;
            const maxAttempts = shop.maxRounds || 3;
            const strategy = shop.strategy || 'moderate';
            const priceRounding = shop.priceRounding;

            // Use Service for calculation
            const counterResult = NegotiationService.calculateCounterOffer(
                originalPrice,
                minAcceptedPrice,
                attempt,
                maxAttempts,
                strategy,
                priceRounding
            );

            if (counterResult.isFinal && counterResult.amount === minAcceptedPrice && attempt > maxAttempts) {
                return {
                    status: "REJECTED",
                    counterPrice: minAcceptedPrice.toFixed(2),
                    message: `Désolé, je ne peux pas descendre plus bas que ${minAcceptedPrice.toFixed(2)} €. C'est mon dernier prix.`
                };
            }

            const counterPrice = counterResult.amount.toFixed(2);

            // Save Offer
            await db.offer.create({
                data: {
                    shopId: shop.id,
                    offeredPrice: offerValue,
                    status: "REJECTED",
                    productTitle: productData.title,
                    productId: productId,
                    originalPrice: originalPrice,
                    sessionId: sessionId // Track session
                },
            });

            // Use Service for message
            const category = NegotiationService.determineCategory(offerValue, originalPrice, counterResult.amount);
            const reactionMsg = NegotiationService.getMessage(category, counterPrice);

            return {
                status: "COUNTER",
                counterPrice,
                message: reactionMsg
            };
        }

    } catch (error) {
        console.error("Negotiation Error", error);

        if (error.message && error.message.includes("Trop de tentatives")) {
            return { status: "ERROR", error: error.message };
        }

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
        const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
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
          title
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
        const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await response.json();

        if (!response.ok || json.errors) {
            const errorMsg = json.errors ? json.errors.map(e => e.message).join(', ') : "Unknown API Error";
            console.error("Negotiate API: Product Fetch Error", {
                status: response.status,
                errors: json.errors,
            });
            return { error: `Shopify API Error: ${errorMsg}` };
        }

        const variant = json.data?.product?.variants?.nodes?.[0];
        const collections = json.data?.product?.collections?.nodes?.map(n => n.id) || [];

        if (variant) {
            return {
                title: json.data?.product?.title,
                price: variant.price,
                compareAtPrice: variant.compareAtPrice,
                collections
            };
        }

        console.error("Negotiate API: No variant found in response", JSON.stringify(json, null, 2));
        return { error: "Produit ou variante introuvable." };

    } catch (e) {
        console.error("Error fetching price", e);
        return { error: `Network/Server Error: ${e.message}` };
    }
}
