import { useLoaderData } from "react-router";
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
  InlineGrid
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopUrl = session.shop;

  const shop = await db.shop.findUnique({
    where: { shopUrl },
    include: {
      offers: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    },
  });

  if (!shop) {
    return {
      stats: { total: 0, accepted: 0, rejected: 0 },
      recentOffers: []
    };
  }

  // Calculate Stats using separate queries to get accurate totals (since shop.offers is limited to 10)
  const allOffersCount = await db.offer.count({ where: { shopId: shop.id } });
  const acceptedCount = await db.offer.count({ where: { shopId: shop.id, status: "ACCEPTED" } });
  const rejectedCount = await db.offer.count({ where: { shopId: shop.id, status: "REJECTED" } });

  const recentOffers = shop.offers.map(offer => ({
    id: offer.id,
    productTitle: offer.productTitle || "Produit inconnu",
    originalPrice: offer.originalPrice,
    offerPrice: offer.offerPrice,
    status: offer.status,
    createdAt: offer.createdAt,
  }));

  return {
    stats: { total: allOffersCount, accepted: acceptedCount, rejected: rejectedCount },
    recentOffers,
  };
};

export default function Index() {
  const { stats, recentOffers } = useLoaderData();

  const resourceName = {
    singular: 'offre',
    plural: 'offres',
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
            {productTitle}
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
    <Page title="Tableau de Bord">
      <Layout>
        {/* KPI Section */}
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Total Offres</Text>
                <Text variant="headingLg" as="p">{stats.total}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Acceptées</Text>
                <Text variant="headingLg" as="p" tone="success">{stats.accepted}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3" tone="subdued">Refusées</Text>
                <Text variant="headingLg" as="p" tone="critical">{stats.rejected}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Recent Offers Table */}
        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <Text variant="headingMd" as="h3">Offres Récentes</Text>
            </Box>
            {recentOffers.length > 0 ? (
              <IndexTable
                resourceName={resourceName}
                itemCount={recentOffers.length}
                selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Produit' },
                  { title: 'Date' },
                  { title: 'Offre' },
                  { title: 'Statut' },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            ) : (
              <Box padding="400">
                <Text tone="subdued" as="p">Aucune offre pour le moment.</Text>
              </Box>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
