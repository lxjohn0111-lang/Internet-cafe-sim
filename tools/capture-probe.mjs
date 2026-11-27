import { openGame } from './capture-lib.mjs';
const { browser, page } = await openGame({ width: 1920, height: 1080 });
for (const q of ['medium', 'high', 'ultra']) {
  await page.evaluate((q) => window.__game.renderer.setQuality(q), q);
  const t0 = Date.now();
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__step(1 / 30)); await page.screenshot({ type: 'jpeg', quality: 90, path: `tools/shots/probe_${q}.jpg` }); }
  console.log(q, ((Date.now() - t0) / 3).toFixed(0), 'ms/frame');
}
await browser.close();
