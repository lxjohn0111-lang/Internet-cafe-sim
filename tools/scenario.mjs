import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const url = 'http://localhost:4173/';
const shots = 'tools/shots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { const t = m.type(); if ((t === 'error' || t === 'warning') && !m.text().includes('GPU stall') && !m.text().includes('TUNNEL')) logs.push(`[${t}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 });
await page.evaluate(() => { const g = window.__game; g.input.locked = true; document.getElementById('clicktoplay').classList.add('hidden'); g.renderer.auto = false; });
const steps = JSON.parse(process.argv[2] || '[]');
let i = 0;
for (const st of steps) {
  i++;
  const r = await page.evaluate(st.js).catch(e => 'ERR ' + e.message);
  if (r !== undefined && r !== null) console.log(`step ${i}:`, typeof r === 'string' ? r : JSON.stringify(r));
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.shot) await page.screenshot({ path: `${shots}/${st.shot}.png` });
}
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
