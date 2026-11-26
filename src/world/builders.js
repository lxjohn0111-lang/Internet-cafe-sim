import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, labelMat } from './materials.js';
import * as T from './textures.js';

// ---------- geometry helpers ----------
const gcache = new Map();
export function rbox(w, h, d, r = 0.01, seg = 2) {
  const k = `rb${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_${r}_${seg}`;
  if (!gcache.has(k)) gcache.set(k, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.0001)));
  return gcache.get(k);
}
export function bx(w, h, d) {
  const k = `b${w}_${h}_${d}`;
  if (!gcache.has(k)) gcache.set(k, new THREE.BoxGeometry(w, h, d));
  return gcache.get(k);
}
export function cy(rt, rb, h, seg = 20, open = false) {
  const k = `c${rt}_${rb}_${h}_${seg}_${open}`;
  if (!gcache.has(k)) gcache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return gcache.get(k);
}
export function sph(r, ws = 16, hs = 12) {
  const k = `s${r}_${ws}_${hs}`;
  if (!gcache.has(k)) gcache.set(k, new THREE.SphereGeometry(r, ws, hs));
  return gcache.get(k);
}
export function pl(w, h) {
  const k = `p${w}_${h}`;
  if (!gcache.has(k)) gcache.set(k, new THREE.PlaneGeometry(w, h));
  return gcache.get(k);
}
export function add(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  if (o.s) m.scale.setScalar(o.s);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
  m.castShadow = o.cast ?? true; m.receiveShadow = o.recv ?? true;
  if (parent) parent.add(m);
  return m;
}

// ---------- shared canvases ----------
let _canMats = null, _snackMats = null;
export function canMats() {
  if (!_canMats) _canMats = [0, 1, 2, 3, 4].map((i) => labelMat(T.canLabel(i), { rough: 0.25, metal: 0.6, env: 1.2 }));
  return _canMats;
}
export function snackMats() {
  if (!_snackMats) _snackMats = [0, 1, 2, 3].map((i) => labelMat(T.snackLabel(i), { rough: 0.35, metal: 0.3, env: 1 }));
  return _snackMats;
}

// ---------- small items ----------
export function makeCan(brand = 0) {
  const g = new THREE.Group();
  add(g, cy(0.033, 0.033, 0.11, 20), canMats()[brand % 5], 0, 0, 0);
  add(g, cy(0.029, 0.033, 0.01, 20), M.metal, 0, 0.059, 0);
  add(g, cy(0.029, 0.033, 0.01, 20), M.metal, 0, -0.059, 0, { rx: Math.PI });
  return g;
}
export function makeCrushedCan(brand = 0) {
  const g = new THREE.Group();
  add(g, cy(0.03, 0.036, 0.05, 9), canMats()[brand % 5], 0, 0, 0, { rz: 0.2 });
  return g;
}
export function makeChips(i = 0) {
  const g = new THREE.Group();
  const geo = rbox(0.14, 0.19, 0.05, 0.02, 3);
  add(g, geo, snackMats()[i % 4], 0, 0, 0);
  return g;
}
export function makeWrapper(i = 0) {
  const g = new THREE.Group();
  add(g, rbox(0.12, 0.012, 0.09, 0.005, 1), snackMats()[i % 4], 0, 0, 0, { rz: 0.1, rx: 0.05 });
  return g;
}
export function makeCup(coffee = true) {
  const g = new THREE.Group();
  add(g, cy(0.042, 0.032, 0.12, 18), M.paper, 0, 0, 0);
  add(g, cy(0.044, 0.044, 0.012, 18), coffee ? M.blackPlastic : M.redPaint, 0, 0.064, 0);
  add(g, cy(0.0435, 0.0405, 0.035, 18), coffee ? new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.8 }) : M.redPaint, 0, 0.0, 0);
  return g;
}
export function makePizzaBox() {
  const g = new THREE.Group();
  add(g, rbox(0.36, 0.045, 0.36, 0.004, 1), M.cardboard, 0, 0, 0);
  const top = add(g, pl(0.3, 0.3), labelMat(T.signCanvas([{ text: 'PIZZA', size: 60, color: '#c41f26' }, { text: 'HOT & FAST', size: 26, color: '#222' }], { w: 256, h: 256, bg: '#e8d8b8', accent: '#c41f26' })), 0, 0.0231, 0, { rx: -Math.PI / 2, cast: false });
  top.receiveShadow = true;
  return g;
}
export function makeBoxItem(w = 0.5, h = 0.4, d = 0.5, label = '') {
  const g = new THREE.Group();
  add(g, rbox(w, h, d, 0.008, 1), M.cardboard, 0, 0, 0);
  add(g, bx(w + 0.002, 0.004, 0.07), M.tape, 0, h / 2, 0, { cast: false });
  if (label) {
    const lm = labelMat(T.signCanvas([{ text: label, size: 38 }, { text: 'FRAGILE · THIS SIDE UP', size: 18, color: '#c41f26' }], { w: 256, h: 128, bg: '#efe8d8', fg: '#222', accent: '#222' }));
    add(g, pl(w * 0.7, w * 0.35), lm, 0, 0, d / 2 + 0.002, { cast: false });
  }
  return g;
}
export function makeDuck() {
  const g = new THREE.Group();
  add(g, sph(0.06, 14, 10), M.yellowPlastic, 0, 0, 0, { sy: 0.8, sz: 1.15 });
  add(g, sph(0.038, 12, 10), M.yellowPlastic, 0, 0.055, 0.04);
  add(g, bx(0.03, 0.01, 0.03), new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.4 }), 0, 0.05, 0.08);
  add(g, sph(0.006, 6, 6), M.blackPlastic, 0.018, 0.068, 0.068); add(g, sph(0.006, 6, 6), M.blackPlastic, -0.018, 0.068, 0.068);
  return g;
}
export function makeBill() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: T.tex(T.dollarCanvas()), side: THREE.DoubleSide, roughness: 0.8 });
  add(g, pl(0.15, 0.07), m, 0, 0, 0, { rx: -Math.PI / 2, cast: false });
  return g;
}

// ---------- tools ----------
export function makeMop() {
  const g = new THREE.Group();
  add(g, cy(0.012, 0.012, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0x2c64c8, roughness: 0.4, metalness: 0.4 }), 0, 0.65, 0);
  const head = add(g, cy(0.03, 0.09, 0.14, 14), new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 1 }), 0, 0.06, 0);
  head.userData.part = 'head';
  return g;
}
export function makeExtinguisher() {
  const g = new THREE.Group();
  add(g, cy(0.065, 0.065, 0.42, 20), M.redPaint, 0, 0.21, 0);
  add(g, sph(0.065, 20, 10), M.redPaint, 0, 0.42, 0, { sy: 0.6 });
  add(g, cy(0.018, 0.022, 0.08, 10), M.blackPlastic, 0, 0.48, 0);
  add(g, bx(0.12, 0.015, 0.03), M.metal, 0.04, 0.52, 0);
  add(g, cy(0.012, 0.012, 0.25, 8), M.rubber, -0.06, 0.38, 0.05, { rz: 0.4 });
  add(g, pl(0.09, 0.12), labelMat(T.signCanvas([{ text: 'FIRE', size: 70 }, { text: 'PULL·AIM·SPRAY', size: 30 }], { w: 256, h: 256, bg: '#c41f26' })), 0, 0.22, 0.0655, { cast: false });
  return g;
}

