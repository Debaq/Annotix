/**
 * Split monolithic locale JSON files into per-namespace files.
 *
 * Before:  public/locales/en.json  (all keys in one file)
 * After:   public/locales/en/app.json, en/common.json, ...
 *
 * Usage: node scripts/split-locales.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'public', 'locales');

const LANGS = ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zh'];
const SKIP_KEYS = new Set(['language', 'code']);

for (const lang of LANGS) {
  const srcFile = join(localesDir, `${lang}.json`);
  const data = JSON.parse(readFileSync(srcFile, 'utf-8'));

  const outDir = join(localesDir, lang);
  mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    const outFile = join(outDir, `${key}.json`);
    writeFileSync(outFile, JSON.stringify(value, null, 2) + '\n', 'utf-8');
    count++;
  }

  console.log(`${lang}: ${count} namespace files written to ${outDir}`);

  // Remove original monolithic file
  unlinkSync(srcFile);
  console.log(`  deleted ${srcFile}`);
}

console.log('\nDone!');
