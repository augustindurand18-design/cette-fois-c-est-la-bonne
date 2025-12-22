import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/translation.json";
import fr from "./locales/fr/translation.json";

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        // lng: "en", // Removed to enable detection
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
            order: ["localStorage", "navigator"],
            caches: ["localStorage"],
        },
    });

export default i18n;
