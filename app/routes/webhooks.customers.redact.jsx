import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Payload: { customer: { id: 123456, email: '...' }, ... }

    try {
        const customerEmail = payload.customer.email;
        if (customerEmail) {
            // Anonymize offers for this customer
            const result = await db.offer.updateMany({
                where: { customerEmail: customerEmail },
                data: {
                    customerEmail: 'redacted@deleted.com',
                    status: 'REDACTED'
                }
            });
            console.log(`[GDPR] Redacted ${result.count} offers for ${customerEmail}.`);
        }
    } catch (e) {
        console.error("GDPR Redact Error", e);
    }

    return new Response();
};
