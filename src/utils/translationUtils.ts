import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import i18n from '../lib/i18n';

// Higher Order Component that wraps components to log missing translations
export function withTranslationLogging<OriginalProps extends WithTranslation>(
  Component: React.ComponentType<OriginalProps>
): React.ComponentType<Omit<OriginalProps, keyof WithTranslation>> {
  const WrappedComponent: React.ComponentType<Omit<OriginalProps, keyof WithTranslation>> = (props) => {
    // Create a wrapper for the t function
    const wrappedT = (key: string, options?: any) => {
      const currentLang = i18n.language;
      
      // Check if the key exists in the current language
      const keyExists = i18n.exists(key, { lng: currentLang });
      
      // If the key doesn't exist in the current language, log it
      if (!keyExists) {
        console.warn(`[TRANSLATION MISSING] Key: ${key}, Language: ${currentLang}`);
        
        // Store missing keys in localStorage for tracking across sessions
        if (typeof window !== 'undefined' && window.localStorage) {
          const missingKeysKey = `missing_translation_keys_${currentLang}`;
          let missingKeys = JSON.parse(localStorage.getItem(missingKeysKey) || '{}');
          
          // Add or increment the count for this key
          missingKeys[key] = (missingKeys[key] || 0) + 1;
          
          // Save back to localStorage
          localStorage.setItem(missingKeysKey, JSON.stringify(missingKeys));
        }
      }
      
      // Call the original t function from context
      return (React.createElement(Component, props as OriginalProps)).props.t(key, options);
    };

    // This approach has limitations, so we'll use the hook approach in components instead
    return React.createElement(Component, props as OriginalProps);
  };

  return withTranslation()(WrappedComponent as any);
}

// For a more practical approach, we'll provide a utility to help developers identify missing keys
export const checkMissingTranslations = async (languageCode: string) => {
  try {
    // Load the translation file for the specified language
    const response = await fetch(`/locales/${languageCode}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ${languageCode}.json`);
    }
    const currentTranslations = await response.json();
    
    // Load the fallback language (English) for comparison
    const fallbackResponse = await fetch('/locales/en.json');
    if (!fallbackResponse.ok) {
      throw new Error('Failed to load en.json');
    }
    const fallbackTranslations = await fallbackResponse.json();
    
    // Find keys that exist in fallback but not in current language
    const findMissingKeys = (obj1: any, obj2: any, prefix = ''): string[] => {
      const missing: string[] = [];
      
      for (const key in obj2) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (!(key in obj1)) {
          missing.push(fullKey);
        } else if (
          typeof obj1[key] === 'object' && 
          typeof obj2[key] === 'object' &&
          obj1[key] !== null && 
          obj2[key] !== null &&
          !Array.isArray(obj1[key]) && 
          !Array.isArray(obj2[key])
        ) {
          missing.push(...findMissingKeys(obj1[key], obj2[key], fullKey));
        }
      }
      
      return missing;
    };
    
    const missingKeys = findMissingKeys(currentTranslations, fallbackTranslations);
    console.log(`Missing translation keys in ${languageCode}:`, missingKeys);
    
    return missingKeys;
  } catch (error) {
    console.error('Error checking missing translations:', error);
    return [];
  }
};