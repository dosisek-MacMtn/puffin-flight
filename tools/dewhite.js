#!/usr/bin/env node
/* Remove a white background from a logo PNG, keeping antialiased edges clean,
 * and trim the surrounding empty margin.
 *
 * Why not a plain white key: flat logo art is antialiased against its
 * background, so edge pixels are blends of the brand colour with white. Keying
 * out "near enough to white" either leaves a pale fringe or eats the edge.
 *
 * A blend of colour F with white is C = A*F + (1-A)*255, so the vector
 * (255-C) is always parallel to (255-F) and its length scales with A. So the
 * tool samples the image's own solid colours, matches each pixel to the one it
 * points at, and recovers alpha as a length ratio. Solid pixels come back fully
 * opaque in the exact brand colour; edge pixels get true partial alpha.
 *
 * Usage: node tools/dewhite.js <in.png> <out.png> [--pad=N] [--no-trim]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const args = process.argv.slice(2);
const [inFile, outFile] = args.filter((a) => !a.startsWith('--'));
const padArg = args.find((a) => a.startsWith('--pad='));
const pad = padArg ? parseInt(padArg.split('=')[1], 10) : 0;
const trim = !args.includes('--no-trim');

if (!inFile || !outFile) {
  console.error('Usage: node tools/dewhite.js <in.png> <out.png> [--pad=N] [--no-trim]');
  process.exit(1);
}

(async () => {
  const b64 = fs.readFileSync(inFile).toString('base64');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage();

  const result = await page.evaluate(async (opts) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + opts.b64;
    await img.decode();

    const w = img.naturalWidth, h = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, w, h).data;

    // 1. Sample the solid colours actually present (well away from white).
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.min(r, g, b) > 190) continue;              // white-ish, skip
      const key = (r >> 3) + ',' + (g >> 3) + ',' + (b >> 3);
      let e = counts.get(key);
      if (!e) counts.set(key, (e = { n: 0, r: 0, g: 0, b: 0 }));
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    const refs = [...counts.values()]
      .filter((e) => e.n > w * h * 0.0004)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((e) => {
        const r = Math.round(e.r / e.n), g = Math.round(e.g / e.n), b = Math.round(e.b / e.n);
        const dr = 255 - r, dg = 255 - g, db = 255 - b;
        const len = Math.hypot(dr, dg, db);
        return { r, g, b, dr, dg, db, len, n: e.n };
      })
      .filter((c) => c.len > 8);

    if (!refs.length) throw new Error('No solid colours found - is this image blank?');

    // 2. Recover alpha per pixel from its distance along its own colour's ray.
    const out = sctx.createImageData(w, h);
    const o = out.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dr = 255 - data[i], dg = 255 - data[i + 1], db = 255 - data[i + 2];
        const len = Math.hypot(dr, dg, db);
        if (len < 3) { o[i + 3] = 0; continue; }           // background

        let best = refs[0], bestDot = -Infinity;
        for (let k = 0; k < refs.length; k++) {
          const c = refs[k];
          const dot = (dr * c.dr + dg * c.dg + db * c.db) / (len * c.len);
          if (dot > bestDot) { bestDot = dot; best = c; }
        }
        let a = Math.round(255 * Math.min(1, len / best.len));
        // Respect any alpha the source already had.
        a = Math.round(a * (data[i + 3] / 255));
        if (a <= 0) { o[i + 3] = 0; continue; }

        o[i] = best.r; o[i + 1] = best.g; o[i + 2] = best.b; o[i + 3] = a;
        if (a > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 3. Trim the empty margin (optionally keeping a little padding).
    let cx = 0, cy = 0, cw = w, ch = h;
    if (opts.trim && maxX >= 0) {
      cx = Math.max(0, minX - opts.pad);
      cy = Math.max(0, minY - opts.pad);
      cw = Math.min(w - cx, maxX - minX + 1 + opts.pad * 2);
      ch = Math.min(h - cy, maxY - minY + 1 + opts.pad * 2);
    }

    const dst = document.createElement('canvas');
    dst.width = cw; dst.height = ch;
    const dctx = dst.getContext('2d');
    const full = document.createElement('canvas');
    full.width = w; full.height = h;
    full.getContext('2d').putImageData(out, 0, 0);
    dctx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);

    return {
      png: dst.toDataURL('image/png').split(',')[1],
      from: [w, h], to: [cw, ch],
      refs: refs.map((c) => ({ hex: '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join(''), px: c.n }))
    };
  }, { b64, pad, trim });

  await browser.close();
  fs.writeFileSync(outFile, Buffer.from(result.png, 'base64'));
  console.log(`${path.basename(outFile)} - ${result.to[0]}x${result.to[1]} (from ${result.from[0]}x${result.from[1]}), ` +
    `${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
  console.log('brand colours found:', result.refs.map((r) => `${r.hex} (${r.px}px)`).join(', '));
})();
