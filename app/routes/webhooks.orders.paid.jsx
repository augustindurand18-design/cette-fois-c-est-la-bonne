import { authenticate, PLAN_STARTER, PLAN_GROWTH } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
        // The admin context isn't available if the session is missing, but for webhooks with delivery method HTTP, 
        // it handles session tokens or offline tokens. If we used `shopify.webhook`, we might need to handle session manually 
        // or rely on `authenticate.webhook` providing it from offline storage if configured.
        return new Response();
    }

    // 1. Validate Topic
    if (topic !== "ORDERS_PAID") {
        return new Response();
    }

    const order = payload;
    console.log(`WEBHOOK: Order ${order.name} paid in shop ${shop}`);

    // 2. Check for Discount Codes
    const discountCodes = order.discount_codes || [];
    if (discountCodes.length === 0) {
        console.log("No discount codes in order. Skipping commission check.");
        return new Response();
    }

    try {
        // 3. Match Discount Code to Offer
        for (const codeObj of discountCodes) {
            const code = codeObj.code;

            const offer = await db.offer.findFirst({
                where: { code: code, status: "ACCEPTED" }, // Ensure it was an accepted offer
            });

            if (offer) {
                console.log(`Matched App Offer: ${code} for Order ${order.name}`);

                // 4. Mark Offer as Converted
                if (!offer.isConverted) {
                    await db.offer.update({
                        where: { id: offer.id },
                        data: {
                            isConverted: true,
                            convertedAt: new Date(),
                            orderId: String(order.id)
                        },
                    });
                }

                // 5. Calculate Commission
                // We need to check the shop's active plan to determine percentage.
                // Since we are in a webhook, we might rely on DB `shop.plan` if we sync it, 
                // OR we can query Billing API (slower).
                // Let's assume we sync `plan` to DB or check Billing API via `admin.billing`.

                let commissionRate = 0;

                // Check Billing via API to be accurate
                const billing = admin.billing;
                const isStarter = await billing.check({ plans: [PLAN_STARTER], isTest: true });
                const isGrowth = await billing.check({ plans: [PLAN_GROWTH], isTest: true });
                // Scale is 0% so we don't care

                if (isStarter) commissionRate = 0.04;
                else if (isGrowth) commissionRate = 0.01;

                if (commissionRate > 0) {
                    // Price to charge commission on:
                    // The offer was for a specific product price. The order might have multiple items.
                    // Ideally we charge on the `offer.offeredPrice`.

                    // Secure Math: Work in cents to avoid floating point errors
                    const priceInCents = Math.round(offer.offeredPrice * 100);
                    const commissionInCents = Math.round(priceInCents * commissionRate);
                    const commissionAmount = commissionInCents / 100;

                    console.log(`Charging commission: ${commissionAmount} (Rate: ${commissionRate}) for Offer Price: ${offer.offeredPrice}`);

                    // 6. Create Usage Record
                    // We need the subscriptionLineItemId. `admin.billing.request` handles subscriptions, 
                    // but `createUsageRecord` needs the line item ID.
                    // Getting it is tricky without querying all subscriptions.

                    // Helper to find subscription
                    const subscriptions = await admin.graphql(
                        `#graphql
                query {
                  appInstallation {
                    activeSubscriptions {
                      id
                      name
                      lineItems {
                        id
                        plan {
                          pricingDetails {
                            ... on AppUsagePricing {
                              balanceUsed {
                                amount
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }`
                    );

                    const subData = await subscriptions.json();
                    const activeSub = subData.data.appInstallation.activeSubscriptions[0];

                    if (activeSub) {
                        const lineItem = activeSub.lineItems.find(item => item.plan?.pricingDetails?.balanceUsed !== undefined);

                        if (lineItem) {
                            try {
                                const roundedCommission = parseFloat(commissionAmount.toFixed(2));
                                await billing.createUsageRecord({
                                    subscriptionLineItemId: lineItem.id,
                                    price: { amount: roundedCommission, currencyCode: 'USD' },
                                    description: `Commission (${commissionRate * 100}%) for Order ${order.name}`,
                                    isTest: true,
                                });
                                console.log(`Usage record created successfully: $${roundedCommission}`);
                            } catch (billingError) {
                                console.error("Billing Error:", billingError);
                                // KILL SWITCH
                                // If we can't charge, we must stop the service to prevent revenue loss
                                // Detect if error is due to Capped Amount
                                // Note: Error messages vary, but usually contain "usage limit"
                                const errorString = String(billingError);
                                if (errorString.includes("usage limit") || errorString.includes("maximum")) {
                                    console.warn(`[BILLING ALERT] Shop ${shop} reached spending limit. Disabling active status.`);

                                    await db.shop.update({
                                        where: { shopUrl: shop },
                                        data: {
                                            isActive: false,
                                            // Optional: Add a flag 'billingIssue: true' if you have it in schema
                                        }
                                    });
                                }
                            }
                        } else {
                            console.error("No usage line item found in subscription.");
                        }
                    }
                } else {
                    console.log("0% Commission plan. Skipping charge.");
                }
            }
        }

    } catch (error) {
        console.error("Error processing commission webhook:", error);
    }

    return new Response();
};