// ---------- PC components ----------
export function makeMonitor(tier) {
  const g = new THREE.Group();
  let sw, sh, screen;
  if (tier === 1) {
    // chunky CRT-era monitor
    sw = 0.34; sh = 0.26;
    add(g, rbox(0.42, 0.36, 0.36, 0.03, 3), M.whitePlastic, 0, 0.26, -0.12).material = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.55 });
    add(g, rbox(0.3, 0.06, 0.24, 0.02), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.55 }), 0, 0.03, -0.1);
    screen = add(g, pl(sw, sh), M.screenOff, 0, 0.27, 0.061, { cast: false });
    g.userData.screenH = 0.27;
  } else if (tier === 4) {
    sw = 0.86; sh = 0.37;
    const curve = new THREE.CylinderGeometry(1.2, 1.2, sh + 0.02, 40, 1, true, -0.4, 0.8);
    const back = add(g, curve, M.blackPlastic, 0, 0.42, 1.1, { ry: Math.PI });
    back.scale.set(1, 1, 1);
    const scrGeo = new THREE.CylinderGeometry(1.195, 1.195, sh, 40, 1, true, -0.37, 0.74);
    // flip normals inward to face viewer
    scrGeo.scale(-1, 1, 1);
    screen = add(g, scrGeo, M.screenOff, 0, 0.42, 1.1, { ry: Math.PI, cast: false });
    add(g, rbox(0.06, 0.28, 0.04, 0.01), M.metalDark, 0, 0.2, -0.13);
    add(g, rbox(0.34, 0.015, 0.2, 0.006), M.metalDark, 0, 0.008, -0.1);
    add(g, bx(0.7, 0.01, 0.01), M.rgb, 0, 0.42, -0.12, { cast: false });
    g.userData.screenH = 0.42;
    g.userData.curved = true;
  } else {
    sw = tier === 2 ? 0.48 : 0.6; sh = tier === 2 ? 0.28 : 0.34;
    const y = tier === 2 ? 0.34 : 0.38;
    add(g, rbox(sw + 0.025, sh + 0.025, 0.03, 0.008), M.blackPlastic, 0, y, -0.015);
    add(g, rbox(sw * 0.5, sh * 0.5, 0.04, 0.02), M.blackPlastic, 0, y, -0.045);
    screen = add(g, pl(sw, sh), M.screenOff, 0, y, 0.0006, { cast: false });
    add(g, rbox(0.05, y, 0.03, 0.01), tier === 3 ? M.metal : M.greyPlastic, 0, y / 2, -0.07);
    add(g, rbox(0.26, 0.012, 0.18, 0.005), tier === 3 ? M.metal : M.greyPlastic, 0, 0.006, -0.06);
    if (tier === 3) add(g, bx(sw * 0.8, 0.008, 0.008), M.rgb, 0, y + sh / 2 - 0.02, -0.06, { cast: false });
    g.userData.screenH = y;
  }
  g.userData.screen = screen;
  g.userData.sw = sw; g.userData.sh = sh;
  return g;
}

export function makeTower(tier) {
  const g = new THREE.Group();
  const fans = [];
  if (tier === 1) {
    const beige = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.55 });
    add(g, rbox(0.19, 0.4, 0.42, 0.01), beige, 0, 0.2, 0);
    add(g, bx(0.15, 0.02, 0.005), M.greyPlastic, 0, 0.33, 0.211); add(g, bx(0.15, 0.02, 0.005), M.greyPlastic, 0, 0.3, 0.211);
    add(g, cy(0.01, 0.01, 0.005, 10), M.ledGreen, 0.05, 0.12, 0.212, { rx: Math.PI / 2, cast: false });
    add(g, bx(0.12, 0.04, 0.005), new THREE.MeshStandardMaterial({ color: 0x333, roughness: 0.6 }), 0, 0.22, 0.211);
  } else if (tier === 2) {
    add(g, rbox(0.2, 0.42, 0.42, 0.012), M.blackPlastic, 0, 0.21, 0);
    add(g, bx(0.12, 0.3, 0.005), M.metalDark, 0, 0.22, 0.211);
    add(g, cy(0.008, 0.008, 0.005, 10), new THREE.MeshStandardMaterial({ emissive: 0x3fa0ff, emissiveIntensity: 3, color: 0 }), 0, 0.38, 0.212, { rx: Math.PI / 2, cast: false });
  } else {
    const big = tier === 4;
    const H = big ? 0.55 : 0.46, D = big ? 0.5 : 0.44, W = big ? 0.25 : 0.21;
    add(g, rbox(W, H, D, 0.012), M.blackPlastic, 0, H / 2, 0);
    // glass side panel (+x side faces the aisle)
    add(g, bx(0.004, H - 0.04, D - 0.04), M.glassDark, W / 2 + 0.002, H / 2, 0, { cast: false });
    // interior
    add(g, bx(0.01, H - 0.06, D - 0.06), M.carbon, -W / 2 + 0.02, H / 2, 0, { cast: false });
    add(g, rbox(W * 0.6, 0.05, D * 0.6, 0.008), big ? M.metal : M.metalDark, 0, H * 0.45, 0.02, { cast: false });
    add(g, bx(W * 0.5, 0.012, D * 0.55), M.rgb, 0, H * 0.45 - 0.032, 0.02, { cast: false });
    const nf = big ? 3 : 2;
    for (let i = 0; i < nf; i++) {
      const fan = new THREE.Group();
      fan.position.set(0, H * (0.25 + i * 0.25), D / 2 - 0.03);
      add(fan, new THREE.TorusGeometry(0.055, 0.008, 8, 24), M.rgb, 0, 0, 0, { cast: false });
      const blades = new THREE.Group();
      for (let b = 0; b < 7; b++) add(blades, bx(0.045, 0.004, 0.014), M.blackPlastic, Math.cos(b / 7 * Math.PI * 2) * 0.028, Math.sin(b / 7 * Math.PI * 2) * 0.028, 0, { rz: b / 7 * Math.PI * 2 + 0.5, cast: false });
      fan.add(blades); fans.push(blades);
      g.add(fan);
    }
    if (big) { add(g, cy(0.04, 0.04, 0.03, 20), M.rgb, 0, H * 0.75, -0.05, { cast: false }); add(g, new THREE.TorusGeometry(0.04, 0.006, 6, 18), M.chrome, 0, H * 0.75, -0.05, { rx: Math.PI / 2, cast: false }); }
    add(g, bx(W - 0.02, 0.012, 0.005), M.rgb, 0, H - 0.01, D / 2 + 0.001, { cast: false });
  }
  g.userData.fans = fans;
  return g;
}

