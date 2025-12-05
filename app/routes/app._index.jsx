import { useEffect, useState } from "react";
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
    stats: { total, accepted, rejected },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopUrl = session.shop;
  const formData = await request.formData();
  const minDiscount = parseFloat(formData.get("minDiscount"));

  // Upsert Shop & Rule
  let shop = await db.shop.findUnique({ where: { shopUrl } });
  if (!shop) {
    shop = await db.shop.create({
      data: {
        id: session.id,
        shopUrl,
        accessToken: session.accessToken,
        isActive: true,
      },
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

export default function Index() {
  const { minDiscount, stats } = useLoaderData();
  const fetcher = useFetcher();

  // Transform 0.8 -> 20 (%)
  const [discountValue, setDiscountValue] = useState(Math.round((1 - minDiscount) * 100));

  const handleSliderChange = (value) => {
    setDiscountValue(value);
  };

  const handleSave = () => {
    // Transform 20 -> 0.8
    const newMinDiscount = 1 - (discountValue / 100);
    fetcher.submit(
      { minDiscount: newMinDiscount.toString() },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      // shopify.toast.show("Règles mises à jour !"); 
      // Note: access to shopify object might need useAppBridge() hook if not global
      // but standard template has standard Toast logic.
      // If we need Toast: const shopify = useAppBridge(); 
      // I'll skip toast call if shopify is not defined to avoid breakage, or assuming global shopify object 
      // from legacy app bridge. Modern App Bridge makes 'shopify' global? No.
      // I will assume simple functionality for now.
    }
  }, [fetcher.data]);

  return (
    <Page title="SmartOffer Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">Règles de Négociation</Text>
              <Box padding="200">
                <Text>Rabais Maximum Autorisé: {discountValue}%</Text>
                <RangeSlider
                  output
                  label="Définissez le pourcentage maximum de réduction que le bot peut accepter."
                  min={0}
                  max={50}
                  step={1}
                  value={discountValue}
                  onChange={handleSliderChange}
                  suffix={`${discountValue}%`}
                />
              </Box>
              <Box>
                <Banner title="Note" tone="info">
                  Le bot acceptera toute offre supérieure ou égale à {100 - discountValue}% du prix original.
                </Banner>
              </Box>
              <Box pb="400">
                <button
                  onClick={handleSave}
                  style={{
                    backgroundColor: '#008060',
                    color: 'white',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {fetcher.state !== "idle" ? "Enregistrement..." : "Enregistrer"}
                </button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Statistiques</Text>
              <BlockStack>
                <Text variant="bodyMd" as="p">Offres Reçues: <b>{stats.total}</b></Text>
                <Text variant="bodyMd" as="p" color="success">Acceptées: <b>{stats.accepted}</b></Text>
                <Text variant="bodyMd" as="p" color="critical">Refusées: <b>{stats.rejected}</b></Text>
              </BlockStack>
            </BlockStack>
          </Card>
          <Box pt="400">
            <Card>
              <Text variant="headingSm" as="h3">App Embed</Text>
              <Text>Assurez-vous d'activer l'extension dans votre thème.</Text>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
