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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shopUrl = session.shop;

    const shop = await db.shop.findUnique({
        where: { shopUrl },
        include: { rules: true },
    });

    if (!shop) {
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
        for (const [key, value] of formData.entries()) {
            if (key.startsWith("rule_")) {
                const ruleId = key.replace("rule_", "");
                await db.rule.update({
                    where: { id: ruleId },
                    data: { minDiscount: parseFloat(value) }
                });
            }
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

    if (actionType === "addRule") {
        const resourceId = formData.get("resourceId");
        const type = formData.get("type"); // 'product' or 'collection'

        const existing = await db.rule.findFirst({
            where: {
                shopId: shop.id,
                [type === 'product' ? 'productId' : 'collectionId']: resourceId
            }
        });

        if (!existing) {
            await db.rule.create({
                data: {
                    shopId: shop.id,
                    [type === 'product' ? 'productId' : 'collectionId']: resourceId,
                    minDiscount: 0.80, // Default to 20%
                    isEnabled: true
                }
            });
        }
        return { success: true };
    }

    if (actionType === "deleteRule") {
        const ruleId = formData.get("ruleId");
        await db.rule.delete({ where: { id: ruleId } });
        return { success: true };
    }

    return { success: false };
};

export default function ProductsPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();

    const [searchTerm, setSearchTerm] = useState("");

    // Specific Rules State
    const [specificRuleValues, setSpecificRuleValues] = useState(() => {
        const initial = {};
        loaderData.rules.forEach(r => {
            initial[r.id] = Math.round((1 - r.minDiscount) * 100);
        });
        return initial;
    });

    const handleSpecificSliderChange = (ruleId, value) => {
        setSpecificRuleValues(prev => ({
            ...prev,
            [ruleId]: value
        }));
    };

    const handleSave = () => {
        const data = { actionType: "saveRules" };
        Object.entries(specificRuleValues).forEach(([ruleId, val]) => {
            data[`rule_${ruleId}`] = (1 - (val / 100)).toString();
        });
        fetcher.submit(data, { method: "POST" });
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
        <Page
            title="Produits & Collections"
            subtitle="Gérez les rabais pour des produits ou collections spécifiques."
            primaryAction={{
                content: fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer",
                onAction: handleSave,
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <Text variant="headingMd">Règles Spécifiques</Text>
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

                                        const isEnabled = item.isEnabled !== false; // Default true if undefined

                                        let minPriceDisplay = null;
                                        if (item.price) {
                                            const originalMs = parseFloat(item.price);
                                            const minPrice = originalMs * (1 - (discountPercent / 100));
                                            minPriceDisplay = `${minPrice.toFixed(2)} €`;
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
                                                <BlockStack gap="200">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Text variant="bodyMd" fontWeight="bold">{item.title}</Text>
                                                        <Badge tone={isEnabled ? "success" : "critical"}>
                                                            {isEnabled ? "Activé" : "Désactivé"}
                                                        </Badge>
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text variant="bodySm">Rabais Max: {discountPercent}%</Text>
                                                        {minPriceDisplay && (
                                                            <Text variant="bodyXs" tone="subdued">Prix Min: {minPriceDisplay}</Text>
                                                        )}
                                                    </div>

                                                    <RangeSlider
                                                        output
                                                        min={0}
                                                        max={80}
                                                        step={1}
                                                        value={discountPercent}
                                                        onChange={(v) => handleSpecificSliderChange(item.id, v)}
                                                        disabled={!isEnabled}
                                                        suffix={`${discountPercent}%`}
                                                    />
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
    );
}
