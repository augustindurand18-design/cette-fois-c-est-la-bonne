import db from "../db.server";

const REACTIONS = {
    SHOCKED: [ // < 50% of original
        "Cette offre est nettement inférieure à nos attentes. Cependant, nous pouvons vous proposer {price} €.",
        "Nous ne pouvons malheureusement pas accepter une offre si basse. Le produit mérite mieux. Je vous propose {price} €.",
        "Ce prix est trop éloigné de la valeur de l'article. Nous pourrions descendre à {price} €.",
        "Votre offre est un peu trop agressive. Pouvons-nous nous accorder sur {price} € ?",
        "Nous sommes ouverts à la négociation, mais ce montant est insuffisant. Que dites-vous de {price} € ?"
    ],
    LOW: [ // < Min Acceptable
        "C'est un effort appréciable, mais nous ne pouvons pas descendre à ce niveau. Notre meilleure offre est {price} €.",
        "Nous nous rapprochons, mais ce prix reste en dessous de notre limite. Je peux vous le laisser à {price} €.",
        "Je ne peux pas valider ce montant, mais je suis sûr que nous pouvons trouver un accord à {price} €.",
        "Votre offre est intéressante mais encore un peu juste. Je vous propose {price} €.",
        "Nous y sommes presque. Un petit effort supplémentaire ? Je peux descendre à {price} €."
    ],
    CLOSE: [ // Within 10% of Min Acceptable
        "Nous sommes très proches d'un accord. Encore un petit pas vers {price} € ?",
        "Votre offre est tentante. Si vous acceptez {price} €, nous avons un deal.",
        "Nous touchons au but. Seriez-vous d'accord pour {price} € ?",
        "L'écart est minime. Je peux vous faire une ultime proposition à {price} €.",
        "C'est presque validé. Accordons-nous sur {price} €."
    ],
    SUCCESS: [ // Accepted
        "C'est entendu. Nous acceptons votre offre avec plaisir.",
        "Accord conclu. Vous bénéficiez de ce tarif préférentiel.",
        "C'est une offre équitable. Nous sommes ravis de l'accepter.",
        "Proposition validée. Merci pour cette négociation constructive.",
        "C'est d'accord pour nous. Profitez bien de votre achat."
    ],
    HIGH: [ // Should be prevented normally
        "Inutile de proposer plus, le prix actuel est de {price} €.",
        "Le prix affiché est déjà de {price} €, vous ne paierez pas plus cher.",
        "Notre prix est de {price} €, nous ne prenons pas de surenchère."
    ]
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OFFERS_PER_WINDOW = 10;

export const NegotiationService = {
    /**
     * Get a random reaction message for a category
     */
    getMessage(category, price = null) {
        const messages = REACTIONS[category] || REACTIONS.LOW;
        const msg = messages[Math.floor(Math.random() * messages.length)];
        return price ? msg.replace("{price}", price) : msg;
    },

    /**
     * Check if a session has exceeded the rate limit
     * @param {string} sessionId 
     * @param {string} shopId 
     */
    async checkRateLimit(sessionId, shopId) {
        if (!sessionId) return; // Should ideally always have one

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
