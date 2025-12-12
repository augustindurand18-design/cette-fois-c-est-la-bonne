import db from "../db.server";


const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OFFERS_PER_WINDOW = 10;

export const NegotiationService = {
    /**
     * Get a random reaction message for a category
     * @param {string} category 
     * @param {string|number} price 
     * @param {Function} t - i18next translation function
     */
    getMessage(category, price = null, t) {
        // Fallback to LOW if category invalid
        const validCategories = ['SHOCKED', 'LOW', 'CLOSE', 'SUCCESS', 'HIGH'];
        const safeCategory = validCategories.includes(category) ? category : 'LOW';

        // Helper to get random array element from resources
        // We need to know the length of the array in the translation file.
        // i18next returnObjects: true is one way, or we can just assume size 5.
        // Better: t returns the array if returnObjects is true.

        const messages = t(`negotiation.reactions.${safeCategory}`, { returnObjects: true });

        // Safety check if messages is not an array (e.g. key missing)
        if (!Array.isArray(messages)) {
            return "Message unavailable.";
        }

        const msg = messages[Math.floor(Math.random() * messages.length)];
        return msg.replace("{{price}}", price); // i18next interpolation is usually {{val}}, but let's stick to simple replacement or use t's feature
        // Actually, let's use t's interpolation if we passed keys individually, 
        // but here we picked a string from an array. Converting {{price}} manually is fine 
        // OR we could pass price to t, but t returns the raw array. 
        // Let's rely on t returning the array of string with {{price}} placeholder, 
        // and we assume the frontend or this service replaces it. 
        // Wait, standard i18next interpolation happens inside t. 
        // If we get the array, it's already "translated" but headers might be raw?
        // Actually, t('key', { returnObjects: true }) returns the array of STRINGS.
        // Those strings might contain {{price}}. We should replace it using the variable.

        // Correct approach with i18next for arrays:
        // You usually can't interpolate into the array easily with a single t call.
        // So manual replacement is the way to go for this specific logic (random pick).
    },

    /**
     * Check if a session has exceeded the rate limit
     * @param {string} sessionId 
     * @param {string} shopId 
     */
    async checkRateLimit(sessionId, shopId) {
        if (!sessionId) return;

        const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000);

        const recentOffers = await db.offer.count({
            where: {
                sessionId: sessionId,
                shopId: shopId,
                createdAt: {
                    gte: windowStart
                }
            }
        });

        if (recentOffers >= MAX_OFFERS_PER_WINDOW) {
            // This error message should also be translated, but errors are often hardcoded for now.
            // Let's keep it simple or throw a specific error code.
            throw new Error("Trop de tentatives. Veuillez patienter une minute.");
        }
    },

    /**
     * Calculate counter offer based on strategy
     */
    calculateCounterOffer(originalPrice, minAcceptedPrice, attempt, maxAttempts, strategy, priceRounding) {
        // Safe guard logic
        if (attempt > maxAttempts) {
            return {
                amount: minAcceptedPrice,
                isFinal: true
            };
        }

        const priceGap = originalPrice - minAcceptedPrice;
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
        } else { // Moderate (Default)
            if (attempt === 1) concessionPercent = 0.30;
            else if (attempt === 2) concessionPercent = 0.60;
            else concessionPercent = 1.0;
        }

        let targetPrice = originalPrice - (priceGap * concessionPercent);
        if (targetPrice < minAcceptedPrice) targetPrice = minAcceptedPrice;

        const rounding = priceRounding !== undefined ? priceRounding : 0.85;
        let basePrice = Math.floor(targetPrice);
        let counterPriceVal = basePrice + rounding;

        // Ensure sensible rounding
        if (counterPriceVal < minAcceptedPrice) {
            counterPriceVal = minAcceptedPrice;
        }
        if (counterPriceVal > originalPrice) {
            counterPriceVal = originalPrice - 0.15;
        }

        return {
            amount: counterPriceVal,
            isFinal: false
        };
    },

    /**
     * Determine reaction category
     */
    determineCategory(offerValue, originalPrice, counterPrice) {
        if (offerValue < originalPrice * 0.5) return 'SHOCKED';
        if (offerValue >= counterPrice * 0.9) return 'CLOSE';
        return 'LOW';
    }
};

