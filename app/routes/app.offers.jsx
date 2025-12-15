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
    Tabs
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
    const attachImages = async (offers) => {
        return Promise.all(offers.map(async (offer) => {
            let imageUrl = null;
            if (offer.productId) {
                try {
                    const response = await admin.graphql(
                        `#graphql
                        query getProductImage($id: ID!) {
                            product(id: $id) {
                                featuredImage {
                                    url
                                }
                            }
                        }`,
                        { variables: { id: `gid://shopify/Product/${offer.productId}` } }
                    );
                    const data = await response.json();
                    imageUrl = data.data?.product?.featuredImage?.url;
                } catch (err) {
                    // console.error("Failed to fetch image:", err);
                }
            }
            return { ...offer, imageUrl };
        }));
    };

    const pendingOffers = await attachImages(pendingOffersData);
    const historyOffers = await attachImages(historyOffersData);

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

    const [selectedTab, setSelectedTab] = useState(0);
    const [activeOffer, setActiveOffer] = useState(null);
    const [counterPrice, setCounterPrice] = useState("");
    const [toastActive, setToastActive] = useState(false);
    const [toastMsg, setToastMsg] = useState("");

    const handleTabChange = useCallback(
        (selectedTabIndex) => setSelectedTab(selectedTabIndex),
        [],
    );

    const tabs = [
        {
            id: 'pending-offers',
            content: "En attente",
            accessibilityLabel: 'Offers pending review',
            panelID: 'pending-offers-content',
        },
        {
            id: 'history-offers',
            content: "Historique",
            accessibilityLabel: 'Past offers',
            panelID: 'history-offers-content',
        },
    ];

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

    const renderOfferList = (offers, isHistory = false) => (
        <ResourceList
            resourceName={{ singular: 'offer', plural: 'offers' }}
            items={offers}
            emptyState={
                <EmptyState
                    heading={t('offers.empty_heading')}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                    <p>{isHistory ? "Aucune offre traitée pour le moment." : t('offers.empty_body')}</p>
                </EmptyState>
            }
            renderItem={(item) => {
                const { id, offeredPrice, originalPrice, productTitle, customerEmail, createdAt, imageUrl, status, counterPrice: itemCounterPrice } = item;
                const date = new Date(createdAt).toLocaleDateString();

                const media = (
                    <Thumbnail
                        source={imageUrl || ""}
                        alt={productTitle}
                        size="small"
                    />
                );

                let badge = null;
                if (status === "ACCEPTED") badge = <Badge tone="success">Acceptée</Badge>;
                else if (status === "REJECTED") badge = <Badge tone="critical">Refusée</Badge>;
                else if (status === "COUNTERED") badge = <Badge tone="warning">Contre-offre ({itemCounterPrice}€)</Badge>;
                else if (status === "PENDING") badge = <Badge tone="attention">En attente</Badge>;

                return (
                    <ResourceItem
                        id={id}
                        accessibilityLabel={`View offer for ${productTitle}`}
                        media={media}
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
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <div>
                                        <Text variant="headingLg" as="span" tone="success">
                                            {offeredPrice} €
                                        </Text>
                                        <Text variant="bodySm" tone="subdued" as="span" style={{ marginLeft: '8px', textDecoration: 'line-through' }}>
                                            {originalPrice} €
                                        </Text>
                                    </div>
                                    {badge}
                                </div>
                            </div>

                            {!isHistory && (
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
                            )}
                        </BlockStack>
                    </ResourceItem>
                );
            }}
        />
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
                            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                                {selectedTab === 0 && renderOfferList(pendingOffers, false)}
                                {selectedTab === 1 && renderOfferList(historyOffers, true)}
                            </Tabs>
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
