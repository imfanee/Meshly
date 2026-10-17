#!/usr/bin/env node
/**
 * Generates branded raster assets that need more than a resize:
 * og.png (1200x630 link-preview image) and the two manifest screenshots.
 * Everything is drawn as SVG and rasterised with sharp, so the script needs
 * no fonts or native deps beyond sharp itself.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appDir, 'public/icons');
const logo = readFileSync(join(outDir, 'logo.svg')).toString('base64');

const mark = (x, y, s) =>
  `<image href="data:image/svg+xml;base64,${logo}" x="${x}" y="${y}" width="${s}" height="${s}"/>`;

const text = (x, y, size, weight, fill, content) =>
  `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" ` +
  `font-weight="${weight}" fill="${fill}">${content}</text>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0B1117"/>
  ${mark(468, 130, 264)}
  ${text(600, 505, 72, 600, '#E6EDF3', 'Meshly')}
  ${text(600, 565, 34, 400, '#8B9BA8', 'Private meetings, peer to peer.')}
</svg>`;

const screenshot = (
  w,
  h,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#0B1117"/>
  ${mark(w / 2 - 96, h * 0.28, 192)}
  ${text(w / 2, h * 0.62, 56, 600, '#E6EDF3', 'Meshly')}
  ${text(w / 2, h * 0.68, 28, 400, '#8B9BA8', 'Private meetings, peer to peer.')}
</svg>`;

mkdirSync(outDir, { recursive: true });
const jobs = [
  [Buffer.from(og), join(appDir, 'public/og.png')],
  [Buffer.from(screenshot(1280, 800)), join(outDir, 'screenshot-wide.png')],
  [Buffer.from(screenshot(720, 1280)), join(outDir, 'screenshot-narrow.png')],
];
for (const [svg, file] of jobs) {
  await sharp(svg, { density: 144 }).png().toFile(file);
  console.log(`wrote ${file}`);
}