let _kbGeo = null;
function keyboardKeysGeometry() {
  if (_kbGeo) return _kbGeo;
  const geos = [];
  const k = new RoundedBoxGeometry(0.016, 0.008, 0.016, 1, 0.003);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) {
    if (r === 4 && c > 3 && c < 11) continue;
    const g = k.clone(); g.translate(-0.13 + c * 0.0186, 0.012, -0.045 + r * 0.0195);
    geos.push(g);
  }
  const sp = new RoundedBoxGeometry(0.125, 0.008, 0.016, 1, 0.003); sp.translate(0.003, 0.012, -0.045 + 4 * 0.0195); geos.push(sp);
  _kbGeo = mergeGeometries(geos);
  return _kbGeo;
}
export function makeKeyboard(tier) {
  const g = new THREE.Group();
  add(g, rbox(0.3, 0.018, 0.11, 0.005), tier >= 3 ? M.metalDark : (tier === 1 ? new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6 }) : M.blackPlastic), 0, 0.009, 0);
  add(g, keyboardKeysGeometry(), tier === 1 ? new THREE.MeshStandardMaterial({ color: 0xcfc6ad, roughness: 0.6 }) : M.blackPlastic, 0, 0, 0, { cast: false });
  if (tier >= 3) add(g, bx(0.29, 0.003, 0.1), M.rgb, 0, 0.0165, 0, { cast: false });
  return g;
}
export function makeMouse(tier) {
  const g = new THREE.Group();
  add(g, sph(0.03, 14, 10), tier === 1 ? new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6 }) : M.blackPlastic, 0, 0.012, 0, { sx: 0.65, sy: 0.4, sz: 1.0 });
  if (tier >= 3) add(g, bx(0.004, 0.002, 0.02), M.rgb, 0, 0.024, 0.01, { cast: false });
  return g;
}
export function makeHeadphones(mat) {
  const g = new THREE.Group();
  add(g, new THREE.TorusGeometry(0.085, 0.012, 8, 20, Math.PI), mat || M.blackPlastic, 0, 0.09, 0);
  add(g, cy(0.04, 0.04, 0.03, 16), mat || M.blackPlastic, 0.085, 0.07, 0, { rz: Math.PI / 2 });
  add(g, cy(0.04, 0.04, 0.03, 16), mat || M.blackPlastic, -0.085, 0.07, 0, { rz: Math.PI / 2 });
  return g;
}

// ---------- chairs ----------
export function makeChair(tier) {
  const g = new THREE.Group();
  if (tier === 1) {
    const m = M.plasticChairBlue;
    add(g, rbox(0.44, 0.04, 0.42, 0.015), m, 0, 0.45, 0);
    add(g, rbox(0.42, 0.36, 0.03, 0.015), m, 0, 0.66, 0.2, { rx: -0.1 });
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) add(g, cy(0.012, 0.012, 0.45, 8), M.metal, x, 0.225, z);
    g.userData.seatH = 0.47;
  } else {
    const gaming = tier === 3;
    const seatM = gaming ? M.leatherRed : M.fabric;
    // star base
    const base = new THREE.Group(); g.add(base);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      add(base, rbox(0.3, 0.03, 0.04, 0.01), M.blackPlastic, Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14, { ry: -a });
      add(base, sph(0.025, 8, 6), M.rubber, Math.cos(a) * 0.28, 0.025, Math.sin(a) * 0.28);
    }
    add(g, cy(0.025, 0.03, 0.32, 12), M.chrome, 0, 0.24, 0);
    const top = new THREE.Group(); top.position.y = 0.4; g.add(top);
    add(top, rbox(0.5, 0.09, 0.5, 0.035, 3), seatM, 0, 0.06, 0);
    if (gaming) {
      add(top, rbox(0.52, 0.85, 0.1, 0.04, 3), M.leather, 0, 0.5, 0.25, { rx: -0.08 });
      add(top, rbox(0.3, 0.6, 0.02, 0.01), seatM, 0, 0.5, 0.195, { rx: -0.08 });
      add(top, rbox(0.12, 0.65, 0.1, 0.04), seatM, 0.22, 0.45, 0.22, { rx: -0.08 });
      add(top, rbox(0.12, 0.65, 0.1, 0.04), seatM, -0.22, 0.45, 0.22, { rx: -0.08 });
      add(top, rbox(0.22, 0.1, 0.08, 0.04, 3), M.leatherRed, 0, 0.82, 0.21, { rx: -0.08 });
      add(top, rbox(0.06, 0.03, 0.26, 0.01), M.blackPlastic, 0.27, 0.27, 0.0); add(top, rbox(0.06, 0.03, 0.26, 0.01), M.blackPlastic, -0.27, 0.27, 0.0);
      add(top, cy(0.012, 0.012, 0.2, 8), M.blackPlastic, 0.27, 0.16, 0.05); add(top, cy(0.012, 0.012, 0.2, 8), M.blackPlastic, -0.27, 0.16, 0.05);
    } else {
      add(top, rbox(0.46, 0.55, 0.06, 0.03, 3), M.fabric, 0, 0.45, 0.25, { rx: -0.1 });
      add(top, rbox(0.04, 0.3, 0.04, 0.01), M.blackPlastic, 0, 0.18, 0.25);
      add(top, rbox(0.05, 0.03, 0.22, 0.01), M.blackPlastic, 0.26, 0.25, 0.02); add(top, rbox(0.05, 0.03, 0.22, 0.01), M.blackPlastic, -0.26, 0.25, 0.02);
      add(top, cy(0.01, 0.01, 0.16, 8), M.blackPlastic, 0.26, 0.16, 0.05); add(top, cy(0.01, 0.01, 0.16, 8), M.blackPlastic, -0.26, 0.16, 0.05);
    }
    g.userData.top = top;
    g.userData.seatH = 0.5;
  }
  return g;
}

