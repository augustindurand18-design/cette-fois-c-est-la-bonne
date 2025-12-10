import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    Button,
    ResourceList,
    Avatar,
    ResourceItem,
    InlineStack,
    RangeSlider,
    TextField,
    Badge,
    Frame,
    Toast,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useEffect } from "react";
import crypto from "crypto";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shopUrl = session.shop;

    const shop = await db.shop.findUnique({
        where: { shopUrl },
        include: { rules: true },
    });

    console.log("[LOADER] Shop URL:", shopUrl);
    console.log("[LOADER] Shop found:", !!shop);

    if (!shop) {
        console.log("[LOADER] Shop not found, returning empty rules.");
        return { rules: [] };
    }

    // Filter out the global rule to send only specific rules to the list
    const specificRules = shop.rules.filter((r) => r.collectionId || r.productId);

    // Fetch details from Shopify
    const productIds = specificRules.filter(r => r.productId).map(r => r.productId);
    const collectionIds = specificRules.filter(r => r.collectionId).map(r => r.collectionId);

    const allIds = [...productIds, ...collectionIds];

    let nodes = [];
    if (allIds.length > 0) {
        try {
            const response = await admin.graphql(
                `#graphql
                query specificRules($ids: [ID!]!) {
                  nodes(ids: $ids) {
                    ... on Product {
                      id
                      title
                      featuredImage {
                        url
                      }
                      priceRangeV2 {
                        minVariantPrice {
                          amount
                        }
                      }
                    }
                    ... on Collection {
                      id
                      title
                      image {
                        url
                      }
                    }
                  }
                }`,
                {
                    variables: {
                        ids: allIds,
                    },
                },
            );
            const responseJson = await response.json();
            if (responseJson.data && responseJson.data.nodes) {
                nodes = responseJson.data.nodes;
            }
        } catch (e) {
            console.error("Error fetching details", e);
        }
    }

    const rulesWithDetails = specificRules.map(r => {
        let details = {};
        if (r.productId) {
            const product = nodes.find(n => n && n.id === r.productId);
            details = {
                title: product ? product.title : `Produit: ${r.productId.split('/').pop()}`,
                imageUrl: product?.featuredImage?.url,
                price: product?.priceRangeV2?.minVariantPrice?.amount
            };
        } else if (r.collectionId) {
            const collection = nodes.find(n => n && n.id === r.collectionId);
            details = {
                title: collection ? collection.title : `Collection: ${r.collectionId.split('/').pop()}`,
                imageUrl: collection?.image?.url
            };
        }

        return {
            ...r,
            ...details
        };
    });

    return {
        rules: rulesWithDetails,
        apiKey: process.env.SHOPIFY_API_KEY
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });

    if (actionType === "saveRules") {
        const updates = {};

        for (const [key, value] of formData.entries()) {
            if (key.startsWith("rule_")) {
                const parts = key.split('_');

                if (parts.length >= 3) {
                    const ruleId = parts[1];
                    const field = parts[2]; // discount | minPrice

                    if (!updates[ruleId]) updates[ruleId] = {};

                    if (field === "discount") {
                        updates[ruleId].minDiscount = parseFloat(value);
                    } else if (field === "minPrice") {
                        updates[ruleId].minPrice = value === "" ? null : parseFloat(value);
                    }
                }
            }
        }

        // Execute updates
        for (const [ruleId, data] of Object.entries(updates)) {
            await db.rule.update({
                where: { id: ruleId },
                data: {
                    minDiscount: data.minDiscount,
                    minPrice: data.minPrice
                }
            });
        }
        return { success: true };
    }

    if (actionType === "toggleRule") {
        const ruleId = formData.get("ruleId");
        const isEnabled = formData.get("isEnabled") === "true";
        await db.rule.update({
            where: { id: ruleId },
            data: { isEnabled }
        });
        return { success: true };
    }

    if (actionType === "deleteRule") {
        const ruleId = formData.get("ruleId");
        await db.rule.delete({ where: { id: ruleId } });
        return { success: true };
    }

    if (actionType === "addRule") {
        const resourceId = formData.get("resourceId");
        const type = formData.get("type"); // 'product' or 'collection'

        console.log("[ACTION] Adding Rule. Resource:", resourceId, "Type:", type);
        console.log("[ACTION] Session Shop:", session.shop);
        console.log("[ACTION] DB Shop found:", !!shop);

        if (!shop) {
            console.log("[ACTION] Shop not found in DB. Creating new shop record...");
            try {
                shop = await db.shop.create({
                    data: {
                        id: crypto.randomUUID(),
                        shopUrl: session.shop,
                        isActive: true // Auto-activate on manual rule creation
                    }
                });
                console.log("[ACTION] Created new shop:", shop.id);
            } catch (e) {
                console.error("[ACTION] Failed to create shop:", e);
                return { success: false, message: `Erreur création: ${e.message}` };
            }
        }

        if (!shop) return { success: false, message: "Impossible de récupérer la boutique" };

        const existing = await db.rule.findFirst({
            where: {
                shopId: shop.id,
                [type === 'product' ? 'productId' : 'collectionId']: resourceId
            }
        });

        if (!existing) {
            console.log("[ACTION] Creating new rule for shop ID:", shop.id);
            const newRule = await db.rule.create({
                data: {
                    shopId: shop.id,
                    [type === 'product' ? 'productId' : 'collectionId']: resourceId,
                    minDiscount: 0.80, // Default to 20%
                    isEnabled: true
                }
            });
            console.log("[ACTION] Rule created ID:", newRule.id);
            return { success: true, message: "Règle ajoutée avec succès" };
        } else {
            console.log("[ACTION] Rule already exists.");
            return { success: false, message: "Cette règle existe déjà" };
        }
    }

    return { success: false };
};

