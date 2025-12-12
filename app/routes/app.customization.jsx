import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    Box,
    Select,
    TextField,
    FormLayout,
    Thumbnail,
    Button,
    DropZone,
    InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });

    if (!shop) {
        return {
            botWelcomeMsg: "",
            botRejectMsg: "",
            botSuccessMsg: "",
            widgetColor: "#000000",
            botIcon: "",
        };
    }

    return {
        botWelcomeMsg: shop.botWelcomeMsg,
        botRejectMsg: shop.botRejectMsg,
        botSuccessMsg: shop.botSuccessMsg,
        widgetColor: shop.widgetColor,
        botIcon: shop.botIcon,
        widgetColor: shop.widgetColor,
        botIcon: shop.botIcon,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const botWelcomeMsg = formData.get("botWelcomeMsg");
    const botRejectMsg = formData.get("botRejectMsg");
    const botSuccessMsg = formData.get("botSuccessMsg");
    const widgetColor = formData.get("widgetColor");
    const botIcon = formData.get("botIcon");
    const updateData = {
        botWelcomeMsg,
        botRejectMsg,
        botSuccessMsg,
        widgetColor,
        botIcon,
    };

    await db.shop.update({
        where: { shopUrl: session.shop },
        data: updateData,
    });

    return { success: true };
};

