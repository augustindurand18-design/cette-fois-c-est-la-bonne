import { useLoaderData, useFetcher, useSubmit, useSearchParams } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  IndexTable,
  Badge,
  useIndexResourceState,
  Box,
  InlineGrid,
  Select,
  TextField,
  InlineStack,
  Button
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopUrl = session.shop;
  const url = new URL(request.url);

  // Date Filtering Logic
  const period = url.searchParams.get("period") || "last_7d";
  const customStart = url.searchParams.get("start");
  const customEnd = url.searchParams.get("end");

  let startDate = new Date();
  let endDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  if (period === "today") {
    // startDate is already today 00:00
  } else if (period === "yesterday") {
    startDate.setDate(startDate.getDate() - 1);
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);
  } else if (period === "last_3d") {
    startDate.setDate(startDate.getDate() - 2); // Today included => 3 days total
  } else if (period === "last_7d") {
    startDate.setDate(startDate.getDate() - 6);
  } else if (period === "last_30d") {
    startDate.setDate(startDate.getDate() - 29);
  } else if (period === "custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Default fallback
    startDate.setDate(startDate.getDate() - 6);
  }

  const shop = await db.shop.findUnique({
    where: { shopUrl },
    include: {
      offers: {
        where: { createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    },
  });

  if (!shop) {
    return {
      stats: { total: 0, accepted: 0, rejected: 0, revenue: 0, avgDiscount: 0, acceptanceRate: 0, sparklineData: [] },
      recentOffers: []
    };
  }

  const dateFilter = {
    shopId: shop.id,
    createdAt: { gte: startDate, lte: endDate }
  };

  // Calculate Stats
  const allOffersCount = await db.offer.count({ where: dateFilter });

  const acceptedOffers = await db.offer.findMany({
    where: { ...dateFilter, status: "ACCEPTED" },
    select: { offeredPrice: true, originalPrice: true, createdAt: true }
  });

  const acceptedCount = acceptedOffers.length;
  const rejectedCount = await db.offer.count({ where: { ...dateFilter, status: "REJECTED" } });

  let totalRevenue = 0;
  let totalDiscountPercentage = 0;

  acceptedOffers.forEach(offer => {
    totalRevenue += offer.offeredPrice;
    if (offer.originalPrice && offer.originalPrice > 0) {
      totalDiscountPercentage += ((offer.originalPrice - offer.offeredPrice) / offer.originalPrice);
    }
  });

  const avgDiscount = acceptedCount > 0 ? (totalDiscountPercentage / acceptedCount) * 100 : 0;
  const acceptanceRate = allOffersCount > 0 ? (acceptedCount / allOffersCount) * 100 : 0;

  const recentOffers = shop.offers.map(offer => ({
    id: offer.id,
    productTitle: offer.productTitle || "Produit inconnu",
    originalPrice: offer.originalPrice,
    offerPrice: offer.offeredPrice,
    status: offer.status,
    createdAt: offer.createdAt,
  }));

  // Calculate Sparkline Data (Dynamic X-Axis based on range)
  const sparklineData = [];
  const oneDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.round(Math.abs((endDate - startDate) / oneDay)) + 1; // +1 to include start day
  const effectiveDays = Math.max(daysDiff, 1);

  // If period is filtered, we show trend over that specific period
  for (let i = 0; i < effectiveDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const nextD = new Date(d);
    nextD.setDate(d.getDate() + 1);

    const dayTotal = acceptedOffers
      .filter(o => {
        const oDate = new Date(o.createdAt);
        return oDate >= d && oDate < nextD;
      })
      .reduce((sum, o) => sum + o.offeredPrice, 0);

    sparklineData.push(dayTotal);
  }

  return {
    stats: {
      total: allOffersCount,
      accepted: acceptedCount,
      rejected: rejectedCount,
      revenue: totalRevenue,
      avgDiscount: avgDiscount.toFixed(1),
      acceptanceRate: acceptanceRate.toFixed(1),
      sparklineData
    },
    recentOffers,
    filter: { period, start: customStart, end: customEnd }
  };
};

import { useTranslation } from "react-i18next";

// Simple Sparkline Component
const TinyChart = ({ data, color = "#008060" }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1); // Avoid div by zero
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" width="100%" height="40" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
      {/* Area under curve (optional opacity) */}
      <polygon
        fill={color}
        fillOpacity="0.1"
        points={`0,100 ${points} 100,100`}
      />
    </svg>
  );
};

