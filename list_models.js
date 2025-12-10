
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API KEY found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Bypass getGenerativeModel and use the API directly via fetch to list models? 
    // Or usage of the SDK if it has listModels? 
    // The SDK doesn't always expose a simple "listModels" on the instance easily without looking up docs, 
    // but looking at the error message, it says "Call ListModels". 
    // Let's try the direct HTTP call which is safer for a script using the key.

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Available Models:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error listing models", e);
    }
}

listModels();
