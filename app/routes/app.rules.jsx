import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    Select,
    Checkbox,
    Box,
    Banner,
    InlineStack,

    Button,
    ButtonGroup,
    RadioButton
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shopUrl = session.shop;

    const shop = await db.shop.findUnique({
        where: { shopUrl },
    });

    if (!shop) {
        return {
            priceRounding: 0.85,
            isActive: false,
            maxRounds: 3,
            strategy: "moderate",
            allowSaleItems: true,
            enableExitIntent: false
        };
    }

    return {
        priceRounding: shop.priceRounding !== undefined ? shop.priceRounding : 0.85,
        isActive: shop.isActive,
        maxRounds: shop.maxRounds,
        strategy: shop.strategy,
        allowSaleItems: shop.allowSaleItems,
        enableExitIntent: shop.enableExitIntent,
        autoNegotiation: shop.autoNegotiation !== false
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });

    if (actionType === "saveSettings") {
        const priceRounding = parseFloat(formData.get("priceRounding"));
        const isActive = formData.get("isActive") === "true";
        const maxRounds = parseInt(formData.get("maxRounds"), 10);
        const strategy = formData.get("strategy");
        const allowSaleItems = formData.get("allowSaleItems") === "true";
        const enableExitIntent = formData.get("enableExitIntent") === "true";

        console.log("Saving Rules:", {
            priceRounding,
            isActive,
            maxRounds,
            strategy,
            allowSaleItems,
            enableExitIntent,
            autoNegotiationVal: formData.get("autoNegotiation")
        });

        await db.shop.update({
            where: { id: shop.id },
            data: {
                priceRounding: !isNaN(priceRounding) ? priceRounding : 0.85,
                isActive,
                maxRounds: !isNaN(maxRounds) ? maxRounds : 3,
                strategy,
                allowSaleItems,
                enableExitIntent,
                autoNegotiation: formData.get("autoNegotiation") === "true"
            },
        });

        return { success: true };
    }

    return { success: false };
};

export default function RulesPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();
    const { t } = useTranslation();

    const [rounding, setRounding] = useState(loaderData.priceRounding ? loaderData.priceRounding.toString() : "0.85");
    const [isActive, setIsActive] = useState(loaderData.isActive);
    const [maxRounds, setMaxRounds] = useState(loaderData.maxRounds.toString());
    const [strategy, setStrategy] = useState(loaderData.strategy);
    const [allowSaleItems, setAllowSaleItems] = useState(loaderData.allowSaleItems);
    const [enableExitIntent, setEnableExitIntent] = useState(loaderData.enableExitIntent);
    const [autoNegotiation, setAutoNegotiation] = useState(loaderData.autoNegotiation);

    const [isDirty, setIsDirty] = useState(false);



    useEffect(() => {
        const isModified =
            rounding !== (loaderData.priceRounding ? loaderData.priceRounding.toString() : "0.85") ||
            isActive !== loaderData.isActive ||
            maxRounds !== loaderData.maxRounds.toString() ||
            strategy !== loaderData.strategy ||
            allowSaleItems !== loaderData.allowSaleItems ||
            enableExitIntent !== loaderData.enableExitIntent ||
            autoNegotiation !== loaderData.autoNegotiation;

        setIsDirty(isModified);
    }, [rounding, isActive, maxRounds, strategy, allowSaleItems, enableExitIntent, autoNegotiation, loaderData]);

    const handleSave = () => {
        fetcher.submit({
            actionType: "saveSettings",
            priceRounding: rounding,
            isActive: isActive.toString(),
            maxRounds: maxRounds,
            strategy: strategy,
            allowSaleItems: allowSaleItems.toString(),
            enableExitIntent: enableExitIntent.toString(),
            autoNegotiation: autoNegotiation.toString()
        }, { method: "POST" });
    };

    return (
        <Page
            title={t('rules.title')}
            subtitle={t('rules.subtitle')}
            primaryAction={{
                content: fetcher.state !== "idle" ? t('common.saving') : t('common.save'),
                onAction: handleSave,
                disabled: fetcher.state !== "idle",
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">{t('rules.activation')}</Text>

                            <BlockStack gap="400">
                                {/* Global Activation */}
                                <InlineStack align="space-between" blockAlign="center">
                                    <Box>
                                        <Text variant="headingSm">{t('rules.bot_status')}</Text>
                                        <Text tone="subdued" variant="bodySm">{isActive ? t('rules.active_desc') : t('rules.inactive_desc')}</Text>
                                    </Box>
                                    <Button
                                        variant={isActive ? "primary" : "secondary"}
                                        tone={isActive ? "success" : "critical"}
                                        onClick={() => setIsActive(!isActive)}
                                    >
                                        {isActive ? t('rules.bot_active') : t('rules.bot_inactive')}
                                    </Button>
                                </InlineStack>

                                <Box borderBlockStartWidth="025" borderColor="border-subdued" paddingBlockStart="400">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <BlockStack gap="200">
                                            <RadioButton
                                                label={t('rules.mode_auto')}
                                                helpText={t('rules.mode_auto_desc')}
                                                checked={autoNegotiation}
                                                id="modeAuto"
                                                name="negotiationMode"
                                                onChange={() => setAutoNegotiation(true)}
                                            />
                                            <RadioButton
                                                label={t('rules.mode_manual')}
                                                helpText={t('rules.mode_manual_desc')}
                                                checked={!autoNegotiation}
                                                id="modeManual"
                                                name="negotiationMode"
                                                onChange={() => setAutoNegotiation(false)}
                                            />
                                        </BlockStack>
                                    </InlineStack>
                                </Box>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">{t('rules.behavior')}</Text>



                            <Select
                                label={t('rules.rounds_label')}
                                options={[
                                    { label: '1 (Offre unique)', value: '1' },
                                    { label: '3 (Classique)', value: '3' },
                                    { label: '5 (Longue négociation)', value: '5' },
                                ]}
                                onChange={(val) => setMaxRounds(val)}
                                value={maxRounds}
                                helpText={t('rules.help_rounds')}
                            />

                            <Select
                                label={t('rules.strategy_label')}
                                options={[
                                    { label: 'Conciliant (Lâche prise rapidement)', value: 'conciliatory' },
                                    { label: 'Modéré (Équilibré)', value: 'moderate' },
                                    { label: 'Ferme (Lâche prise difficilement)', value: 'aggressive' },
                                ]}
                                onChange={(val) => setStrategy(val)}
                                value={strategy}
                                helpText="Défaut: Modéré"
                            />

                            <Checkbox
                                label={t('rules.allow_sales_label')}
                                checked={allowSaleItems}
                                onChange={(val) => setAllowSaleItems(val)}
                                helpText={t('rules.help_sales')}
                            />

                            <Checkbox
                                label={t('rules.exit_intent_label')}
                                checked={enableExitIntent}
                                onChange={(val) => setEnableExitIntent(val)}
                                helpText={t('rules.exit_intent_help')}
                            />
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">{t('rules.price_rounding')}</Text>
                            <Select
                                label={t('rules.rounding_label')}
                                options={[
                                    { label: '.85 (Psychologique)', value: '0.85' },
                                    { label: '.99 (Classique)', value: '0.99' },
                                    { label: '.95', value: '0.95' },
                                    { label: '.90', value: '0.90' },
                                    { label: '.50', value: '0.50' },
                                    { label: '.00 (Rond)', value: '0.00' },
                                ]}
                                onChange={setRounding}
                                value={rounding}
                            />
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