export default function ProductsPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();

    // Toast State
    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastError, setToastError] = useState(false);

    useEffect(() => {
        if (fetcher.data && fetcher.state === "idle" && fetcher.data.message) {
            setToastMessage(fetcher.data.message);
            setToastError(!fetcher.data.success);
            setToastActive(true);
        }
    }, [fetcher.data, fetcher.state]);

    const toggleToast = () => setToastActive((active) => !active);

    const toastMarkup = toastActive ? (
        <Toast content={toastMessage} onDismiss={toggleToast} error={toastError} />
    ) : null;

    const [searchTerm, setSearchTerm] = useState("");

    // Specific Rules State: Discount % (0-100)
    const [specificRuleValues, setSpecificRuleValues] = useState(() => {
        const initial = {};
        loaderData.rules.forEach(r => {
            initial[r.id] = Math.round((1 - r.minDiscount) * 100);
        });
        return initial;
    });

    // Specific Rules State: Exact Min Price (Float or null)
    const [specificPriceValues, setSpecificPriceValues] = useState(() => {
        const initial = {};
        loaderData.rules.forEach(r => {
            initial[r.id] = r.minPrice !== null && r.minPrice !== undefined ? r.minPrice : null;
        });
        return initial;
    });

    const handleSpecificSliderChange = (ruleId, value, originalPrice) => {
        setSpecificRuleValues(prev => ({
            ...prev,
            [ruleId]: value
        }));

        if (originalPrice) {
            const calculatedPrice = originalPrice * (1 - (value / 100));
            setSpecificPriceValues(prev => ({
                ...prev,
                [ruleId]: calculatedPrice
            }));
        } else {
            setSpecificPriceValues(prev => ({
                ...prev,
                [ruleId]: null
            }));
        }
    };

    const handleSpecificPriceChange = (ruleId, newPriceString, originalPrice) => {
        if (!originalPrice) return;

        // 1. Update State with EXACT string to allow typing (e.g. "12.")
        // CHANGED: Store empty string directly to avoid fallback logic kicking in
        setSpecificPriceValues(prev => ({ ...prev, [ruleId]: newPriceString }));

        // 2. Sync Slider (Logic Only)
        // Parse strictly for calculation
        const priceCandidate = parseFloat(newPriceString);

        // If invalid number (e.g. empty, "-", "."), skip valid calculation update but keep string in state
        if (isNaN(priceCandidate)) return;

        // Clamp for discount sync
        let validPriceForCalc = priceCandidate;
        if (validPriceForCalc < 0) validPriceForCalc = 0;
        if (validPriceForCalc > originalPrice) validPriceForCalc = originalPrice;

        let discountPercent = Math.round((1 - (validPriceForCalc / originalPrice)) * 100);
        if (discountPercent > 80) discountPercent = 80;
        if (discountPercent < 0) discountPercent = 0;

        setSpecificRuleValues(prev => ({ ...prev, [ruleId]: discountPercent }));
    };

    // Dirty State Tracking
    const [isDirty, setIsDirty] = useState(false);

    // Initial Values for Reset
    const [initialRuleValues, setInitialRuleValues] = useState({});
    const [initialPriceValues, setInitialPriceValues] = useState({});

    useEffect(() => {
        // Initialize or Re-initialize when loaderData changes (e.g. after save)
        const initRules = {};
        const initPrices = {};
        loaderData.rules.forEach(r => {
            initRules[r.id] = Math.round((1 - r.minDiscount) * 100);
            initPrices[r.id] = r.minPrice !== null && r.minPrice !== undefined ? r.minPrice : null;
        });
        setInitialRuleValues(initRules);
        setInitialPriceValues(initPrices);
        setIsDirty(false); // Reset dirty state on load/refresh
    }, [loaderData.rules]);

    // Check for dirty state whenever values change
    useEffect(() => {
        let dirty = false;
        // Compare current specificRuleValues with initial
        for (const key in specificRuleValues) {
            if (specificRuleValues[key] !== initialRuleValues[key]) {
                dirty = true;
                break;
            }
        }
        // Compare prices
        if (!dirty) {
            for (const key in specificPriceValues) {
                // Handle null/string mismatch roughly (e.g. 120.00 vs 120)
                // convert both to strings or numbers for comparison if not null
                const current = specificPriceValues[key];
                const initial = initialPriceValues[key];

                if (current != initial) { // Loose equality to catch 123 != "123"
                    // Double check for number parsing equality if both exist
                    if (current && initial && parseFloat(current) === parseFloat(initial)) {
                        continue;
                    }
                    if ((current === "" && initial === null) || (current === null && initial === "")) continue;

                    dirty = true;
                    break;
                }
            }
        }
        setIsDirty(dirty);
    }, [specificRuleValues, specificPriceValues, initialRuleValues, initialPriceValues]);

    const handleDiscard = () => {
        setSpecificRuleValues(initialRuleValues);
        setSpecificPriceValues(initialPriceValues);
        setIsDirty(false);
    };

    const handleSave = () => {
        const data = { actionType: "saveRules" };
        Object.keys(specificRuleValues).forEach((ruleId) => {
            const discountVal = specificRuleValues[ruleId];
            data[`rule_${ruleId}_discount`] = (1 - (discountVal / 100)).toString();

            const priceVal = specificPriceValues[ruleId];
            data[`rule_${ruleId}_minPrice`] = (priceVal !== null && priceVal !== undefined) ? priceVal.toString() : "";
        });
        fetcher.submit(data, { method: "POST" });
        // Optimistically reset dirty logic or wait for loader re-validation (useEffect handles it)
    };

    const handleAddProduct = async () => {
        const selection = await window.shopify.resourcePicker({
            type: "product",
            multiple: false,
        });

        if (selection && selection.length > 0) {
            fetcher.submit({
                actionType: "addRule",
                resourceId: selection[0].id,
                type: "product"
            }, { method: "POST" });
        }
    };

    const handleAddCollection = async () => {
        const selection = await window.shopify.resourcePicker({
            type: "collection",
            multiple: false,
        });

        if (selection && selection.length > 0) {
            fetcher.submit({
                actionType: "addRule",
                resourceId: selection[0].id,
                type: "collection"
            }, { method: "POST" });
        }
    };

    const handleDeleteRule = (ruleId) => {
        fetcher.submit({
            actionType: "deleteRule",
            ruleId
        }, { method: "POST" });
    };

    const handleToggleRule = (ruleId, currentStatus) => {
        fetcher.submit({
            actionType: "toggleRule",
            ruleId,
            isEnabled: (!currentStatus).toString()
        }, { method: "POST" });
    };

    const filteredRules = loaderData.rules.filter(r =>
        r.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Frame>
            {toastMarkup}
            <Page
                title="Produits & Collections"
                subtitle="Gérez les rabais pour des produits ou collections spécifiques."
                primaryAction={{
                    content: fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer",
                    onAction: handleSave,
                    disabled: !isDirty || fetcher.state !== "idle",
                }}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <Text variant="headingMd">Règles Spécifiques ({loaderData.rules.length})</Text>
                                    <InlineStack gap="200">
                                        <Button onClick={handleAddProduct}>Ajouter Produit</Button>
                                        <Button onClick={handleAddCollection}>Ajouter Collection</Button>
                                    </InlineStack>
                                </div>

                                <TextField
                                    label="Rechercher"
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    autoComplete="off"
                                    placeholder="Nom du produit ou collection..."
                                    labelHidden
                                    prefix="🔍"
                                />

                                {filteredRules.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#6d7175' }}>
                                        <Text>{searchTerm ? "Aucun résultat trouvé." : "Aucune règle définie. Ajoutez un produit ou une collection."}</Text>
                                    </div>
                                ) : (
                                    <ResourceList
                                        resourceName={{ singular: 'règle', plural: 'règles' }}
                                        items={filteredRules}
                                        renderItem={(item) => {
                                            const discountPercent = specificRuleValues[item.id] !== undefined
                                                ? specificRuleValues[item.id]
                                                : Math.round((1 - item.minDiscount) * 100);

                                            const isEnabled = item.isEnabled !== false;

                                            let originalPrice = null;
                                            if (item.price) {
                                                originalPrice = parseFloat(item.price);
                                            }

                                            // Determine current min price to display
                                            let currentMinPrice = specificPriceValues[item.id];

                                            // Fallback logic for display if explicit price not set but original exists
                                            // NOTE: We do NOT fallback if currentMinPrice is "" (user cleared it explicitly)
                                            if ((currentMinPrice === null || currentMinPrice === undefined) && originalPrice) {
                                                currentMinPrice = originalPrice * (1 - (discountPercent / 100));
                                            }

                                            return (
                                                <ResourceItem
                                                    id={item.id}
                                                    accessibilityLabel={`Modifier la règle pour ${item.title}`}
                                                    media={
                                                        <Avatar customer size="medium" name={item.title} source={item.imageUrl} />
                                                    }
                                                    shortcutActions={[
                                                        {
                                                            content: isEnabled ? 'Désactiver' : 'Activer',
                                                            onAction: () => handleToggleRule(item.id, isEnabled)
                                                        },
                                                        {
                                                            content: 'Supprimer',
                                                            destructive: true,
                                                            onAction: () => handleDeleteRule(item.id)
                                                        }
                                                    ]}
                                                    persistActions
                                                >
                                                    <BlockStack gap="400">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Text variant="bodyMd" fontWeight="bold">{item.title}</Text>
                                                            <Badge tone={isEnabled ? "success" : "critical"}>
                                                                {isEnabled ? "Activé" : "Désactivé"}
                                                            </Badge>
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <Text variant="bodySm">Rabais Max: {discountPercent}%</Text>
                                                                <RangeSlider
                                                                    output
                                                                    min={0}
                                                                    max={80}
                                                                    step={1}
                                                                    value={discountPercent}
                                                                    onChange={(v) => handleSpecificSliderChange(item.id, v, originalPrice)}
                                                                    disabled={!isEnabled}
                                                                    suffix={`${discountPercent}%`}
                                                                />
                                                            </div>

                                                            {item.price && originalPrice && (
                                                                <div style={{ width: '150px' }}>
                                                                    <TextField
                                                                        label="Prix Minimum Accepté"
                                                                        type="number"
                                                                        step={0.01}
                                                                        value={
                                                                            currentMinPrice !== null && currentMinPrice !== undefined
                                                                                ? (typeof currentMinPrice === 'number' ? currentMinPrice.toFixed(2) : currentMinPrice)
                                                                                : ""
                                                                        }
                                                                        onChange={(v) => handleSpecificPriceChange(item.id, v, originalPrice)}
                                                                        prefix="€"
                                                                        disabled={!isEnabled}
                                                                        autoComplete="off"
                                                                        helpText={`Prix de base : ${originalPrice.toFixed(2)} €`}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </BlockStack>
                                                </ResourceItem>
                                            );
                                        }}
                                    />
                                )}
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        </Frame>
    );
}
