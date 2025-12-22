import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    // This occurs 48 hours after uninstall. We must delete all data.
    try {
        const shopUrl = payload.shop_domain;
        const shopRecord = await db.shop.findUnique({ where: { shopUrl } });

        if (shopRecord) {
            // Delete Offers
            await db.offer.deleteMany({ where: { shopId: shopRecord.id } });
            // Delete Rules
            await db.rule.deleteMany({ where: { shopId: shopRecord.id } });
            // Delete Shop (or mark inactive/deleted if you want to keep stats, but GDPR implies deletion)
            // For strict compliance, we delete.
            await db.shop.delete({ where: { id: shopRecord.id } });

            console.log(`[GDPR] Fully wiped data for shop ${shopUrl}`);
        }
    } catch (e) {
        // If shop not found or already deleted, it's fine.
        console.error("GDPR Shop Redact Error", e);
    }

    return new Response();
};
