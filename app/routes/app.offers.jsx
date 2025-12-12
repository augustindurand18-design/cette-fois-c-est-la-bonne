import {
    Page,
    Layout,
    Card,
    ResourceList,
    ResourceItem,
    Text,
    Badge,
    Button,
    ButtonGroup,
    Banner,
    BlockStack,
    Box,
    EmptyState,
    Modal,
    TextField,
    Frame,
    Toast
} from "@shopify/polaris";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ShopifyService } from "../services/ShopifyService";
import { EmailService } from "../services/EmailService";
import { useTranslation } from "react-i18next";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    // Check if shop exists
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });
    if (!shop) return { offers: [] };

    // Fetch Pending Offers
    const offers = await db.offer.findMany({
        where: {
            shopId: shop.id,
            status: "PENDING", // Only show pending manual offers for now
        },
        orderBy: { createdAt: "desc" },
    });

    return { offers };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const offerId = formData.get("offerId");
    const intent = formData.get("intent"); // ACCEPT | REJECT | COUNTER

    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });
    if (!shop) return { success: false, error: "Shop not found" };

    const credentials = {
        user: shop.gmailUser,
        pass: shop.gmailAppPassword
    };

    const offer = await db.offer.findUnique({ where: { id: offerId } });
    if (!offer) return { success: false, error: "Offer not found" };

    if (intent === "ACCEPT") {
        // 1. Generate Discount Code (Valid 3 hours)
        const code = `MANUAL-${Math.floor(Math.random() * 1000000)}`;
        const productGid = offer.productId ? `gid://shopify/Product/${offer.productId}` : null;
        const discountAmount = offer.originalPrice - offer.offeredPrice;

        // Validity: Now to Now + 3 Hours
        const now = new Date();
        const endsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        if (productGid && discountAmount > 0) {
            const createdCode = await ShopifyService.createDiscount(
                shop.shopUrl,
                shop.accessToken,
                code,
                discountAmount,
                productGid,
                endsAt
            );

            if (createdCode) {
                // 2. Update Offer
                await db.offer.update({
                    where: { id: offerId },
                    data: {
                        status: "ACCEPTED",
                        code: code,
                        convertedAt: new Date(), // Using convertedAt to track completion time? Or maybe just status
                    }
                });

                // Send Email to customer
                await EmailService.sendOfferAccepted(credentials, offer.customerEmail, code, endsAt, offer.productTitle || "le produit");

                // console.log(`[EMAIL SENT] To: ${offer.customerEmail}, Subject: Offer Accepted!, Body: Use code ${code}. Valid until ${endsAt.toLocaleString()}`);

                return { success: true, message: `Offer accepted! Code ${code} sent to customer.` };
            }
        }
        return { success: false, error: "Failed to create discount." };

    } else if (intent === "REJECT") {
        await db.offer.update({
            where: { id: offerId },
            data: { status: "REJECTED" }
        });

        // Send Email to customer
        await EmailService.sendOfferRejected(credentials, offer.customerEmail, offer.productTitle || "le produit");

        // console.log(`[EMAIL SENT] To: ${offer.customerEmail}, Subject: Offer Declined.`);

        return { success: true, message: "Offer rejected." };

    } else if (intent === "COUNTER") {
        const counterPrice = parseFloat(formData.get("counterPrice"));

        await db.offer.update({
            where: { id: offerId },
            data: {
                status: "COUNTERED",
                counterPrice: counterPrice
            }
        });

        // Send Email to customer
        await EmailService.sendCounterOffer(credentials, offer.customerEmail, counterPrice, offer.productTitle || "le produit");

        // console.log(`[EMAIL SENT] To: ${offer.customerEmail}, Subject: Counter Offer: ${counterPrice}€, Body: We can do ${counterPrice}€. Reply if interested.`);

        return { success: true, message: `Counter offer of ${counterPrice}€ sent.` };
    }

    return { success: false };
};