// ---------- station ----------
// local frame: desk front edge at z=0, customer sits at +z, faces -z
export function makeStationBase(vip = false, deskStyle = 0) {
  const g = new THREE.Group();
  const top = deskStyle === 1 ? M.deskWood : M.deskBlack;
  add(g, rbox(1.4, 0.035, 0.75, 0.008), top, 0, 0.74, -0.375);
  // edge LED strip
  add(g, bx(1.36, 0.006, 0.006), vip ? M.ledPink : M.ledCyan, 0, 0.725, -0.002, { cast: false });
  // legs (metal frame)
  for (const x of [-0.66, 0.66]) {
    add(g, rbox(0.05, 0.72, 0.05, 0.008), M.metalDark, x, 0.36, -0.08);
    add(g, rbox(0.05, 0.72, 0.05, 0.008), M.metalDark, x, 0.36, -0.68);
    add(g, rbox(0.05, 0.04, 0.65, 0.008), M.metalDark, x, 0.04, -0.38);
  }
  add(g, rbox(1.3, 0.06, 0.03, 0.008), M.metalDark, 0, 0.68, -0.72);
  // privacy divider (fabric) on left side, back panel
  add(g, rbox(0.04, 0.55, 0.78, 0.015), vip ? M.fabricRed : M.fabric, -0.7, 1.03, -0.39);
  add(g, rbox(1.44, 0.5, 0.04, 0.015), vip ? M.fabricRed : M.fabric, 0, 1.0, -0.77);
  add(g, bx(1.44, 0.01, 0.045), vip ? M.ledPink : M.ledCyan, 0, 1.255, -0.77, { cast: false });
  // mousepad
  add(g, rbox(0.8, 0.004, 0.34, 0.002), M.rubber, 0.05, 0.76, -0.24, { cast: false });
  // cable bundle
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.1, 0.76, -0.62), new THREE.Vector3(-0.15, 0.6, -0.7), new THREE.Vector3(-0.45, 0.15, -0.66), new THREE.Vector3(-0.48, 0.02, -0.5)]);
  add(g, new THREE.TubeGeometry(curve, 16, 0.012, 6, false), M.rubber, 0, 0, 0, { cast: false });
  // power strip
  add(g, rbox(0.3, 0.04, 0.06, 0.01), M.whitePlastic, -0.3, 0.02, -0.6, { cast: false });
  return g;
}

// ---------- big furniture ----------
export function makeCounter(len = 4.2) {
  const g = new THREE.Group();
  add(g, rbox(len, 1.0, 0.65, 0.01), M.deskWood, 0, 0.5, 0);
  for (let i = 0; i < Math.floor(len / 0.6); i++) add(g, rbox(0.52, 0.8, 0.02, 0.005), M.deskBlack, -len / 2 + 0.33 + i * 0.6, 0.5, 0.33);
  add(g, rbox(len + 0.1, 0.05, 0.8, 0.008), M.granite, 0, 1.025, 0.04);
  add(g, bx(len, 0.01, 0.01), M.ledWarm, 0, 0.98, 0.44, { cast: false });
  add(g, bx(len, 0.02, 0.01), M.ledCyan, 0, 0.03, 0.33, { cast: false });
  return g;
}
export function makeRegister() {
  const g = new THREE.Group();
  add(g, rbox(0.36, 0.1, 0.34, 0.015), M.blackPlastic, 0, 0.05, 0);
  const drawer = add(g, rbox(0.34, 0.06, 0.3, 0.01), M.greyPlastic, 0, 0.03, 0.05);
  add(g, rbox(0.3, 0.06, 0.14, 0.01), M.blackPlastic, 0, 0.12, -0.04, { rx: -0.4 });
  const disp = add(g, pl(0.18, 0.06), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x30ff90, emissiveIntensity: 1.2 }), 0, 0.135, 0.03, { rx: -0.4 - Math.PI / 2 + Math.PI / 2, cast: false });
  disp.rotation.x = -0.4;
  add(g, rbox(0.04, 0.16, 0.04, 0.01), M.blackPlastic, 0.1, 0.18, -0.12);
  add(g, rbox(0.18, 0.1, 0.02, 0.01), M.blackPlastic, 0.1, 0.27, -0.12);
  // cash stack visual
  const cash = new THREE.Group(); cash.position.set(-0.25, 0.0, 0.05); g.add(cash);
  g.userData.cash = cash; g.userData.drawer = drawer;
  return g;
}
export function makeTipJar() {
  const g = new THREE.Group();
  add(g, cy(0.07, 0.065, 0.18, 20, true), M.glass, 0, 0.09, 0, { cast: false });
  add(g, cy(0.065, 0.065, 0.005, 20), M.glass, 0, 0.002, 0, { cast: false });
  const coins = add(g, cy(0.06, 0.06, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xc9a440, metalness: 1, roughness: 0.3 }), 0, 0.02, 0);
  g.userData.coins = coins;
  add(g, pl(0.1, 0.05), labelMat(T.signCanvas([{ text: 'TIPS', size: 80 }], { w: 256, h: 128, bg: '#fff', fg: '#222', accent: '#ff3fa4' })), 0, 0.1, 0.071, { cast: false });
  return g;
}
export function makeLaptop() {
  const g = new THREE.Group();
  add(g, rbox(0.34, 0.016, 0.24, 0.006), M.metal, 0, 0.008, 0);
  add(g, keyboardKeysGeometry(), M.blackPlastic, 0, 0.0, 0.03, { s: 1, cast: false }).scale.set(1, 0.4, 0.8);
  const lid = new THREE.Group(); lid.position.set(0, 0.016, -0.115); lid.rotation.x = -0.25; g.add(lid);
  add(lid, rbox(0.34, 0.22, 0.01, 0.005), M.metal, 0, 0.11, 0);
  const screen = add(lid, pl(0.31, 0.19), M.screenOff, 0, 0.11, 0.0055, { cast: false });
  g.userData.screen = screen;
  return g;
}

export function makeFridge() {
  const g = new THREE.Group();
  const W = 0.8, H = 2.0, D = 0.7;
  // hollow shell so the lit interior is visible through the glass door
  add(g, rbox(W, H, 0.08, 0.015), M.metalDark, 0, H / 2, -D / 2 + 0.04);
  add(g, rbox(0.05, H, D, 0.015), M.metalDark, -W / 2 + 0.025, H / 2, 0); add(g, rbox(0.05, H, D, 0.015), M.metalDark, W / 2 - 0.025, H / 2, 0);
  add(g, rbox(W, 0.24, D, 0.015), M.metalDark, 0, H - 0.12, 0); add(g, rbox(W, 0.16, D, 0.015), M.metalDark, 0, 0.08, 0);
  // interior (lit)
  add(g, bx(W - 0.1, H - 0.42, 0.01), M.fridgeLight, 0, H / 2 - 0.02, -D / 2 + 0.085, { cast: false });
  add(g, bx(0.02, H - 0.42, D - 0.12), M.fridgeLight, -W / 2 + 0.055, H / 2 - 0.02, 0, { cast: false }); add(g, bx(0.02, H - 0.42, D - 0.12), M.fridgeLight, W / 2 - 0.055, H / 2 - 0.02, 0, { cast: false });
  const shelves = [];
  for (let i = 0; i < 4; i++) {
    const y = 0.35 + i * 0.4;
    add(g, bx(W - 0.08, 0.012, D - 0.12), M.glassTint, 0, y, 0.0, { cast: false });
    shelves.push(y);
  }
  // header sign
  add(g, bx(W - 0.04, 0.16, 0.02), labelMat(T.signCanvas([{ text: 'ICE COLD', size: 54, color: '#35f2ff' }], { w: 256, h: 64, bg: '#0a1118', accent: '#35f2ff', border: false })), 0, H - 0.1, D / 2 + 0.005, { cast: false });
  // door glass + handle (door is +z)
  add(g, bx(W - 0.06, H - 0.3, 0.02), M.glass, 0, H / 2 - 0.05, D / 2 - 0.01, { cast: false });
  add(g, rbox(0.03, 0.5, 0.04, 0.01), M.chrome, W / 2 - 0.08, H / 2, D / 2 + 0.03);
  // cans as instanced mesh (stock visual)
  const canGeo = cy(0.033, 0.033, 0.12, 12);
  const inst = new THREE.InstancedMesh(canGeo, canMats()[0], 48);
  inst.castShadow = false;
  const cols = [0, 1, 2, 3, 4];
  let n = 0;
  for (let s = 0; s < 4; s++) for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const m = new THREE.Matrix4().makeTranslation(-0.28 + c * 0.11, shelves[s] + 0.067, -0.15 + r * 0.14);
    inst.setMatrixAt(n, m); inst.setColorAt(n, new THREE.Color().setHSL(((c + s * 2) % 5) / 5, 0.6, 0.6)); n++;
  }
  inst.material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.3 });
  g.add(inst);
  g.userData.cans = inst;
  const light = new THREE.PointLight(0xdff0ff, 1.2, 2.5, 2); light.position.set(0, 1.2, 0.6); g.add(light);
  return g;
}

