'use strict';
/* Capture stills of each screen/stage for visual review. Dev only. */
const path = require('path'); const http = require('http'); const fs = require('fs');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));
const ROOT = path.join(__dirname, '..'); const PORT = 8935;
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'tools', 'shots');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, 'dist', req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(file));
});
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '1-title.png') });

  // SWIM
  await page.evaluate(() => {
    document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // Make the puffin immortal for the capture, otherwise a run ends mid-shoot
    // and the next screenshot is of a fresh SWIM run.
    const w = window.PF._debug.getWorld();
    const proto = Object.getPrototypeOf(w);
    window.__realCollide = proto.collide;
    window.__realOob = proto.outOfBounds;
    proto.collide = function (inv) {
      // Keep pickups working, drop every lethal hit.
      return window.__realCollide.call(this, inv).filter((e) => e.type !== 'lethal');
    };
    proto.outOfBounds = function () { return false; };
    // Hold a representative altitude rather than freezing mid-dive.
    window.__hold = setInterval(() => {
      const p = window.PF._debug.getWorld().puffin;
      if (p.y + p.vy * 0.25 > 250) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    }, 16);
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, '2-swim.png') });

  // Stage transition banner + FLY
  await page.evaluate(() => { window.PF._debug.state.score = 498; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '3-fly-banner.png') });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: path.join(OUT, '4-fly.png') });

  // SOAR
  await page.evaluate(() => { window.PF._debug.state.score = 998; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, '5-soar.png') });

  // Buffering wheel
  await page.evaluate(() => {
    const w = window.PF._debug.getWorld();
    const o = w.obstacles.acquire();
    Object.assign(o, { kind: 'buffer', variant: 'buffer', x: w.puffin.x + 150, y: w.puffin.y,
      baseY: w.puffin.y, r: 30, amp: 0, freq: 0, phase: 0, speedMul: 1, spin: 0,
      used: false, dead: false, scored: false, seed: 0.5 });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '6-buffering.png') });

  // Game over
  await page.evaluate(() => {
    clearInterval(window.__hold);
    const w = window.PF._debug.getWorld();
    const proto = Object.getPrototypeOf(w);
    proto.collide = window.__realCollide;
    proto.outOfBounds = window.__realOob;
    w.puffin.y = 900;                              // drop out of bounds
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '7-gameover.png') });

  // Portrait phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '8-portrait.png') });

  await browser.close(); server.close();
  console.log('shots in', OUT);
})();
