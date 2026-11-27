// Verifies saving/loading through a mock CrazyGames SDK v3 data module, plus SDK lifecycle calls.
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript(() => {
  const store = JSON.parse(localStorage.getItem('__mockcg') || '{}');
  const log = window.__cglog = [];
  const persist = () => localStorage.setItem('__mockcg', JSON.stringify(store));
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    async init() { log.push('init'); await new Promise((r) => setTimeout(r, 50)); },
    game: { loadingStart: () => log.push('loadingStart'), loadingStop: () => log.push('loadingStop'), gameplayStart: () => log.push('gameplayStart'), gameplayStop: () => log.push('gameplayStop'), happytime: () => log.push('happytime'), settings: { muteAudio: false, disableChat: false }, addSettingsChangeListener: () => {} },
    ad: { requestAd: (type, cb) => { log.push('ad:' + type); setTimeout(() => { cb.adStarted && cb.adStarted(); setTimeout(() => cb.adFinished && cb.adFinished(), 100); }, 50); }, hasAdblock: async () => false },
    data: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { log.push('data.setItem:' + k); store[k] = String(v); persist(); }, removeItem: (k) => { delete store[k]; persist(); }, clear: () => { for (const k in store) delete store[k]; persist(); } },
  } };
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const boot = async () => { await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 }); };
await page.goto(url); await page.evaluate(() => { localStorage.clear(); }); // fresh profile
await boot();
const a = await page.evaluate(() => {
  const g = window.__game; g.renderer.setQuality('low');
  g.state.money = 1234; g.state.day = 3; g.state.level = 4; g.state.ach.first_ko = true; g.state.stations.push({ slot: 3, tier: 2, chair: 2 });
  g.save();
  const stored = JSON.parse(localStorage.getItem('__mockcg'))['pingpalace_save'];
  return { log: window.__cglog.slice(), storedMoney: stored && JSON.parse(stored).money, localSave: localStorage.getItem('pingpalace_save') };
});
console.log('1st session:', JSON.stringify(a));
await boot();
const b = await page.evaluate(() => { const g = window.__game; return { day: g.state.day, money: g.state.money, level: g.state.level, stations: g.stations.length, ach: g.state.ach.first_ko, log: window.__cglog.slice(0, 6) }; });
console.log('after reload:', JSON.stringify(b));
const c = await page.evaluate(async () => {
  const g = window.__game; g.renderer.setQuality('low');
  g.state.minutes = 22 * 60; g.endDay(false); await new Promise((r) => setTimeout(r, 1500));
  document.getElementById('btn-double').click(); await new Promise((r) => setTimeout(r, 800));
  await g.nextDay();
  return { day: g.state.day, log: window.__cglog.filter((x) => !x.startsWith('data.')), saves: window.__cglog.filter((x) => x.startsWith('data.')).length };
});
console.log('day cycle:', JSON.stringify(c));
console.log('errors:', errs.join(' | ') || 'none');
await browser.close();
