import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { topic, shop, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
        return new Response();
    }

    if (topic !== "DRAFT_ORDERS_UPDATE") {
        return new Response();
    }

    const draftOrder = payload;
    console.log(`WEBHOOK: Draft Order ${draftOrder.id} updated in shop ${shop}. Status: ${draftOrder.status}`);

    // We only care if the draft order is completed (paid)
    if (draftOrder.status !== "completed") {
        return new Response();
    }

    // A completed draft order will typically have an order_id attached
    const orderId = draftOrder.order_id;
    if (!orderId) {
        return new Response();
    }

    try {
        // Draft Orders created by our app have a specific tag, or we can cross-reference by the Draft Order ID
        // In api.negotiate, we save the offer.code like: DRAFT-123456789
        const draftIdCode = `DRAFT-${draftOrder.id}`;

        const offer = await db.offer.findFirst({
            where: {
                shop: { shopUrl: shop },
                code: draftIdCode,
                status: "ACCEPTED_DRAFT"
            }
        });

        if (offer) {
            console.log(`Matched App Draft Offer: ${draftIdCode} for actual Order ${orderId}`);

            if (!offer.isConverted) {
                await db.offer.update({
                    where: { id: offer.id },
                    data: {
                        isConverted: true,
                        convertedAt: new Date(),
                        orderId: String(orderId),
                        status: "ACCEPTED" // Standardize status for dashboard visibility if needed
                    },
                });
                console.log(`Offer ${offer.id} marked as converted.`);

                // Note: Revenue commission logic for Draft Orders could be added here
                // similar to orders/paid logic, IF we want to charge commission on VIP orders too.
            }
        } else {
            console.log(`No matching offer found for Draft Order ${draftOrder.id}`);
        }

    } catch (error) {
        console.error("Error processing draft order webhook:", error);
    }

    return new Response();
};
