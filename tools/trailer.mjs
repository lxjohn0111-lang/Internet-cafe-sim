// Renders an 18 s gameplay preview video frame by frame (deterministic, virtual time) -> JPEG frames.
import fs from 'fs';
import { openGame, setupScene } from './capture-lib.mjs';
const [W, H, outDir] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const EVERY = Number(process.argv[5] || 1), QUALITY = process.argv[6] || 'high';
const FROM = Number(process.argv[7] || 0), TO = Number(process.argv[8] || 1e9);
const FPS = 30, DURATION = 18.4;
fs.mkdirSync(outDir, { recursive: true });
const { browser, page, errors } = await openGame({ width: W, height: H, quality: QUALITY });
await setupScene(page);
await page.evaluate(() => {
  const g = window.__game, p = g.player, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ease = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  const aim = (from, to) => { const ey = 1.63; return { yaw: Math.atan2(-(to.x - from.x), -(to.z - from.z)), pitch: Math.atan2(to.y - ey, Math.hypot(to.x - from.x, to.z - from.z)) }; };
  const set = (x, z, yaw, pitch) => { p.pos.set(x, 0, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; };
  const st = window.__st = {};
  // pick actors
  const seated = g.seatedCustomers();
  st.giver = seated.find((n) => n.ai.station.slot.row === 'L') || seated[0];
  window.__director = (t) => {
    // SHOT A: dolly into the busy cafe
    if (t < 3.8) {
      const k = ease(t / 3.8);
      const from = V(lerp(1.6, -0.2, k), 0, lerp(5.0, 2.4, k));
      const a = aim(from, V(lerp(-6, -5, k), lerp(1.1, 1.0, k), lerp(0.5, -1.5, k)));
      set(from.x, from.z, a.yaw, a.pitch);
      if (!st.reqA && t > 0.6) { st.reqA = true; const n = seated[2] || seated[0]; if (n) { n.ai.req = null; g.customers.makeRequest(n, 'snack'); } }
      return;
    }
    // SHOT B: hand a soda to a thirsty gamer
    if (t < 7.6) {
      const n = st.giver; const lt = t - 3.8;
      if (!st.bInit) { st.bInit = true; if (n) { n.ai.req = null; g.customers.makeRequest(n, 'drink'); n.ai.req.left = n.ai.req.max * 0.55; } const it = g.items.spawn('soda', p.camera.position.clone()); p.pickUp(it); }
      const target = n ? n.headPos().clone() : V(-7, 1.2, 1);
      const app = n ? n.ai.station.slot.approach : V(-6, 0, 1);
      const k = ease(Math.min(1, lt / 2.2));
      const from = V(lerp(app.x + 1.6, app.x + 0.55, k), 0, lerp(app.z + 1.6, app.z + 0.55, k));
      const a = aim(from, V(target.x, target.y - 0.35, target.z)); set(from.x, from.z, a.yaw, a.pitch);
      if (!st.given && lt > 2.4 && n && p.held) { st.given = true; const act = g.describe({ type: 'npc', npc: n }, p); if (act && act.run) { act.run(); p.reach(); } }
      return;
    }
    // SHOT C: MEGA punch on a troublemaker (driven through the real input path)
    if (t < 11.8) {
      const lt = t - 7.6; const m = g.input.mouse;
      if (!st.cInit) {
        st.cInit = true; if (p.held) { const it = p.held; p.held = null; p.holdAnchor.remove(it.obj); g.items.remove(it); }
        const th = st.thug = g.customers.spawnThug(); th.setPos(V(1.25, 0, 0.35)); th.ai.override = () => true; th.ai.hits = 2; th.stop(); th.play('angry', 0); th.say('Nice register you got there…', 2.2);
      }
      const th = st.thug;
      const k = ease(Math.min(1, lt / 1.6));
      const from = V(lerp(3.0, 2.25, k), 0, lerp(2.1, 1.3, k));
      const look = th.rag ? th.rag.pelvisPos.clone().add(V(0, 0.2, 0)) : th.headPos().clone().setY(1.3);
      if (!th.rag) th.lookAt(p.pos);
      st.look = st.look ? st.look.lerp(look, th.rag ? 0.35 : 0.18) : look;
      const a = aim(from, st.look); set(from.x, from.z, a.yaw, a.pitch);
      if (lt > 0.8 && !st.down) { st.down = true; m.pressed[0] = true; m.down[0] = true; }
      if (lt > 0.8 && lt < 2.1) m.down[0] = true;
      if (lt >= 2.1 && !st.up) { st.up = true; m.down[0] = false; m.released[0] = true; }
      return;
    }
    // SHOT D: disco fever
    if (t < 15.4) {
      const lt = t - 11.8;
      if (!st.dInit) { st.dInit = true; g.events.trigger('disco'); }
      const k = ease(lt / 3.6);
      const from = V(lerp(1.9, 1.2, k), 0, lerp(4.2, 3.4, k));
      const a = aim(from, V(lerp(-2.6, -3.2, k), lerp(1.5, 1.25, k), lerp(-0.4, 0.6, k))); set(from.x, from.z, a.yaw, a.pitch);
      return;
    }
    // SHOT E: it's raining money
    const lt = t - 15.4;
    if (!st.eInit) { st.eInit = true; g.hud.banner('JACKPOT', 'CRYPTO MILLIONAIRE', 'Grab the cash!'); }
    if (lt < 2.4) for (let i = 0; i < 4; i++) { const ang = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 2.0; g.items.spawnBill(V(Math.cos(ang) * r - 0.6, 2.6 + Math.random() * 0.8, Math.sin(ang) * r - 0.2), 5); }
    const k = ease(Math.min(1, lt / 3));
    const from = V(lerp(1.0, 0.4, k), 0, lerp(2.4, 1.6, k));
    const a = aim(from, V(-1.2, lerp(1.9, 1.2, k), -0.6)); set(from.x, from.z, a.yaw, a.pitch);
  };
});
const frames = Math.round(DURATION * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const shoot = f % EVERY === 0 && f >= FROM && f <= TO;
  await page.evaluate(([t, r]) => { window.__director(t); window.__step(1 / 30, r); }, [f / FPS, shoot]);
  if (shoot) await page.screenshot({ type: 'jpeg', quality: 93, path: `${outDir}/f${String(f).padStart(4, '0')}.jpg` });
  if (f % 30 === 0) console.log(`${W}x${H} frame ${f}/${frames}  ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
}
console.log('done', errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
