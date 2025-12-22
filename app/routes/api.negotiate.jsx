import db from "../db.server";
import { NegotiationService } from "../services/negotiation.server";
import { ShopifyService } from "../services/ShopifyService";
import { AIService } from "../services/AIService";
import { authenticate } from "../shopify.server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import i18next from "i18next"; // Ensure you have i18next available
import i18n from "../i18n"; // Import existing i18n config/instance

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
        enableInactivityTrigger: shop.enableInactivityTrigger,
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

    let t = (key) => key; // Fallback translator

    try {
        const body = await request.json();

        // --- SECURITY: Zod Validation ---
        const Validation = await import("../validators.server").then(m => m.NegotiationSchema);
        const result = Validation.safeParse(body);

        if (!result.success) {
            console.error("Negotiation API: Validation Error", result.error.format());
            // Return specific validation message
            return new Response(JSON.stringify({
                error: "Invalid Data",
                details: result.error.flatten().fieldErrors
            }), { status: 400 });
        }

        const { productId, variantId, offerPrice, shopUrl, sessionId, customerEmail } = result.data;
        // ---------------------------------

        // 1. Verify Shop & Get Token
        const shop = await db.shop.findUnique({ where: { shopUrl } });
        if (!shop || !shop.isActive) {
            return new Response(JSON.stringify({ error: "Shop negotiation is disabled." }), { status: 403 });
        }

        if (!shop.accessToken) {
            console.error("Negotiate API: Missing Access Token for shop", shop.shopUrl);
            return { status: "ERROR", error: "Le jeton d'accès est manquant. Veuillez réinstaller l'application." };
        }

        // Initialize Translator with Shop Settings and Client Locale
        const clientLocale = body.locale || 'en';

        let customReactions = {};
        try {
            if (shop.reactionMessages) {
                customReactions = JSON.parse(shop.reactionMessages);
            }
        } catch (e) {
            console.error("Failed to parse reactionMessages for shop:", shopUrl, e);
        }

        t = (key) => {
            // 1. Try Custom Shop Messages
            const parts = key.split('.');
            let customValue = customReactions;
            for (const part of parts) {
                customValue = customValue?.[part];
            }
            if (customValue) return customValue;

            // 2. Fallback to i18next translations (using client locale)
            // We use the imported i18n instance to get the translation for the specific locale
            if (i18n.exists(key, { lng: clientLocale })) {
                return i18n.t(key, { lng: clientLocale, returnObjects: true });
            }

            // 3. Ultimate Fallback (Hardcoded English if i18n fails or key missing)
            const enTranslations = {
                negotiation: {
                    reactions: {
                        SHOCKED: [
                            "This offer is significantly below our expectations. However, we can offer you {{price}} €.",
                            "Unfortunately we cannot accept such a low offer. The product deserves better. I propose {{price}} €.",
                            "This price is too far from the item's value. We could go down to {{price}} €.",
                            "Your offer is a bit too aggressive. Can we agree on {{price}} €?",
                            "We are open to negotiation, but this amount is insufficient. How about {{price}} €?"
                        ],
                        LOW: [
                            "I appreciate the effort, but we can't go that low. Our best offer is {{price}} €.",
                            "We're getting closer, but this price is still below our limit. I can let it go for {{price}} €.",
                            "I can't validate this amount, but I'm sure we can find a deal at {{price}} €.",
                            "Your offer is interesting but still a bit tight. I propose {{price}} €.",
                            "We are almost there. A little more effort? I can go down to {{price}} €."
                        ],
                        CLOSE: [
                            "We are very close to a deal. Another small step towards {{price}} €?",
                            "Your offer is tempting. If you accept {{price}} €, we have a deal.",
                            "We are reaching the goal. Would you agree to {{price}} €?",
                            "The gap is minimal. I can make you a final proposal at {{price}} €.",
                            "It's almost validated. Let's agree on {{price}} €."
                        ],
                        SUCCESS: [
                            "It's agreed. We accept your offer with pleasure.",
                            "Deal concluded. You benefit from this preferential rate.",
                            "It's a fair offer. We are delighted to accept it.",
                            "Proposal validated. Thank you for this constructive negotiation.",
                            "It's okay for us. Enjoy your purchase."
                        ],
                        HIGH: [
                            "No need to offer more, the current price is {{price}} €.",
                            "The displayed price is already {{price}} €, you won't pay more.",
                            "Our price is {{price}} €, we don't take higher bids."
                        ],
                        invalid_offer: "I didn't understand your price. Can you give me an amount (e.g. 45)?",
                        sale_restriction: "Sorry, I cannot negotiate on already discounted items.",
                        min_limit_reached: "Sorry, I cannot go lower than {{price}} €. That's my final price."
                    }
                }
            };

            let fallbackValue = enTranslations;
            for (const part of parts) {
                fallbackValue = fallbackValue?.[part];
            }

            return fallbackValue || key;
        };

        // 2. Rate Limit & Anti-Abuse Check
        if (sessionId) {
            await NegotiationService.checkRateLimit(sessionId, shop.id, productId);
        }

        // 3. Fetch Product Data
        console.log(`Negotiate API: Fetching data for product ${productId} on ${shop.shopUrl} with variant ${variantId}`);
        const productData = await ShopifyService.getProductData(shop.shopUrl, shop.accessToken, productId, variantId);

        if (!productData || productData.error) {
            console.error(`Negotiate API: Product data fetch failed for ${productId} on ${shop.shopUrl}`);
            const errorMsg = productData?.error || "Impossible de récupérer les infos du produit.";
            return { status: "ERROR", error: errorMsg };
        }

        const originalPrice = parseFloat(productData.price);
        const compareAtPrice = productData.compareAtPrice ? parseFloat(productData.compareAtPrice) : null;

        // 4. Determine Rule
        // Rules are attached to the generic Product ID, not the Variant ID.
        // So we must use the Product GID to find the rule.
        const productGid = `gid://shopify/Product/${productId}`;
        let rule = await db.rule.findFirst({
            where: { shopId: shop.id, productId: productGid, isEnabled: true },
        });

        if (!rule) {
            const collectionRules = await db.rule.findMany({
                where: { shopId: shop.id, collectionId: { not: null }, isEnabled: true }
            });
            if (collectionRules.length > 0 && productData.collections) {
                rule = collectionRules.find(r => productData.collections.includes(r.collectionId));
            }
        }

        let minAcceptedPrice;
        if (rule && rule.minPrice !== null && rule.minPrice !== undefined) {
            minAcceptedPrice = rule.minPrice;
        } else {
            const minDiscountMultiplier = rule ? rule.minDiscount : 1.0;
            const rawMinPrice = originalPrice * minDiscountMultiplier;
            minAcceptedPrice = Math.round(rawMinPrice * 100) / 100;
        }

        // Check Sale Items Restriction
        if (!shop.allowSaleItems && compareAtPrice && compareAtPrice > originalPrice) {
            return {
                status: "REJECTED",
                counterPrice: originalPrice.toFixed(2),
                message: t("negotiation.reactions.sale_restriction")
            };
        }

        // SMART PARSING
        let offerValue = null;
        let chatResponse = null;
        const apiKey = process.env.GEMINI_API_KEY;

        if (apiKey) {
            const minPriceForContext = minAcceptedPrice || (originalPrice * 0.8);
            const aiResult = await AIService.analyzeIntent(apiKey, {
                productTitle: productData.title,
                originalPrice,
                minPriceForContext,
                userText: offerPrice
            });

            if (aiResult) {
                if (aiResult.type === 'OFFER' && aiResult.price) {
                    offerValue = aiResult.price;
                } else if (aiResult.type === 'CHAT') {
                    chatResponse = aiResult.message;
                }
            }
        } else {
            console.warn("Negotiate API: Missing GEMINI_API_KEY");
        }

        // Fallback or explicit regex
        if (offerValue === null && chatResponse === null) {
            const priceMatch = String(offerPrice).match(/(\d+(?:[.,]\d{1,2})?)/);
            if (priceMatch) {
                offerValue = parseFloat(priceMatch[0].replace(',', '.'));
            }
        }

        if (chatResponse) {
            return { status: "CHAT", message: chatResponse };
        }

        if (offerValue === null || isNaN(offerValue)) {
            return {
                status: "REJECTED",
                counterPrice: null,
                message: t("negotiation.reactions.invalid_offer")
            };
        }

        // --- MANUAL MODE INTERCEPTION ---
        // If shop has autoNegotiation disabled, we catch the offer here.
        if (shop.autoNegotiation === false) {
            // Validated 'customerEmail' from Zod result is used here

            if (!customerEmail) {
                // Step 1: Request Email
                return {
                    status: "REQUEST_EMAIL",
                    message: "To submit your offer of " + offerValue + "€ manually to the merchant, please enter your email address below."
                };
            } else {
                // Step 2: Save Offer & Confirm
                // We use a specific status for manual offers
                await db.offer.create({
                    data: {
                        shopId: shop.id,
                        offeredPrice: offerValue,
                        status: "PENDING",
                        customerEmail: customerEmail,
                        productTitle: productData.title,
                        productId: productId,
                        originalPrice: originalPrice,
                        sessionId: sessionId
                    },
                });

                // LEAD GEN STRATEGY: Create Customer in Shopify
                if (customerEmail) {
                    ShopifyService.createCustomer(shop.shopUrl, shop.accessToken, customerEmail).catch(err => console.error("Lead Gen Fail", err));
                }

                return {
                    status: "MANUAL_COMPLETED",
                    message: "Thank you! Your offer of " + offerValue + "€ has been sent to the merchant. We will contact you at " + customerEmail + " shortly."
                };
            }
        }
        // --------------------------------

        if (offerValue > originalPrice) {
            const highMsg = NegotiationService.getMessage('HIGH', originalPrice.toFixed(2), t);
            return {
                status: "REJECTED",
                counterPrice: originalPrice.toFixed(2),
                message: highMsg
            };
        }

        if (offerValue >= minAcceptedPrice) {
            // ACCEPT OFFER
            let discountAmount = originalPrice - offerValue;
            if (discountAmount < 0) discountAmount = 0;
            discountAmount = Math.round(discountAmount * 100) / 100; // Fix precision

            // --- VIP MODE: DRAFT ORDER ---
            if (shop.fulfillmentMode === 'DRAFT_ORDER') {
                console.log("Negotiate API: Creating Draft Order (VIP Mode)");

                const draftOrder = await ShopifyService.createDraftOrder(
                    shop.shopUrl,
                    shop.accessToken,
                    productData.variantId || productData.id || productId,
                    discountAmount,
                    customerEmail
                );

                if (!draftOrder) {
                    return { status: "ERROR", error: "Échec de la réservation. Veuillez réessayer." };
                }

                await db.offer.create({
                    data: {
                        shopId: shop.id,
                        offeredPrice: offerValue,
                        status: "ACCEPTED_DRAFT", // New Status
                        code: `DRAFT-${draftOrder.id.split('/').pop()}`, // Store Draft ID as code ref
                        productTitle: productData.title,
                        productId: productId,
                        originalPrice: originalPrice,
                        sessionId: sessionId,
                    },
                });

                // Sync Customer (VIP usually creates customer via DraftOrder, but good to tag properly)
                if (customerEmail) {
                    ShopifyService.createCustomer(shop.shopUrl, shop.accessToken, customerEmail).catch(e => console.error("Lead Gen Error", e));
                }

                return {
                    status: "ACCEPTED_DRAFT",
                    message: "Offre acceptée ! Une commande a été pré-réservée pour vous. Le vendeur va la valider et vous recevrez un lien de paiement par email sous peu."
                };
            }

            // --- STANDARD MODE: DISCOUNT CODE ---
            const code = `OFFER-${Math.floor(Math.random() * 1000000)}`;
            console.log("Negotiate API: Attempting to create discount", { code, discountAmount, productGid });

            const durationMinutes = shop.autoValidityDuration || 24;
            const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

            const createdCode = await ShopifyService.createDiscount(
                shop.shopUrl,
                shop.accessToken,
                code,
                discountAmount,
                productGid,
                endsAt
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
                    sessionId: sessionId,
                },
            });

            // LEAD GEN STRATEGY: Create Customer in Shopify
            if (customerEmail) {
                // Fire and forget (don't await to speed up response)
                ShopifyService.createCustomer(shop.shopUrl, shop.accessToken, customerEmail).then(() => {
                    console.log(`[LEAD GEN] Synced customer ${customerEmail} to Shopify.`);
                });
            }

            const successMsg = NegotiationService.getMessage('SUCCESS', offerValue.toFixed(2), t);
            return { status: "ACCEPTED", code, message: successMsg, validityDuration: durationMinutes };

        } else {
            // REJECT / COUNTER Logic
            const attempt = result.data.round || 1;
            const maxAttempts = shop.maxRounds || 3;
            const strategy = shop.strategy || 'moderate';
            const priceRounding = shop.priceRounding;

            const counterResult = NegotiationService.calculateCounterOffer(
                originalPrice,
                minAcceptedPrice,
                attempt,
                maxAttempts,
                strategy,
                priceRounding
            );

            if (counterResult.isFinal && counterResult.amount === minAcceptedPrice && attempt > maxAttempts) {
                // Here we also use t for the final refusal message
                // Currently hardcoded in previous logic, let's look at the key "min_limit_reached"
                const limitMsg = t("negotiation.reactions.min_limit_reached").replace("{{price}}", minAcceptedPrice.toFixed(2));
                return {
                    status: "REJECTED",
                    counterPrice: minAcceptedPrice.toFixed(2),
                    message: limitMsg
                };
            }

            const counterPrice = counterResult.amount.toFixed(2);

            await db.offer.create({
                data: {
                    shopId: shop.id,
                    offeredPrice: offerValue,
                    status: "REJECTED",
                    productTitle: productData.title,
                    productId: productId,
                    originalPrice: originalPrice,
                    sessionId: sessionId
                },
            });

            const category = NegotiationService.determineCategory(offerValue, originalPrice, counterResult.amount);
            const reactionMsg = NegotiationService.getMessage(category, counterPrice, t);

            return {
                status: "COUNTER",
                counterPrice,
                message: reactionMsg
            };
        }

    } catch (error) {
        console.error("Negotiation Error", error);

        // Handle Rate Limit Errors with standardized codes
        if (error.message === "RATE_LIMIT_SPAM") {
            return { status: "REJECTED", message: t("negotiation.errors.rate_limit_spam") };
        }
        if (error.message === "RATE_LIMIT_DAILY") {
            return { status: "REJECTED", message: t("negotiation.errors.rate_limit_daily") };
        }
        if (error.message === "RATE_LIMIT_HOURLY") {
            return { status: "REJECTED", message: t("negotiation.errors.rate_limit_hourly") };
        }

        // Fallback for older legacy messages (safety net)
        if (error.message && (
            error.message.includes("Trop de tentatives") ||
            error.message.includes("Limite quotidienne")
        )) {
            return { status: "REJECTED", message: error.message };
        }

        return new Response(JSON.stringify({ error: "Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
