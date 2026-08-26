import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGS = ["en", "ar", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const STORAGE_KEY = "kamix.lang";

/** Best-effort language guess from the browser, defaulting to English. */
export function detectLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)?.toLowerCase();
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
      return saved as Lang;
    }
  } catch {
    /* storage unavailable — fall through */
  }
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("ar")) return "ar";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

/** Apply the document direction (rtl for Arabic) + persist the choice. */
export function applyLanguage(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function switchLanguage(lang: Lang) {
  applyLanguage(lang);
  void i18n.changeLanguage(lang);
}

const initial = detectLanguage();
applyLanguage(initial);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar }, fr: { translation: fr } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
