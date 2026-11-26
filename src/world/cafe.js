import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, labelMat } from './materials.js';
import * as B from './builders.js';
import * as T from './textures.js';
import { Screen } from './screens.js';

export const H = 3.4; // ceiling height

// Station slot layout. Local frame: desk front edge at origin, customer sits at +z facing -z.
export function makeSlots() {
  const s = [];
  const leftZ = [4.0, 2.4, 0.8, -0.8, -2.4, -4.0];
  leftZ.forEach((z, i) => s.push({ id: s.length, x: -7.2, z, rotY: Math.PI / 2, vip: false, row: 'L', order: i }));
  const isZ = [3.0, 1.4, -0.2, -1.8];
  isZ.forEach((z, i) => { s.push({ id: s.length, x: -3.25, z, rotY: -Math.PI / 2, vip: false, row: 'A', order: 6 + i * 2 }); s.push({ id: s.length, x: -1.75, z, rotY: Math.PI / 2, vip: false, row: 'B', order: 7 + i * 2 }); });
  [-7.0, -5.3, -3.6, -1.9, -0.2].forEach((x, i) => s.push({ id: s.length, x, z: -10.75, rotY: 0, vip: true, row: 'V', order: 14 + i }));
  for (const sl of s) {
    const c = Math.cos(sl.rotY), sn = Math.sin(sl.rotY);
    const toW = (lx, lz) => new THREE.Vector3(sl.x + lx * c + lz * sn, 0, sl.z - lx * sn + lz * c);
    sl.toWorld = toW;
    sl.chairPos = toW(0, 0.48);
    sl.approach = toW(0.0, 1.05);
    sl.deskCenter = toW(0, -0.38);
    sl.faceYaw = sl.rotY + Math.PI; // NPC yaw so that model +z faces desk (-local z)
  }
  return s.sort((a, b) => a.order - b.order);
}

export class World {
  constructor(scene, physics) {
    this.scene = scene; this.physics = physics;
    this.colliders = [];      // {minX,maxX,minZ,maxZ,minY,maxY, nav:true, player:true}
    this.interactables = [];
    this.animated = [];       // callbacks(dt, t)
    this.lights = { interior: [], panels: [], street: [], neon: [] };
    this.screens = [];
    this.slots = makeSlots();
    this.power = true;
    this.time = 0;
    this.disco = false;
    this.staticGroup = new THREE.Group(); scene.add(this.staticGroup);
    this.dynGroup = new THREE.Group(); scene.add(this.dynGroup);
    this.hitGroup = new THREE.Group(); scene.add(this.hitGroup);
    this.vipOpen = false;
    this.upgradeObjs = {};
  }