export default function Index() {
  const { stats, recentOffers, filter } = useLoaderData();
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const submit = useSubmit();

  const [period, setPeriod] = useState(filter?.period || "last_7d");
  const [customStart, setCustomStart] = useState(filter?.start || "");
  const [customEnd, setCustomEnd] = useState(filter?.end || "");

  // Handle Export Download
  useEffect(() => {
    if (fetcher.data && fetcher.data.csv) {
      const blob = new Blob([fetcher.data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-offers-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  }, [fetcher.data]);

  const handlePeriodChange = (value) => {
    setPeriod(value);
    if (value !== "custom") {
      submit({ period: value }, { method: "get", replace: true });
    }
  };

  const handleCustomDateChange = () => {
    if (customStart && customEnd) {
      submit({ period: "custom", start: customStart, end: customEnd }, { method: "get", replace: true });
    }
  };

  const resourceName = {
    singular: t('dashboard.offer'),
    plural: t('dashboard.recent_offers'),
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(recentOffers);

  const rowMarkup = recentOffers.map(
    ({ id, productTitle, originalPrice, offerPrice, status, createdAt }, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold">
            {productTitle === "Produit inconnu" ? t('dashboard.unknown_product') : productTitle}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()} {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" decoration="lineThrough" tone="subdued">
            {originalPrice}€
          </Text>
          <Text as="span" variant="bodyMd" fontWeight="bold">
            {' '}→ {offerPrice}€
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={status === 'ACCEPTED' ? 'success' : status === 'REJECTED' ? 'critical' : 'attention'}>
            {status}
          </Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page
      title={t('dashboard.title')}
      primaryAction={{
        content: fetcher.state === "loading" ? "Exportation..." : "Exporter CSV",
        onAction: () => fetcher.load("/api/export-offers"),
        disabled: fetcher.state === "loading"
      }}
    >
      <Layout>
        {/* Filter Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h3">Filtres de période</Text>
              <InlineGrid columns={period === "custom" ? ["oneThird", "twoThirds"] : "1fr"} gap="400">
                <Select
                  label="Période"
                  labelHidden
                  options={[
                    { label: "Aujourd'hui", value: "today" },
                    { label: "Hier", value: "yesterday" },
                    { label: "3 derniers jours", value: "last_3d" },
                    { label: "7 derniers jours", value: "last_7d" },
                    { label: "30 derniers jours", value: "last_30d" },
                    { label: "Personnalisé", value: "custom" },
                  ]}
                  onChange={handlePeriodChange}
                  value={period}
                />
                {period === "custom" && (
                  <InlineStack gap="400" align="start">
                    <TextField
                      label="Début"
                      type="date"
                      value={customStart}
                      onChange={(val) => setCustomStart(val)}
                      autoComplete="off"
                    />
                    <TextField
                      label="Fin"
                      type="date"
                      value={customEnd}
                      onChange={(val) => setCustomEnd(val)}
                      autoComplete="off"
                    />
                    <div style={{ marginTop: '28px' }}>
                      <Button onClick={handleCustomDateChange} variant="primary">Appliquer</Button>
                    </div>
                  </InlineStack>
                )}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* KPI Section */}
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Revenus Générés</Text>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Text variant="headingLg" as="p">{stats.revenue.toFixed(2)} €</Text>
                  <div style={{ width: '80px', height: '30px' }}>
                    <TinyChart data={stats.sparklineData} />
                  </div>
                </div>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Taux d'Acceptation</Text>
                <Text variant="headingLg" as="p" tone="success">{stats.acceptanceRate}%</Text>
                <Text variant="bodyXs" tone="subdued">{stats.total} offres totales</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Rabais Moyen</Text>
                <Text variant="headingLg" as="p" tone="highlight">{stats.avgDiscount}%</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Recent Offers Table */}
        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <Text variant="headingMd" as="h3">{t('dashboard.recent_offers')}</Text>
            </Box>
            {recentOffers.length > 0 ? (
              <IndexTable
                resourceName={resourceName}
                itemCount={recentOffers.length}
                selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: t('dashboard.product') },
                  { title: t('dashboard.date') },
                  { title: t('dashboard.offer') },
                  { title: t('dashboard.status') },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            ) : (
              <Box padding="400">
                <Text tone="subdued" as="p">{t('dashboard.no_offers')}</Text>
              </Box>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