export function makeSnackShelf() {
  const g = new THREE.Group();
  const W = 1.6, H = 1.8, D = 0.45;
  add(g, rbox(W, 0.03, D, 0.005), M.metal, 0, 0.1, 0);
  for (let i = 0; i < 4; i++) add(g, rbox(W, 0.025, D, 0.005), M.metal, 0, 0.45 + i * 0.4, 0);
  for (const x of [-W / 2, W / 2]) add(g, rbox(0.04, H, 0.04, 0.005), M.metalDark, x, H / 2, -D / 2 + 0.02), add(g, rbox(0.04, H, 0.04, 0.005), M.metalDark, x, H / 2, D / 2 - 0.02);
  add(g, bx(W, H, 0.01), M.metalDark, 0, H / 2, -D / 2, { cast: false });
  const bags = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 9; i++) {
    const b = makeChips((i + s) % 4);
    b.position.set(-W / 2 + 0.12 + i * 0.17, 0.56 + s * 0.4, 0.05 + (i % 2) * 0.04);
    b.rotation.x = -0.15; b.rotation.y = (Math.random() - 0.5) * 0.3;
    g.add(b); bags.push(b);
  }
  add(g, pl(0.5, 0.14), labelMat(T.signCanvas([{ text: 'SNACKS  $3', size: 46, color: '#ffd34d' }], { w: 512, h: 128, bg: '#111', accent: '#ffd34d', border: false })), 0, H + 0.1, 0, { cast: false });
  g.userData.bags = bags;
  return g;
}

export function makeBin() {
  const g = new THREE.Group();
  add(g, cy(0.22, 0.18, 0.62, 24, true), M.metalDark, 0, 0.31, 0);
  add(g, cy(0.18, 0.18, 0.01, 24), M.metalDark, 0, 0.005, 0);
  add(g, new THREE.TorusGeometry(0.22, 0.012, 8, 28), M.chrome, 0, 0.62, 0, { rx: Math.PI / 2 });
  const fill = add(g, cy(0.19, 0.18, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }), 0, 0.03, 0, { cast: false });
  g.userData.fill = fill;
  // inner (backface)
  const inner = add(g, cy(0.215, 0.175, 0.6, 24, true), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, side: THREE.BackSide, roughness: 0.9 }), 0, 0.31, 0, { cast: false });
  return g;
}

export function makePlant(type = 0) {
  const g = new THREE.Group();
  add(g, cy(0.2, 0.15, 0.4, 20), type ? M.blackPlastic : M.terracotta, 0, 0.2, 0);
  add(g, cy(0.19, 0.19, 0.02, 18), M.soil, 0, 0.39, 0, { cast: false });
  const leafGeo = new THREE.SphereGeometry(0.1, 8, 6); leafGeo.scale(0.5, 1, 0.12);
  const n = type ? 9 : 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.3;
    const h = type ? 0.4 + Math.random() * 0.45 : 0.25 + Math.random() * 0.3;
    const leaf = add(g, leafGeo, i % 2 ? M.leaf : M.leafDark, Math.cos(a) * 0.06, 0.42 + h * 0.5, Math.sin(a) * 0.06, { cast: true });
    leaf.scale.set(type ? 0.6 : 1.4, h * (type ? 4 : 2.5), type ? 1 : 1.4);
    leaf.rotation.set(Math.sin(a) * (type ? 0.15 : 0.7), -a, Math.cos(a) * (type ? 0.15 : 0.7));
  }
  return g;
}

export function makeSofa() {
  const g = new THREE.Group();
  const m = M.fabricSofa;
  add(g, rbox(2.0, 0.42, 0.9, 0.06, 3), m, 0, 0.25, 0);
  add(g, rbox(2.0, 0.55, 0.22, 0.08, 3), m, 0, 0.6, -0.36);
  add(g, rbox(0.22, 0.32, 0.9, 0.08, 3), m, -0.92, 0.55, 0); add(g, rbox(0.22, 0.32, 0.9, 0.08, 3), m, 0.92, 0.55, 0);
  add(g, rbox(0.86, 0.14, 0.62, 0.06, 3), m, -0.44, 0.52, 0.06); add(g, rbox(0.86, 0.14, 0.62, 0.06, 3), m, 0.44, 0.52, 0.06);
  for (const x of [-0.9, 0.9]) for (const z of [-0.38, 0.38]) add(g, cy(0.025, 0.02, 0.06, 8), M.metalDark, x, 0.03, z);
  return g;
}

export function makeArcade() {
  const g = new THREE.Group();
  const side = new THREE.MeshStandardMaterial({ color: 0x1a0a30, roughness: 0.5 });
  add(g, rbox(0.75, 1.8, 0.8, 0.02), side, 0, 0.9, 0);
  add(g, rbox(0.7, 0.2, 0.35, 0.02), M.blackPlastic, 0, 1.0, 0.35, { rx: 0.35 });
  const scr = add(g, pl(0.56, 0.44), M.screenOff, 0, 1.4, 0.36, { rx: -0.25, cast: false });
  add(g, bx(0.7, 0.18, 0.04), labelMat(T.neonCanvas('ARCADE', '#ff3fa4', { w: 512, h: 128, size: 90 })), 0, 1.75, 0.4, { cast: false });
  for (let i = 0; i < 6; i++) add(g, cy(0.02, 0.02, 0.02, 10), [M.ledRed, M.ledCyan, M.ledGreen][i % 3], -0.1 + (i % 3) * 0.08, 1.08, 0.45 + Math.floor(i / 3) * 0.05, { cast: false });
  add(g, cy(0.008, 0.008, 0.06, 8), M.chrome, -0.22, 1.1, 0.45);
  add(g, sph(0.02, 10, 8), M.ledRed, -0.22, 1.14, 0.45);
  add(g, bx(0.02, 1.6, 0.01), M.ledPink, 0.375, 0.9, 0.39, { cast: false }); add(g, bx(0.02, 1.6, 0.01), M.ledPink, -0.375, 0.9, 0.39, { cast: false });
  g.userData.screen = scr;
  return g;
}

