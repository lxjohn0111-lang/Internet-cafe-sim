// Renders the three CrazyGames cover images (1920x1080, 800x1200, 800x800) from a live game moment.
import fs from 'fs';
import sharp from 'sharp';
import { openGame, setupScene } from './capture-lib.mjs';
const OUT = 'crazygames-upload/covers';
fs.mkdirSync(OUT, { recursive: true });
const formats = [
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, scale: 1, logo: 'top' },
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, scale: 2, logo: 'top' },
  { name: 'cover-square-800x800', w: 800, h: 800, scale: 2, logo: 'top' },
];
for (const f of formats) {
  const { browser, page, errors } = await openGame({ width: f.w, height: f.h, scale: f.scale, quality: 'ultra' });
  await setupScene(page, { hours: 20.2 });
  await page.evaluate((f) => {
    const g = window.__game, p = g.player, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const th = g.customers.spawnThug(); th.setPos(V(1.25, 0, 0.35)); th.ai.override = () => true; th.ai.hits = 2; th.stop(); th.play('angry', 0);
    const aim = (from, to) => ({ yaw: Math.atan2(-(to.x - from.x), -(to.z - from.z)), pitch: Math.atan2(to.y - 1.63, Math.hypot(to.x - from.x, to.z - from.z)) });
    const from = V(2.15, 0, 1.2); const look = V(0.9, f.h > f.w ? 1.5 : 1.35, 0.15);
    const a = aim(from, look); p.pos.copy(from); p.yaw = a.yaw; p.pitch = a.pitch; p.vel.set(0, 0, 0);
    p.baseFov = f.h > f.w ? 80 : 72;
    for (let i = 0; i < 8; i++) window.__step(1 / 30, false);
    // charge, then MEGA punch through the real input path
    const m = g.input.mouse; m.pressed[0] = true; m.down[0] = true;
    for (let i = 0; i < 40; i++) { th.lookAt(p.pos); p.pos.copy(from); p.yaw = a.yaw; p.pitch = a.pitch; m.down[0] = true; window.__step(1 / 30, false); }
    m.down[0] = false; m.released[0] = true;
    for (let i = 0; i < 9; i++) { p.pos.copy(from); p.yaw = a.yaw; p.pitch = a.pitch; window.__step(1 / 30, false); }
    // calm the particles down and bring the fists back to a clean pose for the still
    g.fx.glow.n = 0; g.fx.soft.n = 0; g.fx.flat.n = 0;
    const pp = th.rag ? th.rag.pelvisPos.clone() : th.headPos().clone(); g.fx.sparks(pp, 18); g.fx.confetti(pp.clone().add(V(0, 0.4, 0)), 40);
    p.punchT = 1; p.charge = 0;
    for (let i = 0; i < 3; i++) { p.pos.copy(from); p.yaw = a.yaw; p.pitch = a.pitch; window.__step(1 / 60, false); }
    // a few customers react
    g.seatedCustomers().slice(0, 2).forEach((n, i) => n.say(['WHOA!', 'LET\'S GOOO!'][i], 3, { shout: true, voice: false }));
    document.getElementById('hud').style.display = 'none';
    const logo = document.createElement('div');
    logo.innerHTML = '<div class="cv-logo">PING<span>PALACE</span></div><div class="cv-sub">NET CAFÉ SIMULATOR</div>';
    const st = document.createElement('style');
    const big = f.h > f.w ? 118 : f.w === f.h ? 104 : 150;
    st.textContent = `#cv{position:fixed;left:0;right:0;top:0;z-index:99;text-align:center;padding:${f.w > f.h ? 46 : 54}px 20px ${f.w > f.h ? 90 : 110}px;background:linear-gradient(180deg,rgba(3,5,10,.82),rgba(3,5,10,.45) 60%,rgba(3,5,10,0));font-family:Inter,'DejaVu Sans',sans-serif}
      .cv-logo{font-weight:900;font-size:${big}px;line-height:.92;letter-spacing:.02em;color:#fff;text-shadow:0 0 30px rgba(53,242,255,.75),0 0 80px rgba(53,242,255,.35),0 6px 0 rgba(0,0,0,.35)}
      .cv-logo span{display:${f.w > f.h ? 'inline' : 'block'};margin-left:${f.w > f.h ? '.18em' : '0'};color:#ff3fa4;text-shadow:0 0 30px rgba(255,63,164,.85),0 0 80px rgba(255,63,164,.35),0 6px 0 rgba(0,0,0,.35)}
      .cv-sub{margin-top:14px;font-weight:800;font-size:${Math.round(big * 0.2)}px;letter-spacing:.45em;color:#eaf6ff;opacity:.92}`;
    logo.id = 'cv'; document.head.appendChild(st); document.body.appendChild(logo);
    window.__step(1 / 30, true);
  }, f);
  await page.waitForTimeout(500);
  const raw = `${OUT}/${f.name}.raw.png`;
  await page.screenshot({ path: raw });
  await sharp(raw).resize(f.w, f.h).png({ compressionLevel: 9 }).toFile(`${OUT}/${f.name}.png`);
  fs.unlinkSync(raw);
  console.log(f.name, errors.length ? errors.join(' | ') : 'ok');
  await browser.close();
}
