// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Available languages
export const availableLanguages = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

// Function to load translation file
const loadTranslation = async (lng: string) => {
  try {
    const response = await fetch(`/locales/${lng}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ${lng}.json`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading translation for ${lng}:`, error);
    return {};
  }
};

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'es',
    supportedLngs: availableLanguages.map((lang) => lang.code),
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    resources: {}, // Will be loaded dynamically
  });

// Load all translations
const initTranslations = async () => {
  for (const lang of availableLanguages) {
    const translation = await loadTranslation(lang.code);
    i18n.addResourceBundle(lang.code, 'translation', translation);
  }
};

// Initialize translations on startup
initTranslations();

export default i18n;
