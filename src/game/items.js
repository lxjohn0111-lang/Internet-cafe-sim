import * as THREE from 'three';
import { CANNON } from '../core/physics.js';
import * as B from '../world/builders.js';
import * as T from '../world/textures.js';
import { audio } from '../core/audio.js';

export const DEFS = {
  soda: { name: 'Soda', need: 'drink', make: () => B.makeCan(Math.floor(Math.random() * 5)), shape: () => new CANNON.Cylinder(0.033, 0.033, 0.11, 10), mass: 0.35, hold: [0.0, -0.17, -0.42], sound: 'can' },
  chips: { name: 'Chips', need: 'snack', make: () => B.makeChips(Math.floor(Math.random() * 4)), shape: () => new CANNON.Box(new CANNON.Vec3(0.07, 0.095, 0.025)), mass: 0.12, hold: [0.0, -0.17, -0.42] },
  coffee: { name: 'Coffee', need: 'coffee', make: () => B.makeCup(true), shape: () => new CANNON.Cylinder(0.042, 0.035, 0.12, 10), mass: 0.3, hold: [0.0, -0.17, -0.42] },
  pizza: { name: 'Pizza', need: 'food', make: () => B.makePizzaBox(), shape: () => new CANNON.Box(new CANNON.Vec3(0.18, 0.023, 0.18)), mass: 0.5, hold: [0.0, -0.22, -0.5] },
  trash_can: { name: 'Empty can', trash: true, make: () => B.makeCrushedCan(Math.floor(Math.random() * 5)), shape: () => new CANNON.Cylinder(0.034, 0.034, 0.05, 8), mass: 0.05, hold: [0.0, -0.17, -0.42], sound: 'can' },
  trash_wrap: { name: 'Wrapper', trash: true, make: () => B.makeWrapper(Math.floor(Math.random() * 4)), shape: () => new CANNON.Box(new CANNON.Vec3(0.06, 0.008, 0.045)), mass: 0.03, hold: [0.0, -0.17, -0.42] },
  trash_cup: { name: 'Old cup', trash: true, make: () => B.makeCup(false), shape: () => new CANNON.Cylinder(0.042, 0.035, 0.12, 10), mass: 0.05, hold: [0.0, -0.17, -0.42] },
  duck: { name: 'Rubber duck', trash: true, duck: true, make: () => B.makeDuck(), shape: () => new CANNON.Sphere(0.06), mass: 0.08, hold: [0.0, -0.17, -0.42], sound: 'squeak' },
  keyboard: { name: 'Keyboard', trash: true, make: () => B.makeKeyboard(2), shape: () => new CANNON.Box(new CANNON.Vec3(0.15, 0.015, 0.055)), mass: 0.6, hold: [0.0, -0.2, -0.45] },
  box_station: { name: 'PC Station kit', heavy: true, make: () => B.makeBoxItem(0.75, 0.55, 0.6, 'PC STATION'), shape: () => new CANNON.Box(new CANNON.Vec3(0.375, 0.275, 0.3)), mass: 8, hold: [0.0, -0.32, -0.75] },
  mop: { name: 'Mop', tool: 'mop', make: () => B.makeMop(), shape: () => new CANNON.Box(new CANNON.Vec3(0.05, 0.65, 0.05)), mass: 1, offsetY: 0.65 },
  extinguisher: { name: 'Fire extinguisher', tool: 'ext', make: () => B.makeExtinguisher(), shape: () => new CANNON.Cylinder(0.065, 0.065, 0.5, 10), mass: 4, offsetY: 0.25 },
};

let _uid = 0;
export class Item {
  constructor(mgr, kind, pos, opts = {}) {
    this.mgr = mgr; this.kind = kind; this.def = DEFS[kind]; this.id = ++_uid;
    this.inner = this.def.make();
    this.obj = new THREE.Group(); this.obj.add(this.inner);
    if (this.def.offsetY) this.inner.position.y = -this.def.offsetY;
    this.obj.position.copy(pos);
    if (opts.rotY) this.obj.rotation.y = opts.rotY;
    this.obj.traverse((o) => { o.userData.ent = { type: 'item', item: this }; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.state = 'world'; this.age = 0; this.thrownFrom = null; this.payload = opts.payload || null;
    mgr.scene.add(this.obj);
    if (!opts.static) this.addBody(opts.vel);
    else this.body = null;
  }
  addBody(vel) {
    this.body = this.mgr.physics.addProp(this.obj, this.def.shape(), this.def.mass, { angularDamping: 0.3 });
    if (vel) this.body.velocity.set(vel.x, vel.y, vel.z);
    this.body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.4) { audio.play(this.def.sound || (this.def.heavy ? 'thud' : 'clank'), { pos: this.obj.position, vol: Math.min(0.8, v / 6) }); if (this.kind === 'duck' && v > 2) audio.play('squeak', { pos: this.obj.position }); }
    });
  }
  removeBody() { if (this.body) { this.mgr.physics.removeProp(this.body); this.body = null; } }
}

