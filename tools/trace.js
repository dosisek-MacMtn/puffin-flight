'use strict';
const path = require('path'); const http = require('http'); const fs = require('fs');
const { installPilot } = require('./pilot');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));
const ROOT = path.join(__dirname, '..'); const PORT = 8933;
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, 'dist', req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(installPilot);
  await page.evaluate(() => {
    const PF = window.PF, S = PF._debug.state;
    window.__hist = []; window.__deaths = [];
    window.__watch = setInterval(() => {
      const w = PF._debug.getWorld(), pu = w.puffin;
      if (S.mode === 'playing') {
        window.__hist.push({ t: +S.time.toFixed(2), y: Math.round(pu.y), vy: Math.round(pu.vy), tgt: Math.round(window.__target||0), f: window.__willFlap?1:0,
          obs: w.obstacles.alive.filter(o => o.x < 620).map(o => o.kind === 'column'
            ? `${o.variant}@${Math.round(o.x)}w${o.w} gap ${Math.round(o.gapY)}±${Math.round(o.gapH/2)}`
            : `${o.kind}@${Math.round(o.x)},${Math.round(o.y)}`) });
        if (window.__hist.length > 400) window.__hist.shift();
      }
      if (S.lastDeath && S.lastDeath !== window.__ref2) {
        window.__ref2 = S.lastDeath;
        window.__deaths.push({ death: S.lastDeath, tail: window.__hist.slice(-40) });
      }
    }, 16);
  });

  await page.waitForTimeout(20000);
  const out = await page.evaluate(() => { clearInterval(window.__pilot); clearInterval(window.__watch); return window.__deaths.slice(0, 2); });
  await browser.close(); server.close();
  out.forEach(d => {
    console.log('\n=== death:', JSON.stringify(d.death));
    d.tail.forEach(h => console.log(`  t=${h.t} y=${h.y} vy=${h.vy} tgt=${h.tgt} flap=${h.f}  [${h.obs.join(' | ')}]`));
  });
})();
