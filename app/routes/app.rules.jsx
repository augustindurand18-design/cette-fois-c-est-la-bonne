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

    const [rounding, setRounding] = useState(loaderData.priceRounding !== undefined ? loaderData.priceRounding.toString() : "0.85");
    const [isActive, setIsActive] = useState(loaderData.isActive);
    const [maxRounds, setMaxRounds] = useState(loaderData.maxRounds ? loaderData.maxRounds.toString() : "3");
    const [strategy, setStrategy] = useState(loaderData.strategy || "moderate");
    const [allowSaleItems, setAllowSaleItems] = useState(loaderData.allowSaleItems);
    const [enableExitIntent, setEnableExitIntent] = useState(loaderData.enableExitIntent);
    const [enableInactivityTrigger, setEnableInactivityTrigger] = useState(loaderData.enableInactivityTrigger);
    const [fulfillmentMode, setFulfillmentMode] = useState(loaderData.fulfillmentMode || "DISCOUNT_CODE");
    const [autoNegotiation, setAutoNegotiation] = useState(loaderData.autoNegotiation);
    const [autoValidity, setAutoValidity] = useState(loaderData.autoValidityDuration ? loaderData.autoValidityDuration.toString() : "24");
    const [manualValidity, setManualValidity] = useState(loaderData.manualValidityDuration ? loaderData.manualValidityDuration.toString() : "72");

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        // Safe comparison strings
        const s = (val) => (val === null || val === undefined) ? "" : val.toString();

        const isModified =
            s(rounding) !== s(loaderData.priceRounding !== undefined ? loaderData.priceRounding : 0.85) ||
            s(isActive) !== s(loaderData.isActive) ||
            s(maxRounds) !== s(loaderData.maxRounds) ||
            s(strategy) !== s(loaderData.strategy) ||
            s(allowSaleItems) !== s(loaderData.allowSaleItems) ||
            s(enableExitIntent) !== s(loaderData.enableExitIntent) ||
            s(enableInactivityTrigger) !== s(loaderData.enableInactivityTrigger) ||
            s(fulfillmentMode) !== s(loaderData.fulfillmentMode || "DISCOUNT_CODE") ||
            s(autoNegotiation) !== s(loaderData.autoNegotiation) ||
            s(autoValidity) !== s(loaderData.autoValidityDuration || 24) ||
            s(manualValidity) !== s(loaderData.manualValidityDuration || 72);

        setIsDirty(isModified);
    }, [rounding, isActive, maxRounds, strategy, allowSaleItems, enableExitIntent, enableInactivityTrigger, fulfillmentMode, autoNegotiation, autoValidity, manualValidity, loaderData]);

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
                            <Text as="h2" variant="headingMd">{t('rules.fulfillment_title')}</Text>
                            <Box>
                                <InlineStack align="start" gap="800">
                                    <RadioButton
                                        label={t('rules.fulfillment_standard')}
                                        helpText={t('rules.fulfillment_standard_help')}
                                        checked={fulfillmentMode === 'DISCOUNT_CODE'}
                                        id="modeStandard"
                                        name="fulfillmentMode"
                                        onChange={() => setFulfillmentMode('DISCOUNT_CODE')}
                                    />
                                    <RadioButton
                                        label={t('rules.fulfillment_draft')}
                                        helpText={t('rules.fulfillment_draft_help')}
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
                                    { label: t('rules.rounds_options.one'), value: '1' },
                                    { label: t('rules.rounds_options.three'), value: '3' },
                                    { label: t('rules.rounds_options.five'), value: '5' },
                                ]}
                                onChange={(val) => setMaxRounds(val)}
                                value={maxRounds}
                                helpText={t('rules.help_rounds')}
                            />

                            <Select
                                label={t('rules.strategy_label')}
                                options={[
                                    { label: t('rules.strategies.conciliatory'), value: 'conciliatory' },
                                    { label: t('rules.strategies.moderate'), value: 'moderate' },
                                    { label: t('rules.strategies.aggressive'), value: 'aggressive' },
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
                                label={t('rules.inactivity_label')}
                                checked={enableInactivityTrigger}
                                onChange={(val) => setEnableInactivityTrigger(val)}
                                helpText={t('rules.inactivity_help')}
                            />
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">{t('rules.price_rounding')}</Text>
                            <Select
                                label={t('rules.rounding_label')}
                                options={[
                                    { label: t('rules.rounding_options.psychological'), value: '0.85' },
                                    { label: t('rules.rounding_options.classic'), value: '0.99' },
                                    { label: '.95', value: '0.95' },
                                    { label: '.90', value: '0.90' },
                                    { label: '.50', value: '0.50' },
                                    { label: t('rules.rounding_options.round'), value: '0.00' },
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
