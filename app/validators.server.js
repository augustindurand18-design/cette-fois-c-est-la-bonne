import { z } from "zod";

export const NegotiationSchema = z.object({
    shopUrl: z.string().min(1, "Shop URL is required"),
    productId: z.string().min(1, "Product ID is required"),
    variantId: z.string().optional(), // Specific variant being negotiated
    offerPrice: z.union([z.string(), z.number()], { errorMap: () => ({ message: "Price must be a number or text containing a number" }) }),
    sessionId: z.string().optional(),
    locale: z.string().optional(),
    customerEmail: z.string().email("Invalid email format").optional().nullable(),
    round: z.number().int().min(1).default(1),
    // Optional context for rule matching
    collectionIds: z.array(z.string()).optional(),
});
