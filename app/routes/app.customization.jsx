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
// import { Modal, TitleBar, ResourcePicker } from "@shopify/app-bridge-react"; // ResourcePicker native not supported for images
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";
import { ChatIcon, EmailIcon, LanguageIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useSubmit } from "react-router"; // Fix for fetcher.submit vs useSubmit

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
            widgetTemplate: "classic",
            widgetTitle: "Chat with us",
            chatTheme: "modern",
        };
    }

    return {
        botWelcomeMsg: shop.botWelcomeMsg,
        botRejectMsg: shop.botRejectMsg,
        botSuccessMsg: shop.botSuccessMsg,
        widgetColor: shop.widgetColor,
        botIcon: shop.botIcon,
        widgetTemplate: shop.widgetTemplate || 'classic',
        widgetTitle: shop.widgetTitle || "Chat with us",
        chatTheme: shop.chatTheme || "modern",
        emailFont: shop.emailFont,
        emailPrimaryColor: shop.emailPrimaryColor,
        emailAcceptedSubject: shop.emailAcceptedSubject,
        emailAcceptedBody: shop.emailAcceptedBody,
        emailRejectedSubject: shop.emailRejectedSubject,
        emailRejectedBody: shop.emailRejectedBody,
        emailCounterSubject: shop.emailCounterSubject,
        emailCounterBody: shop.emailCounterBody,
        reactionMessages: shop.reactionMessages || "{}"
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
        widgetTemplate: formData.get("widgetTemplate"),
        widgetTitle: formData.get("widgetTitle"),
        chatTheme: formData.get("chatTheme"),
        emailFont: formData.get("emailFont"),
        emailPrimaryColor: formData.get("emailPrimaryColor"),
        emailAcceptedSubject: formData.get("emailAcceptedSubject"),
        emailAcceptedBody: formData.get("emailAcceptedBody"),
        emailRejectedSubject: formData.get("emailRejectedSubject"),
        emailRejectedBody: formData.get("emailRejectedBody"),
        emailCounterSubject: formData.get("emailCounterSubject"),
        emailCounterBody: formData.get("emailCounterBody"),
        reactionMessages: formData.get("reactionMessages"),
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
            welcome: "Hello! 👋 I can offer you a discount if you propose a reasonable price. What is your price?",
            reject: "Hmm, that's too low. I can go down to {price}€.", // Legacy fallback
            success: "It's a deal for {price}€ ! 🎉", // Legacy fallback
            reactions: {
                SHOCKED: [
                    "This offer is significantly below our expectations. However, we can offer you {{price}} €.",
                    "Unfortunately we cannot accept such a low offer. The product deserves better. I propose {{price}} €.",
                    "This price is too far from the item's value. We could go down to {{price}} €."
                ],
                LOW: [
                    "I appreciate the effort, but we can't go that low. Our best offer is {{price}} €.",
                    "We're getting closer, but this price is still below our limit. I can let it go for {{price}} €.",
                    "I can't validate this amount, but I'm sure we can find a deal at {{price}} €."
                ],
                CLOSE: [
                    "We are very close to a deal. Another small step towards {{price}} €?",
                    "Your offer is tempting. If you accept {{price}} €, we have a deal.",
                    "We are reaching the goal. Would you agree to {{price}} €?"
                ],
                SUCCESS: [
                    "It's agreed. We accept your offer with pleasure.",
                    "Deal concluded. You benefit from this preferential rate.",
                    "It's a fair offer. We are delighted to accept it."
                ],
                HIGH: [
                    "No need to offer more, the current price is {{price}} €."
                ],
                invalid_offer: "I didn't understand your price. Can you give me an amount (e.g. 45)?",
                sale_restriction: "Sorry, I cannot negotiate on already discounted items.",
                min_limit_reached: "Sorry, I cannot go lower than {{price}} €. That's my final price."
            }
        },
        friendly: {
            label: t('customization.tones.friendly'),
            welcome: "Hey there! 😊 Use me to get a sweet deal! Make an offer!",
            reject: "Ouch, that's a bit low! 😅 I can do {price}€.",
            success: "YAY! Deal! 🥳 Enjoy for {price}€!",
            reactions: {
                SHOCKED: [
                    "Whoa! That's super low! 😅 I can do {{price}} € though!",
                    "You're kidding right? 😉 Let's try {{price}} € instead.",
                    "I'd love to say yes, but I can't go that low! How about {{price}} €?"
                ],
                LOW: [
                    "Getting warmer! 🔥 But I need a bit more. How about {{price}} €?",
                    "Nice try! 😉 I can meet you at {{price}} €.",
                    "Almost there! Can you do {{price}} €?"
                ],
                CLOSE: [
                    "So close! Just a tiny bit more? {{price}} €?",
                    "We are practically there! Say yes to {{price}} €? 🤞",
                    "I'm feeling generous! {{price}} € and it's yours!"
                ],
                SUCCESS: [
                    "YAY! It's a deal! 🥳",
                    "Woohoo! Accepted! 🎉",
                    "Awesome! Enjoy your deal! 💖"
                ],
                HIGH: [
                    "Whoa, easy tiger! The price is only {{price}} €! 😉"
                ],
                invalid_offer: "Oops! I didn't verify that. Just type a number please! 🔢",
                sale_restriction: "Oh no! This item is already on super sale! 🛑",
                min_limit_reached: "I really can't go lower than {{price}} €! 🥺"
            }
        },
        professional: {
            label: t('customization.tones.professional'),
            welcome: "Welcome. We authorize negotiation on this item. Please submit your best offer.",
            reject: "We cannot accept this offer. Our counter-proposal is {price}€.",
            success: "Offer accepted. The price is set at {price}€.",
            reactions: {
                SHOCKED: [
                    "This offer is below our acceptable margin. Counter-offer: {{price}} €.",
                    "We differ significantly on the valuation. We propose {{price}} €.",
                    "This is outside our negotiation range. We can offer {{price}} €."
                ],
                LOW: [
                    "We acknowledge your offer but require {{price}} €.",
                    "This is slightly below our limit. We can accept {{price}} €.",
                    "Please revise your offer to {{price}} € for acceptance."
                ],
                CLOSE: [
                    "We are pending agreement. {{price}} € would be accepted.",
                    "Approaching final agreement price of {{price}} €.",
                    "A final adjustment to {{price}} € is required."
                ],
                SUCCESS: [
                    "Offer accepted. Proceeding to checkout.",
                    "Deal confirmed.",
                    "Proposal validated."
                ],
                HIGH: [
                    "The list price is {{price}} €. Please bid lower."
                ],
                invalid_offer: "Invalid input. Please enter a numerical value.",
                sale_restriction: "Negotiation is not applicable to discounted inventory.",
                min_limit_reached: "Final floor price reached: {{price}} €."
            }
        },
        minimalist: {
            label: t('customization.tones.minimalist'),
            welcome: "Negotiate your price.",
            reject: "Too low. {price}€.",
            success: "Agreed. {price}€.",
            reactions: {
                SHOCKED: [
                    "Too low. {{price}} €.",
                    "No. {{price}} €.",
                    "Impossible. {{price}} €."
                ],
                LOW: [
                    "Higher. {{price}} €.",
                    "Not enough. {{price}} €.",
                    "Try {{price}} €."
                ],
                CLOSE: [
                    "Almost. {{price}} €.",
                    "Close. {{price}} €.",
                    "{{price}} €?"
                ],
                SUCCESS: [
                    "Agreed.",
                    "Done.",
                    "Accepted."
                ],
                HIGH: [
                    "Max {{price}} €."
                ],
                invalid_offer: "Number only.",
                sale_restriction: "No negotiation.",
                min_limit_reached: "Min {{price}} €."
            }
        }
    };

    // Initial Values
    const initialWelcome = loaderData.botWelcomeMsg || TONE_PRESETS.standard.welcome;
    // We keep these for legacy/fallback but mainly focus on reactions now
    const initialReject = loaderData.botRejectMsg || TONE_PRESETS.standard.reject;
    const initialSuccess = loaderData.botSuccessMsg || TONE_PRESETS.standard.success;

    const [welcomeMsg, setWelcomeMsg] = useState(initialWelcome);
    const [rejectMsg, setRejectMsg] = useState(initialReject);
    const [successMsg, setSuccessMsg] = useState(initialSuccess);
    const [color, setColor] = useState(loaderData.widgetColor || "#000000");
    const [botIcon, setBotIcon] = useState(loaderData.botIcon || "");
    const [widgetTemplate, setWidgetTemplate] = useState(loaderData.widgetTemplate || 'classic');
    const [widgetTitle, setWidgetTitle] = useState(loaderData.widgetTitle || "Chat with us");
    const [chatTheme, setChatTheme] = useState(loaderData.chatTheme || "modern");

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
    // Helper to verify if botIcon is valid for preview (mostly simply truthy check + data/https)
    const botiConPreview = botIcon && (botIcon.startsWith('data:') || botIcon.startsWith('http'));

    const handleToneChange = (newTone) => {
        setTone(newTone);
        if (TONE_PRESETS[newTone]) {
            // Update Legacy Fields
            setWelcomeMsg(TONE_PRESETS[newTone].welcome);
            setRejectMsg(TONE_PRESETS[newTone].reject);
            setSuccessMsg(TONE_PRESETS[newTone].success);

            // Update New JSON Fields
            const presetReactions = TONE_PRESETS[newTone].reactions;
            const newStructure = {
                negotiation: {
                    reactions: JSON.parse(JSON.stringify(presetReactions)) // Deep copy
                }
            };
            setReactionMessages(newStructure);
        }
    };

    // Reaction Messages State
    const [reactionMessages, setReactionMessages] = useState(() => {
        try {
            const parsed = JSON.parse(loaderData.reactionMessages || "{}");
            // Ensure structure exists
            if (!parsed.negotiation) parsed.negotiation = {};
            if (!parsed.negotiation.reactions) parsed.negotiation.reactions = {};
            return parsed;
        } catch (e) {
            return { negotiation: { reactions: {} } };
        }
    });

    const handleReactionChange = (category, value, index = null) => {
        const newReactions = { ...reactionMessages };
        if (!newReactions.negotiation) newReactions.negotiation = { reactions: {} };
        if (!newReactions.negotiation.reactions) newReactions.negotiation.reactions = {};

        if (Array.isArray(newReactions.negotiation.reactions[category])) {
            // It's an array (SHOCKED, LOW, etc.)
            if (index !== null) {
                newReactions.negotiation.reactions[category][index] = value;
            }
        } else {
            // String value
            newReactions.negotiation.reactions[category] = value;
        }
        setReactionMessages(newReactions);
    };

    const addReactionVariant = (category) => {
        const newReactions = { ...reactionMessages };
        if (!newReactions.negotiation.reactions[category]) newReactions.negotiation.reactions[category] = [];
        newReactions.negotiation.reactions[category].push("");
        setReactionMessages(newReactions);
    };

    const removeReactionVariant = (category, index) => {
        const newReactions = { ...reactionMessages };
        if (newReactions.negotiation.reactions[category]) {
            newReactions.negotiation.reactions[category].splice(index, 1);
        }
        setReactionMessages(newReactions);
    };

    useEffect(() => {
        const isModified =
            welcomeMsg !== initialWelcome ||
            rejectMsg !== initialReject ||
            successMsg !== initialSuccess ||
            color !== (loaderData.widgetColor || "#000000") ||
            botIcon !== (loaderData.botIcon || "") ||
            widgetTemplate !== (loaderData.widgetTemplate || 'classic') ||
            widgetTitle !== (loaderData.widgetTitle || "Chat with us") ||
            chatTheme !== (loaderData.chatTheme || "modern") ||
            emailFont !== (loaderData.emailFont || "Arial, sans-serif") ||
            emailPrimaryColor !== (loaderData.emailPrimaryColor || "#008060") ||
            emailAcceptedSubject !== (loaderData.emailAcceptedSubject || "Your offer has been accepted! 🎉") ||
            emailAcceptedBody !== (loaderData.emailAcceptedBody || "") ||
            emailRejectedSubject !== (loaderData.emailRejectedSubject || "Update on your offer") ||
            emailRejectedBody !== (loaderData.emailRejectedBody || "") ||
            emailCounterSubject !== (loaderData.emailCounterSubject || "Counter-offer for your request") ||
            emailCounterBody !== (loaderData.emailCounterBody || "") ||
            JSON.stringify(reactionMessages) !== (loaderData.reactionMessages || "{}");

        setIsDirty(isModified);
    }, [
        welcomeMsg, rejectMsg, successMsg, color, botIcon, widgetTemplate, widgetTitle, chatTheme, initialWelcome, initialReject, initialSuccess, loaderData,
        emailFont, emailPrimaryColor, emailAcceptedSubject, emailAcceptedBody, emailRejectedSubject, emailRejectedBody, emailCounterSubject, emailCounterBody,
        reactionMessages
    ]);

    const handleSave = () => {
        let formData = new FormData();
        formData.append("botWelcomeMsg", welcomeMsg);
        formData.append("botRejectMsg", rejectMsg);
        formData.append("botSuccessMsg", successMsg);
        formData.append("widgetColor", color);
        formData.append("botIcon", botIcon);
        formData.append("widgetTemplate", widgetTemplate);
        formData.append("widgetTitle", widgetTitle);
        formData.append("chatTheme", chatTheme);
        formData.append("emailFont", emailFont);
        formData.append("emailPrimaryColor", emailPrimaryColor);
        formData.append("emailAcceptedSubject", emailAcceptedSubject);
        formData.append("emailAcceptedBody", emailAcceptedBody);
        formData.append("emailRejectedSubject", emailRejectedSubject);
        formData.append("emailRejectedBody", emailRejectedBody);
        formData.append("emailCounterSubject", emailCounterSubject);
        formData.append("emailCounterBody", emailCounterBody);
        formData.append("reactionMessages", JSON.stringify(reactionMessages));

        fetcher.submit(formData, { method: "POST" });
    };

    const [selectedTab, setSelectedTab] = useState(0);

    // Helper for Reaction Arrays
    const renderReactionList = (category, title) => {
        const items = reactionMessages?.negotiation?.reactions?.[category] || [];
        return (
            <Box paddingBlockEnd="400">
                <Text variant="headingSm" as="h6">{title}</Text>
                <div style={{ marginTop: '10px' }}>
                    {items.map((msg, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ flexGrow: 1 }}>
                                <TextField
                                    value={msg}
                                    onChange={(val) => handleReactionChange(category, val, idx)}
                                    autoComplete="off"
                                    multiline={2}
                                />
                            </div>
                            <Button tone="critical" onClick={() => removeReactionVariant(category, idx)}>Remove</Button>
                        </div>
                    ))}
                    <Button onClick={() => addReactionVariant(category)}>+ Add Variant</Button>
                </div>
            </Box>
        );
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
                    <Card padding="0">
                        <div style={{ padding: '16px', borderBottom: '1px solid #e1e3e5', background: '#f9fafb' }}>
                            <InlineGrid columns={3} gap="400">
                                <Button
                                    pressed={selectedTab === 0}
                                    variant={selectedTab === 0 ? "primary" : undefined}
                                    onClick={() => setSelectedTab(0)}
                                    size="large"
                                    icon={ChatIcon}
                                    fullWidth
                                >
                                    Appearance
                                </Button>
                                <Button
                                    pressed={selectedTab === 1}
                                    variant={selectedTab === 1 ? "primary" : undefined}
                                    onClick={() => setSelectedTab(1)}
                                    size="large"
                                    icon={LanguageIcon}
                                    fullWidth
                                >
                                    Conversation
                                </Button>
                                <Button
                                    pressed={selectedTab === 2}
                                    variant={selectedTab === 2 ? "primary" : undefined}
                                    onClick={() => setSelectedTab(2)}
                                    size="large"
                                    icon={EmailIcon}
                                    fullWidth
                                >
                                    Emails
                                </Button>
                            </InlineGrid>
                        </div>

                        <Box padding="400">
                            {/* TAB 0: APPEARANCE */}
                            {selectedTab === 0 && (
                                <BlockStack gap="500">
                                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "2rem" }}>
                                        {/* Left Column: Settings */}
                                        <div style={{ flex: "1 1 400px" }}>
                                            <Text as="h2" variant="headingMd">{t('customization.widget_appearance')}</Text>
                                            <FormLayout>
                                                <Box paddingBlockEnd="400">
                                                    <Select
                                                        label="Position & Style"
                                                        options={[
                                                            { label: 'Centre (Popup Classique)', value: 'centered' },
                                                            { label: 'Angle (Glissant - Bas Droite)', value: 'corner' }
                                                        ]}
                                                        onChange={setWidgetTemplate}
                                                        value={widgetTemplate}
                                                        helpText="Choisissez la position du widget sur la boutique."
                                                    />
                                                </Box>
                                                <Box paddingBlockEnd="400">
                                                    <Select
                                                        label="Style du Chat"
                                                        options={[
                                                            { label: 'Moderne', value: 'modern' },
                                                            { label: 'Ludique', value: 'playful' },
                                                            { label: 'Classique', value: 'classic' }
                                                        ]}
                                                        onChange={setChatTheme}
                                                        value={chatTheme}
                                                        helpText="Choisissez l'apparence des bulles et du chat."
                                                    />
                                                </Box>
                                                <Box paddingBlockEnd="400">
                                                    <TextField
                                                        label="Titre du Widget"
                                                        value={widgetTitle}
                                                        onChange={setWidgetTitle}
                                                        autoComplete="off"
                                                        helpText="Texte affiché en haut de la fenêtre (ex: Discuter avec nous)"
                                                    />
                                                </Box>
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        {botiConPreview ? (
                                                            <div style={{ position: "relative" }}>
                                                                <Thumbnail source={botIcon} alt="Bot Icon" size="large" />
                                                                <div style={{ position: "absolute", top: -8, right: -8 }}>
                                                                    <Button
                                                                        icon={DeleteIcon}
                                                                        onClick={() => setBotIcon("")}
                                                                        accessibilityLabel="Remove image"
                                                                        size="micro"
                                                                        tone="critical"
                                                                        variant="primary"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                width: "60px",
                                                                height: "60px",
                                                                backgroundColor: "#f1f1f1",
                                                                borderRadius: "8px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                border: "1px dashed #babfc3"
                                                            }}>
                                                                <span style={{ fontSize: "24px", opacity: 0.5 }}>🤖</span>
                                                            </div>
                                                        )}

                                                        <div style={{ flexGrow: 1 }}>
                                                            <DropZone onDrop={handleDrop} allowMultiple={false} variableHeight>
                                                                <DropZone.FileUpload actionTitle={t('customization.upload_label') || "Upload Image"} />
                                                            </DropZone>
                                                            <Text variant="bodyXs" tone="subdued" as="p" alignment="center">
                                                                Recommended: Square image, PNG or JPG.
                                                            </Text>
                                                        </div>
                                                    </div>
                                                </Box>
                                            </FormLayout>
                                        </div>

                                        {/* Right Column: Preview */}
                                        <div style={{ flex: "1 1 300px", minWidth: "300px" }}>
                                            <div style={{ position: "sticky", top: "20px" }}>
                                                <Box paddingBlockEnd="400" background="bg-surface-secondary" padding="400" borderRadius="200">
                                                    <Text variant="headingSm" as="h6" paddingBlockEnd="400" alignment="center">Live Preview</Text>
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
                                                        }} className={`smart-offer-preview-container theme-${chatTheme}`}>
                                                            {/* Header */}
                                                            <div className="preview-header" style={{
                                                                backgroundColor: chatTheme === 'modern' ? 'transparent' : color,
                                                                color: chatTheme === 'modern' ? '#000' : "#fff",
                                                                padding: "12px 16px",
                                                                fontWeight: "600",
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center"
                                                            }}>
                                                                <span>{widgetTitle || "Chat with us"}</span>
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
                                                                    I love this color!
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Box>
                                            </div>
                                        </div>
                                    </div>
                                </BlockStack>
                            )}

                            {/* TAB 1: CONVERSATION (Merged Mode) */}
                            {selectedTab === 1 && (
                                <BlockStack gap="500">
                                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "2rem" }}>
                                        {/* Left Column: Settings */}
                                        <div style={{ flex: "1 1 400px" }}>
                                            <Text as="h2" variant="headingMd" tone="subdued" textDecorationLine="none">Conversation Strategy</Text>
                                            <Box paddingBlockStart="400" paddingBlockEnd="400">
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
                                                <Text as="p" tone="subdued">Select a tone to auto-fill all messages below.</Text>
                                            </Box>

                                            <Box paddingBlockEnd="400" borderColor="border-subdued" borderBlockEndWidth="025">
                                                <Text variant="headingSm" as="h5">👋 Welcome Message</Text>
                                                <TextField
                                                    label="Initial greeting"
                                                    value={welcomeMsg}
                                                    onChange={(val) => { setWelcomeMsg(val); setTone('custom'); }}
                                                    autoComplete="off"
                                                    multiline={2}
                                                />
                                            </Box>

                                            {/* The Dynamic Dictionary */}
                                            <div style={{ marginTop: '20px' }}>
                                                {renderReactionList('SHOCKED', "😱 Shocked (Offer too low)")}
                                                {renderReactionList('LOW', "😕 Low (Offer needs improvement)")}
                                                {renderReactionList('CLOSE', "🤔 Close (Almost there)")}
                                                {renderReactionList('SUCCESS', "🎉 Success (Deal accepted)")}
                                                {renderReactionList('HIGH', "🛑 High (Offer above original price)")}

                                                <Text variant="headingMd" as="h3" paddingBlockStart="400" paddingBlockEnd="400">🛡️ System Messages (Fixed)</Text>

                                                <Box paddingBlockEnd="400">
                                                    <TextField
                                                        label="Invalid Offer (Not a number)"
                                                        value={reactionMessages?.negotiation?.reactions?.invalid_offer || ""}
                                                        onChange={(val) => handleReactionChange('invalid_offer', val)}
                                                        autoComplete="off"
                                                    />
                                                </Box>
                                                <Box paddingBlockEnd="400">
                                                    <TextField
                                                        label="Discount Restriction (Item on sale)"
                                                        value={reactionMessages?.negotiation?.reactions?.sale_restriction || ""}
                                                        onChange={(val) => handleReactionChange('sale_restriction', val)}
                                                        autoComplete="off"
                                                    />
                                                </Box>
                                                <Box paddingBlockEnd="400">
                                                    <TextField
                                                        label="Min Limit Reached (Final Rejection)"
                                                        value={reactionMessages?.negotiation?.reactions?.min_limit_reached || ""}
                                                        onChange={(val) => handleReactionChange('min_limit_reached', val)}
                                                        autoComplete="off"
                                                    />
                                                </Box>
                                            </div>
                                        </div>

                                        {/* Right Column: Chat Preview */}
                                        <div style={{ flex: "1 1 300px", minWidth: "300px" }}>
                                            <div style={{ position: "sticky", top: "20px" }}>
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
                                                                    {reactionMessages?.negotiation?.reactions?.LOW?.[0]?.replace("{{price}}", "90.00") || rejectMsg?.replace("{price}", "90.00") || "Je peux faire 90.00 €."}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Box>
                                            </div>
                                        </div>
                                    </div>
                                </BlockStack>
                            )}

                            {/* TAB 2: EMAILS */}
                            {selectedTab === 2 && (
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

                            {/* CSS for Live Preview */}
                            <style>{`
                                /* Modern Theme (iOS 26 / Neon) */
                                .smart-offer-preview-container.theme-modern {
                                    --so-bubble-radius: 24px;
                                    background-color: rgba(255, 255, 255, 0.65) !important;
                                    backdrop-filter: blur(35px) saturate(200%);
                                    -webkit-backdrop-filter: blur(35px) saturate(200%);
                                    border: 1px solid rgba(255, 255, 255, 0.4) !important;
                                    box-shadow: 
                                        0 20px 50px rgba(0, 0, 0, 0.1), 
                                        0 0 0 1px rgba(255, 255, 255, 0.5) inset,
                                        0 0 20px rgba(0, 122, 255, 0.15) !important; /* Blue Neon Aura */
                                }
                                .theme-modern .preview-header {
                                    background: transparent !important;
                                    border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
                                }
                                
                                /* Playful Theme */
                                .smart-offer-preview-container.theme-playful {
                                    border: 2px solid #000 !important;
                                    box-shadow: 4px 4px 0px rgba(0,0,0,1) !important;
                                    border-radius: 12px !important;
                                }
                                .theme-playful .preview-header {
                                    border-bottom: 2px solid #000 !important;
                                    font-weight: 800;
                                }

                                /* Classic Theme */
                                .smart-offer-preview-container.theme-classic {
                                    border-radius: 8px !important;
                                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                                }
                                .theme-classic .preview-header {
                                    border-bottom: none !important;
                                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                                }
                            `}</style>

                        </Box>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page >
    );
}

