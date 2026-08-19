#!/usr/bin/env node
/* Puffin Flight — headless acceptance checks.
 *
 * Boots dist/index.html in Chromium, plays it with the shared autopilot, and
 * verifies the acceptance criteria that can be checked mechanically.
 * Development only — not part of the build or the deliverable.
 *
 * Usage: node tools/smoke.js
 */
'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');
const { installPilot } = require('./pilot');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 8931;
const PLAY_SECONDS = Number(process.env.PLAY_SECONDS || 70);

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/embed') {
        // Same-origin host page so the iframe's document is readable.
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><body style="margin:0">
          <iframe id="f" src="/" style="width:640px;height:360px;border:0"></iframe></body>`);
        return;
      }
      const file = path.join(DIST, url === '/' ? 'index.html' : decodeURIComponent(url).slice(1));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': ext === '.html' ? 'text/html' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream'
      });
      res.end(fs.readFileSync(file));
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await ctx.newPage();

  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));

  const base = `http://localhost:${PORT}`;
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(700);

  check('boots with no console errors', errors.length === 0, errors.join(' | '));
  const offsite = requests.filter((u) => !u.startsWith(base));
  check('zero external network requests', offsite.length === 0, offsite.join(', '));
  check('single request for the whole game', requests.length === 1,
    requests.length + ' request(s): ' + requests.map((u) => u.replace(base, '') || '/').join(' '));

  // ---- score formatting (Mbps -> Gbps at 1000) ----
  const fmt = await page.evaluate(() => [0, 742, 999, 1000, 1234, 2000].map((n) => window.PF.formatSpeed(n)));
  check('score formats in Mbps and flips to Gbps at 1000',
    JSON.stringify(fmt) === JSON.stringify(['0 Mbps', '742 Mbps', '999 Mbps', '1.0 Gbps', '1.2 Gbps', '2.0 Gbps']),
    fmt.join(' / '));

  // ---- stage thresholds match the plan names exactly ----
  const stages = await page.evaluate(() =>
    window.PF.CONFIG.stages.map((s) => s.id + '@' + s.threshold));
  check('stages are SWIM/FLY/SOAR at 0/500/1000',
    JSON.stringify(stages) === JSON.stringify(['SWIM@0', 'FLY@500', 'SOAR@1000']), stages.join(' '));

  // ---- buffering wheel: drains score, slows, never kills ----
  await page.evaluate(() => {
    document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const buffer = await page.evaluate(async () => {
    const PF = window.PF, S = PF._debug.state, w = PF._debug.getWorld();
    S.score = 300;
    // Drop a Big Cable wheel right on top of the puffin.
    const o = w.obstacles.acquire();
    Object.assign(o, {
      kind: 'buffer', variant: 'buffer', x: w.puffin.x, y: w.puffin.y, r: 30,
      baseY: w.puffin.y, amp: 0, freq: 0, phase: 0, speedMul: 1, spin: 0,
      used: false, dead: false, scored: false, seed: 0.5
    });
    const before = S.score;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 350));
    // Score keeps accruing (at the reduced buffering rate) during the wait, so
    // the observed drop is the 50 Mbps penalty minus whatever was earned.
    const elapsed = (performance.now() - t0) / 1000;
    const accrued = PF.CONFIG.stages[S.stageIdx].scoreRate * PF.CONFIG.buffering.speedFactor * elapsed;
    return { before, after: S.score, accrued, mode: S.mode, bufferTime: S.bufferTime,
      penalty: PF.CONFIG.scoring.bufferPenalty };
  });
  const drain = buffer.before - buffer.after + buffer.accrued;
  check('buffering wheel drains 50 Mbps and does not end the run',
    buffer.mode === 'playing' && buffer.bufferTime > 0 && Math.abs(drain - buffer.penalty) < 3,
    `drained ${drain.toFixed(1)} Mbps (penalty ${buffer.penalty}), still ${buffer.mode}`);

  // ---- play a long session with the autopilot ----
  await page.evaluate(() => { window.PF._debug.state.score = 0; });
  await page.evaluate(installPilot);
  await page.waitForTimeout(PLAY_SECONDS * 1000);

  const log = await page.evaluate(() => {
    clearInterval(window.__pilot);
    return Object.assign({}, window.__log, {
      stageList: Object.keys(window.__log.stages),
      storageKeys: Object.keys(window.localStorage),
      high: window.localStorage.getItem('gwi-puffin-highscore')
    });
  });

  check('score accumulates', log.maxScore > 400, 'peak ' + Math.floor(log.maxScore) + ' Mbps');
  // Real play proves the game is survivable far enough to leave the first
  // stage. How far beyond that a single 70s session gets is luck, so the
  // transitions themselves are verified deterministically below.
  check('autopilot survives past SWIM into FLY', log.stageList.includes('FLY'),
    'stages seen: ' + log.stageList.join(',') + ', peak ' + Math.floor(log.maxScore) + ' Mbps');

  const transitions = await page.evaluate(async () => {
    const PF = window.PF, S = PF._debug.state;
    const seen = [];
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));

    // The autopilot has stopped, so keep this run alive by hand: a run that has
    // ended stops advancing stages, which would make the check meaningless.
    const w = PF._debug.getWorld();
    const proto = Object.getPrototypeOf(w);
    const realCollide = proto.collide, realOob = proto.outOfBounds;
    proto.collide = function (inv) {
      return realCollide.call(this, inv).filter((e) => e.type !== 'lethal');
    };
    proto.outOfBounds = function () { return false; };
    const hold = setInterval(() => {
      const p = PF._debug.getWorld().puffin;
      if (p.y + p.vy * 0.25 > 260) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    }, 16);
    if (S.mode !== 'playing') {
      document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await settle(300);
    }

    for (const target of [500, 1000]) {
      S.score = target - 2;
      S.peak = target - 2;
      await settle(400);
      const stage = PF.CONFIG.stages[S.stageIdx];
      seen.push({
        at: target, id: stage.id,
        banner: S.bannerTime > 0, bannerStage: S.bannerStage,
        blending: S.blend < 1
      });
      await settle(1400);            // let the blend finish before the next one
      seen[seen.length - 1].blendDone = S.blend >= 1;
      seen[seen.length - 1].mode = S.mode;
    }

    clearInterval(hold);
    proto.collide = realCollide;
    proto.outOfBounds = realOob;
    return seen;
  });
  const fly = transitions[0], soar = transitions[1];
  check('crossing 500 Mbps unlocks FLY with a banner',
    fly.id === 'FLY' && fly.banner && fly.bannerStage === 'FLY' && fly.blendDone,
    JSON.stringify(fly));
  check('crossing 1000 Mbps unlocks SOAR with a banner',
    soar.id === 'SOAR' && soar.banner && soar.bannerStage === 'SOAR' && soar.blendDone,
    JSON.stringify(soar));
  check('frame pacing holds up', log.longFrames / log.frames < 0.05,
    log.longFrames + '/' + log.frames + ' ticks over 60ms');
  check('high score written to localStorage', Number(log.high) > 0, 'stored ' + log.high);
  check('stores nothing but the high score',
    log.storageKeys.length === 1 && log.storageKeys[0] === 'gwi-puffin-highscore',
    log.storageKeys.join(', '));
  check('no errors after a long session', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ---- high score survives a reload ----
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  const titleHigh = await page.textContent('#pf-title-high');
  check('high score persists across sessions',
    /(Mbps|Gbps)$/.test(titleHigh) && titleHigh !== '0 Mbps', 'title shows ' + titleHigh);

  // ---- responsive ----
  for (const vp of [
    { w: 390, h: 844, n: 'portrait phone' },
    { w: 844, h: 390, n: 'landscape phone' },
    { w: 1440, h: 900, n: 'desktop' }
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(350);
    const box = await page.evaluate(() => {
      const s = document.getElementById('pf-stage').getBoundingClientRect();
      const c = document.getElementById('pf-canvas');
      return {
        w: s.width, h: s.height, cw: c.width, ch: c.height,
        docW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        docH: document.documentElement.scrollHeight,
        clientH: document.documentElement.clientHeight
      };
    });
    const ratio = box.w / box.h;
    check(`${vp.n}: 16:9 playfield, fits without scrolling`,
      Math.abs(ratio - 16 / 9) < 0.02 && box.w <= vp.w + 1 && box.h <= vp.h + 1 &&
      box.docW <= box.clientW && box.docH <= box.clientH && box.cw > 0,
      `${Math.round(box.w)}x${Math.round(box.h)} @ ${ratio.toFixed(2)}`);
  }

  // ---- iframe embed (same-origin host page) ----
  const embed = await ctx.newPage();
  await embed.goto(base + '/embed', { waitUntil: 'load' });
  await embed.waitForTimeout(1200);
  const iframeState = await embed.evaluate(() => {
    const doc = document.getElementById('f').contentDocument;
    const c = doc.getElementById('pf-canvas');
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) };
  });
  check('plays inside an iframe', iframeState.w > 0 && iframeState.cssW > 0,
    `canvas ${iframeState.cssW}x${iframeState.cssH} css`);
  await embed.close();

  // ---- reduced motion ----
  const rmCtx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 900, height: 640 } });
  const rmPage = await rmCtx.newPage();
  const rmErrors = [];
  rmPage.on('pageerror', (e) => rmErrors.push(e.message));
  await rmPage.goto(base + '/', { waitUntil: 'load' });
  await rmPage.waitForTimeout(500);
  await rmPage.evaluate(() => {
    document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const S = window.PF._debug.state;
    S.score = 480;                       // push it into a stage transition
  });
  await rmPage.waitForTimeout(2500);
  const rm = await rmPage.evaluate(() => ({
    shake: window.PF._debug.state.shake,
    particles: window.PF._debug.getWorld().particles.alive.length,
    stage: window.PF.CONFIG.stages[window.PF._debug.state.stageIdx].id
  }));
  check('reduced motion: no shake through a stage transition, particles restrained',
    rm.shake === 0 && rm.particles < 90 && rmErrors.length === 0,
    `shake ${rm.shake}, ${rm.particles} particles, stage ${rm.stage}`);
  await rmCtx.close();

  // ---- pause: key, button, and tab hide ----
  await page.setViewportSize({ width: 900, height: 640 });
  await page.evaluate(() => {
    document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('p');
  await page.waitForTimeout(150);
  const paused = await page.evaluate(() => ({
    mode: window.PF._debug.state.mode,
    panelVisible: !document.getElementById('pf-paused').hidden
  }));
  check('P pauses and shows the pause panel',
    paused.mode === 'paused' && paused.panelVisible, JSON.stringify(paused));

  await page.click('#pf-resume');
  await page.waitForTimeout(150);
  const resumed = await page.evaluate(() => window.PF._debug.state.mode);
  check('Resume button returns to play', resumed === 'playing', 'mode ' + resumed);

  const autoPaused = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 120));
    return window.PF._debug.state.mode;
  });
  check('auto-pauses when the tab is hidden', autoPaused === 'paused', 'mode ' + autoPaused);

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
