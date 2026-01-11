// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { filter } from 'jszip';
// Available languages
export const availableLanguages = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

// Helper to identify the caller component from stack trace
const getCaller = (): string => {
  try {
    const err = new Error();
    if (err.stack) {
      const stackLines = err.stack.split('\n');

      // Look for the first line that references a file in src/
      for (const line of stackLines) {
        // Skip i18n internals and node_modules
        if (line.includes('node_modules') || line.includes('src/lib/i18n.ts') || line.includes('i18next')) {
          continue;
        }

        // Try to match file path in src/
        // Example: at Header (http://localhost:5173/src/features/core/components/Header.tsx:16:10)
        const srcMatch = line.match(/src\/([a-zA-Z0-9_\-\/]+\.tsx?)/);
        if (srcMatch && srcMatch[1]) {
          const parts = srcMatch[1].split('/');
          return parts[parts.length - 1];
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return 'Unknown';
};

// Log cache for deduplication (session-wide)
const logCache = new Set<string>();

// Capture native console.log to potentially bypass some interceptors
const nativeLog = console.log.bind(console);

// Custom Post-Processor for logging successful translations
const loggingProcessor = {
  type: 'postProcessor' as const,
  name: 'logger',
  process: function(value: string, key: string, options: any, translator: any) {
    const caller = getCaller();
    const lng = translator.language;
    
    // Create a unique signature for this log event
    const signature = `${key}-${lng}-${caller}`;
    
    // Check if we've logged this recently to prevent duplication
    if (logCache.has(signature)) {
      return value;
    }
    
    // Add to cache (never cleared during session to avoid log spam on interactions)
    logCache.add(signature);
    
    // Check if the key actually exists in the resources
    const exists = i18n.exists(key, { lng });

    if (exists) {
       nativeLog(`[OK] ${key}.${lng} (${caller})`);
    } else {
       nativeLog(`[FAIL] ${key}.${lng} (${caller})`);
    }
    
    return value;
  }
};

// Load translation JSON files from the public `locales/` folder at runtime.
// This avoids hardcoding the entire resources object in the source file
// and lets you edit the JSON files directly (e.g., public/locales/es.json).
const loadLocale = async (code: string) => {
  if (typeof window === 'undefined' || !code) return null;
  try {
    const res = await fetch(`/locales/${code}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    // Add as the default namespace 'translation'
    i18n.addResourceBundle(code, 'translation', data, true, true);
    // Force i18next to re-apply the current language so react-i18next
    // components re-render with the newly loaded resources.
    try {
      await i18n.changeLanguage(code);
    } catch (e) {
      // ignore
    }
    return data;
  } catch (e) {
    // silently ignore missing files in dev
    return null;
  }
};

// Helper to load all supported locales (non-blocking)
const loadAllLocales = async () => {
  const codes = availableLanguages.map((l) => l.code);
  await Promise.all(codes.map((c) => loadLocale(c)));
};
// Initialize i18next and load locale JSON files from `/locales/*.json`
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(loggingProcessor) // Register the custom logger
  .init({
    // Let language detector pick the language (localStorage, navigator)
    // Do not fallback to another language when a key is missing —
    // show the key instead so missing translations are visible.
    fallbackLng: false,
    supportedLngs: availableLanguages.map((l) => l.code),
    ns: ['translation'],
    defaultNS: 'translation',
    postProcess: ['logger'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    resources: {},
    // When a key is missing or the translation is an empty string/null,
    // return the key instead of rendering an empty string.
    returnNull: false,
    returnEmptyString: false,
    // Ensure we at least show the key if parsing fails
    parseMissingKeyHandler: (key: string) => key,
    fallbackNS: 'translation',
    // Track missing keys in localStorage
    missingKeyHandler: (lng, ns, key, fallbackValue) => {
      if (typeof window !== 'undefined' && window.localStorage) {
        const missingKeysKey = `missing_translation_keys_${lng}`;
        let missingKeys = JSON.parse(localStorage.getItem(missingKeysKey) || '{}');
        missingKeys[key] = (missingKeys[key] || 0) + 1;
        localStorage.setItem(missingKeysKey, JSON.stringify(missingKeys));
      }
    },
    debug: false,
  })
  .then(() => {
    // Ensure current language is loaded immediately, then prefetch others
    const current = i18n.language || 'es';
    loadLocale(current);
    // Prefetch all supported locales in background
    loadAllLocales();
  })
  .catch(() => {
    // ignore init errors here
  });

// Utility function to get all missing keys for the current language
export const getMissingTranslationKeys = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const currentLng = i18n.language;
    const missingKeysKey = `missing_translation_keys_${currentLng}`;
    return JSON.parse(localStorage.getItem(missingKeysKey) || '{}');
  }
  return {};
};

// Utility function to clear missing keys from localStorage
export const clearMissingTranslationKeys = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const currentLng = i18n.language;
    const missingKeysKey = `missing_translation_keys_${currentLng}`;
    localStorage.removeItem(missingKeysKey);
  }
};

// Utility function to get a summary of missing keys
export const getMissingKeysSummary = () => {
  const missingKeys = getMissingTranslationKeys();
  const keys = Object.keys(missingKeys);
  const totalMissing = keys.length;
  const totalUsages = keys.reduce((sum, key) => sum + missingKeys[key], 0);

  return {
    totalMissing,
    totalUsages,
    keys,
    missingKeys
  };
};

export default i18n;
