
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const models = data.models || [];

        const validModels = models.filter(m =>
            m.supportedGenerationMethods &&
            m.supportedGenerationMethods.includes("generateContent") &&
            m.name.includes("gemini")
        );

        console.log("Valid Gemini Models for generateContent:");
        validModels.forEach(m => console.log(m.name));
    } catch (e) {
        console.error(e);
    }
}

listModels();
