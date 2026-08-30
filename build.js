#!/usr/bin/env node
/* Puffin Flight build.
 *
 * Inlines src/styles.css and every src/*.js into a single dist/index.html, and
 * embeds the artwork as data URIs. If the embedded art would push the file past
 * INLINE_BUDGET, the assets are copied to dist/assets/ and referenced instead —
 * either way the result makes zero network requests at runtime.
 *
 * Usage: node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');
const DIST = path.join(ROOT, 'dist');
const INLINE_BUDGET = 300 * 1024; // bytes of embedded art before we split files

const ASSET_KEYS = {
  flying: 'puffin-flying.svg',
  pointing: 'puffin-pointing.svg',
  thumbsup: 'puffin-thumbsup.svg',
  logo: 'gwi-logo.svg'
};

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function read(p) { return fs.readFileSync(p, 'utf8'); }

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(file);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/* Resolve each asset, preferring a real brand PNG over the placeholder SVG if
 * one has been dropped in with the same base name. */
function resolveAsset(name) {
  const base = name.replace(/\.svg$/, '');
  for (const ext of ['.png', '.webp', '.svg']) {
    const candidate = path.join(ASSETS, base + ext);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing asset: ${name}`);
}

function build() {
  let html = read(path.join(SRC, 'index.html'));

  // 1. Assets -> data URIs, or copied files if they get heavy.
  const resolved = {};
  let total = 0;
  for (const [key, file] of Object.entries(ASSET_KEYS)) {
    const full = resolveAsset(file);
    resolved[key] = full;
    total += fs.statSync(full).size;
  }
  const inlineArt = total * 1.37 <= INLINE_BUDGET; // base64 overhead ~4/3

  const map = {};
  if (inlineArt) {
    for (const [key, full] of Object.entries(resolved)) map[key] = dataUri(full);
  } else {
    const outDir = path.join(DIST, 'assets');
    fs.mkdirSync(outDir, { recursive: true });
    for (const [key, full] of Object.entries(resolved)) {
      const base = path.basename(full);
      fs.copyFileSync(full, path.join(outDir, base));
      map[key] = `assets/${base}`;
    }
  }
  const assetBlock =
    '<script>\nwindow.PF_ASSETS = ' + JSON.stringify(map, null, inlineArt ? 0 : 2) + ';\n</script>';
  html = html.replace(
    /<!-- BUILD:ASSETS:START -->[\s\S]*?<!-- BUILD:ASSETS:END -->/,
    () => assetBlock
  );

  // 2. Stylesheet -> inline <style>.
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
    '<style>\n' + read(path.join(SRC, href)).trim() + '\n</style>'
  );

  // 3. Scripts -> inline. Order is preserved from the HTML.
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    '<script>\n' + read(path.join(SRC, src)).trim() + '\n</script>'
  );

  // 4. Belt and braces: nothing may reach the network at runtime.
  const external = html.match(/(?:src|href)\s*=\s*"(?!data:|#)([^"]*\/\/[^"]*)"/g);
  if (external) throw new Error('External reference left in build: ' + external.join(', '));
  if (/<script src=|<link rel="stylesheet"/.test(html)) {
    throw new Error('Un-inlined script or stylesheet left in build');
  }

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, 'index.html');
  fs.writeFileSync(out, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`Built ${path.relative(ROOT, out)} — ${kb} KB, art ${inlineArt ? 'inlined' : 'copied to dist/assets/'}`);

  buildPwa(html);
}

/* The installable app needs real URLs: a manifest and a service worker cannot
 * be inlined into the page. index.html itself stays self-contained, so an
 * iframe embed still works with these files absent - a manifest is only
 * fetched for a top-level page. */
function buildPwa(html) {
  const swSrc = read(path.join(SRC, 'sw.js'));
  const manifestSrc = read(path.join(SRC, 'manifest.webmanifest'));
  // Cache name tracks everything that ships, so any change to the page, the
  // worker or the manifest lands in a fresh cache and retires the old one.
  const version = crypto.createHash('sha1')
    .update(html).update(swSrc).update(manifestSrc)
    .digest('hex').slice(0, 8);

  fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), manifestSrc);

  const sw = swSrc.replace(/__CACHE_VERSION__/g, version);
  if (sw.includes('__CACHE_VERSION__')) throw new Error('Cache version not substituted in sw.js');
  fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

  const iconSrc = path.join(ASSETS, 'icons');
  const iconOut = path.join(DIST, 'icons');
  if (!fs.existsSync(iconSrc)) {
    throw new Error('Missing assets/icons/ — run: node tools/make-icons.js');
  }
  fs.mkdirSync(iconOut, { recursive: true });
  const icons = fs.readdirSync(iconSrc).filter((f) => f.endsWith('.png'));
  for (const f of icons) fs.copyFileSync(path.join(iconSrc, f), path.join(iconOut, f));

  // Everything the worker precaches must actually exist, or install fails and
  // the app silently never goes offline.
  const manifest = JSON.parse(read(path.join(DIST, 'manifest.webmanifest')));
  const precached = sw.match(/'\.\/[^']*'/g).map((s) => s.slice(3, -1)).filter(Boolean);
  for (const rel of precached) {
    if (!fs.existsSync(path.join(DIST, rel))) {
      throw new Error(`Service worker precaches a missing file: ${rel}`);
    }
  }
  for (const icon of manifest.icons) {
    if (!fs.existsSync(path.join(DIST, icon.src))) {
      throw new Error(`Manifest references a missing icon: ${icon.src}`);
    }
  }

  const total = [...icons.map((f) => path.join(iconOut, f)),
    path.join(DIST, 'sw.js'), path.join(DIST, 'manifest.webmanifest')]
    .reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(`PWA — manifest, service worker (cache ${version}) and ${icons.length} icons, ` +
    `${(total / 1024).toFixed(1)} KB`);
}

build();
