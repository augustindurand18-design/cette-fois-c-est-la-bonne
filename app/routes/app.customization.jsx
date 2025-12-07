import { useState, useCallback } from "react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

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

    await db.shop.update({
        where: { shopUrl: session.shop },
        data: {
            botWelcomeMsg,
            botRejectMsg,
            botSuccessMsg,
            botSuccessMsg,
            widgetColor,
            botIcon,
        },
    });

    return { success: true };
};

const TONE_PRESETS = {
    standard: {
        label: "Standard",
        welcome: "Bonjour ! 👋 Je peux vous faire une remise si vous me proposez un prix raisonnable. Quel est votre prix ?",
        reject: "C'est un peu juste... Je peux vous le faire à {price} €.",
        success: "C'est d'accord pour {price}€ ! 🎉"
    },
    friendly: {
        label: "Amical",
        welcome: "Salut ! 👋 Je suis d'humeur négociatrice aujourd'hui. Fais-moi ta meilleure offre !",
        reject: "Oula, c'est bas ! 😅 Je peux descendre à {price} € pour te faire plaisir.",
        success: "Top ! Vendu pour {price}€ ! Fonce ! 🚀"
    },
    professional: {
        label: "Professionnel",
        welcome: "Bonjour. Nous sommes ouverts à la discussion. Quelle est votre proposition de prix ?",
        reject: "Cette offre est en dessous de notre seuil. Nous pouvons vous proposer {price} €.",
        success: "Votre offre de {price}€ est acceptée. Merci de votre confiance."
    },
    minimalist: {
        label: "Direct / Minimaliste",
        welcome: "Faites une offre.",
        reject: "Trop bas. Min: {price} €.",
        success: "Ok pour {price}€."
    }
};

export default function CustomizationPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();

    // Initial Values
    const initialWelcome = loaderData.botWelcomeMsg || TONE_PRESETS.standard.welcome;
    const initialReject = loaderData.botRejectMsg || TONE_PRESETS.standard.reject;
    const initialSuccess = loaderData.botSuccessMsg || TONE_PRESETS.standard.success;

    const [welcomeMsg, setWelcomeMsg] = useState(initialWelcome);
    const [rejectMsg, setRejectMsg] = useState(initialReject);
    const [successMsg, setSuccessMsg] = useState(initialSuccess);
    const [color, setColor] = useState(loaderData.widgetColor || "#000000");
    const [botIcon, setBotIcon] = useState(loaderData.botIcon || "");

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
        fetcher.submit(
            {
                botWelcomeMsg: welcomeMsg,
                botRejectMsg: rejectMsg,
                botSuccessMsg: successMsg,
                botSuccessMsg: successMsg,
                widgetColor: color,
                botIcon: botIcon
            },
            { method: "POST" }
        );
    };

    return (
        <Page
            title="Personnalisation"
            subtitle="Gérez l'apparence et le ton de votre bot de négociation."
            primaryAction={{
                content: fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer",
                onAction: handleSave,
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Personnalisation du Bot</Text>

                            {/* Visuals Section (Top) */}
                            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "2rem" }}>

                                {/* Left Column: Controls (Color + Photo) */}
                                <div style={{ flex: "1 1 300px" }}>
                                    <FormLayout>
                                        <Text variant="headingSm" as="h6">Couleur du Widget</Text>
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
                                                    title="Cliquer pour changer la couleur"
                                                >
                                                    <span style={{ fontSize: "20px", filter: "drop-shadow(0 0 2px rgba(255,255,255,0.8))" }}>🎨</span>
                                                </div>
                                                <Text variant="bodyXs" tone="subdued">Cliquer</Text>
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
                                                    label="Code Hex"
                                                    value={color}
                                                    onChange={setColor}
                                                    autoComplete="off"
                                                    placeholder="#000000"
                                                    helpText="Ou entrez le code couleur manuellement."
                                                />
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: "1rem" }}>
                                            <Text variant="headingSm" as="h6">Photo de Profil du Bot</Text>
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
                                                        <DropZone onDrop={handleDrop} accept="image/*" type="image" allowMultiple={false} label="Télécharger une image">
                                                            {(!botIcon && !file) && <DropZone.FileUpload />}
                                                        </DropZone>
                                                        <TextField
                                                            label="Ou coller une URL"
                                                            value={botIcon}
                                                            onChange={setBotIcon}
                                                            autoComplete="off"
                                                            placeholder="https://..."
                                                            helpText="Lien direct vers une image."
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
                                        <Text variant="headingSm" as="h6">Aperçu du Chat</Text>
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
                                                <span>Négociation en direct</span>
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

                            {/* Content Section (Bottom) */}
                            <FormLayout>
                                <Select
                                    label="Ton de la conversation"
                                    options={[
                                        { label: 'Personnalisé', value: 'custom' },
                                        { label: 'Standard', value: 'standard' },
                                        { label: 'Amical / Sympa', value: 'friendly' },
                                        { label: 'Professionnel', value: 'professional' },
                                        { label: 'Direct / Minimaliste', value: 'minimalist' },
                                    ]}
                                    onChange={handleToneChange}
                                    value={tone}
                                    helpText="Sélectionnez un style pour pré-remplir les messages ci-dessous."
                                />

                                <TextField
                                    label="Message de Bienvenue"
                                    value={welcomeMsg}
                                    onChange={(val) => { setWelcomeMsg(val); setTone('custom'); }}
                                    autoComplete="off"
                                    multiline={2}
                                />

                                <TextField
                                    label="Message de Contre-offre"
                                    value={rejectMsg}
                                    onChange={(val) => { setRejectMsg(val); setTone('custom'); }}
                                    autoComplete="off"
                                    multiline={2}
                                    helpText="Si vous ne mettez pas le prix, il sera ajouté automatiquement à la fin."
                                />

                                <TextField
                                    label="Message de Succès"
                                    value={successMsg}
                                    onChange={(val) => { setSuccessMsg(val); setTone('custom'); }}
                                    autoComplete="off"
                                    multiline={2}
                                    helpText="Si vous ne mettez pas le prix, il sera ajouté automatiquement à la fin."
                                />
                            </FormLayout>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
