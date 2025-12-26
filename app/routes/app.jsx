import { Outlet, useLoaderData, useRouteError } from "react-router";
import { useEffect } from "react";
import crypto from "crypto";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate, PLAN_STARTER, PLAN_GROWTH, PLAN_SCALE } from "../shopify.server";

export const links = () => [];

import db from "../db.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  // SELF-HEALING: Sync Access Token from Session to DB
  // This ensures that even after a DB reset, the token is restored when Admin is opened.
  try {
    await db.shop.upsert({
      where: { shopUrl: session.shop },
      update: { accessToken: session.accessToken },
      create: {
        shopUrl: session.shop,
        accessToken: session.accessToken,
        isActive: true,
        id: crypto.randomUUID()
      }
    });
  } catch (e) {
    console.error("Failed to sync token in App Loader", e);
  }

  // Check Billing
  if (process.env.NODE_ENV === 'production') {
    const billingCheck = await billing.require({
      plans: [PLAN_STARTER, PLAN_GROWTH, PLAN_SCALE],
      onFailure: async () => billing.request({ plan: PLAN_STARTER, isTest: true }),
    });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

import { useTranslation } from "react-i18next";

export default function App() {
  const { apiKey } = useLoaderData();
  const { t, i18n } = useTranslation();

  // Sync language with Shopify Admin locale (passed as query param)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locale = params.get("locale");
    if (locale) {
      // Shopify sends 'fr-FR', i18next expects 'fr' or 'fr-FR' depending on setup.
      // Our resources are 'fr' and 'en'.
      const lang = locale.split('-')[0];
      if (lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    }
  }, [i18n]);

  // Static Polaris translations to avoid context re-initialization
  const polarisTranslations = {
    Polaris: {
      ResourceList: {
        sortingLabel: "Sort by",
        defaultItemSingular: "item",
        defaultItemPlural: "items",
        showing: "Showing {itemsCount} {resource}",
        Item: {
          actionsMenuLabel: "Actions used for selection",
        },
      },
      Common: {
        checkbox: "checkbox",
      },
    },
  };

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={polarisTranslations}>
        <ui-nav-menu>
          <a href="/app" rel="home">
            {t('nav.dashboard')}
          </a>
          <a href="/app/rules">{t('nav.rules')}</a>
          <a href="/app/products">{t('nav.products')}</a>
          <a href="/app/offers">{t('nav.offers')}</a>
          <a href="/app/customization">{t('nav.customization')}</a>
          <a href="/app/parameters">{t('nav.parameters')}</a>
          <a href="/app/pricing">Pricing</a>
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
