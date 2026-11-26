// Checks every visible HUD text element for overlaps at many screen sizes.
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium, devices } = require('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const targets = [
  ['desktop-1920', { viewport: { width: 1920, height: 1080 } }],
  ['desktop-1280', { viewport: { width: 1280, height: 720 } }],
  ['laptop-1024', { viewport: { width: 1024, height: 600 } }],
  ['window-820', { viewport: { width: 820, height: 640 } }],
  ['phone-portrait', devices['Pixel 7']],
  ['phone-landscape', devices['Pixel 7 landscape']],
  ['iphone-se-land', devices['iPhone SE landscape']],
];
let total = 0;
for (const [name, opts] of targets) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 });
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  const res = await page.evaluate(async () => {
    const g = window.__game; g.renderer.setQuality('low'); g.input.locked = true; document.getElementById('clicktoplay').classList.add('hidden');
    g.simulate(30);
    // worst case: banner + 5 toasts + prompt with sub line + carried item + charge bar + bubbles everywhere
    g.hud.banner('WEIRD EVENT', 'SPRINKLER MALFUNCTION', 'It\'s raining… indoors. Everybody panic, then mop.');
    for (let i = 0; i < 6; i++) g.hud.toast(`🧪 Test notification number ${i + 1} with a reasonably long text`, 'good', 60000);
    const it = g.items.spawn('soda', g.player.camera.position.clone()); g.player.pickUp(it);
    const p = g.player; p.pos.set(-4.6, 0, 3.0); p.yaw = Math.PI / 2 + 0.25; p.pitch = -0.12;
    g.npcs.forEach((n, i) => { if (n.ai && n.ai.role === 'customer') { n.say('This is a fairly long sentence that a customer might say out loud', 30, { voice: false }); n.setNeed('🥤', 0.5); } });
    g.player.charge = 0.6; g.player.charging = true;
    g.simulate(0.2);
    g.hud.setPrompt({ text: '<kbd>E</kbd> Give Soda to TryhardSkyler42', sub: 'Grab the extinguisher by the fuse box and spray it with LMB', run: () => {} }, 0);
    g.hud._obsT = 0; g.hud.update(0.016); g.hud.update(0.016);
    await new Promise((r) => setTimeout(r, 400));
    g.hud._obsT = 0; g.hud.update(0.016);
    const sels = ['#hud-tl', '#hud-money', '#hud-tr', '#hud-obj', '#feed .toast:not(.under-banner)', '#banner.show', '#prompt', '#carry', '#hints', '#charge.show', '#t-top', '.t-btns', '#t-stick', '.bub'];
    const boxes = [];
    for (const q of sels) document.querySelectorAll(q).forEach((el, i) => {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      let e = el; while (e) { if (getComputedStyle(e).display === 'none') return; e = e.parentElement; }
      if ((q === '#prompt' || q === '#carry') && !el.textContent.trim()) return;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      boxes.push({ q: q + (i ? '#' + i : ''), r: { l: r.left, t: r.top, r: r.right, b: r.bottom }, el });
    });
    const out = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.q.startsWith('#feed') && b.q.startsWith('#feed')) continue;
      const ox = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l), oy = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
      if (ox > 1 && oy > 1) out.push(`${a.q} x ${b.q} (${ox.toFixed(0)}x${oy.toFixed(0)})`);
    }
    // text clipped off-screen
    for (const b of boxes) if (b.r.l < -1 || b.r.t < -1 || b.r.r > innerWidth + 1 || b.r.b > innerHeight + 1) out.push(`${b.q} off-screen`);
    return { n: boxes.length, bubbles: boxes.filter((b) => b.q.startsWith('.bub')).length, out };
  });
  await page.screenshot({ path: `tools/shots/ov_${name}.png` });
  total += res.out.length;
  console.log(name.padEnd(16), 'elements', res.n, 'bubbles', res.bubbles, res.out.length ? 'OVERLAPS: ' + res.out.join(' | ') : 'OK', errs.join(' '));
  await ctx.close();
}
console.log('TOTAL OVERLAPS', total);
await browser.close();
