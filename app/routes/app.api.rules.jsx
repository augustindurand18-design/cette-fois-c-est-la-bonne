import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }) {
    const { session } = await authenticate.admin(request);
    const { shop } = session;

    const shopRecord = await db.shop.findUnique({
        where: { shopUrl: shop },
        include: { rules: true },
    });

    if (!shopRecord) {
        return { rules: [] };
    }

    return { rules: shopRecord.rules };
}

export async function action({ request }) {
    const { session } = await authenticate.admin(request);
    const { shop } = session;
    const method = request.method;

    if (method === "POST" || method === "PUT") {
        const data = await request.json(); // Expected: { minDiscount: 0.8, isEnabled: ... }

        // Ensure shop exists in our DB
        let shopRecord = await db.shop.findUnique({
            where: { shopUrl: shop },
        });

        if (!shopRecord) {
            shopRecord = await db.shop.create({
                data: {
                    id: session.id, // Using session ID as shop ID for simplicity if it's unique per shop (offline session)
                    shopUrl: shop,
                    accessToken: session.accessToken,
                    isActive: true,
                },
            });
        }

        // Handle Global Rule (collectionId & productId are null)
        // For MVP we assume we are updating the global rule.
        const ruleData = {
            minDiscount: parseFloat(data.minDiscount) || 0.8,
            isEnabled: data.isEnabled !== undefined ? data.isEnabled : true,
        };

        const existingRule = await db.rule.findFirst({
            where: {
                shopId: shopRecord.id,
                collectionId: null,
                productId: null
            }
        });

        if (existingRule) {
            await db.rule.update({
                where: { id: existingRule.id },
                data: ruleData
            });
        } else {
            await db.rule.create({
                data: {
                    shopId: shopRecord.id,
                    ...ruleData
                }
            });
        }

        return { success: true };
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}