export function makeVending() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc41f26, roughness: 0.35, metalness: 0.3 });
  add(g, rbox(1.0, 1.95, 0.55, 0.02), red, 0, 0.975, -0.125);
  add(g, rbox(0.08, 1.95, 0.27, 0.01), red, -0.46, 0.975, 0.27); add(g, rbox(0.26, 1.95, 0.27, 0.01), red, 0.37, 0.975, 0.27);
  add(g, rbox(1.0, 0.4, 0.27, 0.01), red, 0, 1.75, 0.27); add(g, rbox(1.0, 0.42, 0.27, 0.01), red, 0, 0.21, 0.27);
  add(g, bx(0.66, 1.15, 0.01), M.fridgeLight, -0.09, 0.99, 0.16, { cast: false });
  for (let r = 0; r < 4; r++) { add(g, bx(0.66, 0.012, 0.22), M.metal, -0.09, 0.47 + r * 0.27, 0.27, { cast: false }); for (let c = 0; c < 4; c++) { const can = makeCan(r + c); can.position.set(-0.33 + c * 0.16, 0.54 + r * 0.27, 0.28); g.add(can); } }
  add(g, bx(0.68, 1.16, 0.015), M.glass, -0.09, 0.99, 0.4, { cast: false });
  add(g, bx(0.2, 0.5, 0.02), M.blackPlastic, 0.37, 1.3, 0.41);
  add(g, pl(0.14, 0.06), new THREE.MeshStandardMaterial({ emissive: 0xff3030, emissiveIntensity: 2, color: 0 }), 0.37, 1.45, 0.421, { cast: false });
  add(g, bx(0.6, 0.12, 0.05), M.blackPlastic, -0.09, 0.25, 0.41);
  add(g, bx(0.96, 0.2, 0.02), labelMat(T.signCanvas([{ text: 'FIZZ COLA', size: 64 }], { w: 512, h: 128, bg: '#c41f26', accent: '#fff', border: false })), 0, 1.85, 0.411, { cast: false });
  return g;
}

export function makeCoffeeMachine() {
  const g = new THREE.Group();
  add(g, rbox(0.34, 0.45, 0.38, 0.02), M.metal, 0, 0.225, 0);
  add(g, rbox(0.3, 0.08, 0.3, 0.02), M.blackPlastic, 0, 0.47, 0);
  add(g, bx(0.22, 0.12, 0.08), M.blackPlastic, 0, 0.26, 0.17);
  add(g, rbox(0.22, 0.02, 0.12, 0.005), M.chrome, 0, 0.04, 0.17);
  add(g, pl(0.14, 0.05), new THREE.MeshStandardMaterial({ emissive: 0x35f2ff, emissiveIntensity: 1.5, color: 0 }), 0, 0.38, 0.191, { cast: false });
  return g;
}

export function makeWaterCooler() {
  const g = new THREE.Group();
  add(g, rbox(0.32, 1.0, 0.32, 0.02), M.whitePlastic, 0, 0.5, 0);
  add(g, cy(0.15, 0.15, 0.4, 20), new THREE.MeshPhysicalMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, roughness: 0.05 }), 0, 1.22, 0, { cast: false });
  add(g, sph(0.15, 20, 10), new THREE.MeshPhysicalMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, roughness: 0.05 }), 0, 1.42, 0, { sy: 0.4, cast: false });
  add(g, bx(0.04, 0.03, 0.03), M.ledRed, -0.05, 0.75, 0.17, { cast: false }); add(g, bx(0.04, 0.03, 0.03), M.ledCyan, 0.05, 0.75, 0.17, { cast: false });
  return g;
}

export function makeAC() {
  const g = new THREE.Group();
  add(g, rbox(1.0, 0.3, 0.24, 0.05, 3), M.whitePlastic, 0, 0, 0);
  for (let i = 0; i < 6; i++) add(g, bx(0.9, 0.006, 0.03), M.greyPlastic, 0, -0.12 + 0, 0.1 + 0 * i, { rx: 0.4 }).position.set(0, -0.12, 0.08 + i * 0.0);
  add(g, pl(0.1, 0.03), new THREE.MeshStandardMaterial({ emissive: 0x35f2ff, emissiveIntensity: 2, color: 0 }), 0.35, 0.06, 0.121, { cast: false });
  const flap = add(g, bx(0.9, 0.006, 0.06), M.greyPlastic, 0, -0.13, 0.1);
  g.userData.flap = flap;
  return g;
}

export function makeSpeaker() {
  const g = new THREE.Group();
  add(g, rbox(0.3, 0.45, 0.28, 0.02), M.blackPlastic, 0, 0, 0);
  add(g, cy(0.1, 0.1, 0.02, 24), M.rubber, 0, -0.06, 0.14, { rx: Math.PI / 2 });
  add(g, cy(0.04, 0.04, 0.02, 16), M.rubber, 0, 0.13, 0.14, { rx: Math.PI / 2 });
  const cone = add(g, cy(0.05, 0.08, 0.02, 20), M.greyPlastic, 0, -0.06, 0.15, { rx: Math.PI / 2 });
  g.userData.cone = cone;
  return g;
}

export function makeCeilingPanel(w = 1.2, d = 0.6) {
  const g = new THREE.Group();
  add(g, rbox(w + 0.04, 0.04, d + 0.04, 0.01), M.whitePlastic, 0, 0, 0, { cast: false });
  const p = add(g, pl(w, d), M.lightPanel, 0, -0.021, 0, { rx: Math.PI / 2, cast: false });
  g.userData.panel = p;
  return g;
}

export function makePendant() {
  const g = new THREE.Group();
  add(g, cy(0.003, 0.003, 0.9, 4), M.blackPlastic, 0, -0.45, 0, { cast: false });
  add(g, cy(0.06, 0.2, 0.18, 24, true), M.metalDark, 0, -0.95, 0, { cast: false });
  const bulb = add(g, sph(0.05, 12, 10), M.ledWarm, 0, -1.0, 0, { cast: false });
  g.userData.bulb = bulb;
  return g;
}

export function makeBed() {
  const g = new THREE.Group();
  add(g, rbox(1.1, 0.3, 2.05, 0.02), M.deskWood, 0, 0.15, 0);
  add(g, rbox(1.05, 0.22, 1.95, 0.08, 3), M.mattress, 0, 0.41, 0);
  add(g, rbox(1.08, 0.08, 1.3, 0.04, 3), M.blanket, 0, 0.53, 0.3);
  add(g, rbox(0.6, 0.12, 0.35, 0.06, 3), M.whitePlastic, 0, 0.58, -0.72);
  add(g, rbox(1.1, 0.8, 0.06, 0.02), M.deskWood, 0, 0.55, -1.02);
  return g;
}

