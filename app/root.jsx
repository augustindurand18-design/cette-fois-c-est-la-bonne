import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
  { rel: "stylesheet", href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css" },
  { rel: "stylesheet", href: "https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css" },
];

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <html lang={i18n.language || "en"}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <link rel="preconnect" href="https://cdn.shopify.com/" />
          <Meta />
          <Links />
        </head>
        <body>
          <Outlet />
          <ScrollRestoration />
          <Scripts />
        </body>
      </html>
    </I18nextProvider>
  );
}
