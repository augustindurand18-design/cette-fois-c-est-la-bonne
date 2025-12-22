import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    FormLayout,
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
            enableExitIntent: false,
            enableInactivityTrigger: false
        };
    }

    return {
        priceRounding: shop.priceRounding !== undefined ? shop.priceRounding : 0.85,
        isActive: shop.isActive,
        maxRounds: shop.maxRounds,
        strategy: shop.strategy,
        allowSaleItems: shop.allowSaleItems,
        enableExitIntent: shop.enableExitIntent,
        enableInactivityTrigger: shop.enableInactivityTrigger,
        fulfillmentMode: shop.fulfillmentMode || "DISCOUNT_CODE",
        autoNegotiation: shop.autoNegotiation !== false,
        autoValidityDuration: shop.autoValidityDuration || 24,
        manualValidityDuration: shop.manualValidityDuration || 72,
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
        const enableInactivityTrigger = formData.get("enableInactivityTrigger") === "true";
        const autoValidityDuration = parseInt(formData.get("autoValidityDuration"), 10);
        const manualValidityDuration = parseInt(formData.get("manualValidityDuration"), 10);

        console.log("Saving Rules:", {
            priceRounding,
            isActive,
            maxRounds,
            strategy,
            allowSaleItems,
            enableExitIntent,
            enableInactivityTrigger,
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
                enableInactivityTrigger,
                autoNegotiation: formData.get("autoNegotiation") === "true",
                fulfillmentMode: formData.get("fulfillmentMode"), // New Field
                autoValidityDuration: !isNaN(autoValidityDuration) ? autoValidityDuration : 24,
                manualValidityDuration: !isNaN(manualValidityDuration) ? manualValidityDuration : 72
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
    const [enableInactivityTrigger, setEnableInactivityTrigger] = useState(loaderData.enableInactivityTrigger);
    const [fulfillmentMode, setFulfillmentMode] = useState(loaderData.fulfillmentMode);
    const [autoNegotiation, setAutoNegotiation] = useState(loaderData.autoNegotiation);
    const [autoValidity, setAutoValidity] = useState(loaderData.autoValidityDuration.toString());
    const [manualValidity, setManualValidity] = useState(loaderData.manualValidityDuration.toString());

    const [isDirty, setIsDirty] = useState(false);



    useEffect(() => {
        const isModified =
            rounding !== (loaderData.priceRounding ? loaderData.priceRounding.toString() : "0.85") ||
            isActive !== loaderData.isActive ||
            maxRounds !== loaderData.maxRounds.toString() ||
            strategy !== loaderData.strategy ||
            allowSaleItems !== loaderData.allowSaleItems ||
            enableExitIntent !== loaderData.enableExitIntent ||
            enableInactivityTrigger !== loaderData.enableInactivityTrigger ||
            fulfillmentMode !== loaderData.fulfillmentMode ||
            autoNegotiation !== loaderData.autoNegotiation ||
            autoValidity !== loaderData.autoValidityDuration.toString() ||
            manualValidity !== loaderData.manualValidityDuration.toString();

        setIsDirty(isModified);
    }, [rounding, isActive, maxRounds, strategy, allowSaleItems, enableExitIntent, enableInactivityTrigger, fulfillmentMode, autoNegotiation, loaderData]);

    const handleSave = () => {
        fetcher.submit({
            actionType: "saveSettings",
            priceRounding: rounding,
            isActive: isActive.toString(),
            maxRounds: maxRounds,
            strategy: strategy,
            allowSaleItems: allowSaleItems.toString(),
            enableExitIntent: enableExitIntent.toString(),
            enableInactivityTrigger: enableInactivityTrigger.toString(),
            fulfillmentMode: fulfillmentMode,
            autoNegotiation: autoNegotiation.toString(),
            autoValidityDuration: autoValidity,
            manualValidityDuration: manualValidity
        }, { method: "POST" });
    };

    return (
        <Page
            title={t('rules.title')}
            subtitle={t('rules.subtitle')}
            primaryAction={{
                content: fetcher.state !== "idle" ? t('common.saving') : t('common.save'),
                onAction: handleSave,
                disabled: !isDirty || fetcher.state !== "idle",
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


                                <Box borderBlockStartWidth="025" borderColor="border-subdued" paddingBlockStart="400">
                                    <Text as="h3" variant="headingSm">{t('rules.validity_title')}</Text>
                                    <Box paddingBlockStart="200">
                                        <FormLayout>
                                            <FormLayout.Group>
                                                <Select
                                                    label={t('rules.auto_validity')}
                                                    options={[
                                                        { label: t('time.minutes', { count: 1 }), value: '1' },
                                                        { label: t('time.minutes', { count: 2 }), value: '2' },
                                                        { label: t('time.minutes', { count: 3 }), value: '3' },
                                                        { label: t('time.minutes', { count: 4 }), value: '4' },
                                                        { label: t('time.minutes', { count: 5 }), value: '5' },
                                                        { label: t('time.minutes', { count: 6 }), value: '6' },
                                                        { label: t('time.minutes', { count: 7 }), value: '7' },
                                                        { label: t('time.minutes', { count: 8 }), value: '8' },
                                                        { label: t('time.minutes', { count: 9 }), value: '9' },
                                                        { label: t('time.minutes', { count: 10 }), value: '10' },
                                                    ]}
                                                    onChange={setAutoValidity}
                                                    value={autoValidity}
                                                    helpText={t('rules.auto_validity_help')}
                                                />
                                                <Select
                                                    label={t('rules.manual_validity')}
                                                    options={[
                                                        { label: t('time.minutes', { count: 5 }), value: '5' },
                                                        { label: t('time.minutes', { count: 15 }), value: '15' },
                                                        { label: t('time.minutes', { count: 30 }), value: '30' },
                                                        { label: t('time.minutes', { count: 45 }), value: '45' },
                                                        { label: t('time.hours', { count: 1 }), value: '60' },
                                                        { label: t('time.hours', { count: 2 }), value: '120' },
                                                        { label: t('time.days', { count: 1 }), value: '1440' },
                                                    ]}
                                                    onChange={setManualValidity}
                                                    value={manualValidity}
                                                    helpText={t('rules.manual_validity_help')}
                                                />
                                            </FormLayout.Group>
                                        </FormLayout>
                                    </Box>
                                </Box>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Finalisation & Sécurité (Contrôle Marchand)</Text>
                            <Box>
                                <InlineStack align="start" gap="800">
                                    <RadioButton
                                        label="Paiement Immédiat (Standard)"
                                        helpText="Le client paie immédiatement via un code promo."
                                        checked={fulfillmentMode === 'DISCOUNT_CODE'}
                                        id="modeStandard"
                                        name="fulfillmentMode"
                                        onChange={() => setFulfillmentMode('DISCOUNT_CODE')}
                                    />
                                    <RadioButton
                                        label="Validation Manuelle (Recommandé > 1000€)"
                                        helpText="Aucun paiement immédiat. Une commande brouillon est créée pour votre validation finale."
                                        checked={fulfillmentMode === 'DRAFT_ORDER'}
                                        id="modeDraft"
                                        name="fulfillmentMode"
                                        onChange={() => setFulfillmentMode('DRAFT_ORDER')}
                                    />
                                </InlineStack>
                            </Box>
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
                                helpText={t('rules.strategy_default') || "Default: Moderate"}
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

                            <Checkbox
                                label="Activer le déclencheur d'inactivité"
                                checked={enableInactivityTrigger}
                                onChange={(val) => setEnableInactivityTrigger(val)}
                                helpText="Ouvre le chat automatiquement après 20 s d'inactivité."
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
            </Layout >
        </Page >
    );
}
