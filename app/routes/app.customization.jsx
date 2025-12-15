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
    InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";
import { ChatIcon, EmailIcon } from "@shopify/polaris-icons";

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
        emailFont: shop.emailFont,
        emailPrimaryColor: shop.emailPrimaryColor,
        emailAcceptedSubject: shop.emailAcceptedSubject,
        emailAcceptedBody: shop.emailAcceptedBody,
        emailRejectedSubject: shop.emailRejectedSubject,
        emailRejectedBody: shop.emailRejectedBody,
        emailCounterSubject: shop.emailCounterSubject,
        emailCounterBody: shop.emailCounterBody,
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
        widgetColor,
        botIcon,
        emailFont: formData.get("emailFont"),
        emailPrimaryColor: formData.get("emailPrimaryColor"),
        emailAcceptedSubject: formData.get("emailAcceptedSubject"),
        emailAcceptedBody: formData.get("emailAcceptedBody"),
        emailRejectedSubject: formData.get("emailRejectedSubject"),
        emailRejectedBody: formData.get("emailRejectedBody"),
        emailCounterSubject: formData.get("emailCounterSubject"),
        emailCounterBody: formData.get("emailCounterBody"),
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

    // Email Customization State
    const [emailFont, setEmailFont] = useState(loaderData.emailFont || "Arial, sans-serif");
    const [emailPrimaryColor, setEmailPrimaryColor] = useState(loaderData.emailPrimaryColor || "#008060");

    // Accepted
    const [emailAcceptedSubject, setEmailAcceptedSubject] = useState(loaderData.emailAcceptedSubject || "Your offer has been accepted! 🎉");
    const [emailAcceptedBody, setEmailAcceptedBody] = useState(loaderData.emailAcceptedBody || "<h2>Congratulations! Your offer has been accepted.</h2><p>You successfully negotiated for the product: <strong>{productTitle}</strong>.</p><p>Here is your unique discount code:</p><h1 style='color: {color};'>{code}</h1><p><strong>Attention:</strong> This code is valid only until: {endsAt}.</p>");

    // Rejected
    const [emailRejectedSubject, setEmailRejectedSubject] = useState(loaderData.emailRejectedSubject || "Update on your offer");
    const [emailRejectedBody, setEmailRejectedBody] = useState(loaderData.emailRejectedBody || "<h2>Regarding your offer for {productTitle}</h2><p>We have reviewed your proposal, but unfortunately we cannot accept it at this time.</p><p>Feel free to <a href='{productUrl}'>visit our shop</a> to make a different offer.</p>");

    // Counter
    const [emailCounterSubject, setEmailCounterSubject] = useState(loaderData.emailCounterSubject || "Counter-offer for your request");
    const [emailCounterBody, setEmailCounterBody] = useState(loaderData.emailCounterBody || "<h2>New proposal for {productTitle}</h2><p>Your initial offer was a bit low, but we want to find a deal.</p><p>We can offer you this product for the exceptional price of:</p><h1 style='color: blue;'>{newPrice} €</h1><p><strong>Accept this offer:</strong> Use code <strong style='color: green;'>{code}</strong> at checkout.</p><p>(Valid until {endsAt})</p>");

    // Preview State
    const [previewType, setPreviewType] = useState('accepted'); // accepted | rejected | counter

    // Helper to generate preview HTML
    const getPreviewHtml = () => {
        const mockData = {
            productTitle: "Stylish Sunglasses",
            productUrl: "#",
            code: "SUMMER-SALE-123",
            endsAt: new Date(Date.now() + 86400000).toLocaleString(),
            newPrice: "85.00",
            color: emailPrimaryColor
        };

        let body = "";
        let subject = "";

        if (previewType === 'accepted') {
            body = emailAcceptedBody;
            subject = emailAcceptedSubject;
        } else if (previewType === 'rejected') {
            body = emailRejectedBody;
            subject = emailRejectedSubject;
        } else {
            body = emailCounterBody;
            subject = emailCounterSubject;
        }

        // Simple replacements for preview
        let htmlContent = body
            .replace(/{productTitle}/g, mockData.productTitle)
            .replace(/{code}/g, mockData.code)
            .replace(/{endsAt}/g, mockData.endsAt)
            .replace(/{color}/g, mockData.color)
            .replace(/{productUrl}/g, mockData.productUrl)
            .replace(/{newPrice}/g, mockData.newPrice);

        // Add fake buttons based on type
        if (previewType === 'accepted' || previewType === 'counter') {
            htmlContent += `
            <div style="margin: 20px 0;">
                <a href="#" style="background-color: ${emailPrimaryColor}; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Buy now
                </a>
            </div>`;
        }

        if (previewType === 'counter') {
            htmlContent += `
            <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
            <p><strong>Not interested?</strong></p>
            <p>If this price doesn't work for you, you can <a href="#">return to the product page</a> to make a different offer.</p>
        `;
        }

        return `
            <div style="font-family: ${emailFont}; color: #333; line-height: 1.5;">
                <h3 style="margin-top:0; border-bottom: 1px solid #eee; padding-bottom: 10px;">Subject: ${subject}</h3>
                ${htmlContent}
            </div>
        `;
    };

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const isModified =
            welcomeMsg !== initialWelcome ||
            rejectMsg !== initialReject ||
            successMsg !== initialSuccess ||
            color !== (loaderData.widgetColor || "#000000") ||
            botIcon !== (loaderData.botIcon || "") ||
            emailFont !== (loaderData.emailFont || "Arial, sans-serif") ||
            emailPrimaryColor !== (loaderData.emailPrimaryColor || "#008060") ||
            emailAcceptedSubject !== (loaderData.emailAcceptedSubject || "Your offer has been accepted! 🎉") ||
            emailAcceptedBody !== (loaderData.emailAcceptedBody || "") ||
            emailRejectedSubject !== (loaderData.emailRejectedSubject || "Update on your offer") ||
            emailRejectedBody !== (loaderData.emailRejectedBody || "") ||
            emailCounterSubject !== (loaderData.emailCounterSubject || "Counter-offer for your request") ||
            emailCounterBody !== (loaderData.emailCounterBody || "");

        setIsDirty(isModified);
    }, [
        welcomeMsg, rejectMsg, successMsg, color, botIcon, initialWelcome, initialReject, initialSuccess, loaderData,
        emailFont, emailPrimaryColor, emailAcceptedSubject, emailAcceptedBody, emailRejectedSubject, emailRejectedBody, emailCounterSubject, emailCounterBody
    ]);

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
        formData.append("emailFont", emailFont);
        formData.append("emailPrimaryColor", emailPrimaryColor);
        formData.append("emailAcceptedSubject", emailAcceptedSubject);
        formData.append("emailAcceptedBody", emailAcceptedBody);
        formData.append("emailRejectedSubject", emailRejectedSubject);
        formData.append("emailRejectedBody", emailRejectedBody);
        formData.append("emailCounterSubject", emailCounterSubject);
        formData.append("emailCounterBody", emailCounterBody);

        fetcher.submit(formData, { method: "POST" });
    };

    const [selectedTab, setSelectedTab] = useState(0);

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
                    <Card padding="0">
                        <div style={{ padding: '16px', borderBottom: '1px solid #e1e3e5', background: '#f9fafb' }}>
                            <InlineGrid columns={2} gap="400">
                                <Button
                                    pressed={selectedTab === 0}
                                    variant={selectedTab === 0 ? "primary" : undefined}
                                    onClick={() => setSelectedTab(0)}
                                    size="large"
                                    icon={ChatIcon}
                                    fullWidth
                                >
                                    Chatbot Widget
                                </Button>
                                <Button
                                    pressed={selectedTab === 1}
                                    variant={selectedTab === 1 ? "primary" : undefined}
                                    onClick={() => setSelectedTab(1)}
                                    size="large"
                                    icon={EmailIcon}
                                    fullWidth
                                >
                                    Email Templates
                                </Button>
                            </InlineGrid>
                        </div>

                        <Box padding="400">
                            {selectedTab === 0 && (
                                <BlockStack gap="500">
                                    <Text as="h2" variant="headingMd">Chatbot Configuration</Text>

                                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "2rem" }}>
                                        {/* Left Column: Settings */}
                                        <div style={{ flex: "1 1 300px" }}>
                                            <FormLayout>
                                                <Box paddingBlockEnd="400">
                                                    <Text variant="headingSm" as="h6">{t('customization.widget_color')}</Text>
                                                    <div style={{ display: "flex", alignItems: "end", gap: "10px", marginTop: "10px" }}>
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
                                                            >
                                                                <span style={{ fontSize: "20px" }}>🎨</span>
                                                            </div>
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
                                                            />
                                                        </div>
                                                    </div>
                                                </Box>

                                                <Box paddingBlockEnd="400">
                                                    <Text variant="headingSm" as="h6" paddingBlockEnd="200">{t('customization.profile_pic')}</Text>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                        {botIcon && (
                                                            <Thumbnail source={botIcon} alt="Bot Icon" size="medium" />
                                                        )}
                                                        <div style={{ flexGrow: 1 }}>
                                                            <TextField
                                                                label={t('customization.url_label')}
                                                                value={botIcon}
                                                                onChange={setBotIcon}
                                                                autoComplete="off"
                                                                placeholder="https://..."
                                                            />
                                                            <div style={{ marginTop: '10px' }}>
                                                                <DropZone onDrop={handleDrop} accept="image/*" type="image" allowMultiple={false} label={t('customization.upload_label')}>
                                                                    {(!botIcon && !file) && <DropZone.FileUpload />}
                                                                </DropZone>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Box>

                                                <Box paddingBlockStart="400" borderBlockStartWidth="025" borderColor="border-subdued">
                                                    <Text variant="headingMd" as="h3" paddingBlockEnd="400">Message Settings</Text>
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
                                                    />
                                                    <TextField
                                                        label={t('customization.success_msg')}
                                                        value={successMsg}
                                                        onChange={(val) => { setSuccessMsg(val); setTone('custom'); }}
                                                        autoComplete="off"
                                                        multiline={2}
                                                    />
                                                </Box>
                                            </FormLayout>
                                        </div>

                                        {/* Right Column: Chat Preview */}
                                        <div style={{ flex: "1 1 300px", minWidth: "300px" }}>
                                            <Box paddingBlockEnd="400" background="bg-surface-secondary" padding="400" borderRadius="200">
                                                <Text variant="headingSm" as="h6" paddingBlockEnd="400" alignment="center">{t('customization.chat_preview')}</Text>
                                                <div style={{ display: "flex", justifyContent: "center" }}>
                                                    <div style={{
                                                        border: "1px solid #e1e3e5",
                                                        borderRadius: "12px",
                                                        overflow: "hidden",
                                                        width: "100%",
                                                        maxWidth: "320px",
                                                        backgroundColor: "#fff",
                                                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
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
                                                            padding: "16px",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: "12px",
                                                            minHeight: "250px"
                                                        }}>
                                                            {/* Bot Msg */}
                                                            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                                                {botIcon ? (
                                                                    <div style={{
                                                                        width: "28px",
                                                                        height: "28px",
                                                                        borderRadius: "50%",
                                                                        overflow: "hidden",
                                                                        flexShrink: 0,
                                                                        backgroundImage: `url(${botIcon})`,
                                                                        backgroundSize: "cover",
                                                                        backgroundPosition: "center"
                                                                    }} />
                                                                ) : (
                                                                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#eee", flexShrink: 0 }} />
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
                                                </div>
                                            </Box>
                                        </div>
                                    </div>
                                </BlockStack>
                            )}

                            {selectedTab === 1 && (
                                <BlockStack gap="500">
                                    <Text as="h2" variant="headingMd">Email Templates</Text>
                                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                                        {/* Left: Controls */}
                                        <div style={{ flex: "1 1 400px" }}>
                                            <FormLayout>
                                                <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
                                                    <div style={{ flex: 1 }}>
                                                        <TextField
                                                            label="Email Primary Color"
                                                            value={emailPrimaryColor}
                                                            onChange={setEmailPrimaryColor}
                                                            autoComplete="off"
                                                            helpText="Used for buttons and highlights"
                                                        />
                                                        <div
                                                            style={{
                                                                width: "100%",
                                                                height: "30px",
                                                                backgroundColor: emailPrimaryColor,
                                                                marginTop: "5px",
                                                                borderRadius: "4px",
                                                                cursor: "pointer",
                                                                border: "1px solid #ccc"
                                                            }}
                                                            onClick={() => document.getElementById("email-color-picker").click()}
                                                        />
                                                        <input
                                                            type="color"
                                                            id="email-color-picker"
                                                            value={emailPrimaryColor}
                                                            onChange={(e) => setEmailPrimaryColor(e.target.value)}
                                                            style={{ visibility: "hidden", position: "absolute", width: 0, height: 0 }}
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <Select
                                                            label="Font Family"
                                                            options={[
                                                                { label: 'Arial', value: 'Arial, sans-serif' },
                                                                { label: 'Helvetica', value: 'Helvetica, sans-serif' },
                                                                { label: 'Verdana', value: 'Verdana, sans-serif' },
                                                                { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
                                                                { label: 'Gill Sans', value: '"Gill Sans", sans-serif' },
                                                                { label: 'Noto Sans', value: '"Noto Sans", sans-serif' },
                                                                { label: 'Avantgarde', value: 'Avantgarde, sans-serif' },
                                                                { label: 'Optima', value: 'Optima, sans-serif' },
                                                                { label: 'Arial Narrow', value: '"Arial Narrow", sans-serif' },
                                                                { label: 'Times New Roman', value: '"Times New Roman", serif' },
                                                                { label: 'Georgia', value: 'Georgia, serif' },
                                                                { label: 'Garamond', value: 'Garamond, serif' },
                                                                { label: 'Palatino', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
                                                                { label: 'Baskerville', value: 'Baskerville, serif' },
                                                                { label: 'Bookman', value: '"Bookman Old Style", serif' },
                                                                { label: 'Didot', value: 'Didot, serif' },
                                                                { label: 'American Typewriter', value: '"American Typewriter", serif' },
                                                                { label: 'Courier New', value: '"Courier New", monospace' },
                                                                { label: 'Monaco', value: 'Monaco, monospace' },
                                                                { label: 'Lucida Console', value: '"Lucida Console", monospace' },
                                                                { label: 'Brush Script MT', value: '"Brush Script MT", cursive' },
                                                                { label: 'Copperplate', value: 'Copperplate, fantasy' },
                                                                { label: 'Papyrus', value: 'Papyrus, fantasy' },
                                                                { label: 'Impact', value: 'Impact, fantasy' },
                                                                { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
                                                                { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
                                                                { label: 'Tahoma', value: 'Tahoma, sans-serif' },
                                                                { label: 'Geneva', value: 'Geneva, sans-serif' },
                                                                { label: 'Century Gothic', value: '"Century Gothic", sans-serif' },
                                                                { label: 'Lucida Grande', value: '"Lucida Grande", sans-serif' },
                                                            ]}
                                                            onChange={setEmailFont}
                                                            value={emailFont}
                                                        />
                                                    </div>
                                                </div>

                                                <Text variant="headingSm" as="h4">Accepted Email</Text>
                                                <TextField
                                                    label="Subject"
                                                    value={emailAcceptedSubject}
                                                    onChange={setEmailAcceptedSubject}
                                                    autoComplete="off"
                                                />
                                                <TextField
                                                    label="HTML Body"
                                                    value={emailAcceptedBody}
                                                    onChange={setEmailAcceptedBody}
                                                    multiline={4}
                                                    autoComplete="off"
                                                    helpText="Available variables: {productTitle}, {code}, {endsAt}, {color}"
                                                />

                                                <div style={{ marginTop: "20px" }}>
                                                    <Text variant="headingSm" as="h4">Rejected Email</Text>
                                                    <TextField
                                                        label="Subject"
                                                        value={emailRejectedSubject}
                                                        onChange={setEmailRejectedSubject}
                                                        autoComplete="off"
                                                    />
                                                    <TextField
                                                        label="HTML Body"
                                                        value={emailRejectedBody}
                                                        onChange={setEmailRejectedBody}
                                                        multiline={4}
                                                        autoComplete="off"
                                                        helpText="Available variables: {productTitle}, {productUrl}"
                                                    />
                                                </div>

                                                <div style={{ marginTop: "20px" }}>
                                                    <Text variant="headingSm" as="h4">Counter Offer Email</Text>
                                                    <TextField
                                                        label="Subject"
                                                        value={emailCounterSubject}
                                                        onChange={setEmailCounterSubject}
                                                        autoComplete="off"
                                                    />
                                                    <TextField
                                                        label="HTML Body"
                                                        value={emailCounterBody}
                                                        onChange={setEmailCounterBody}
                                                        multiline={4}
                                                        autoComplete="off"
                                                        helpText="Available variables: {productTitle}, {newPrice}, {code}, {endsAt}"
                                                    />
                                                </div>
                                            </FormLayout>
                                        </div>

                                        {/* Right: Preview */}
                                        <div style={{ flex: "1 1 350px", minWidth: "300px" }}>
                                            <Box paddingBlockEnd="400" background="bg-surface-secondary" padding="400" borderRadius="200">
                                                <Text variant="headingSm" as="h6" paddingBlockEnd="400" alignment="center">Live Email Preview</Text>
                                                <div style={{ marginBottom: "10px" }}>
                                                    <Select
                                                        label="Preview Type"
                                                        labelHidden
                                                        options={[
                                                            { label: 'Accepted Email', value: 'accepted' },
                                                            { label: 'Rejected Email', value: 'rejected' },
                                                            { label: 'Counter Offer Email', value: 'counter' },
                                                        ]}
                                                        onChange={setPreviewType}
                                                        value={previewType}
                                                    />
                                                </div>

                                                <div style={{
                                                    border: "1px solid #e1e3e5",
                                                    borderRadius: "8px",
                                                    padding: "20px",
                                                    backgroundColor: "#fff",
                                                    minHeight: "350px",
                                                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                                                }}>
                                                    <div dangerouslySetInnerHTML={{ __html: getPreviewHtml() }} />
                                                </div>
                                            </Box>
                                        </div>
                                    </div>
                                </BlockStack>
                            )}
                        </Box>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

