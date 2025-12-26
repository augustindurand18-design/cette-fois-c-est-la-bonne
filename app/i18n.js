import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/translation.json";
import fr from "./locales/fr/translation.json";

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        lng: typeof window === "undefined" ? "en" : undefined, // Force EN on server, detect on client
        fallbackLng: "en",
        supportedLngs: ["en", "fr"],
        resources: {
            en: { translation: en },
            fr: { translation: fr },
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