export function makeToilet() {
  const g = new THREE.Group();
  add(g, cy(0.2, 0.15, 0.4, 24), M.porcelain, 0, 0.2, 0, { sz: 1.3 });
  add(g, new THREE.TorusGeometry(0.17, 0.035, 10, 24), M.porcelain, 0, 0.42, 0.02, { rx: Math.PI / 2, sx: 1, sy: 1.25 });
  add(g, rbox(0.42, 0.38, 0.18, 0.03), M.porcelain, 0, 0.62, -0.25);
  add(g, rbox(0.06, 0.02, 0.03, 0.005), M.chrome, 0.15, 0.78, -0.2);
  return g;
}

export function makeFuseBox() {
  const g = new THREE.Group();
  add(g, rbox(0.5, 0.65, 0.14, 0.01), new THREE.MeshStandardMaterial({ color: 0x8a8f93, metalness: 0.6, roughness: 0.45 }), 0, 0, 0);
  const lever = add(g, rbox(0.05, 0.16, 0.05, 0.01), M.redPaint, 0.15, 0.05, 0.1);
  add(g, pl(0.28, 0.14), labelMat(T.signCanvas([{ text: '⚡ DANGER', size: 64, color: '#111' }, { text: 'HIGH VOLTAGE', size: 34, color: '#111' }], { w: 256, h: 128, bg: '#ffd21f', accent: '#111' })), -0.06, 0.15, 0.072, { cast: false });
  const led = add(g, sph(0.015, 8, 6), M.ledGreen, -0.15, -0.2, 0.075, { cast: false });
  g.userData.lever = lever; g.userData.led = led;
  return g;
}

export function makeDoor() {
  // glass double-action door, pivot at hinge (x=0), extends +x
  const g = new THREE.Group();
  const leaf = new THREE.Group(); g.add(leaf);
  add(leaf, rbox(0.06, 2.3, 0.05, 0.01), M.trim, 0.03, 1.15, 0);
  add(leaf, rbox(0.06, 2.3, 0.05, 0.01), M.trim, 1.47, 1.15, 0);
  add(leaf, rbox(1.5, 0.1, 0.05, 0.01), M.trim, 0.75, 0.05, 0);
  add(leaf, rbox(1.5, 0.08, 0.05, 0.01), M.trim, 0.75, 2.26, 0);
  add(leaf, bx(1.38, 2.12, 0.012), M.glass, 0.75, 1.16, 0, { cast: false });
  add(leaf, cy(0.015, 0.015, 1.2, 10), M.chrome, 1.3, 1.1, 0.07, { rz: 0 });
  add(leaf, cy(0.015, 0.015, 1.2, 10), M.chrome, 1.3, 1.1, -0.07, { rz: 0 });
  const sign = add(leaf, pl(0.42, 0.22), labelMat(T.signCanvas([{ text: 'OPEN', size: 110, color: '#30ff90' }], { w: 256, h: 128, bg: '#0a0a0a', accent: '#30ff90' })), 0.75, 1.55, 0.03, { cast: false });
  sign.material.emissive = new THREE.Color(0xffffff); sign.material.emissiveMap = sign.material.map; sign.material.emissiveIntensity = 1.4;
  g.userData.leaf = leaf; g.userData.sign = sign;
  return g;
}

export function makeStreetLamp() {
  const g = new THREE.Group();
  add(g, cy(0.07, 0.1, 5.5, 12), M.metalDark, 0, 2.75, 0);
  add(g, rbox(0.12, 0.08, 1.4, 0.02), M.metalDark, 0, 5.5, 0.65);
  add(g, rbox(0.3, 0.1, 0.6, 0.03), M.metalDark, 0, 5.45, 1.3);
  const bulb = add(g, bx(0.24, 0.02, 0.5), M.ledWarm, 0, 5.39, 1.3, { cast: false });
  g.userData.bulb = bulb;
  return g;
}

const CAR_COLORS = [0xb01020, 0x1d3f8a, 0xe8e8e8, 0x111111, 0x3a6b3a, 0xd4a017, 0x6a6e75];
export function makeCar(seed = 0) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: CAR_COLORS[seed % CAR_COLORS.length], metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const van = seed % 4 === 3;
  if (van) {
    add(g, rbox(4.8, 1.6, 1.9, 0.15, 3), paint, 0, 1.15, 0);
    add(g, rbox(1.2, 0.8, 1.86, 0.1, 3), M.glassDark, 1.75, 1.45, 0);
  } else {
    add(g, rbox(4.3, 0.7, 1.8, 0.18, 3), paint, 0, 0.7, 0);
    add(g, rbox(2.2, 0.6, 1.6, 0.25, 3), paint, -0.2, 1.25, 0);
    add(g, rbox(2.0, 0.5, 1.64, 0.2, 3), M.glassDark, -0.2, 1.27, 0);
  }
  for (const x of [-1.35, 1.35]) for (const z of [-0.85, 0.85]) {
    add(g, cy(0.34, 0.34, 0.24, 20), M.rubber, x, 0.34, z, { rx: Math.PI / 2 });
    add(g, cy(0.22, 0.22, 0.25, 12), M.chrome, x, 0.34, z, { rx: Math.PI / 2 });
  }
  const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 4 });
  const tl = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 3 });
  add(g, rbox(0.06, 0.12, 0.35, 0.02), hl, 2.16 + (van ? 0.25 : 0), 0.8, 0.6, { cast: false }); add(g, rbox(0.06, 0.12, 0.35, 0.02), hl, 2.16 + (van ? 0.25 : 0), 0.8, -0.6, { cast: false });
  add(g, rbox(0.06, 0.12, 0.35, 0.02), tl, -2.16 - (van ? 0.25 : 0), 0.85, 0.6, { cast: false }); add(g, rbox(0.06, 0.12, 0.35, 0.02), tl, -2.16 - (van ? 0.25 : 0), 0.85, -0.6, { cast: false });
  g.userData.hl = hl; g.userData.tl = tl;
  return g;
}

export function makePigeon() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x7a7f88, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.8 });
  const neck = new THREE.MeshStandardMaterial({ color: 0x4f7a6a, roughness: 0.5, metalness: 0.3 });
  add(g, sph(0.1, 14, 10), grey, 0, 0, 0, { sx: 0.8, sy: 0.75, sz: 1.3 });
  add(g, sph(0.06, 12, 10), neck, 0, 0.07, 0.1);
  add(g, sph(0.05, 12, 10), dark, 0, 0.12, 0.13);
  add(g, bx(0.015, 0.015, 0.04), new THREE.MeshStandardMaterial({ color: 0xd0a060 }), 0, 0.11, 0.18);
  add(g, sph(0.008, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0x401000 }), 0.03, 0.13, 0.16); add(g, sph(0.008, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0x401000 }), -0.03, 0.13, 0.16);
  const wl = new THREE.Group(); wl.position.set(0.06, 0.03, 0); g.add(wl);
  add(wl, bx(0.22, 0.01, 0.12), dark, 0.11, 0, -0.01);
  const wr = new THREE.Group(); wr.position.set(-0.06, 0.03, 0); g.add(wr);
  add(wr, bx(0.22, 0.01, 0.12), dark, -0.11, 0, -0.01);
  add(g, bx(0.08, 0.01, 0.1), dark, 0, 0.0, -0.15, { rx: 0.3 });
  g.userData.wl = wl; g.userData.wr = wr;
  return g;
}

