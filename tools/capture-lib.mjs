// Shared helpers for deterministic frame-by-frame capture of the game (covers & trailers).
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
export async function openGame({ width, height, scale = 1, url = 'http://localhost:4173/', quality = 'high' }) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 180000 });
  await page.evaluate((quality) => {
    const g = window.__game; g.manual = true; g.renderer.auto = false; g.renderer.setQuality(quality);
    g.input.locked = true; g.everLocked = true; g.tutorialT = 9999;
    document.getElementById('clicktoplay').classList.add('hidden');
    document.getElementById('hints').style.display = 'none';
    // virtual time: timers and CSS animations follow the captured frames, not the wall clock
    const cap = window.__cap = { vt: 0, q: [], anim: new WeakMap() };
    window.setTimeout = (fn, ms = 0, ...args) => { const id = cap.q.length + 1 + Math.random(); cap.q.push({ at: cap.vt + (ms || 0), fn: () => fn(...args), id }); return id; };
    window.clearTimeout = (id) => { cap.q = cap.q.filter((t) => t.id !== id); };
    window.__step = (dt, render = true) => {
      g.frame(dt, render);
      cap.vt += dt * 1000;
      for (let guard = 0; guard < 20; guard++) {
        const due = cap.q.filter((t) => t.at <= cap.vt); if (!due.length) break;
        cap.q = cap.q.filter((t) => t.at > cap.vt); due.forEach((t) => { try { t.fn(); } catch (e) { console.error(e); } });
      }
      for (const a of document.getAnimations()) { if (!cap.anim.has(a)) { cap.anim.set(a, cap.vt - dt * 1000); a.pause(); } a.currentTime = Math.max(0, cap.vt - cap.anim.get(a)); }
    };
  }, quality);
  return { browser, page, errors };
}

// Builds a busy, upgraded café at dusk for marketing shots.
export async function setupScene(page, { hours = 19.3 } = {}) {
  await page.evaluate(async (hours) => {
    const g = window.__game, V = (x, y, z) => new THREE.Vector3(x, y, z);
    g.events.timer = 1e9; g.customers.thugAcc = -1e9; g.customers.pedAcc = 1e9;
    const s = g.state; s.level = 7; s.money = 4280; s.rep = 88;
    const tiers = [[3, 3, 3], [4, 3, 3], [5, 4, 3], [6, 3, 3], [7, 4, 3], [8, 3, 3], [9, 2, 2], [10, 3, 3], [11, 4, 3]];
    for (const [slot, tier, chair] of tiers) { if (!g.stations.some((st) => st.slot.id === slot)) { g.addStation({ slot, tier, chair }, true); s.stations.push({ slot, tier, chair }); } }
    g.stations.forEach((st, i) => { if (i < 3) { st.setTier(i === 1 ? 4 : 3); st.setChairTier(3); } });
    for (const u of ['decor', 'speakers', 'arcade', 'coffee', 'ac', 'camera']) { if (!s.upgrades[u]) { s.upgrades[u] = true; g.applyUpgrade(u, true); } }
    g.nav.rebuild();
    // tidy up: remove trash so shots look clean
    g.items.items.filter((i) => i.def.trash).forEach((i) => g.items.remove(i));
    s.minutes = hours * 60;
    // fill the PCs
    for (let i = 0; i < 11; i++) { g.customers.spawnCustomer({ pos: V(-0.5 + (i % 3) * 0.6, 0, 3.8 + Math.floor(i / 3) * 0.5) }); }
    for (let i = 0; i < 170; i++) window.__step(1 / 10, false);
    // no more arrivals during the shots; send away anyone still queuing/walking in
    g.customers.spawnAcc = -1e9;
    for (const n of g.npcs.slice()) if (!n.ai || n.ai.role !== 'customer' || !n.seated) g.customers.despawn(n);
    for (const a of ['first_cust', 'first_ko', 'oops', 'mega', 'swish', 'rich1k', 'rich10k', 'five_star', 'stations8', 'titan', 'fixer', 'events10']) s.ach[a] = true;
    s.minutes = hours * 60;
    g.fx.glow.n = 0; g.fx.soft.n = 0; g.fx.flat.n = 0;
    document.querySelectorAll('#feed .toast').forEach((t) => t.remove());
    window.__step(1 / 30, false);
  }, hours);
}
