import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

import { useTranslation } from "react-i18next";

export default function App() {
  const { apiKey } = useLoaderData();
  const { t } = useTranslation();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider>
        <ui-nav-menu>
          <a href="/app" rel="home">
            {t('nav.dashboard')}
          </a>
          <a href="/app/rules">{t('nav.rules')}</a>
          <a href="/app/products">{t('nav.products')}</a>
          <a href="/app/offers">{t('nav.offers')}</a>
          <a href="/app/customization">{t('nav.customization')}</a>
          <a href="/app/parameters">{t('nav.parameters')}</a>
        </ui-nav-menu>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
