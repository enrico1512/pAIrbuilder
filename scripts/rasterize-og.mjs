#!/usr/bin/env node
/**
 * Rasterizza i 3 OG SVG (hub, winelist, pAIrbuilder) → PNG 1200×630.
 *
 * Perché PNG e non SVG: Twitter/Facebook/WhatsApp scrapers NON renderizzano
 * `image/svg+xml` come og:image. Serve formato raster.
 *
 * Esegui: `node scripts/rasterize-og.mjs` (richiede sharp installato).
 *
 * Aggiunto 28 mag 2026 (audit security/SEO, fix #6).
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..', '..');

const targets = [
  {
    svg: resolve(root, 'Claude/Projects/ambrosiavino.com/public/images/og-cover.svg'),
    png: resolve(root, 'Claude/Projects/ambrosiavino.com/public/images/og-cover.png'),
    label: 'hub',
  },
  {
    svg: resolve(root, 'Claude/Projects/ambrosiavino-winelist/public/images/og-cover.svg'),
    png: resolve(root, 'Claude/Projects/ambrosiavino-winelist/public/images/og-cover.png'),
    label: 'winelist',
  },
  {
    svg: resolve(root, 'Claude/Projects/Pairbuilder/public/images/og-cover.svg'),
    png: resolve(root, 'Claude/Projects/Pairbuilder/public/images/og-cover.png'),
    label: 'pAIrbuilder',
  },
];

for (const t of targets) {
  try {
    const svgBuffer = readFileSync(t.svg);
    const pngBuffer = await sharp(svgBuffer, { density: 300 })
      .resize(1200, 630, { fit: 'fill' })
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();
    writeFileSync(t.png, pngBuffer);
    const size = (pngBuffer.length / 1024).toFixed(1);
    console.log(`✓ ${t.label.padEnd(12)} → ${t.png}  (${size} KB)`);
  } catch (err) {
    console.error(`✗ ${t.label}: ${err.message}`);
    process.exitCode = 1;
  }
}
