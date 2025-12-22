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
    Toast,
    Thumbnail,
    InlineStack
} from "@shopify/polaris";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ShopifyService } from "../services/ShopifyService";
import { EmailService } from "../services/EmailService";
import { useTranslation } from "react-i18next";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);

    // Check if shop exists
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });
    if (!shop) return { pendingOffers: [], historyOffers: [] };

    // Fetch Pending Offers
    const pendingOffersData = await db.offer.findMany({
        where: {
            shopId: shop.id,
            status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
    });

    // Fetch History Offers (Alles else)
    const historyOffersData = await db.offer.findMany({
        where: {
            shopId: shop.id,
            status: { not: "PENDING" },
        },
        orderBy: { createdAt: "desc" },
        take: 50 // Limit history to last 50 for performance
    });

    // Helper to fetch images
    // Optimized helper to fetch images in ONE batch request
    const attachImages = async (offers) => {
        const productIds = offers
            .filter(o => o.productId)
            .map(o => `gid://shopify/Product/${o.productId}`);

        if (productIds.length === 0) return offers;

        try {
            const response = await admin.graphql(
                `#graphql
                query getProductImages($ids: [ID!]!) {
                    nodes(ids: $ids) {
                        ... on Product {
                            id
                            featuredImage {
                                url
                            }
                        }
                    }
                }`,
                { variables: { ids: productIds } }
            );

            const data = await response.json();
            const products = data.data?.nodes || [];

            // Create a lookup map: numeric ID -> image URL
            const imageMap = {};
            products.forEach(p => {
                if (p && p.id) {
                    const idParts = p.id.split('/');
                    const numericId = idParts[idParts.length - 1];
                    imageMap[numericId] = p.featuredImage?.url;
                }
            });

            return offers.map(offer => ({
                ...offer,
                imageUrl: offer.productId ? imageMap[offer.productId] : null
            }));

        } catch (err) {
            console.error("Failed to batch fetch images:", err);
            return offers; // Return offers without images on failure
        }
    };

    const [pendingOffers, historyOffers] = await Promise.all([
        attachImages(pendingOffersData),
        attachImages(historyOffersData)
    ]);

    return { pendingOffers, historyOffers };
};

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const offerId = formData.get("offerId");
    const intent = formData.get("intent"); // ACCEPT | REJECT | COUNTER

    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });
    if (!shop) return { success: false, error: "Shop not found" };

    // Fetch Shop Name for Email Sender
    let shopName = shop.shopUrl;
    try {
        const response = await admin.graphql(`{ shop { name } }`);
        const data = await response.json();
        if (data.data?.shop?.name) {
            shopName = data.data.shop.name;
        }
    } catch (err) {
        console.error("Failed to fetch shop name:", err);
    }

    const credentials = {
        user: shop.gmailUser,
        pass: shop.gmailAppPassword,
        smtpHost: shop.smtpHost,
        smtpPort: shop.smtpPort,
        name: shopName
    };

    const customization = {
        font: shop.emailFont,
        primaryColor: shop.emailPrimaryColor,
        subject: shop.emailAcceptedSubject, // Will be overridden for other types if passed but good to have access
        body: shop.emailAcceptedBody // Same
    };

    const offer = await db.offer.findUnique({ where: { id: offerId } });
    if (!offer) return { success: false, error: "Offer not found" };

    if (intent === "ACCEPT") {
        // 1. Generate Discount Code (Valid 3 hours)
        const code = `MANUAL-${Math.floor(Math.random() * 1000000)}`;
        const productGid = offer.productId ? `gid://shopify/Product/${offer.productId}` : null;
        const discountAmount = offer.originalPrice - offer.offeredPrice;

        // Validity: Manual Duration (Minutes)
        const durationMinutes = shop.manualValidityDuration || 72 * 60; // Default to 72h (converted to mins) if old default
        const now = new Date();
        const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

        // Fetch Product Handle for "Buy Now" Link
        let checkoutUrl = null;
        if (productGid && admin) {
            try {
                const response = await admin.graphql(
                    `#graphql
                    query getProductHandle($id: ID!) {
                        product(id: $id) {
                            handle
                        }
                    }`,
                    { variables: { id: productGid } }
                );
                const data = await response.json();
                const handle = data.data?.product?.handle;

                if (handle) {
                    checkoutUrl = `https://${shop.shopUrl}/discount/${code}?redirect=/products/${handle}`;
                }
            } catch (err) {
                console.error("Failed to fetch product handle:", err);
            }
        }

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
                        convertedAt: new Date(),
                    }
                });

                // Send Email to customer
                await EmailService.sendOfferAccepted(
                    credentials,
                    offer.customerEmail,
                    code,
                    endsAt,
                    offer.productTitle || "le produit",
                    checkoutUrl, // New arg
                    {
                        ...customization,
                        subject: shop.emailAcceptedSubject,
                        body: shop.emailAcceptedBody
                    }
                );

                return { success: true, message: `Offer accepted! Code ${code} sent to customer.` };
            }
        }
        return { success: false, error: "Failed to create discount." };

    } else if (intent === "REJECT") {
        await db.offer.update({
            where: { id: offerId },
            data: { status: "REJECTED" }
        });

        // Fetch Handle (for return link)
        let productUrl = `https://${shop.shopUrl}`; // Fallback
        const productGid = offer.productId ? `gid://shopify/Product/${offer.productId}` : null;

        if (productGid && admin) {
            try {
                const response = await admin.graphql(
                    `#graphql
                    query getProductHandle($id: ID!) {
                        product(id: $id) {
                            handle
                        }
                    }`,
                    { variables: { id: productGid } }
                );
                const data = await response.json();
                const handle = data.data?.product?.handle;

                if (handle) {
                    productUrl = `https://${shop.shopUrl}/products/${handle}`;
                }
            } catch (err) {
                console.error("Failed to fetch handle for reject:", err);
            }
        }

        // Send Email to customer
        await EmailService.sendOfferRejected(
            credentials,
            offer.customerEmail,
            offer.productTitle || "the product",
            productUrl, // New Arg
            {
                ...customization,
                subject: shop.emailRejectedSubject,
                body: shop.emailRejectedBody
            }
        );

        return { success: true, message: "Offer rejected." };

    } else if (intent === "COUNTER") {
        const counterPrice = parseFloat(formData.get("counterPrice"));
        const discountAmount = offer.originalPrice - counterPrice;

        // 1. Generate Counter Code
        const code = `COUNTER-${Math.floor(Math.random() * 1000000)}`;
        const productGid = offer.productId ? `gid://shopify/Product/${offer.productId}` : null;

        // Validity: Manual Duration (Minutes)
        const durationMinutes = shop.manualValidityDuration || 72 * 60;
        const now = new Date();
        const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

        // Fetch Handle (for links)
        let checkoutUrl = null;
        let productUrl = `https://${shop.shopUrl}`; // Fallback

        if (productGid && admin) {
            try {
                const response = await admin.graphql(
                    `#graphql
                    query getProductHandle($id: ID!) {
                        product(id: $id) {
                            handle
                        }
                    }`,
                    { variables: { id: productGid } }
                );
                const data = await response.json();
                const handle = data.data?.product?.handle;

                if (handle) {
                    productUrl = `https://${shop.shopUrl}/products/${handle}`;
                    checkoutUrl = `https://${shop.shopUrl}/discount/${code}?redirect=/products/${handle}`;
                }
            } catch (err) {
                console.error("Failed to fetch handle for counter:", err);
            }
        }

        // 2. Create Discount for Counter Price
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
                await db.offer.update({
                    where: { id: offerId },
                    data: {
                        status: "COUNTERED",
                        counterPrice: counterPrice,
                        code: code // Store this code so we know it exists
                    }
                });

                // Send Email
                await EmailService.sendCounterOffer(
                    credentials,
                    offer.customerEmail,
                    counterPrice,
                    offer.productTitle || "the product",
                    code,
                    endsAt,
                    checkoutUrl,
                    productUrl,
                    {
                        ...customization,
                        subject: shop.emailCounterSubject,
                        body: shop.emailCounterBody
                    }
                );

                return { success: true, message: `Counter offer sent with code ${code}.` };
            }
        }

        return { success: false, error: "Failed to create counter discount." };
    }

    return { success: false };
};




