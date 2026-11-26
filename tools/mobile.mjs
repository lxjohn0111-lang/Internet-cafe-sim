import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium, devices } = require('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, dev] of [['portrait', devices['Pixel 7']], ['landscape', devices['Pixel 7 landscape']]]) {
  const ctx = await browser.newContext({ ...dev });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) logs.push('[err] ' + m.text()); });
  await page.goto('http://localhost:4173/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 });
  await page.tap('#clicktoplay');
  // drag the floating joystick forward
  const vw = dev.viewport.width, vh = dev.viewport.height;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vw * 0.18, y: vh * 0.7, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vw * 0.18, y: vh * 0.7 - 50, id: 1 }] });
  const r = await page.evaluate(() => { const g = window.__game; const z0 = g.player.pos.z, x0 = g.player.pos.x; g.simulate(1.5); const moved = Math.hypot(g.player.pos.x - x0, g.player.pos.z - z0); let t = performance.now(); for (let i = 0; i < 3; i++) g.renderer.render(0.016); const ms = (performance.now() - t) / 3; return { touch: g.input.touchMode, q: g.renderer.qualityName, moved: moved.toFixed(2), renderMs: ms.toFixed(0), shadows: g.renderer.r.shadowMap.enabled, lights: g.world.lights.interior.filter(l => l.visible).length }; });
  await page.screenshot({ path: `tools/shots/m_${name}.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.tap('#t-pause');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tools/shots/m_${name}_pause.png` });
  console.log(name, JSON.stringify(r), logs.join(' | '));
  await ctx.close();
}
await browser.close();