export class ItemManager {
  constructor(game) {
    this.game = game; this.scene = game.scene; this.physics = game.physics;
    this.items = [];
    this.bills = []; this.decals = [];
    this.billMat = new THREE.MeshStandardMaterial({ map: T.tex(T.dollarCanvas()), side: THREE.DoubleSide, roughness: 0.8 });
  }
  spawn(kind, pos, opts) { const it = new Item(this, kind, pos, opts); this.items.push(it); return it; }
  remove(it) {
    it.removeBody();
    if (it.obj.parent) it.obj.parent.remove(it.obj);
    const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
    it.state = 'gone';
  }
  get trashCount() { return this.items.filter((i) => i.def.trash && i.state === 'world').length; }

  // money bills fluttering down (money-rain event)
  spawnBill(pos, value = 5) {
    const m = new THREE.Mesh(B.pl(0.15, 0.07), this.billMat); m.castShadow = true;
    m.position.copy(pos); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(m);
    this.bills.push({ m, value, vy: -0.6 - Math.random() * 0.4, ph: Math.random() * 6, landed: false, t: 0 });
  }

  addDecal(kind, pos, size = 0.9) {
    const col = kind === 'puddle' ? 'rgba(150,90,30,0.85)' : kind === 'water' ? 'rgba(120,160,200,0.7)' : 'rgba(235,235,225,0.95)';
    const mat = new THREE.MeshPhysicalMaterial({ map: T.tex(T.puddleCanvas(col)), transparent: true, roughness: kind === 'poop' ? 0.8 : 0.02, metalness: 0, clearcoat: kind === 'poop' ? 0 : 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(B.pl(size, size), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6; m.position.set(pos.x, 0.006 + this.decals.length * 0.0004, pos.z);
    m.receiveShadow = true;
    if (kind === 'poop') m.scale.setScalar(0.3);
    this.scene.add(m);
    const d = { kind, m, pos: m.position.clone(), r: size * (kind === 'poop' ? 0.15 : 0.45), clean: 0 };
    d.hit = this.game.world.hitbox(size * 0.8, 0.1, size * 0.8, new THREE.Vector3(pos.x, 0.05, pos.z), 0, { type: 'decal', decal: d });
    if (kind === 'poop') d.hit.scale.setScalar(0.4);
    this.decals.push(d);
    return d;
  }
  removeDecal(d) {
    this.scene.remove(d.m); d.m.material.dispose();
    const w = this.game.world; w.hitGroup.remove(d.hit); const i = w.interactables.indexOf(d.hit); if (i >= 0) w.interactables.splice(i, 1);
    const j = this.decals.indexOf(d); if (j >= 0) this.decals.splice(j, 1);
  }
  slipperyAt(p) { for (const d of this.decals) if (d.kind !== 'poop' && (d.pos.x - p.x) ** 2 + (d.pos.z - p.z) ** 2 < d.r * d.r) return d; return null; }

  update(dt) {
    const g = this.game;
    for (const it of this.items.slice()) {
      if (it.state !== 'world') continue;
      it.age += dt;
      const p = it.obj.position;
      if (p.y < -2) { this.remove(it); continue; }
      // bins
      if (it.def.trash) {
        for (const bin of g.world.bins) {
          const dx = p.x - bin.pos.x, dz = p.z - bin.pos.z;
          if (dx * dx + dz * dz < 0.19 * 0.19 && p.y < 0.66 && p.y > 0.02) { g.onTrashBinned(it, bin); break; }
        }
      }
    }
    // bills
    const pp = g.player.pos;
    for (let i = this.bills.length - 1; i >= 0; i--) {
      const b = this.bills[i]; b.t += dt;
      if (!b.landed) {
        b.ph += dt * 4; b.m.position.y += b.vy * dt; b.m.position.x += Math.sin(b.ph) * dt * 0.6; b.m.position.z += Math.cos(b.ph * 0.7) * dt * 0.6;
        b.m.rotation.x += dt * 3; b.m.rotation.z += dt * 2;
        if (b.m.position.y <= 0.01) { b.landed = true; b.m.position.y = 0.006; b.m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); }
      }
      const dx = b.m.position.x - pp.x, dz = b.m.position.z - pp.z;
      if (dx * dx + dz * dz < 0.9 * 0.9 && b.m.position.y < 1.6) { g.collectBill(b); this.scene.remove(b.m); this.bills.splice(i, 1); continue; }
      if (b.t > 60) { this.scene.remove(b.m); this.bills.splice(i, 1); }
    }
  }
}
