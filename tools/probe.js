#!/usr/bin/env node
/* Difficulty probe: plays the game with an autopilot and reports how runs end.
 * Used for tuning only — the acceptance checks live in tools/smoke.js.
 * Usage: node tools/probe.js [seconds]
 */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
const { installPilot } = require('./pilot');
const { chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }));

const ROOT = path.join(__dirname, '..');
const PORT = 8932;
const SECONDS = Number(process.argv[2] || 60);

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, 'dist', req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  await page.evaluate(installPilot);

  await page.waitForTimeout(SECONDS * 1000);
  const runs = await page.evaluate(() => { clearInterval(window.__pilot); return window.__log.runs; });
  await browser.close();
  server.close();

  const byReason = {};
  runs.forEach((r) => { byReason[r.reason] = (byReason[r.reason] || 0) + 1; });
  const scores = runs.map((r) => r.score).sort((a, b) => a - b);
  const med = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
  console.log(`runs: ${runs.length}  median ${med} Mbps  best ${scores[scores.length - 1] || 0} Mbps`);
  console.log('ended by:', JSON.stringify(byReason));
  console.log('stages reached:', JSON.stringify(runs.reduce((a, r) => (a[r.stage] = (a[r.stage] || 0) + 1, a), {})));
})();