export function makeCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xd88a3a, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf0e8dc, roughness: 0.9 });
  const body = new THREE.Group(); g.add(body);
  add(body, sph(0.12, 16, 12), fur, 0, 0.22, 0, { sx: 0.8, sz: 1.7 });
  const head = new THREE.Group(); head.position.set(0, 0.32, 0.22); body.add(head);
  add(head, sph(0.085, 16, 12), fur, 0, 0, 0);
  add(head, sph(0.05, 10, 8), white, 0, -0.03, 0.05, { sz: 0.8 });
  const earGeo = new THREE.ConeGeometry(0.03, 0.06, 4);
  add(head, earGeo, fur, 0.045, 0.08, 0); add(head, earGeo, fur, -0.045, 0.08, 0);
  add(head, sph(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9cff40, emissive: 0x2a5010, roughness: 0.2 }), 0.032, 0.015, 0.075); add(head, sph(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9cff40, emissive: 0x2a5010, roughness: 0.2 }), -0.032, 0.015, 0.075);
  const legs = [];
  for (const [x, z] of [[0.05, 0.12], [-0.05, 0.12], [0.05, -0.12], [-0.05, -0.12]]) { const l = add(body, cy(0.022, 0.018, 0.18, 8), fur, x, 0.09, z); legs.push(l); }
  const tail = add(body, cy(0.015, 0.02, 0.3, 8), fur, 0, 0.32, -0.28, { rx: -0.6 });
  g.userData.legs = legs; g.userData.tail = tail; g.userData.head = head;
  return g;
}

export function makeDiscoBall() {
  const g = new THREE.Group();
  add(g, cy(0.004, 0.004, 0.6, 4), M.chrome, 0, 0.3, 0);
  const ball = add(g, new THREE.IcosahedronGeometry(0.25, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, flatShading: true, envMapIntensity: 3 }), 0, 0, 0);
  g.userData.ball = ball;
  return g;
}

export function makeClock() {
  const g = new THREE.Group();
  add(g, cy(0.22, 0.22, 0.04, 40), M.blackPlastic, 0, 0, 0, { rx: Math.PI / 2 });
  add(g, new THREE.CircleGeometry(0.2, 40), labelMat(T.clockFaceCanvas(), { rough: 0.6 }), 0, 0, 0.021, { cast: false });
  add(g, cy(0.21, 0.21, 0.005, 40), M.glass, 0, 0, 0.025, { rx: Math.PI / 2, cast: false });
  const hh = new THREE.Group(); hh.position.z = 0.023; g.add(hh); add(hh, bx(0.012, 0.11, 0.004), M.blackPlastic, 0, 0.045, 0, { cast: false });
  const mh = new THREE.Group(); mh.position.z = 0.025; g.add(mh); add(mh, bx(0.008, 0.16, 0.004), M.blackPlastic, 0, 0.07, 0, { cast: false });
  g.userData.hh = hh; g.userData.mh = mh;
  return g;
}

export function makePoster(i) {
  const g = new THREE.Group();
  add(g, rbox(0.66, 0.92, 0.025, 0.006), M.trim, 0, 0, 0);
  add(g, pl(0.6, 0.86), labelMat(T.posterCanvas(i), { rough: 0.35 }), 0, 0, 0.0135, { cast: false });
  return g;
}

export function makeNeon(text, color, w = 2.4, h = 0.6) {
  const g = new THREE.Group();
  const c = T.neonCanvas(text, color);
  const t = T.tex(c, {});
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, color: new THREE.Color(color).multiplyScalar(0).addScalar(1), toneMapped: false, depthWrite: false });
  m.color.setScalar(1.6);
  add(g, pl(w, h), m, 0, 0, 0.02, { cast: false, recv: false });
  add(g, rbox(w * 0.98, h * 0.7, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3, transparent: true, opacity: 0.6 }), 0, 0, 0, { cast: false });
  g.userData.mat = m;
  return g;
}

export function makeTV() {
  const g = new THREE.Group();
  add(g, rbox(1.3, 0.76, 0.05, 0.01), M.blackPlastic, 0, 0, 0);
  const screen = add(g, pl(1.26, 0.71), M.screenOff, 0, 0, 0.0255, { cast: false });
  add(g, rbox(0.3, 0.2, 0.1, 0.01), M.metalDark, 0, 0, -0.07);
  g.userData.screen = screen;
  return g;
}

export function makeCamera() {
  const g = new THREE.Group();
  add(g, rbox(0.06, 0.06, 0.18, 0.01), M.whitePlastic, 0, 0, 0.09);
  add(g, cy(0.025, 0.025, 0.02, 12), M.blackPlastic, 0, 0, 0.185, { rx: Math.PI / 2 });
  add(g, sph(0.008, 6, 6), M.ledRed, 0.02, 0.025, 0.17, { cast: false });
  add(g, cy(0.01, 0.01, 0.1, 6), M.whitePlastic, 0, 0.05, 0);
  return g;
}

export function makeBanana() {
  // banana costume worn over the body (attached to spine)
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffdf2a, roughness: 0.55 });
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.7, 0.05), new THREE.Vector3(0, -0.3, 0.12), new THREE.Vector3(0, 0.2, 0.12), new THREE.Vector3(0, 0.6, 0.02), new THREE.Vector3(0, 0.8, -0.1)]);
  const geo = new THREE.TubeGeometry(curve, 24, 0.26, 16, false);
  const pos = geo.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const t = (v.y + 0.7) / 1.5; const s = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.75 + 0.25; v.x *= s; v.z = (v.z - 0.05) * s + 0.05; pos.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  add(g, geo, yellow, 0, 0, 0);
  add(g, cy(0.03, 0.05, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x5a3a10, roughness: 0.9 }), 0, 0.86, -0.12, { rx: -0.6 });
  return g;
}

// Merge all static child meshes of a group by material (cuts draw calls massively).
export function bakeGroup(group, keep = () => false) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(); const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || keep(o) || Array.isArray(o.material)) return;
    const g0 = o.geometry; if (!g0.attributes.position || !g0.attributes.normal || !g0.attributes.uv) return;
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g); remove.push(o);
  });
  remove.forEach((o) => o.parent.remove(o));
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat); m.castShadow = b.cast; m.receiveShadow = true; group.add(m);
  }
  return group;
}
export function noSmallShadows(root, minR = 0.12) {
  root.traverse((o) => { if (o.isMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sc = o.scale ? Math.max(o.scale.x, o.scale.y, o.scale.z) : 1; if (o.geometry.boundingSphere.radius * sc < minR) o.castShadow = false; } });
}
