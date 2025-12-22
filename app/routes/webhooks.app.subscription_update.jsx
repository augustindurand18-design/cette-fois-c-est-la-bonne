import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    // Payload: AppSubscription
    // { status: "ACTIVE" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN", ... }

    console.log(`WEBHOOK: Subscription Update for ${shop}. Status: ${payload.app_subscription.status}`);

    const status = payload.app_subscription.status;
    const isActive = status === "ACTIVE";

    // If subscription is cancelled/expired, we disable the bot immediately
    // so they can't use the service for free.

    // We also might want to update the 'plan' field in DB if the user changed plans.
    // The payload usually contains the name of the plan: payload.app_subscription.name

    try {
        const planName = payload.app_subscription.name || "FREE";

        await db.shop.update({
            where: { shopUrl: shop },
            data: {
                isActive: isActive ? undefined : false, // If Not Active, force false. If Active, leave as is (user might have paused manually)
                plan: planName
            }
        });

        if (!isActive) {
            console.log(`[BILLING] Disabling shop ${shop} due to subscription status: ${status}`);
        }

    } catch (e) {
        console.error("Error updating shop subscription status:", e);
    }

    return new Response();
};
