# Languages

Annotix is available in 10 languages with lazy loading and English fallback.

## Supported Languages

| Language | Code | File |
|----------|------|------|
| Deutsch | `de` | `public/locales/de.json` |
| English | `en` | `public/locales/en.json` |
| Espanol | `es` | `public/locales/es.json` |
| Francais | `fr` | `public/locales/fr.json` |
| Italiano | `it` | `public/locales/it.json` |
| Japanese | `ja` | `public/locales/ja.json` |
| Korean | `ko` | `public/locales/ko.json` |
| Portugues | `pt` | `public/locales/pt.json` |
| Russian | `ru` | `public/locales/ru.json` |
| Chinese | `zh` | `public/locales/zh.json` |

## Implementation

- **Library:** [i18next](https://www.i18next.com/) v24 + react-i18next v15.
- **Configuration:** `src/lib/i18n.ts`.
- **Lazy loading:** Language files are loaded on demand, not bundled with the initial app.
- **Fallback:** English (`en`) is used for any missing translation key.
- **Detection:** Language is selected from browser settings or user preference.

## Installer Languages

The Windows NSIS installer supports language selection during installation:

English, Spanish, French, German, Italian, Japanese, Korean, Brazilian Portuguese, Russian, Simplified Chinese.

## Coverage

All UI strings, tooltips, labels, error messages, and settings are translated across all 10 languages. The translation files cover:

- Navigation and layout
- All annotation tools and canvas UI
- Project management
- Export/import dialogs
- Training panel and metrics
- P2P collaboration
- Settings and keyboard shortcuts
- Browser automation
- Error messages and confirmations
