// Script to check for missing translations across all languages
// Run this script to identify all missing translation keys

import { availableLanguages } from './src/lib/i18n';
import { checkMissingTranslations } from './src/utils/translationUtils';

async function checkAllTranslations() {
  console.log('Checking for missing translations across all languages...\n');
  
  for (const lang of availableLanguages) {
    console.log(`Checking ${lang.name} (${lang.code})...`);
    const missingKeys = await checkMissingTranslations(lang.code);
    
    if (missingKeys.length > 0) {
      console.log(`  ❌ Found ${missingKeys.length} missing keys in ${lang.name}:`);
      missingKeys.forEach(key => console.log(`    - ${key}`));
    } else {
      console.log(`  ✅ ${lang.name} is complete!`);
    }
    console.log('');
  }
}

// Run the check
if (typeof window === 'undefined') {
  // This is running in a Node.js environment
  checkAllTranslations().catch(console.error);
}