export default function OffersPage() {
    const { t } = useTranslation();
    const { pendingOffers, historyOffers } = useLoaderData();
    const fetcher = useFetcher();

    const [selectedTab, setSelectedTab] = useState('pending');
    const [activeOffer, setActiveOffer] = useState(null);
    const [counterPrice, setCounterPrice] = useState("");
    const [toastActive, setToastActive] = useState(false);
    const [toastMsg, setToastMsg] = useState("");

    const handleTabChange = useCallback(
        (value) => setSelectedTab(value),
        [],
    );





    const toggleToast = useCallback(() => setToastActive((active) => !active), []);

    const handleAccept = (id) => fetcher.submit({ offerId: id, intent: "ACCEPT" }, { method: "POST" });
    const handleReject = (id) => fetcher.submit({ offerId: id, intent: "REJECT" }, { method: "POST" });

    const handleOpenCounter = (offer) => {
        setActiveOffer(offer);
        setCounterPrice(offer.originalPrice ? offer.originalPrice.toString() : "");
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

    // Custom lightweight row component to guarantee instant rendering without ResourceList overhead
    const OfferRow = ({ offer, isHistory, onAccept, onReject, onCounter, activeFetcherId }) => {
        const { t } = useTranslation();
        const { id, offeredPrice, originalPrice, productTitle, customerEmail, createdAt, imageUrl, status, counterPrice: itemCounterPrice } = offer;
        const date = new Date(createdAt).toLocaleDateString();

        let badge = null;
        if (status === "ACCEPTED") badge = <Badge tone="success">Acceptée</Badge>;
        else if (status === "REJECTED") badge = <Badge tone="critical">Refusée</Badge>;
        else if (status === "COUNTERED") badge = <Badge tone="warning">Contre-offre ({itemCounterPrice}€)</Badge>;
        else if (status === "PENDING") badge = <Badge tone="attention">En attente</Badge>;

        return (
            <Box padding="400" borderBlockEndWidth="025" borderColor="border-subdued">
                <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                        {/* Left: Image + Info */}
                        <InlineStack gap="400" wrap={false} blockAlign="center">
                            <Thumbnail
                                source={imageUrl || ""}
                                alt={productTitle}
                                size="small"
                            />
                            <BlockStack gap="050">
                                <Text variant="headingMd" as="h3">
                                    {productTitle}
                                </Text>
                                <Text variant="bodySm" tone="subdued">
                                    {date} • {customerEmail}
                                </Text>
                            </BlockStack>
                        </InlineStack>

                        {/* Right: Price + Badge */}
                        <BlockStack gap="100" align="end">
                            <div>
                                <Text variant="headingLg" as="span" tone="success">
                                    {offeredPrice} €
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span" style={{ marginLeft: '8px', textDecoration: 'line-through' }}>
                                    {originalPrice} €
                                </Text>
                            </div>
                            {badge}
                        </BlockStack>
                    </InlineStack>

                    {/* Actions (Only for Pending) */}
                    {!isHistory && (
                        <InlineStack gap="200" align="end">
                            <Button
                                onClick={() => onCounter(offer)}
                            >
                                {t('offers.counter')}
                            </Button>
                            <Button
                                variant="primary"
                                tone="critical"
                                onClick={() => onReject(id)}
                                loading={activeFetcherId === id + "-REJECT"}
                            >
                                {t('offers.reject')}
                            </Button>
                            <Button
                                variant="primary"
                                tone="success"
                                onClick={() => onAccept(id)}
                                loading={activeFetcherId === id + "-ACCEPT"}
                            >
                                {t('offers.accept')}
                            </Button>
                        </InlineStack>
                    )}
                </BlockStack>
            </Box>
        );
    };

    // Main List Container
    const OffersListContainer = ({ offers, isHistory, onAccept, onReject, onCounter, fetcher }) => {
        const { t } = useTranslation();

        if (!offers || offers.length === 0) {
            return (
                <Box padding="800">
                    <EmptyState
                        heading={t('offers.empty_heading')}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>{isHistory ? "Aucune offre traitée pour le moment." : t('offers.empty_body')}</p>
                    </EmptyState>
                </Box>
            );
        }

        return (
            <div>
                {offers.map(offer => (
                    <OfferRow
                        key={offer.id}
                        offer={offer}
                        isHistory={isHistory}
                        onAccept={onAccept}
                        onReject={onReject}
                        onCounter={onCounter}
                        activeFetcherId={fetcher.state === "submitting" ? fetcher.formData?.get("offerId") + "-" + fetcher.formData?.get("intent") : null}
                    />
                ))}
            </div>
        );
    };
    const toastMarkup = toastActive ? (
        <Toast content={toastMsg} onDismiss={toggleToast} duration={4000} />
    ) : null;

    return (
        <Frame>
            <Page title={t('offers.title')}>
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            <Box padding="300" borderBlockEndWidth="025" borderColor="border-subdued">
                                <InlineStack gap="200">
                                    <Button
                                        pressed={selectedTab === 'pending'}
                                        onClick={() => handleTabChange('pending')}
                                    >
                                        {t('offers.pending') || "En attente"}
                                    </Button>
                                    <Button
                                        pressed={selectedTab === 'history'}
                                        onClick={() => handleTabChange('history')}
                                    >
                                        {t('offers.history') || "Historique"}
                                    </Button>
                                </InlineStack>

                            </Box>
                            <div style={{ display: selectedTab === 'pending' ? 'block' : 'none' }}>
                                <OffersListContainer
                                    offers={pendingOffers}
                                    isHistory={false}
                                    onAccept={handleAccept}
                                    onReject={handleReject}
                                    onCounter={handleOpenCounter}
                                    fetcher={fetcher}
                                />
                            </div>
                            <div style={{ display: selectedTab === 'history' ? 'block' : 'none' }}>
                                <OffersListContainer
                                    offers={historyOffers}
                                    isHistory={true}
                                    onAccept={handleAccept}
                                    onReject={handleReject}
                                    onCounter={handleOpenCounter}
                                    fetcher={fetcher}
                                />
                            </div>
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
        </Frame >
    );
}