  // ---------- helpers ----------
  collider(minX, maxX, minZ, maxZ, minY = 0, maxY = H, o = {}) {
    const c = { minX, maxX, minZ, maxZ, minY, maxY, nav: o.nav ?? true, player: o.player ?? true, phys: o.phys ?? true, tag: o.tag || '' };
    this.colliders.push(c);
    if (c.phys) c.body = this.physics.addStaticBox((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2);
    return c;
  }
  removeCollider(c) { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); if (c.body) this.physics.removeBody(c.body); }
  // collider from a rotated local box (axis aligned after rotation multiples of 90°)
  colliderLocal(obj, cx, cz, hw, hd, y0, y1, o) {
    obj.updateMatrixWorld(true);
    const p1 = new THREE.Vector3(cx - hw, 0, cz - hd).applyMatrix4(obj.matrixWorld);
    const p2 = new THREE.Vector3(cx + hw, 0, cz + hd).applyMatrix4(obj.matrixWorld);
    return this.collider(Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), Math.min(p1.z, p2.z), Math.max(p1.z, p2.z), y0, y1, o);
  }
  hitbox(w, h, d, pos, rotY, ent) {
    const m = new THREE.Mesh(B.bx(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(pos); m.rotation.y = rotY || 0;
    m.userData.ent = ent; ent.hit = m;
    this.hitGroup.add(m); this.interactables.push(m);
    m.updateMatrixWorld(true);
    return m;
  }
  place(obj, x, y, z, ry = 0, parent) { obj.position.set(x, y, z); obj.rotation.y = ry; (parent || this.staticGroup).add(obj); return obj; }

  wallX(x0, x1, z, thick, mat, openings = [], h = H, y0 = 0, o = {}) {
    // wall running along x at plane z (center)
    const segs = [];
    const xs = [x0, ...openings.flatMap((op) => [op.a, op.b]), x1];
    for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.001) segs.push([xs[i], xs[i + 1], y0, y0 + h]);
    openings.forEach((op) => { if (op.y0 > y0) segs.push([op.a, op.b, y0, op.y0]); if (op.y1 < y0 + h) segs.push([op.a, op.b, op.y1, y0 + h]); });
    for (const [a, b, ya, yb] of segs) {
      const m = B.add(this.staticGroup, B.bx(b - a, yb - ya, thick), mat, (a + b) / 2, (ya + yb) / 2, z);
      m.userData.wall = true;
      if (o.collide !== false) this.collider(a, b, z - thick / 2, z + thick / 2, ya, yb);
    }
  }
  wallZ(z0, z1, x, thick, mat, openings = [], h = H, y0 = 0, o = {}) {
    const segs = [];
    const zs = [z0, ...openings.flatMap((op) => [op.a, op.b]), z1];
    for (let i = 0; i < zs.length; i += 2) if (zs[i + 1] - zs[i] > 0.001) segs.push([zs[i], zs[i + 1], y0, y0 + h]);
    openings.forEach((op) => { if (op.y0 > y0) segs.push([op.a, op.b, y0, op.y0]); if (op.y1 < y0 + h) segs.push([op.a, op.b, op.y1, y0 + h]); });
    for (const [a, b, ya, yb] of segs) {
      const m = B.add(this.staticGroup, B.bx(thick, yb - ya, b - a), mat, x, (ya + yb) / 2, (a + b) / 2);
      m.userData.wall = true;
      if (o.collide !== false) this.collider(x - thick / 2, x + thick / 2, a, b, ya, yb);
    }
  }
  floor(x0, x1, z0, z1, mat, y = 0) {
    const m = B.add(this.staticGroup, new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat, (x0 + x1) / 2, y, (z0 + z1) / 2, { rx: -Math.PI / 2, cast: false });
    const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 3, uv.getY(i) * (z1 - z0) / 3);
    return m;
  }
  ceiling(x0, x1, z0, z1) {
    const m = B.add(this.staticGroup, new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.ceiling, (x0 + x1) / 2, H, (z0 + z1) / 2, { rx: Math.PI / 2, cast: false });
    const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 16, uv.getY(i) * (z1 - z0) / 12);
    return m;
  }

  // ---------- build ----------
  build() {
    this.buildShell();
    this.buildInterior();
    this.buildExterior();
    this.buildLights();
    this.bakeStatic();
  }

  buildShell() {
    // floors
    const fw = this.floor(-8, 8, -6, 6, M.floorWood);
    fw.material = M.floorWood;
    M.floorWood.map.repeat.set(1, 1); M.floorWood.bumpMap.repeat.set(1, 1); M.floorWood.roughnessMap.repeat.set(1, 1);
    this.floor(-8, 1.5, -11.5, -6, M.carpet);
    this.floor(1.5, 8, -11.5, -6, M.floorTile);
    this.ceiling(-8, 8, -11.5, 6);
    // main hall walls
    const winA = { a: -7.4, b: -1.5, y0: 0.6, y1: 2.8 }, winB = { a: 1.5, b: 7.4, y0: 0.6, y1: 2.8 }, door = { a: -0.9, b: 0.9, y0: 0, y1: 2.45 };
    this.wallX(-8.2, 8.2, 6.1, 0.2, M.wall, [winA, door, winB]);
    this.wallZ(-11.7, 6.2, -8.1, 0.2, M.brick);
    this.wallZ(-11.7, 6.2, 8.1, 0.2, M.wallLight);
    // back wall of main hall with VIP opening and back door
    this.vipOpening = { a: -6, b: -1, y0: 0, y1: 2.8 };
    this.wallX(-8, 8, -6.1, 0.2, M.wall, [this.vipOpening, { a: 4.4, b: 5.6, y0: 0, y1: 2.3 }]);
    // VIP / back room
    this.wallX(-8.2, 8.2, -11.6, 0.2, M.wallAccent);
    this.wallZ(-11.5, -6.2, 1.5, 0.2, M.wallLight, [{ a: -7.4, b: -6.6, y0: 0, y1: 2.2 }]);
    // window frames + glass + sills
    for (const w of [winA, winB]) {
      const cx = (w.a + w.b) / 2, len = w.b - w.a;
      B.add(this.staticGroup, B.bx(len, 0.03, 0.02), M.glass, cx, 1.7, 6.1, { cast: false }).scale.set(1, (w.y1 - w.y0) / 0.03, 1);
      B.add(this.staticGroup, B.rbox(len + 0.1, 0.05, 0.35, 0.01), M.granite, cx, w.y0 - 0.02, 5.98);
      B.add(this.staticGroup, B.bx(len, 0.06, 0.08), M.trim, cx, w.y1, 6.1);
      B.add(this.staticGroup, B.bx(len, 0.06, 0.08), M.trim, cx, w.y0, 6.1);
      for (let k = 0; k <= 3; k++) B.add(this.staticGroup, B.bx(0.06, w.y1 - w.y0, 0.08), M.trim, w.a + (len * k) / 3, (w.y0 + w.y1) / 2, 6.1);
      // window vinyl lettering
      const vin = labelMat(T.signCanvas([{ text: 'FAST PCs · COLD DRINKS · NO LAG', size: 40, color: '#ffffff' }], { w: 1024, h: 128, bg: 'rgba(0,0,0,0)', border: false }), { transparent: true });
      B.add(this.staticGroup, B.pl(3.2, 0.4), vin, cx, 2.5, 6.06, { ry: Math.PI, cast: false });
    }
    // baseboards
    B.add(this.staticGroup, B.bx(16, 0.1, 0.02), M.baseboard, 0, 0.05, -5.99, { cast: false });
    B.add(this.staticGroup, B.bx(0.02, 0.1, 12), M.baseboard, 7.99, 0.05, 0, { cast: false });
    // ceiling ducts & cable trays (industrial look)
    for (const z of [-3.2, 3.2]) {
      B.add(this.staticGroup, B.cy(0.15, 0.15, 15.6, 24), M.metal, 0, 3.15, z, { rz: Math.PI / 2 });
      for (let x = -7; x <= 7; x += 2) B.add(this.staticGroup, B.cy(0.16, 0.16, 0.04, 24), M.metalDark, x, 3.15, z, { rz: Math.PI / 2 });
      for (let x = -6; x <= 6; x += 4) B.add(this.staticGroup, B.cy(0.01, 0.01, 0.2, 4), M.metalDark, x, 3.3, z, {});
    }
    B.add(this.staticGroup, B.bx(0.3, 0.05, 11.6), M.metalDark, -5.0, 3.2, 0.1, { cast: false });
    B.add(this.staticGroup, B.cy(0.02, 0.02, 11.6, 6), M.rgb, -5.0, 3.16, 0.1, { rx: Math.PI / 2, cast: false });
    // temporary plywood wall closing VIP area
    const ply = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.9, map: T.tex(T.woodGrainSet(0xc8a878, 5).map) });
    this.vipBlock = new THREE.Group(); this.scene.add(this.vipBlock);
    for (let i = 0; i < 5; i++) {
      const p = B.add(this.vipBlock, B.bx(0.98, 2.78, 0.04), ply, -5.5 + i, 1.39, -6.05);
      p.userData.plank = true;
    }
    const tape = labelMat(T.signCanvas([{ text: 'VIP LOUNGE', size: 70, color: '#111' }, { text: 'COMING SOON · LVL 6', size: 36, color: '#111' }], { w: 512, h: 256, bg: '#ffd21f', accent: '#111' }));
    B.add(this.vipBlock, B.pl(1.6, 0.8), tape, -3.5, 1.5, -6.02, { cast: false });
    this.vipCollider = this.collider(-6, -1, -6.12, -5.98, 0, 2.8, { tag: 'vip' });
  }

  buildInterior() {
    const S = this.staticGroup;
    // ---- counter area ----
    const counter = B.makeCounter(4.3); this.place(counter, 5.75, 0, 2.0, 0);
    this.collider(3.55, 7.95, 1.6, 2.45, 0, 1.05);
    const reg = B.makeRegister(); this.place(reg, 5.0, 1.05, 1.95, Math.PI, this.dynGroup);
    this.register = reg;
    this.hitbox(0.5, 0.4, 0.5, new THREE.Vector3(5.0, 1.2, 1.95), 0, { type: 'register' });
    const tip = B.makeTipJar(); this.place(tip, 4.25, 1.05, 2.2, 0, this.dynGroup); this.tipJar = tip;
    const lap = B.makeLaptop(); this.place(lap, 6.3, 1.05, 1.9, Math.PI, this.dynGroup);
    this.adminScreen = new Screen(lap.userData.screen, { intensity: 1.4 }); this.adminScreen.setMode('admin'); this.screens.push(this.adminScreen);
    this.hitbox(0.5, 0.4, 0.4, new THREE.Vector3(6.3, 1.2, 1.9), 0, { type: 'admin' });
    // radio (music before sound system upgrade)
    const radio = new THREE.Group();
    B.add(radio, B.rbox(0.3, 0.16, 0.1, 0.02), M.redPaint, 0, 0.08, 0); B.add(radio, B.cy(0.05, 0.05, 0.01, 16), M.blackPlastic, -0.07, 0.08, 0.051, { rx: Math.PI / 2 }); B.add(radio, B.cy(0.05, 0.05, 0.01, 16), M.blackPlastic, 0.07, 0.08, 0.051, { rx: Math.PI / 2 }); B.add(radio, B.cy(0.003, 0.003, 0.25, 4), M.chrome, 0.12, 0.26, 0, { rz: 0.3 });
    this.place(radio, 7.4, 1.05, 2.1, Math.PI + 0.3, this.dynGroup);
    this.hitbox(0.35, 0.25, 0.2, new THREE.Vector3(7.4, 1.15, 2.1), 0, { type: 'radio' });
    this.radio = radio;
    // service bell
    const bell = new THREE.Group(); B.add(bell, B.cy(0.05, 0.05, 0.01, 16), M.blackPlastic, 0, 0.005, 0); B.add(bell, B.sph(0.04, 16, 8), M.chrome, 0, 0.012, 0, { sy: 0.7 });
    this.place(bell, 3.85, 1.05, 2.25, 0, this.dynGroup);

    // fridge + snacks (right wall, face -x)
    const fridge = B.makeFridge(); this.place(fridge, 7.55, 0, 0.3, -Math.PI / 2);
    this.fridge = fridge;
    this.collider(7.15, 8.0, -0.12, 0.72, 0, 2.0);
    this.hitbox(0.5, 1.8, 0.8, new THREE.Vector3(7.1, 1.0, 0.3), 0, { type: 'fridge' });
    const shelf = B.makeSnackShelf(); this.place(shelf, 7.7, 0, -1.8, -Math.PI / 2);
    this.shelf = shelf;
    this.collider(7.45, 8.0, -2.62, -0.98, 0, 1.9);
    this.hitbox(0.5, 1.7, 1.6, new THREE.Vector3(7.35, 0.95, -1.8), 0, { type: 'shelf' });
    // menu board above counter (prices are live-updated)
    const menuMesh = B.add(this.dynGroup, B.pl(1.4, 0.7), M.screenOff, 7.97, 2.78, -1.6, { ry: -Math.PI / 2, cast: false }); menuMesh.userData.noBake = true;
    this.menuScreen = new Screen(menuMesh, { w: 512, h: 256, intensity: 1.0 });
    this.menuScreen.d_menu = (c, w, h) => {
      c.fillStyle = '#0b0f18'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#35f2ff'; c.font = '900 34px Arial'; c.textAlign = 'left'; c.fillText('PING PALACE MENU', 24, 46);
      const items = this.menuScreen.state.items || [];
      c.font = '700 26px Arial';
      items.forEach((it, i) => { c.fillStyle = '#fff'; c.fillText(it[0], 24, 96 + i * 38); c.fillStyle = '#ffd34d'; c.textAlign = 'right'; c.fillText(it[1], w - 24, 96 + i * 38); c.textAlign = 'left'; });
    };
    this.menuScreen.setMode('menu'); this.screens.push(this.menuScreen);

    // TV with news on right wall near entrance
    const tv = B.makeTV(); this.place(tv, 7.93, 2.35, 4.0, -Math.PI / 2, this.dynGroup);
    this.tvScreen = new Screen(tv.userData.screen, { w: 512, h: 288, intensity: 1.3 }); this.tvScreen.setMode('news'); this.screens.push(this.tvScreen);

    // ---- lobby ----
    const sofa = B.makeSofa(); this.place(sofa, 1.6, 0, -4.9, 0);
    this.collider(0.6, 2.6, -5.4, -4.45, 0, 0.75);
    this.sofaSeats = [new THREE.Vector3(1.15, 0, -4.75), new THREE.Vector3(2.05, 0, -4.75)];
    const table = new THREE.Group(); B.add(table, B.rbox(1.0, 0.04, 0.5, 0.01), M.glassTint, 0, 0.42, 0); B.add(table, B.rbox(0.9, 0.02, 0.4, 0.005), M.deskWood, 0, 0.12, 0);
    for (const [x, z] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) B.add(table, B.cy(0.015, 0.015, 0.42, 8), M.chrome, x, 0.21, z);
    this.place(table, 1.6, 0, -3.8, 0);
    this.collider(1.1, 2.1, -4.05, -3.55, 0, 0.45);
    this.place(B.makePlant(0), 7.4, 0, 5.4); this.collider(7.2, 7.6, 5.2, 5.6, 0, 1);
    this.place(B.makePlant(1), -7.5, 0, 5.5); this.collider(-7.7, -7.3, 5.3, 5.7, 0, 1);
    this.place(B.makePlant(0), 3.1, 0, -5.5); this.collider(2.9, 3.3, -5.7, -5.3, 0, 1);
    const cooler = B.makeWaterCooler(); this.place(cooler, 1.6, 0, 5.6, Math.PI); this.collider(1.4, 1.8, 5.4, 5.8, 0, 1.5);
    this.hitbox(0.4, 1.4, 0.4, new THREE.Vector3(1.6, 0.7, 5.6), 0, { type: 'cooler' });
    // clock
    this.clock = B.makeClock(); this.place(this.clock, 1.6, 2.5, -5.98, 0, this.dynGroup);
    // posters
    const posterSpots = [[-7.97, 2.15, 3.2, Math.PI / 2], [-7.97, 2.15, 0.0, Math.PI / 2], [-7.97, 2.15, -3.2, Math.PI / 2], [3.0, 2.0, -5.97, 0], [-0.3, 2.0, -5.97, 0], [7.97, 2.0, -3.9, -Math.PI / 2]];
    posterSpots.forEach((p, i) => this.place(B.makePoster(i), p[0], p[1], p[2], p[3]));
    // neon sign (back wall)
    const neon = B.makeNeon('PING PALACE', '#35f2ff', 2.6, 0.65); this.place(neon, -3.5, 2.95, -5.97, 0, this.dynGroup); this.lights.neon.push(neon);
    const neon2 = B.makeNeon('GG', '#ff3fa4', 0.9, 0.5); this.place(neon2, 5.0, 2.7, -5.97, 0, this.dynGroup); this.lights.neon.push(neon2);
    const neon3 = B.makeNeon('NO RAGE QUITTING', '#ffd34d', 2.4, 0.4); this.place(neon3, -7.96, 2.85, 0.8, Math.PI / 2, this.dynGroup); this.lights.neon.push(neon3);
    // wifi sign on counter front
    const wifi = labelMat(T.signCanvas([{ text: 'FREE WiFi', size: 46, color: '#35f2ff' }, { text: 'pass: ilovelag', size: 34 }], { w: 512, h: 256, bg: '#0b0f18', accent: '#35f2ff' }));
    B.add(S, B.pl(0.6, 0.3), wifi, 4.6, 0.7, 2.335, { cast: false });
    const rules = labelMat(T.signCanvas([{ text: 'HOUSE RULES', size: 34, color: '#ff3fa4' }, { text: '1. No fighting', size: 24 }, { text: '2. Seriously, no fighting', size: 24 }, { text: '3. The owner WILL punch you', size: 24 }], { w: 512, h: 320, bg: '#101010', accent: '#ff3fa4' }));
    B.add(S, B.pl(0.8, 0.5), rules, 7.97, 1.7, 4.0 - 1.6, { ry: -Math.PI / 2, cast: false });
    // bins
    this.bins = [];
    for (const [x, z] of [[3.25, 2.75], [-5.2, 5.55], [-5.2, -5.6], [0.9, -7.0]]) {
      const b = B.makeBin(); this.place(b, x, 0, z, 0, this.dynGroup);
      const col = this.collider(x - 0.22, x + 0.22, z - 0.22, z + 0.22, 0, 0.62, { phys: false });
      this.bins.push({ obj: b, pos: new THREE.Vector3(x, 0, z), fill: 0, col });
      this.hitbox(0.5, 0.7, 0.5, new THREE.Vector3(x, 0.35, z), 0, { type: 'bin', bin: this.bins[this.bins.length - 1] });
      // physics: open bin (walls only) so trash can fall in
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; this.physics.addStaticBox(x + Math.cos(a) * 0.21, 0.31, z + Math.sin(a) * 0.21, 0.02, 0.31, 0.11, -a + Math.PI / 2); }
    }
    // fuse box, extinguisher & mop spots
    const fuse = B.makeFuseBox(); this.place(fuse, 7.92, 1.5, -4.6, -Math.PI / 2, this.dynGroup); this.fuseBox = fuse;
    this.hitbox(0.2, 0.7, 0.55, new THREE.Vector3(7.85, 1.5, -4.6), 0, { type: 'fuse' });
    this.extinguisherSpot = new THREE.Vector3(7.85, 0, -3.6);
    this.mopSpot = new THREE.Vector3(6.4, 0, -5.75);
    // security camera (upgrade visual)
    const cam = B.makeCamera(); this.place(cam, 7.8, 3.25, 5.8, -Math.PI * 0.75, this.dynGroup); cam.visible = false; this.upgradeObjs.camera = cam;
    // AC (upgrade)
    const ac = B.makeAC(); this.place(ac, 7.85, 2.9, -1.0, -Math.PI / 2, this.dynGroup); ac.visible = false; this.upgradeObjs.ac = ac;
    // speakers (upgrade)
    const spk = []; for (const [x, z, r] of [[-7.75, 5.7, Math.PI * 0.75], [7.75, -5.7, -Math.PI * 0.25], [-7.75, -5.7, Math.PI * 0.25], [7.75, 5.7, -Math.PI * 0.75]]) { const s = B.makeSpeaker(); this.place(s, x, 3.0, z, r, this.dynGroup); s.rotation.x = 0.25; s.visible = false; spk.push(s); }
    this.upgradeObjs.speakers = spk;
    // arcade, vending, coffee (upgrades)
    const arc = B.makeArcade(); this.place(arc, 3.3, 0, -4.7, -Math.PI / 2, this.dynGroup); arc.visible = false; this.upgradeObjs.arcade = arc;
    this.arcadeScreen = new Screen(arc.userData.screen, { intensity: 1.6 }); this.arcadeScreen.setMode('arcade');
    const ven = B.makeVending(); this.place(ven, 2.7, 0, 5.45, Math.PI, this.dynGroup); ven.visible = false; this.upgradeObjs.vending = ven;
    const cof = B.makeCoffeeMachine(); this.place(cof, 7.3, 1.05, 1.85, Math.PI, this.dynGroup); cof.visible = false; this.upgradeObjs.coffee = cof;
    // neon decor pack (upgrade)
    const dec = new THREE.Group(); this.dynGroup.add(dec); dec.visible = false; this.upgradeObjs.decor = dec;
    const n4 = B.makeNeon('LEVEL UP', '#4dff9a', 1.6, 0.45); n4.position.set(7.96, 2.9, -2.0); n4.rotation.y = -Math.PI / 2; dec.add(n4);
    const n5 = B.makeNeon('<3 GAMERS', '#ff3fa4', 1.6, 0.45); n5.position.set(4.0, 2.95, 5.98); n5.rotation.y = Math.PI; dec.add(n5);
    for (let i = 0; i < 4; i++) { const p = B.makePlant(i % 2); p.position.set(-6.0 + i * 1.6, 0, 5.6); p.scale.setScalar(0.7); dec.add(p); }
    for (let x = -7.8; x < 7.8; x += 0.5) B.add(dec, B.sph(0.025, 8, 6), [M.ledPink, M.ledCyan, M.ledWarm, M.ledGreen][Math.floor((x + 8) * 2) % 4], x, 3.25 + Math.sin(x * 2) * 0.05, 5.9, { cast: false });
    this.upgradeObjs.plants = [];
    // VIP decor
    const vipSofa = B.makeSofa(); this.place(vipSofa, -4.0, 0, -6.9, Math.PI);
    vipSofa.traverse((o) => { if (o.isMesh) o.material = M.leatherRed; });
    this.vipSofaCol = { minX: -5.0, maxX: -3.0, minZ: -7.35, maxZ: -6.45 };
    const vneon = B.makeNeon('VIP', '#ffd34d', 1.2, 0.5); this.place(vneon, -3.6, 2.7, -11.48, 0, this.dynGroup); this.lights.neon.push(vneon);
    this.place(B.makePlant(1), 1.0, 0, -11.1);
    // ---- back room ----
    const bed = B.makeBed(); this.place(bed, 7.3, 0, -9.9, 0);
    this.collider(6.75, 7.85, -10.95, -8.85, 0, 0.6);
    this.hitbox(1.1, 0.7, 2.0, new THREE.Vector3(7.3, 0.4, -9.9), 0, { type: 'bed' });
    const toilet = B.makeToilet(); this.place(toilet, 2.3, 0, -11.1, 0); this.toilet = toilet;
    this.collider(2.05, 2.55, -11.45, -10.8, 0, 0.8);
    this.hitbox(0.6, 0.9, 0.8, new THREE.Vector3(2.3, 0.45, -11.0), 0, { type: 'toilet' });
    this.toiletSpot = new THREE.Vector3(2.3, 0, -10.35);
    // toilet stall partition
    B.add(S, B.bx(0.04, 2.0, 1.6), M.whitePlastic, 3.1, 1.0, -10.7); this.collider(3.08, 3.12, -11.5, -9.9, 0, 2.0);
    const shelves = new THREE.Group();
    for (let i = 0; i < 4; i++) B.add(shelves, B.rbox(1.6, 0.03, 0.45, 0.005), M.metal, 0, 0.3 + i * 0.5, 0);
    for (const x of [-0.78, 0.78]) B.add(shelves, B.bx(0.03, 1.9, 0.45), M.metalDark, x, 0.95, 0);
    for (let i = 0; i < 6; i++) { const bxo = B.makeBoxItem(0.4, 0.3, 0.35); bxo.position.set(-0.5 + (i % 3) * 0.5, 0.48 + Math.floor(i / 3) * 0.5, 0); shelves.add(bxo); }
    this.place(shelves, 5.0, 0, -11.15, 0); this.collider(4.2, 5.8, -11.4, -10.9, 0, 2);
    B.add(S, B.rbox(0.9, 1.9, 0.55, 0.01), M.deskWood, 7.6, 0.95, -7.0, { ry: -Math.PI / 2 }); this.collider(7.3, 8.0, -7.45, -6.55, 0, 1.9);
    const lamp = B.makePendant(); this.place(lamp, 5.0, H, -8.8, 0, this.dynGroup);
    const poster = B.makePoster(4); this.place(poster, 6.0, 1.8, -11.47, 0);
  }

  buildExterior() {
    const S = this.staticGroup;
    // ground
    const side = B.add(S, new THREE.PlaneGeometry(90, 3.8), M.sidewalk, 0, 0.0, 8.1, { rx: -Math.PI / 2, cast: false });
    B.add(S, B.bx(90, 0.15, 0.25), M.concrete, 0, 0.0, 10.05, { cast: false });
    B.add(S, new THREE.PlaneGeometry(90, 8), M.asphalt, 0, -0.07, 14.1, { rx: -Math.PI / 2, cast: false });
    for (let x = -44; x < 44; x += 4) B.add(S, B.pl(2, 0.15), M.roadLine, x, -0.065, 14.1, { rx: -Math.PI / 2, cast: false });
    B.add(S, B.bx(90, 0.15, 0.25), M.concrete, 0, 0.0, 18.1, { cast: false });
    B.add(S, new THREE.PlaneGeometry(90, 4), M.sidewalk, 0, 0.0, 20.2, { rx: -Math.PI / 2, cast: false });
    B.add(S, new THREE.PlaneGeometry(200, 200), M.asphalt, 0, -0.2, 0, { rx: -Math.PI / 2, cast: false });
    // crosswalk
    for (let i = 0; i < 8; i++) B.add(S, B.pl(0.5, 7.6), M.roadLine, -14 + i * 0.9, -0.064, 14.1, { rx: -Math.PI / 2, cast: false });
    // cafe exterior facade above windows
    B.add(S, B.bx(16.8, 4.2, 0.3), M.brickExt, 0, H + 2.1, 6.35);
    B.add(S, B.bx(16.8, 0.6, 0.35), M.concrete, 0, 0.3 - 0.3, 6.38).scale.set(1, 0.5, 1);
    // awning
    const awn = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    B.add(S, B.bx(16.4, 0.08, 1.4), awn, 0, 3.25, 6.95, { rx: 0.15 });
    B.add(S, B.bx(16.4, 0.25, 0.03), new THREE.MeshStandardMaterial({ color: 0x35f2ff, emissive: 0x35f2ff, emissiveIntensity: 0.6 }), 0, 3.05, 7.63);
    // big outdoor neon
    const big = B.makeNeon('PING PALACE', '#ff3fa4', 5.5, 1.4); this.place(big, 0, 4.4, 6.52, 0, this.dynGroup); this.lights.neon.push(big);
    const sub = B.makeNeon('NET CAFÉ · 24 PCs · ENERGY DRINKS', '#35f2ff', 5.0, 0.5); this.place(sub, 0, 3.6, 6.52, 0, this.dynGroup); this.lights.neon.push(sub);
    // neighbours
    const neighbours = [[-17, 9, 8, 0x5a4a40, 'LAUNDRO-MAT', '#9cf'], [17, 9, 10, 0x40464f, 'NOODLE KING', '#ff9a3c'], [-30, 12, 7, 0x4a3a3a, 'PAWN & CO', '#ffd34d'], [30, 11, 9, 0x3a4a45, 'PHONE FIX', '#4dff9a']];
    neighbours.forEach(([x, w, h, col, name, ncol], i) => {
      const fac = new THREE.MeshStandardMaterial({ map: T.tex(T.facadeCanvas(40 + i, { cols: 4, rows: 3, base: '#' + new THREE.Color(col).getHexString() })), emissiveMap: T.tex(T.emissiveFromFacade(40 + i, { cols: 4, rows: 3 })), emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.9 });
      fac.userData.night = true; this.lights.street.push({ facade: fac });
      B.add(S, B.bx(w, h, 6), fac, x, h / 2, 9.3 - 3 - 0.05 - 3 + 3).position.set(x, h / 2, 3.1);
      B.add(S, B.bx(w - 1, 2.2, 0.1), M.glassDark, x, 1.4, 6.15);
      const n = B.makeNeon(name, ncol, Math.min(w - 1.5, 4), 0.7); this.place(n, x, 3.1, 6.25, 0, this.dynGroup); this.lights.neon.push(n);
    });
    // opposite buildings
    for (let i = 0; i < 7; i++) {
      const w = 9 + (i * 7) % 5, h = 9 + (i * 13) % 14, x = -36 + i * 12;
      const fac = new THREE.MeshStandardMaterial({ map: T.tex(T.facadeCanvas(i + 1, { cols: 5, rows: Math.max(3, Math.round(h / 3)) })), emissiveMap: T.tex(T.emissiveFromFacade(i + 1, { cols: 5, rows: Math.max(3, Math.round(h / 3)) })), emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.85 });
      this.lights.street.push({ facade: fac });
      B.add(S, B.bx(w, h, 8), fac, x, h / 2, 26.3, { cast: false });
      B.add(S, B.bx(w + 0.3, 0.5, 8.3), M.concrete, x, h + 0.25, 26.3, { cast: false });
    }
    // street lamps
    for (const x of [-14, -2.5, 9, 21]) {
      const l = B.makeStreetLamp(); this.place(l, x, 0, 9.6, Math.PI, this.dynGroup);
      // cheap fake light pool instead of a real spotlight (keeps the light count low)
      const pool = new THREE.Mesh(B.pl(7, 7), this.poolMat || (this.poolMat = new THREE.MeshBasicMaterial({ map: T.tex((() => { const c = T.makeCanvas(128, 128); const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,200,140,0.55)'); gr.addColorStop(0.5, 'rgba(255,180,110,0.18)'); gr.addColorStop(1, 'rgba(255,170,100,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return c; })()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.02, 8.2); this.scene.add(pool);
      this.lights.street.push({ pool, bulb: l.userData.bulb });
    }
    // trees on sidewalk
    for (const x of [-10, 4.5, 14]) {
      const tr = new THREE.Group();
      B.add(tr, B.cy(0.09, 0.14, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 }), 0, 1.6, 0);
      const fol = new THREE.MeshStandardMaterial({ color: 0x2e5a2a, roughness: 0.9 });
      for (let k = 0; k < 7; k++) B.add(tr, new THREE.IcosahedronGeometry(0.9 + (k % 3) * 0.2, 1), fol, Math.sin(k * 2.1) * 0.8, 3.4 + (k % 3) * 0.5, Math.cos(k * 2.1) * 0.7);
      B.add(tr, B.bx(1.2, 0.05, 1.2), M.metalDark, 0, 0.02, 0, { cast: false });
      this.place(tr, x, 0, 9.0);
      this.collider(x - 0.2, x + 0.2, 8.8, 9.2, 0, 3);
    }
    // bus stop bench, hydrant, bike
    const bench = new THREE.Group(); B.add(bench, B.rbox(1.8, 0.05, 0.45, 0.01), M.deskWood, 0, 0.45, 0); B.add(bench, B.rbox(1.8, 0.4, 0.05, 0.01), M.deskWood, 0, 0.75, -0.22); for (const x of [-0.8, 0.8]) B.add(bench, B.bx(0.05, 0.45, 0.4), M.metalDark, x, 0.22, 0);
    this.place(bench, -6.5, 0, 9.4, Math.PI); this.collider(-7.4, -5.6, 9.15, 9.65, 0, 0.5);
    const hyd = new THREE.Group(); B.add(hyd, B.cy(0.12, 0.14, 0.6, 14), M.redPaint, 0, 0.3, 0); B.add(hyd, B.sph(0.12, 12, 8), M.redPaint, 0, 0.62, 0, { sy: 0.7 }); B.add(hyd, B.cy(0.05, 0.05, 0.36, 8), M.redPaint, 0, 0.4, 0, { rz: Math.PI / 2 });
    this.place(hyd, 7.5, 0, 9.5); this.collider(7.35, 7.65, 9.35, 9.65, 0, 0.7);
    // invisible boundaries so the player stays near the cafe
    this.collider(-24, 24, 9.85, 10.0, 0, 3, { phys: false, nav: true });
    this.collider(-24.2, -24, 6, 10, 0, 3, { phys: false }); this.collider(24, 24.2, 6, 10, 0, 3, { phys: false });
    this.collider(-8.3, -8.2, 6, 6.4, 0, 3, { phys: false, nav: false });
    // neighbour fronts block sidewalk->building
    this.collider(-24, -8.2, 6.0, 6.3, 0, 8); this.collider(8.2, 24, 6.0, 6.3, 0, 8);
    // cars
    this.cars = [];
    for (let i = 0; i < 6; i++) {
      const car = B.makeCar(i); const lane = i % 2;
      car.position.set(-50 + i * 19, 0, lane ? 16.0 : 12.2); car.rotation.y = lane ? Math.PI : 0;
      this.dynGroup.add(car);
      this.cars.push({ obj: car, lane, speed: 7 + (i * 3) % 6 });
    }
    // door
    const door = B.makeDoor(); door.position.set(-0.75, 0, 6.1); door.scale.x = 1.0; this.dynGroup.add(door);
    door.userData.leaf.scale.x = 1.5 / 1.5;
    this.door = door; this.doorOpen = 0; this.doorTarget = 0;
  }

  buildLights() {
    const scene = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2a20, 0.35); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffeedd, 2.5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, 0);
    // ceiling panels + interior lights
    const panelPos = [[-5.2, 3.8], [-5.2, -0.4], [-5.2, -4.4], [-1.2, 3.8], [-1.2, -0.4], [-1.2, -4.4], [2.8, 3.8], [2.8, -0.4], [2.8, -4.4], [6.0, 0.0], [-4.5, -8.8], [-1.0, -8.8], [5.0, -8.8]];
    panelPos.forEach(([x, z]) => { const p = B.makeCeilingPanel(1.2, 0.6); this.place(p, x, H - 0.03, z, 0, this.dynGroup); this.lights.panels.push(p); });
    const mk = (x, y, z, int, dist, col = 0xfff0dc) => { const l = new THREE.PointLight(col, int, dist, 1.6); l.position.set(x, y, z); scene.add(l); this.lights.interior.push(l); l.userData.base = int; return l; };
    mk(-5.2, 2.9, 2.0, 9, 9); mk(-5.2, 2.9, -2.6, 9, 9); mk(-1.2, 2.9, 0.0, 9, 9); mk(3.2, 2.9, 1.8, 9, 9); mk(3.2, 2.9, -3.4, 7, 8);
    mk(-3.0, 2.9, -8.8, 7, 9, 0xffd8b0); mk(5.0, 2.4, -8.8, 5, 7, 0xffd0a0);
    // key spot lights with shadows
    const spot = (x, z, tx, tz) => { const s = new THREE.SpotLight(0xfff2e0, 40, 14, 1.15, 0.7, 1.5); s.position.set(x, H - 0.1, z); s.target.position.set(tx, 0, tz); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0006; s.shadow.normalBias = 0.04; s.shadow.camera.near = 0.3; scene.add(s); scene.add(s.target); this.lights.interior.push(s); s.userData.base = s.intensity; return s; };
    this.keySpots = [spot(-4.4, 1.5, -4.4, 0.8), spot(3.0, -1.0, 2.5, 0.0)];
    this.keySpots[1].castShadow = false;
    // neon accent fills
    const nf = new THREE.PointLight(0x35f2ff, 3, 6, 2); nf.position.set(-3.5, 2.6, -5.4); scene.add(nf); this.lights.interior.push(nf); nf.userData.base = 3; nf.userData.neon = true;
    const nf2 = new THREE.PointLight(0xff3fa4, 6, 8, 2); nf2.position.set(0, 3.6, 7.4); scene.add(nf2); this.lights.interior.push(nf2); nf2.userData.base = 6; nf2.userData.neon = true;
    // emergency light (power outage)
    this.emergency = new THREE.PointLight(0xff2010, 0, 12, 1.5); this.emergency.position.set(0, 3.0, 0); scene.add(this.emergency);
    // pooled monitor glow lights
    this.screenLights = [];
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0x9ab8ff, 0, 2.6, 2); scene.add(l); this.screenLights.push(l); }
  }

  setScreenLightCount(n) { this.screenLights.forEach((l, i) => { l.visible = i < n; }); this.screenLightCount = n; }

  // merge static meshes by material to save draw calls
  bakeStatic() {
    const groups = new Map();
    const toRemove = [];
    this.staticGroup.updateMatrixWorld(true);
    this.staticGroup.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noBake) return;
      const mat = o.material; if (Array.isArray(mat)) return;
      let g = o.geometry; if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
      g = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(o.matrixWorld);
      const key = mat.uuid + (o.castShadow ? 'c' : 'n');
      if (!groups.has(key)) groups.set(key, { mat, geos: [], cast: o.castShadow });
      groups.get(key).geos.push(g);
      toRemove.push(o);
    });
    for (const o of toRemove) o.parent.remove(o);
    for (const { mat, geos, cast } of groups.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat); m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false;
      this.staticGroup.add(m);
    }
    // remaining (groups) keep
    this.staticGroup.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  }

  // ---------- runtime ----------
  setPower(on) {
    this.power = on;
    for (const l of this.lights.interior) l.intensity = on ? l.userData.base : 0;
    for (const p of this.lights.panels) p.userData.panel.material = on ? M.lightPanel : M.screenOff;
    for (const n of this.lights.neon) n.visible = on;
    M.ledCyan.emissiveIntensity = on ? 3 : 0; M.ledPink.emissiveIntensity = on ? 3 : 0; M.rgb.emissiveIntensity = on ? 3.5 : 0; M.fridgeLight.emissiveIntensity = on ? 1.05 : 0;
    this.emergency.intensity = on ? 0 : 6;
    for (const s of this.screens) s.setPower(on);
  }

  openVIP() {
    if (this.vipOpen) return [];
    this.vipOpen = true;
    this.removeCollider(this.vipCollider);
    const planks = [];
    this.vipBlock.children.slice().forEach((p) => { if (p.userData.plank) planks.push(p); else p.parent.remove(p); });
    return planks;
  }

  setTimeOfDay(hours, skyFn) {
    // sun path: rises +x (6h), noon toward +z (street side), sets -x (20h)
    const dayT = (hours - 6) / 14; // 0..1 over daylight
    const el = Math.sin(Math.max(0, Math.min(1, dayT)) * Math.PI);
    const az = Math.PI * (dayT); // 0 -> +x, pi -> -x
    const dir = new THREE.Vector3(Math.cos(az), Math.max(0.08, el * 1.1), Math.sin(az) * 0.9 + 0.35).normalize();
    this.sun.position.copy(dir).multiplyScalar(40);
    const day = THREE.MathUtils.clamp((el - 0.02) / 0.25, 0, 1);
    const warm = 1 - THREE.MathUtils.clamp((el - 0.05) / 0.4, 0, 1);
    this.sun.intensity = day * 4.2 + (1 - day) * 0.25;
    this.sun.color.setRGB(1, 0.92 - warm * 0.35, 0.85 - warm * 0.55);
    if (day < 0.05) this.sun.color.setRGB(0.6, 0.7, 1.0);
    this.hemi.intensity = 0.15 + day * 0.4;
    this.hemi.color.setRGB(0.6 + day * 0.15, 0.7 + day * 0.15, 0.95);
    this.daylight = day;
    const night = 1 - day;
    for (const s of this.lights.street) {
      if (s.facade) s.facade.emissiveIntensity = night * 1.2;
      if (s.pool) { this.poolMat.opacity = night; s.bulb.material = night > 0.3 ? M.ledWarm : M.whitePlastic; }
    }
    for (const c of this.cars) { c.obj.userData.hl.emissiveIntensity = 0.3 + night * 4; c.obj.userData.tl.emissiveIntensity = 0.5 + night * 3; }
    if (skyFn) skyFn(hours, day, warm);
  }

  update(dt, t, ctx) {
    this.time = t;
    // RGB hue cycling
    const hue = (t * 0.08) % 1;
    if (this.power) M.rgb.emissive.setHSL(hue, 1, 0.5);
    // neon flicker
    for (let i = 0; i < this.lights.neon.length; i++) {
      const n = this.lights.neon[i];
      if (!n.userData.mat) continue;
      const f = (Math.sin(t * 37 + i * 13) > 0.995 || (i === 2 && Math.sin(t * 3.1) > 0.97)) ? 0.3 : 1.6;
      n.userData.mat.color.setScalar(this.disco ? 1.5 + Math.sin(t * 8 + i) : f);
    }
    // disco lights
    if (this.disco) {
      this.lights.interior.forEach((l, i) => { if (l.isPointLight || l.isSpotLight) l.color.setHSL((t * 0.5 + i * 0.17) % 1, 1, 0.55); });
    }
    // door
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 6);
    this.door.userData.leaf.rotation.y = -this.doorOpen * 1.45;
    this.doorTarget = 0;
    // cars
    for (const c of this.cars) {
      const dir = c.lane ? -1 : 1;
      c.obj.position.x += dir * c.speed * dt;
      if (c.obj.position.x > 55) c.obj.position.x = -55; if (c.obj.position.x < -55) c.obj.position.x = 55;
    }
    // clock hands follow game time
    if (ctx && ctx.hours !== undefined) {
      const h = ctx.hours % 12, m = (ctx.hours * 60) % 60;
      this.clock.userData.hh.rotation.z = -h / 12 * Math.PI * 2;
      this.clock.userData.mh.rotation.z = -m / 60 * Math.PI * 2;
    }
    // AC flap
    if (this.upgradeObjs.ac.visible) this.upgradeObjs.ac.userData.flap.rotation.x = 0.4 + Math.sin(t * 0.5) * 0.3;
    // speaker cones bump with music
    if (this.upgradeObjs.speakers[0].visible) { const s = 1 + Math.max(0, Math.sin(t * 8.6)) * 0.08; this.upgradeObjs.speakers.forEach((sp) => sp.userData.cone.scale.set(s, 1, s)); }
    for (const a of this.animated) a(dt, t);
  }

  // let NPCs/player request door opening when near
  nudgeDoor(pos) {
    if (Math.abs(pos.x) < 1.6 && pos.z > 4.6 && pos.z < 7.6) this.doorTarget = 1;
  }
}