export default function CustomizationPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();
    const { t } = useTranslation();

    const TONE_PRESETS = {
        standard: {
            label: t('customization.tones.standard'),
            welcome: t('customization.presets.standard.welcome'),
            reject: t('customization.presets.standard.reject'),
            success: t('customization.presets.standard.success')
        },
        friendly: {
            label: t('customization.tones.friendly'),
            welcome: t('customization.presets.friendly.welcome'),
            reject: t('customization.presets.friendly.reject'),
            success: t('customization.presets.friendly.success')
        },
        professional: {
            label: t('customization.tones.professional'),
            welcome: t('customization.presets.professional.welcome'),
            reject: t('customization.presets.professional.reject'),
            success: t('customization.presets.professional.success')
        },
        minimalist: {
            label: t('customization.tones.minimalist'),
            welcome: t('customization.presets.minimalist.welcome'),
            reject: t('customization.presets.minimalist.reject'),
            success: t('customization.presets.minimalist.success')
        }
    };

    // Initial Values
    // Note: If loaderData has values, we use them. If not, we fallback to standard preset.
    // BUT since we just changed presets to English in 'en', if the DB has French values stored, 
    // the user will still see French in the inputs by default unless we detect it's "standard" french 
    // and replace it. But we cannot easily know if it's the "original" french.
    // The user said "admin en anglais". The texts that come from DB (user saved settings) 
    // are content, not UI. But if the user hasn't saved anything yet, or wants to reset, 
    // they should see English presets.
    // For now, new selection of presets will yield English.
    const initialWelcome = loaderData.botWelcomeMsg || TONE_PRESETS.standard.welcome;
    const initialReject = loaderData.botRejectMsg || TONE_PRESETS.standard.reject;
    const initialSuccess = loaderData.botSuccessMsg || TONE_PRESETS.standard.success;

    const [welcomeMsg, setWelcomeMsg] = useState(initialWelcome);
    const [rejectMsg, setRejectMsg] = useState(initialReject);
    const [successMsg, setSuccessMsg] = useState(initialSuccess);
    const [color, setColor] = useState(loaderData.widgetColor || "#000000");
    const [botIcon, setBotIcon] = useState(loaderData.botIcon || "");

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const isModified =
            welcomeMsg !== initialWelcome ||
            rejectMsg !== initialReject ||
            successMsg !== initialSuccess ||
            color !== (loaderData.widgetColor || "#000000") ||
            botIcon !== (loaderData.botIcon || "");

        setIsDirty(isModified);
    }, [welcomeMsg, rejectMsg, successMsg, color, botIcon, initialWelcome, initialReject, initialSuccess, loaderData]);

    // Detect Tone
    const [tone, setTone] = useState(() => {
        for (const [key, preset] of Object.entries(TONE_PRESETS)) {
            if (
                initialWelcome === preset.welcome &&
                initialReject === preset.reject &&
                initialSuccess === preset.success
            ) {
                return key;
            }
        }
        return "custom";
    });
    const [file, setFile] = useState(null);

    const handleDrop = useCallback(
        (_droppedFiles, acceptedFiles, _rejectedFiles) => {
            const file = acceptedFiles[0];
            if (file) {
                setFile(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                    setBotIcon(reader.result);
                };
                reader.readAsDataURL(file);
            }
        },
        [],
    );

    const handleToneChange = (newTone) => {
        setTone(newTone);
        if (TONE_PRESETS[newTone]) {
            setWelcomeMsg(TONE_PRESETS[newTone].welcome);
            setRejectMsg(TONE_PRESETS[newTone].reject);
            setSuccessMsg(TONE_PRESETS[newTone].success);
        }
    };

    const handleSave = () => {
        let formData = new FormData();
        formData.append("botWelcomeMsg", welcomeMsg);
        formData.append("botRejectMsg", rejectMsg);
        formData.append("botSuccessMsg", successMsg);
        formData.append("widgetColor", color);
        formData.append("botIcon", botIcon);

        fetcher.submit(formData, { method: "POST" });
    };

    return (
        <Page
            title={t('customization.title')}
            subtitle={t('customization.subtitle')}
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
                            <Text as="h2" variant="headingMd">{t('customization.section_title')}</Text>

                            {/* Visuals Section (Top) */}
                            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "2rem" }}>

                                {/* Left Column: Controls (Color + Photo) */}
                                <div style={{ flex: "1 1 300px" }}>
                                    <FormLayout>
                                        <Text variant="headingSm" as="h6">{t('customization.widget_color')}</Text>
                                        <div style={{ display: "flex", alignItems: "end", gap: "10px", marginBottom: "1rem" }}>
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                                                <div
                                                    style={{
                                                        width: "50px",
                                                        height: "50px",
                                                        borderRadius: "8px",
                                                        backgroundColor: color,
                                                        border: "2px solid #ddd",
                                                        cursor: "pointer",
                                                        boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center"
                                                    }}
                                                    onClick={() => document.getElementById("native-color-picker").click()}
                                                    title={t('customization.click_to_change')}
                                                >
                                                    <span style={{ fontSize: "20px", filter: "drop-shadow(0 0 2px rgba(255,255,255,0.8))" }}>🎨</span>
                                                </div>
                                                <Text variant="bodyXs" tone="subdued">{t('customization.click')}</Text>
                                            </div>

                                            <input
                                                type="color"
                                                id="native-color-picker"
                                                value={color}
                                                onChange={(e) => setColor(e.target.value)}
                                                style={{ visibility: "hidden", position: "absolute", width: 0, height: 0 }}
                                            />
                                            <div style={{ flexGrow: 1 }}>
                                                <TextField
                                                    label={t('customization.hex_code')}
                                                    value={color}
                                                    onChange={setColor}
                                                    autoComplete="off"
                                                    placeholder="#000000"
                                                    helpText={t('customization.hex_help')}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: "1rem" }}>
                                            <Text variant="headingSm" as="h6">{t('customization.profile_pic')}</Text>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '0.5rem' }}>
                                                {botIcon && (
                                                    <div style={{ flexShrink: 0 }}>
                                                        <Thumbnail
                                                            source={botIcon}
                                                            alt="Bot Icon"
                                                            size="medium"
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ flexGrow: 1 }}>
                                                    <BlockStack gap="200">
                                                        <DropZone onDrop={handleDrop} accept="image/*" type="image" allowMultiple={false} label={t('customization.upload_label')}>
                                                            {(!botIcon && !file) && <DropZone.FileUpload />}
                                                        </DropZone>
                                                        <TextField
                                                            label={t('customization.url_label')}
                                                            value={botIcon}
                                                            onChange={setBotIcon}
                                                            autoComplete="off"
                                                            placeholder={t('customization.url_placeholder')}
                                                            helpText={t('customization.url_help')}
                                                        />
                                                    </BlockStack>
                                                </div>
                                            </div>
                                        </div>
                                    </FormLayout>
                                </div>

                                {/* Right Column: Preview */}
                                <div style={{ flex: "1 1 300px" }}>
                                    <Box paddingBlockEnd="400">
                                        <Text variant="headingSm" as="h6">{t('customization.chat_preview')}</Text>
                                        <div style={{
                                            border: "1px solid #e1e3e5",
                                            borderRadius: "12px",
                                            overflow: "hidden",
                                            maxWidth: "350px",
                                            margin: "10px 0",
                                            fontFamily: '-apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
                                        }}>
                                            {/* Header */}
                                            <div style={{
                                                backgroundColor: color,
                                                color: "#fff",
                                                padding: "12px 16px",
                                                fontWeight: "600",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center"
                                            }}>
                                                <span>{t('customization.live_negotiation')}</span>
                                                <span>✕</span>
                                            </div>
                                            {/* Body */}
                                            <div style={{
                                                backgroundColor: "#fff",
                                                padding: "16px",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "12px",
                                                minHeight: "150px"
                                            }}>
                                                {/* Bot Msg */}
                                                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                                    {botIcon && (
                                                        <div style={{
                                                            width: "24px",
                                                            height: "24px",
                                                            borderRadius: "50%",
                                                            overflow: "hidden",
                                                            flexShrink: 0,
                                                            backgroundImage: `url(${botIcon})`,
                                                            backgroundSize: "cover",
                                                            backgroundPosition: "center"
                                                        }} />
                                                    )}
                                                    <div style={{
                                                        alignSelf: "flex-start",
                                                        backgroundColor: "#f1f1f1",
                                                        color: "#000",
                                                        padding: "10px 14px",
                                                        borderRadius: "18px 18px 18px 4px",
                                                        maxWidth: "85%",
                                                        fontSize: "14px",
                                                        lineHeight: "1.4"
                                                    }}>
                                                        {welcomeMsg || "Bonjour ! 👋"}
                                                    </div>
                                                </div>
                                                {/* User Msg */}
                                                <div style={{
                                                    alignSelf: "flex-end",
                                                    backgroundColor: color,
                                                    color: "#fff",
                                                    padding: "10px 14px",
                                                    borderRadius: "18px 18px 4px 18px",
                                                    maxWidth: "85%",
                                                    fontSize: "14px"
                                                }}>
                                                    85 €
                                                </div>
                                                {/* Bot Logic */}
                                                <div style={{
                                                    alignSelf: "flex-start",
                                                    backgroundColor: "#f1f1f1",
                                                    color: "#000",
                                                    padding: "10px 14px",
                                                    borderRadius: "18px 18px 18px 4px",
                                                    maxWidth: "85%",
                                                    fontSize: "14px",
                                                    lineHeight: "1.4"
                                                }}>
                                                    {rejectMsg ? rejectMsg.replace("{price}", "90.00") : "Je peux faire 90.00 €."}
                                                </div>
                                            </div>
                                        </div>
                                    </Box>
                                </div>
                            </div>



                            {/* Message Settings */}
                            <Box paddingBlockStart="400" borderBlockStartWidth="025" borderColor="border-subdued">
                                <Text variant="headingMd" as="h3" paddingBlockEnd="400">Bot Settings</Text>
                                <FormLayout>
                                    <Select
                                        label={t('customization.tone_label')}
                                        options={[
                                            { label: t('customization.tones.custom'), value: 'custom' },
                                            { label: t('customization.tones.standard'), value: 'standard' },
                                            { label: t('customization.tones.friendly'), value: 'friendly' },
                                            { label: t('customization.tones.professional'), value: 'professional' },
                                            { label: t('customization.tones.minimalist'), value: 'minimalist' },
                                        ]}
                                        onChange={handleToneChange}
                                        value={tone}
                                        helpText={t('customization.tone_help')}
                                    />

                                    <TextField
                                        label={t('customization.welcome_msg')}
                                        value={welcomeMsg}
                                        onChange={(val) => { setWelcomeMsg(val); setTone('custom'); }}
                                        autoComplete="off"
                                        multiline={2}
                                    />

                                    <TextField
                                        label={t('customization.counter_msg')}
                                        value={rejectMsg}
                                        onChange={(val) => { setRejectMsg(val); setTone('custom'); }}
                                        autoComplete="off"
                                        multiline={2}
                                        helpText={t('customization.msg_help')}
                                    />

                                    <TextField
                                        label={t('customization.success_msg')}
                                        value={successMsg}
                                        onChange={(val) => { setSuccessMsg(val); setTone('custom'); }}
                                        autoComplete="off"
                                        multiline={2}
                                        helpText={t('customization.msg_help')}
                                    />
                                </FormLayout>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
