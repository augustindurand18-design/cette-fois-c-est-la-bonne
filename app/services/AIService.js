
import { GoogleGenerativeAI } from "@google/generative-ai";

export const AIService = {
    /**
     * Analyze user input using Gemini to determine intent (OFFER vs CHAT)
     */
    async analyzeIntent(apiKey, { productTitle, originalPrice, minPriceForContext, userText }) {
        if (!apiKey) {
            console.warn("AIService: Missing API KEY");
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

            const prompt = `
            Context: You are a negotiation bot for a shop. Product: "${productTitle}". Original Price: ${originalPrice}. Minimum acceptable price (secret): ${minPriceForContext}.
            User says: "${userText}"
            
            Goal: Extract the offer amount if the user is making an offer. If the user is just asking a question or chatting, generate a helpful, short (max 1 sentence) reply in ENGLISH.
            IMPORTANT: If the offer is invalid (e.g. 0 or negative), reply in ENGLISH explaining why.
            
            Output JSON ONLY:
            {
                "type": "OFFER" or "CHAT",
                "price": number or null, 
                "message": "string" or null
            }
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean markdown code blocks if any
            const jsonStr = text.replace(/```json|```/g, "").trim();
            const aiData = JSON.parse(jsonStr);

            return {
                type: aiData.type,
                price: aiData.price ? parseFloat(aiData.price) : null,
                message: aiData.message
            };

        } catch (e) {
            console.error("AIService: Gemini Error", e);
            return null; // Return null to signal fallback needed
        }
    }
};
