import { useTranslation, UseTranslationResponse } from 'react-i18next';

// Custom hook that wraps useTranslation to detect missing keys
export const useTranslationWithLogging = (ns?: string | string[]): UseTranslationResponse<'translation', undefined> => {
  const { t, i18n: i18nInstance, ready } = useTranslation(ns);

  // Create a wrapped t function that logs keys
  const wrappedT = (key: string, options?: any) => {
    // Get the current language
    const currentLang = i18nInstance.language;
    const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    
    // Call the original t function first to get the value
    const result = t(key, options);
    
    // Check if the key exists
    const keyExists = i18nInstance.exists(key, { lng: currentLang });
    
    if (!keyExists) {
      console.warn(`❌ [MISSING] Key: "${key}" | Route: ${route} | Lang: ${currentLang}`);
    } else {
      // Uncomment to see all successful translations in console
      // console.debug(`✅ [FOUND] Key: "${key}" -> "${result}" | Route: ${route}`);
    }
    
    return result;
  };

  return {
    t: wrappedT,
    i18n: i18nInstance,
    ready
  };
};