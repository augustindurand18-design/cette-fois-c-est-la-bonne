import { useEffect, useState, useCallback } from "react";
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
  TextField,
  FormLayout,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopUrl = session.shop;

  // 1. Get Shop & Stats
  const shop = await db.shop.findUnique({
    where: { shopUrl },
    include: {
      offers: true,
      rules: true,
    },
  });

  if (!shop) {
    return {
      minDiscount: 0.8,
      priceRounding: 0.85,
      botWelcomeMsg: "Bonjour ! 👋 Je peux vous faire une remise si vous me proposez un prix raisonnable. Quel est votre prix ?",
      botRejectMsg: "C'est un peu juste... Je peux vous le faire à {price} €.",
      botSuccessMsg: "C'est d'accord pour {price}€ ! 🎉",
      widgetColor: "#000000",
      stats: { total: 0, accepted: 0, rejected: 0 }
    };
  }

  // Calculate Stats
  const total = shop.offers.length;
  const accepted = shop.offers.filter((o) => o.status === "ACCEPTED").length;
  const rejected = shop.offers.filter((o) => o.status === "REJECTED").length;

  // Get Global Rule
  const globalRule = shop.rules.find((r) => !r.collectionId && !r.productId);
  const minDiscount = globalRule ? globalRule.minDiscount : 0.8;

  return {
    minDiscount,
    priceRounding: shop.priceRounding !== undefined ? shop.priceRounding : 0.85,
    botWelcomeMsg: shop.botWelcomeMsg,
    botRejectMsg: shop.botRejectMsg,
    botSuccessMsg: shop.botSuccessMsg,
    widgetColor: shop.widgetColor,
    stats: { total, accepted, rejected },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopUrl = session.shop;
  const formData = await request.formData();

  const minDiscount = parseFloat(formData.get("minDiscount"));
  const priceRounding = parseFloat(formData.get("priceRounding"));
  const botWelcomeMsg = formData.get("botWelcomeMsg");
  const botRejectMsg = formData.get("botRejectMsg");
  const botSuccessMsg = formData.get("botSuccessMsg");
  const widgetColor = formData.get("widgetColor");

  // Upsert Shop & Rule
  let shop = await db.shop.findUnique({ where: { shopUrl } });

  const shopData = {
    priceRounding: !isNaN(priceRounding) ? priceRounding : 0.85,
    botWelcomeMsg,
    botRejectMsg,
    botSuccessMsg,
    widgetColor,
  };

  if (!shop) {
    shop = await db.shop.create({
      data: {
        id: session.id,
        shopUrl,
        accessToken: session.accessToken,
        isActive: true,
        ...shopData
      },
    });
  } else {
    await db.shop.update({
      where: { id: shop.id },
      data: shopData
    });
  }

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

export default function Index() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();

  // State
  // Rules
  const [discountValue, setDiscountValue] = useState(Math.round((1 - loaderData.minDiscount) * 100));
  const [rounding, setRounding] = useState(loaderData.priceRounding ? loaderData.priceRounding.toString() : "0.85");

  // Customization
  // Customization
  const initialWelcome = loaderData.botWelcomeMsg || TONE_PRESETS.standard.welcome;
  const initialReject = loaderData.botRejectMsg || TONE_PRESETS.standard.reject;
  const initialSuccess = loaderData.botSuccessMsg || TONE_PRESETS.standard.success;

  const [welcomeMsg, setWelcomeMsg] = useState(initialWelcome);
  const [rejectMsg, setRejectMsg] = useState(initialReject);
  const [successMsg, setSuccessMsg] = useState(initialSuccess);
  const [color, setColor] = useState(loaderData.widgetColor || "#000000");

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

  const handleSliderChange = (value) => setDiscountValue(value);
  const handleTrendingChange = (value) => setRounding(value);

  const handleToneChange = (newTone) => {
    setTone(newTone);
    if (TONE_PRESETS[newTone]) {
      setWelcomeMsg(TONE_PRESETS[newTone].welcome);
      setRejectMsg(TONE_PRESETS[newTone].reject);
      setSuccessMsg(TONE_PRESETS[newTone].success);
    }
  };

  const handleSave = () => {
    const newMinDiscount = 1 - (discountValue / 100);
    fetcher.submit(
      {
        minDiscount: newMinDiscount.toString(),
        priceRounding: rounding,
        botWelcomeMsg: welcomeMsg,
        botRejectMsg: rejectMsg,
        botSuccessMsg: successMsg,
        widgetColor: color
      },
      { method: "POST" }
    );
  };

  return (
    <Page title="SmartOffer Dashboard" primaryAction={{ content: fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer", onAction: handleSave }}>
      <Layout>
        {/* TOP SECTION: GLOBAL RULES */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Règles de Négociation Globales</Text>

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
                  Le bot acceptera toute offre >= {100 - discountValue}% du prix.
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* SIDE SECTION: STATS */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Performance</Text>
              <Box>
                <InlineStack align="space-between">
                  <Text>Total Offres:</Text>
                  <Text fontWeight="bold">{loaderData.stats.total}</Text>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text tone="success">Acceptées:</Text>
                  <Text fontWeight="bold" tone="success">{loaderData.stats.accepted}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text tone="critical">Refusées:</Text>
                  <Text fontWeight="bold" tone="critical">{loaderData.stats.rejected}</Text>
                </InlineStack>
              </Box>
            </BlockStack>
          </Card>
          <Box paddingBlockStart="400">
            <Card>
              <Text as="h2" variant="headingMd">App Embed</Text>
              <p style={{ marginTop: '10px' }}>Activez l'extension dans votre éditeur de thème pour afficher le bouton.</p>
            </Card>
          </Box>
        </Layout.Section>

        {/* BOTTOM SECTION: CUSTOMIZATION */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Personnalisation du Bot</Text>

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

              <FormLayout>
                <TextField
                  label="Couleur du Widget (Hex)"
                  value={color}
                  onChange={setColor}
                  autoComplete="off"
                  prefix={<div style={{ width: 20, height: 20, background: color, borderRadius: 4, border: '1px solid #ccc' }}></div>}
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
