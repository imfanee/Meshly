#!/usr/bin/env node
/**
 * Prebuild step: copy files whose source of truth lives outside app/ into
 * public/ so the Vite build ships them.
 *
 * - infra/cpanel/.htaccess        -> public/.htaccess
 * - infra/cpanel/assets.htaccess  -> public/assets/.htaccess
 * - infra/cpanel/api/turn.php     -> public/api/turn.php
 * - Inter variable font (woff2)   -> public/fonts/InterVariable.woff2
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appDir, '..');

/** @type {Array<[string, string]>} */
const copies = [
  [join(repoRoot, 'infra/cpanel/.htaccess'), 'public/.htaccess'],
  [join(repoRoot, 'infra/cpanel/assets.htaccess'), 'public/assets/.htaccess'],
  [join(repoRoot, 'infra/cpanel/api/turn.php'), 'public/api/turn.php'],
];

// The Inter variable woff2 is extracted from @fontsource-variable/inter so it
// ships from our own origin (AGENTS.md: no third-party runtime assets).
const fontDir = join(appDir, 'node_modules/@fontsource-variable/inter/files');
if (existsSync(fontDir)) {
  const woff2 = readdirSync(fontDir).find(
    (f) =>
      f.includes('latin') &&
      !f.includes('latin-ext') &&
      f.includes('wght-normal') &&
      f.endsWith('.woff2'),
  );
  if (woff2) {
    copies.push([join(fontDir, woff2), 'public/fonts/InterVariable.woff2']);
  }
}

let copied = 0;
for (const [from, dest] of copies) {
  const to = join(appDir, dest);
  if (!existsSync(from)) {
    console.error(`copy-infra: missing source ${from}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}
console.log(`copy-infra: ${copied} file(s) staged into public/`);
