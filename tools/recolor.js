#!/usr/bin/env node
/* Recolour one colour family inside a transparent logo PNG, preserving alpha
 * and antialiasing. Used to produce a reverse (light) tagline for dark
 * backgrounds when no official reverse logo exists.
 *
 * Usage: node tools/recolor.js <in.png> <out.png> <fromHex> <toHex> [tolerance]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const [inFile, outFile, fromHex, toHex, tolArg] = process.argv.slice(2);
if (!inFile || !outFile || !fromHex || !toHex) {
  console.error('Usage: node tools/recolor.js <in.png> <out.png> <fromHex> <toHex> [tolerance]');
  process.exit(1);
}
const tol = Number(tolArg || 70);

(async () => {
  const b64 = fs.readFileSync(inFile).toString('base64');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage();
  const out = await page.evaluate(async (o) => {
    const hex = (h) => {
      const v = h.replace('#', '');
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    };
    const from = hex(o.fromHex), to = hex(o.toHex);
    const img = new Image();
    img.src = 'data:image/png;base64,' + o.b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    let hits = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const dist = Math.hypot(d[i] - from[0], d[i + 1] - from[1], d[i + 2] - from[2]);
      if (dist > o.tol) continue;
      d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2];
      hits++;
    }
    ctx.putImageData(id, 0, 0);
    return { png: c.toDataURL('image/png').split(',')[1], hits };
  }, { b64, fromHex, toHex, tol });
  await browser.close();
  fs.writeFileSync(outFile, Buffer.from(out.png, 'base64'));
  console.log(`${path.basename(outFile)} - recoloured ${out.hits} px, ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
})();
