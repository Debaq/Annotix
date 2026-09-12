// Utilidad de desarrollo para detectar claves de traducción faltantes.
// Compara el JSON de un idioma contra el fallback (en) y devuelve las claves
// que existen en el fallback pero no en el idioma pedido.

type TranslationNode = { [key: string]: TranslationNode | string | string[] };

export const checkMissingTranslations = async (languageCode: string) => {
  try {
    // Load the translation file for the specified language
    const response = await fetch(`locales/${languageCode}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ${languageCode}.json`);
    }
    const currentTranslations: TranslationNode = await response.json();

    // Load the fallback language (English) for comparison
    const fallbackResponse = await fetch('locales/en.json');
    if (!fallbackResponse.ok) {
      throw new Error('Failed to load en.json');
    }
    const fallbackTranslations: TranslationNode = await fallbackResponse.json();

    // Find keys that exist in fallback but not in current language
    const findMissingKeys = (
      obj1: TranslationNode,
      obj2: TranslationNode,
      prefix = ''
    ): string[] => {
      const missing: string[] = [];

      for (const key in obj2) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const left = obj1[key];
        const right = obj2[key];

        if (!(key in obj1)) {
          missing.push(fullKey);
        } else if (
          typeof left === 'object' &&
          typeof right === 'object' &&
          left !== null &&
          right !== null &&
          !Array.isArray(left) &&
          !Array.isArray(right)
        ) {
          missing.push(...findMissingKeys(left, right, fullKey));
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
