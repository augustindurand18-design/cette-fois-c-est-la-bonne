import { useLoaderData, useSubmit } from "react-router";
import { Page, Layout, Card, Text, Button, BlockStack, Box, InlineGrid, List, Badge, Divider, Icon, InlineStack, ProgressBar } from "@shopify/polaris";
import { CheckIcon, XIcon } from "@shopify/polaris-icons";
import { authenticate, PLAN_STARTER, PLAN_GROWTH, PLAN_SCALE } from "../shopify.server";

export async function loader({ request }) {
    const { billing, admin } = await authenticate.admin(request);

    try {
        // Check active plans
        const isGrowth = await billing.check({ plans: [PLAN_GROWTH], isTest: true });
        const isScale = await billing.check({ plans: [PLAN_SCALE], isTest: true });
        const isStarter = await billing.check({ plans: [PLAN_STARTER], isTest: true });

        let currentPlan = "Starter";
        if (isScale) currentPlan = "Scale";
        else if (isGrowth) currentPlan = "Growth";
        else if (isStarter) currentPlan = "Starter";

        return { currentPlan };
    } catch (error) {
        // Fallback re-check
        const isGrowth = await billing.check({ plans: [PLAN_GROWTH], isTest: true });
        const isScale = await billing.check({ plans: [PLAN_SCALE], isTest: true });

        let currentPlan = "Starter";
        if (isScale) currentPlan = "Scale";
        else if (isGrowth) currentPlan = "Growth";

        // Fetch Subscription Usage Stats
        let usageDetails = { isUsageCapped: false, usedAmount: 0, cappedAmount: 0, percentage: 0 };
        try {
            const subscriptions = await admin.graphql(
                `#graphql
                query {
                    appInstallation {
                        activeSubscriptions {
                            name
                            lineItems {
                                plan {
                                    pricingDetails {
                                        ... on AppUsagePricing {
                                            balanceUsed { amount }
                                            cappedAmount { amount }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }`
            );
            const subData = await subscriptions.json();
            const activeSubs = subData.data?.appInstallation?.activeSubscriptions || [];

            if (activeSubs.length > 0) {
                for (const sub of activeSubs) {
                    for (const lineItem of sub.lineItems) {
                        const pricing = lineItem.plan?.pricingDetails;
                        if (pricing && pricing.balanceUsed) {
                            usageDetails.isUsageCapped = true;
                            usageDetails.usedAmount = parseFloat(pricing.balanceUsed.amount);
                            usageDetails.cappedAmount = parseFloat(pricing.cappedAmount.amount);
                            usageDetails.percentage = usageDetails.cappedAmount > 0
                                ? (usageDetails.usedAmount / usageDetails.cappedAmount) * 100
                                : 0;
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch usage limits", error);
        }

        return { currentPlan, usageDetails };
    }
}

export async function action({ request }) {
    const { billing } = await authenticate.admin(request);
    const formData = await request.formData();
    const plan = formData.get("plan");

    if (plan === "Starter") {
        await billing.request({
            plan: PLAN_STARTER,
            isTest: true,
        });
    } else if (plan === "Growth") {
        await billing.request({
            plan: PLAN_GROWTH,
            isTest: true,
        });
    } else if (plan === "Scale") {
        await billing.request({
            plan: PLAN_SCALE,
            isTest: true,
        });
    }

    return null;
}

export default function Pricing() {
    const { currentPlan, usageDetails } = useLoaderData();
    const submit = useSubmit();

    const handleUpgrade = (plan) => {
        submit({ plan }, { method: "POST" });
    };

    const PlanCard = ({ title, price, features, limitations, isCurrent, targetPlan, recommendation }) => (
        <Card>
            <BlockStack gap="500">
                <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingXl" as="h2">{title}</Text>
                        {recommendation ? (
                            <Badge tone="info">{recommendation}</Badge>
                        ) : (
                            <Box minHeight="20px" />
                        )}
                    </InlineStack>
                    <Text variant="heading3xl" as="p">{price}</Text>
                    <Box minHeight="24px">
                        {isCurrent && <Badge tone="success">Current Plan</Badge>}
                    </Box>
                </BlockStack>
                <Divider />
                <BlockStack gap="300">
                    {features.map((feature, index) => (
                        <InlineStack key={index} gap="300" blockAlign="center" wrap={false}>
                            <Box minWidth="24px">
                                <Icon source={CheckIcon} tone="success" />
                            </Box>
                            <Text variant="bodyLg" as="span" fontWeight={feature.includes('%') ? 'bold' : 'regular'}>
                                {feature}
                            </Text>
                        </InlineStack>
                    ))}
                    {limitations && limitations.map((limitation, index) => (
                        <InlineStack key={`limit-${index}`} gap="300" blockAlign="center" wrap={false}>
                            <Box minWidth="24px">
                                <Icon source={XIcon} tone="critical" />
                            </Box>
                            <Text variant="bodyLg" as="span" tone="subdued">
                                {limitation}
                            </Text>
                        </InlineStack>
                    ))}
                </BlockStack>
                <Box paddingBlockStart="200">
                    <Button
                        variant={isCurrent && (!usageDetails?.isUsageCapped || usageDetails.percentage < 80) ? "secondary" : "primary"}
                        disabled={isCurrent && (!usageDetails?.isUsageCapped || usageDetails.percentage < 80)}
                        onClick={() => handleUpgrade(targetPlan)}
                        fullWidth
                        size="large"
                        tone={isCurrent && usageDetails?.percentage >= 80 ? "critical" : undefined}
                    >
                        {isCurrent
                            ? (usageDetails?.percentage >= 80 ? `Renew Plan to Reset Limit` : "Active")
                            : `Upgrade to ${title}`}
                    </Button>
                </Box>
            </BlockStack>
        </Card>
    );

    return (
        <Page title="Pricing Plans" backAction={{ content: "Home", url: "/app" }}>
            <Layout>
                {usageDetails?.isUsageCapped && (
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingMd" as="h2">Monthly Billing Limit Progress</Text>
                                <ProgressBar
                                    progress={usageDetails.percentage}
                                    tone={usageDetails.percentage >= 80 ? "critical" : "primary"}
                                />
                                <Text as="p">
                                    You have used <strong>${usageDetails.usedAmount.toFixed(2)}</strong> of your <strong>${usageDetails.cappedAmount.toFixed(2)}</strong> monthly commission limit ({usageDetails.percentage.toFixed(0)}%).
                                    {usageDetails.percentage >= 80 && " Please click 'Renew Plan' below to increase your limit and avoid service interruption."}
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                <Layout.Section>
                    <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
                        <PlanCard
                            title="Starter"
                            price="$0/mo"
                            features={[
                                "Full Features Access",
                                "4% Commission on Sales",
                                "Unlimited Volume",
                                "Priority Support"
                            ]}
                            limitations={[
                                "Remove Watermark"
                            ]}
                            isCurrent={currentPlan === "Starter"}
                            targetPlan="Starter"
                        />
                        <PlanCard
                            title="Growth"
                            price="$19/mo"
                            recommendation="Best for sales > $600/mo"
                            features={[
                                "Full Features Access",
                                "1% Commission on Sales",
                                "Unlimited Volume",
                                "Priority Support"
                            ]}
                            limitations={[
                                "Remove Watermark"
                            ]}
                            isCurrent={currentPlan === "Growth"}
                            targetPlan="Growth"
                        />
                        <PlanCard
                            title="Scale"
                            price="$59/mo"
                            recommendation="Best for sales > $4000/mo"
                            features={[
                                "Full Features Access",
                                "0% Commission",
                                "Unlimited Volume",
                                "Priority Support",
                                "Remove Watermark"
                            ]}
                            isCurrent={currentPlan === "Scale"}
                            targetPlan="Scale"
                        />
                    </InlineGrid>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