export default function OffersPage() {
    const { t } = useTranslation();
    const { offers } = useLoaderData();
    const fetcher = useFetcher();

    const [activeOffer, setActiveOffer] = useState(null);
    const [counterPrice, setCounterPrice] = useState("");
    const [toastActive, setToastActive] = useState(false);
    const [toastMsg, setToastMsg] = useState("");

    const toggleToast = useCallback(() => setToastActive((active) => !active), []);

    const handleAccept = (id) => {
        fetcher.submit({ offerId: id, intent: "ACCEPT" }, { method: "POST" });
    };

    const handleReject = (id) => {
        fetcher.submit({ offerId: id, intent: "REJECT" }, { method: "POST" });
    };

    const handleOpenCounter = (offer) => {
        setActiveOffer(offer);
        setCounterPrice(offer.originalPrice ? offer.originalPrice.toString() : ""); // Default to original price or empty
    };

    const handleCloseCounter = () => {
        setActiveOffer(null);
        setCounterPrice("");
    };

    const handleSubmitCounter = () => {
        if (activeOffer && counterPrice) {
            fetcher.submit({
                offerId: activeOffer.id,
                intent: "COUNTER",
                counterPrice: counterPrice
            }, { method: "POST" });
            handleCloseCounter();
        }
    };

    // Watch for fetcher success
    if (fetcher.data && fetcher.data.message && fetcher.state === "idle" && fetcher.data.message !== toastMsg) {
        setToastMsg(fetcher.data.message);
        setToastActive(true);
    }

    const emptyStateMarkup = (
        <EmptyState
            heading={t('offers.empty_heading')}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <p>{t('offers.empty_body')}</p>
        </EmptyState>
    );

    const toastMarkup = toastActive ? (
        <Toast content={toastMsg} onDismiss={toggleToast} duration={4000} />
    ) : null;

    return (
        <Frame>
            <Page title={t('offers.title')}>
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            <ResourceList
                                resourceName={{ singular: 'offer', plural: 'offers' }}
                                items={offers}
                                emptyState={emptyStateMarkup}
                                renderItem={(item) => {
                                    const { id, offeredPrice, originalPrice, productTitle, customerEmail, createdAt } = item;
                                    const date = new Date(createdAt).toLocaleDateString();

                                    return (
                                        <ResourceItem
                                            id={id}
                                            accessibilityLabel={`View offer for ${productTitle}`}
                                        >
                                            <BlockStack gap="200">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                    <div>
                                                        <Text variant="headingMd" as="h3">
                                                            {productTitle}
                                                        </Text>
                                                        <Text variant="bodySm" tone="subdued">
                                                            {date} • {customerEmail}
                                                        </Text>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <Text variant="headingLg" as="span" tone="success">
                                                            {offeredPrice} €
                                                        </Text>
                                                        <Text variant="bodySm" tone="subdued" as="span" style={{ marginLeft: '8px', textDecoration: 'line-through' }}>
                                                            {originalPrice} €
                                                        </Text>
                                                    </div>
                                                </div>

                                                <ButtonGroup>
                                                    <Button
                                                        variant="primary"
                                                        tone="success"
                                                        onClick={() => handleAccept(id)}
                                                        loading={fetcher.state === "submitting" && fetcher.formData?.get("offerId") === id && fetcher.formData?.get("intent") === "ACCEPT"}
                                                    >
                                                        {t('offers.accept')}
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleOpenCounter(item)}
                                                    >
                                                        {t('offers.counter')}
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        tone="critical"
                                                        onClick={() => handleReject(id)}
                                                        loading={fetcher.state === "submitting" && fetcher.formData?.get("offerId") === id && fetcher.formData?.get("intent") === "REJECT"}
                                                    >
                                                        {t('offers.reject')}
                                                    </Button>
                                                </ButtonGroup>
                                            </BlockStack>
                                        </ResourceItem>
                                    );
                                }}
                            />
                        </Card>
                    </Layout.Section>
                </Layout>

                <Modal
                    open={!!activeOffer}
                    onClose={handleCloseCounter}
                    title={t("offers.counter_modal_title")}
                    primaryAction={{
                        content: t("offers.send_counter"),
                        onAction: handleSubmitCounter,
                    }}
                    secondaryActions={[
                        {
                            content: t("offers.cancel"),
                            onAction: handleCloseCounter,
                        },
                    ]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            <Text as="p">
                                {t("offers.counter_instruction", {
                                    price: activeOffer?.offeredPrice,
                                    email: activeOffer?.customerEmail
                                })}
                            </Text>
                            <TextField
                                label={t("offers.new_price")}
                                value={counterPrice}
                                onChange={setCounterPrice}
                                type="number"
                                prefix="€"
                                autoComplete="off"
                            />
                        </BlockStack>
                    </Modal.Section>
                </Modal>
                {toastMarkup}
            </Page>
        </Frame>
    );
}
