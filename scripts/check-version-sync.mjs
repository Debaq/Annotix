#!/usr/bin/env node
/**
 * check-version-sync.mjs — verifica que la versión sea la misma en todos lados.
 *
 * La app expone dos versiones por caminos distintos: `getVersion()` en el
 * frontend lee tauri.conf.json, y `check_for_updates` usa CARGO_PKG_VERSION de
 * Cargo.toml. Si se desincronizan, la app se identifica con una versión y
 * compara actualizaciones contra otra. Este check lo impide en CI.
 *
 * Uso: node scripts/check-version-sync.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const sources = [];

sources.push({ file: 'VERSION', version: read('VERSION').trim() });

for (const rel of ['package.json', 'src-tauri/tauri.conf.json']) {
  sources.push({ file: rel, version: JSON.parse(read(rel)).version });
}

const cargoToml = read('src-tauri/Cargo.toml');
// Primer `version = "..."` tras [package]: el de la propia crate.
const pkgSection = cargoToml.split(/^\[/m).find((s) => s.startsWith('package]'));
sources.push({
  file: 'src-tauri/Cargo.toml',
  version: pkgSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
});

// Cargo.lock no rompe el build si queda atrás, pero desincronizado delata un
// bump a medias; se avisa sin fallar.
const lockEntry = read('src-tauri/Cargo.lock')
  .split(/^\[\[package\]\]$/m)
  .find((block) => /^name = "annotix"$/m.test(block));
const lockVersion = lockEntry?.match(/^version = "([^"]+)"$/m)?.[1];

const missing = sources.filter((s) => !s.version);
if (missing.length > 0) {
  console.error('ERROR: no se pudo leer la versión de:');
  missing.forEach((s) => console.error(`  - ${s.file}`));
  process.exit(1);
}

const expected = sources[0].version;
const mismatched = sources.filter((s) => s.version !== expected);

if (mismatched.length > 0) {
  console.error(`ERROR: versiones desincronizadas (VERSION dice ${expected}):`);
  sources.forEach((s) => {
    const mark = s.version === expected ? '✓' : '✗';
    console.error(`  ${mark} ${s.file}: ${s.version}`);
  });
  console.error('\nCorrige con: ./scripts/bump-version.sh');
  process.exit(1);
}

if (lockVersion && lockVersion !== expected) {
  console.warn(
    `AVISO: src-tauri/Cargo.lock tiene annotix ${lockVersion}, se esperaba ${expected}. ` +
      'Corre `cargo check` en src-tauri/ y commitea el lock.',
  );
}

console.log(`Versión ${expected} sincronizada en ${sources.length} archivos.`);
