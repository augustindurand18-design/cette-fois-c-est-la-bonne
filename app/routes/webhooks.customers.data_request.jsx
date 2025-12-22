import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    // Payload contains { customer: { id: 123456, email: '...' }, orders_requested: [...] }

    // In a real production app, you would:
    // 1. Gather all data related to payload.customer.email
    // 2. Send an email to the merchant or Shopify with this data.
    // Since SmartOffer mainly stores offers by email (if manually entered), we log it.

    try {
        const customerEmail = payload.customer.email;
        if (customerEmail) {
            const offers = await db.offer.findMany({
                where: { customerEmail: customerEmail }
            });
            console.log(`[GDPR] Found ${offers.length} offers for ${customerEmail}. Data request acknowledged.`);
        }
    } catch (e) {
        console.error("GDPR Data Request Error", e);
    }

    return new Response();
};
