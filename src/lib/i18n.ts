// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'annotix-language';
const DEFAULT_LANG = 'en';

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

const supportedCodes = availableLanguages.map((l) => l.code);

/** Read saved language from localStorage, default to 'en' */
function getSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && supportedCodes.includes(saved)) return saved;
  } catch {
    // localStorage not available
  }
  return DEFAULT_LANG;
}

/** Persist language choice to localStorage */
export function saveLanguage(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

// Namespace files inside public/locales/{lang}/
const NAMESPACES = [
  'app', 'common', 'header', 'help', 'shortcuts', 'projects', 'tools',
  'gallery', 'classes', 'annotations', 'polygon', 'landmarks', 'skeleton',
  'images', 'actions', 'shortcut', 'canvas', 'stats', 'export', 'import',
  'projectTypes', 'project', 'notifications', 'tour', 'imageInfo',
  'preprocessing', 'classification', 'augmentation', 'pwa', 'storage',
  'inference', 'connector', 'timeseries', 'tabular', 'training', 'setup',
  'video', 'settings', 'wizard', 'p2p', 'automation', 'audio', 'projectDetail',
  'sam',
] as const;

// Load all namespace files for a locale and merge into one resource bundle
const loadLocale = async (code: string) => {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        const res = await fetch(`locales/${code}/${ns}.json`);
        if (!res.ok) return [ns, {}] as const;
        return [ns, await res.json()] as const;
      } catch {
        return [ns, {}] as const;
      }
    }),
  );

  const merged: Record<string, unknown> = {};
  for (const [ns, data] of entries) {
    merged[ns] = data;
    // Registrar también como namespace individual para useTranslation('audio'), etc.
    i18n.addResourceBundle(code, ns, data, true, true);
  }

  i18n.addResourceBundle(code, 'translation', merged, true, true);
};

const initialLang = getSavedLanguage();

i18n
  .use(initReactI18next)
  .init({
    lng: initialLang,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: supportedCodes,
    ns: ['translation', ...NAMESPACES],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    resources: {},
    returnNull: false,
    returnEmptyString: false,
    parseMissingKeyHandler: (key: string) => key,
  })
  .then(async () => {
    // Load current language first so UI renders immediately
    await loadLocale(initialLang);
    if (initialLang !== DEFAULT_LANG) await loadLocale(DEFAULT_LANG);
    await i18n.changeLanguage(initialLang);

    // Prefetch remaining locales in background
    const rest = supportedCodes.filter((c) => c !== initialLang && c !== DEFAULT_LANG);
    Promise.all(rest.map(loadLocale));
  });

// When language changes, persist the choice
i18n.on('languageChanged', (lng) => {
  saveLanguage(lng);
});

export default i18n;
