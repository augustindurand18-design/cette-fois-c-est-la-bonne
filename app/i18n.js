import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/translation.json";

i18n
    .use(initReactI18next)
    .init({
        lng: "en",
        fallbackLng: "en",
        supportedLngs: ["en"],
        resources: {
            en: { translation: en },
        },
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
        detection: {
            // Priority to forced language, but keeping detection config for future flexibility
            order: ["querystring", "localStorage", "navigator"],
            lookupQuerystring: "locale",
            caches: ["localStorage"],
        },
    });

export default i18n;
