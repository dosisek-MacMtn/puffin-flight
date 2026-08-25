#!/usr/bin/env node
/* Rasterize an SVG in assets/ to a PNG beside it, at a retina-friendly scale.
 * build.js prefers .png over .svg for a given base name, so the PNG takes over
 * automatically on the next build.
 *
 * Usage: node tools/rasterize.js gwi-logo [scale]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const base = process.argv[2];
const scale = Number(process.argv[3] || 3);

if (!base) {
  console.error('Usage: node tools/rasterize.js <asset-base-name> [scale]');
  process.exit(1);
}

(async () => {
  const svgPath = path.join(ASSETS, base + '.svg');
  if (!fs.existsSync(svgPath)) throw new Error('No such SVG: ' + svgPath);
  const svg = fs.readFileSync(svgPath, 'utf8');

  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!vb) throw new Error('SVG has no viewBox; cannot size the raster');
  const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  // Transparent background, exact pixel box, no margins.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
    { waitUntil: 'load' }
  );
  const out = path.join(ASSETS, base + '.png');
  await page.locator('svg').screenshot({ path: out, omitBackground: true });
  await browser.close();

  console.log(`${base}.png — ${w}x${h}, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
})();
