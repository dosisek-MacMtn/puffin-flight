#!/usr/bin/env node
/* Generate the PWA app icons from the puffin artwork.
 *
 * Icons are composed here rather than hand-drawn so that dropping in the real
 * brand puffin and re-running this regenerates every size. The output is
 * committed to assets/icons/, which keeps `node build.js` free of any
 * browser dependency.
 *
 * Usage: node tools/make-icons.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ASSETS, 'icons');

/* size: pixel size. safe: fraction of the icon the puffin may occupy.
 * Maskable icons get a much smaller safe area: Android crops them to a circle
 * and anything outside the middle 80% can be cut off. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, safe: 0.78 },
  { file: 'icon-512.png', size: 512, safe: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, safe: 0.56 },
  { file: 'apple-touch-icon-180.png', size: 180, safe: 0.78 }
];

function puffinFile() {
  for (const ext of ['.png', '.webp', '.svg']) {
    const p = path.join(ASSETS, 'puffin-flying' + ext);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No puffin-flying art found in assets/');
}

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

(async () => {
  const src = puffinFile();
  const uri = `data:${MIME[path.extname(src)]};base64,` + fs.readFileSync(src).toString('base64');

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage();

  for (const t of TARGETS) {
    const b64 = await page.evaluate(async (o) => {
      const img = new Image();
      img.src = o.uri;
      await img.decode();

      const c = document.createElement('canvas');
      c.width = o.size; c.height = o.size;
      const ctx = c.getContext('2d');

      // Flat GWI blue. A gradient here looks marginally nicer and costs ~6x
      // the file size: PNG compresses flat colour almost perfectly and smooth
      // ramps very badly.
      ctx.fillStyle = '#1a8fd8';
      ctx.fillRect(0, 0, o.size, o.size);

      // Puffin, scaled to fit the safe area and centred.
      const box = o.size * o.safe;
      const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (o.size - w) / 2, (o.size - h) / 2, w, h);

      return c.toDataURL('image/png').split(',')[1];
    }, { uri, size: t.size, safe: t.safe });

    const out = path.join(OUT, t.file);
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`${t.file} - ${t.size}x${t.size}, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
  }

  await browser.close();
  console.log('Source art:', path.relative(ROOT, src));
})();
