// Long randomized soak test: simulates several game days with random player actions and checks invariants.
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 });
await page.evaluate(() => { const g = window.__game; g.renderer.setQuality('low'); g.input.locked = true; document.getElementById('clicktoplay').classList.add('hidden'); g.state.money = 20000; g.state.level = 8; window.__issues = []; window.__seen = new Map(); });
for (let round = 0; round < 60; round++) {
  const r = await page.evaluate((round) => {
    const g = window.__game, p = g.player, R = (a, b) => a + Math.random() * (b - a), issues = window.__issues;
    try {
      // random player behaviour
      const spots = [[5.4, 0.6], [-4.9, 1.6], [0, 3], [1.5, -3], [-3, -2], [6, -8.5], [0, 7.5], [3, 4]];
      const s = spots[Math.floor(Math.random() * spots.length)]; p.pos.set(s[0], 0, s[1]); p.yaw = R(-3.14, 3.14); p.pitch = R(-0.4, 0.1);
      const act = Math.floor(Math.random() * 9);
      if (act === 0) g.resolvePunch(p, Math.random() < 0.3 ? 1 : 0);
      if (act === 1) { const n = g.npcs[Math.floor(Math.random() * g.npcs.length)]; if (n) { const h = n.rag ? n.rag.pelvisPos.clone() : n.headPos().clone(); p.pos.set(h.x + 1, 0, h.z + 0.5); const e = p.eye; p.yaw = Math.atan2(-(h.x - e.x), -(h.z - e.z)); p.pitch = Math.atan2(h.y - 0.3 - e.y, Math.hypot(h.x - e.x, h.z - e.z)); g.simulate(0.05); g.resolvePunch(p, Math.random() < 0.4 ? 1 : 0); } }
      if (act === 2) { const it = g.items.items.find((i) => i.state === 'world' && !i.def.heavy); if (it) { p.pickUp(it); g.simulate(0.1); p.drop(R(0, 11)); } }
      if (act === 3) { const ids = ['station', 'soda', 'chips', 'beans', 'coffee', 'decor', 'ac', 'speakers', 'fiber', 'arcade', 'camera', 'vending', 'robot', 'vip', 'flyers', 'ducks', 'party']; g.buy(ids[Math.floor(Math.random() * ids.length)]); }
      if (act === 4) { const st = g.stations[Math.floor(Math.random() * g.stations.length)]; if (st) { g.upgradePC(st.slot.id); g.upgradeChair(st.slot.id); } }
      if (act === 5) { const box = g.items.items.find((i) => i.kind === 'box_station'); if (box && g.freeSlots().length) { p.pickUp(box); g.refreshGhosts(); const a = g.describe({ type: 'slot', slot: g.freeSlots()[0] }, p); a && a.run(); } }
      if (act === 6) { g.events.trigger(); }
      if (act === 7) { p.pickFocus(); const a = p.focusAction; if (a && a.run && !/Sleep|Manager|manage|upgrades/i.test(a.text)) a.run(); }
      if (act === 8) { const n = g.seatedCustomers()[0]; if (n && n.ai.req) { const want = { drink: 'soda', snack: 'chips', coffee: 'coffee' }[n.ai.req.type]; if (want) { const it = g.items.spawn(want, p.camera.position.clone()); p.pickUp(it); const a = g.describe({ type: 'npc', npc: n }, p); a && a.run && a.run(); if (p.held) p.drop(0); } } }
      if (g.osOpen) g.closeOS(true);
      g.simulate(R(4, 12));
      if (g.overlay === 'summary') { document.getElementById('summary').classList.add('hidden'); g.overlay = null; g.dayEnding = false; }
      if (g.hours > 25 && !g.dayEnding) g.endDay(false);
      // invariants
      const bad = (m) => { if (issues.length < 60) issues.push(`[r${round} d${g.state.day} ${g.clockText()}] ${m}`); };
      if (!isFinite(p.pos.x + p.pos.y + p.pos.z)) bad('player NaN');
      for (const n of g.npcs) {
        const q = n.rag ? n.rag.pelvisPos : n.root.position;
        if (!isFinite(q.x + q.y + q.z)) bad(`NPC ${n.name} NaN`);
        if (Math.abs(q.x) > 60 || q.z > 30 || q.z < -20 || q.y < -3) bad(`NPC ${n.name} out of world ${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)}`);
        const key = n.id; const st = n.ai ? n.ai.role + ':' + n.ai.state : '?';
        const prev = window.__seen.get(key);
        const pos = n.root.position;
        if (prev && prev.st === st && n.moving && prev.x === Math.round(pos.x * 2) && prev.z === Math.round(pos.z * 2)) { prev.n++; if (prev.n === 4) bad(`NPC ${n.name} stuck in ${st} at ${pos.x.toFixed(1)},${pos.z.toFixed(1)}`); }
        else window.__seen.set(key, { st, x: Math.round(pos.x * 2), z: Math.round(pos.z * 2), n: 0 });
        if (n.rag && n.ragT > 12) bad(`NPC ${n.name} ragdolled for ${n.ragT.toFixed(0)}s`);
      }
      for (const st of g.stations) {
        if (st.occupant && (!st.occupant.alive || !st.occupant.ai || st.occupant.ai.station !== st)) { bad(`station ${st.slot.id} has stale occupant`); st.occupant = null; }
        if (st.reserved && st.reserved !== 'ghost' && (!st.reserved.alive || st.reserved.ai.station !== st)) { bad(`station ${st.slot.id} has stale reservation`); st.reserved = null; }
      }
      if (g.npcs.length > 45) bad('too many NPCs ' + g.npcs.length);
      if (g.items.items.length > 160) bad('too many items ' + g.items.items.length);
      if (g.physics.world.bodies.length > 400) bad('too many bodies ' + g.physics.world.bodies.length);
      if (!isFinite(g.state.money)) bad('money NaN');
      return { day: g.state.day, t: g.clockText(), npcs: g.npcs.length, items: g.items.items.length, bodies: g.physics.world.bodies.length, st: g.stations.length, ev: g.events.active.map((e) => e.def.id).join(',') };
    } catch (e) { issues.push('EXC ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')); return { err: e.message }; }
  }, round);
  if (round % 10 === 0) console.log('round', round, JSON.stringify(r));
}
const issues = await page.evaluate(() => window.__issues);
console.log('ISSUES', issues.length); issues.forEach((i) => console.log(' -', i));
console.log('PAGE ERRORS', errs.length); [...new Set(errs)].slice(0, 15).forEach((e) => console.log(' -', e));
await browser.close();
