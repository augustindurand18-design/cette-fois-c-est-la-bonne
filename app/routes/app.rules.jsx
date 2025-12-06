import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    RangeSlider,
    Text,
    BlockStack,
    Box,
    Banner,
    Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shopUrl = session.shop;

    const shop = await db.shop.findUnique({
        where: { shopUrl },
        include: { rules: true },
    });

    if (!shop) {
        return { minDiscount: 0.8, priceRounding: 0.85 };
    }

    const globalRule = shop.rules.find((r) => !r.collectionId && !r.productId);
    const minDiscount = globalRule ? globalRule.minDiscount : 0.8;

    return {
        minDiscount,
        priceRounding: shop.priceRounding !== undefined ? shop.priceRounding : 0.85,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const minDiscount = parseFloat(formData.get("minDiscount"));
    const priceRounding = parseFloat(formData.get("priceRounding"));

    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });

    // Update Shop Rounding
    await db.shop.update({
        where: { id: shop.id },
        data: { priceRounding: !isNaN(priceRounding) ? priceRounding : 0.85 },
    });

    // Update Global Rule
    const existingRule = await db.rule.findFirst({
        where: { shopId: shop.id, collectionId: null, productId: null },
    });

    if (existingRule) {
        await db.rule.update({
            where: { id: existingRule.id },
            data: { minDiscount },
        });
    } else {
        await db.rule.create({
            data: {
                shopId: shop.id,
                minDiscount,
            },
        });
    }

    return { success: true };
};

export default function RulesPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();

    const [discountValue, setDiscountValue] = useState(Math.round((1 - loaderData.minDiscount) * 100));
    const [rounding, setRounding] = useState(loaderData.priceRounding ? loaderData.priceRounding.toString() : "0.85");

    const handleSliderChange = (value) => setDiscountValue(value);
    const handleTrendingChange = (value) => setRounding(value);

    const handleSave = () => {
        const newMinDiscount = 1 - (discountValue / 100);
        fetcher.submit(
            {
                minDiscount: newMinDiscount.toString(),
                priceRounding: rounding,
            },
            { method: "POST" }
        );
    };

    return (
        <Page
            title="Règles de Négociation"
            subtitle="Définissez les limites et comportements de votre bot."
            primaryAction={{
                content: fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer",
                onAction: handleSave,
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Règles Globales</Text>

                            <Box paddingBlockStart="200">
                                <Text variant="bodyMd" fontWeight="semibold">Rabais Maximum Autorisé: {discountValue}%</Text>
                                <RangeSlider
                                    output
                                    label="Le bot n'acceptera pas d'offres en dessous de ce seuil."
                                    min={0}
                                    max={50}
                                    step={1}
                                    value={discountValue}
                                    onChange={handleSliderChange}
                                    suffix={`${discountValue}%`}
                                />
                            </Box>

                            <Select
                                label="Arrondi des contre-offres (.XX)"
                                options={[
                                    { label: '.85 (Psychologique)', value: '0.85' },
                                    { label: '.99 (Classique)', value: '0.99' },
                                    { label: '.95', value: '0.95' },
                                    { label: '.90', value: '0.90' },
                                    { label: '.50', value: '0.50' },
                                    { label: '.00 (Rond)', value: '0.00' },
                                ]}
                                onChange={handleTrendingChange}
                                value={rounding}
                            />

                            <Banner title="Information" tone="info">
                                Le bot acceptera toute offre supérieure ou égale à {100 - discountValue}% du prix initial.
                            </Banner>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    {/* Placeholder for future product/collection rules */}
                    <Card>
                        <BlockStack gap="200">
                            <Text variant="headingMd">Règles Spécifiques (Bientôt)</Text>
                            <Text tone="subdued">Vous pourrez bientôt définir des remises différentes pour certaines collections ou produits.</Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
