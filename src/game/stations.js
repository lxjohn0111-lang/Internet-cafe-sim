import * as THREE from 'three';
import * as B from '../world/builders.js';
import { M } from '../world/materials.js';
import { Screen } from '../world/screens.js';

export const PC_TIERS = [
  null,
  { name: 'Potato PC', mult: 1.0, desc: 'Beige box, CRT screen, smells like 2003.', breakChance: 1.0 },
  { name: 'Office Pro', mult: 1.45, desc: 'Flat screen and a fan that mostly works.', breakChance: 0.7 },
  { name: 'Gamer RGB', mult: 2.1, desc: 'Glass panel, RGB everything, +10 FPS from lighting alone.', breakChance: 0.45 },
  { name: 'Titan X', mult: 3.2, desc: 'Curved ultrawide, liquid cooling, can run your fridge.', breakChance: 0.25 },
];
export const CHAIR_TIERS = [null, { name: 'Plastic chair', sat: 0 }, { name: 'Office chair', sat: 8 }, { name: 'Racing chair', sat: 16 }];

export class Station {
  constructor(game, slot, data) {
    this.game = game; this.slot = slot;
    this.tier = data.tier || 1; this.chairTier = data.chair || 1;
    this.broken = !!data.broken; this.fire = null; this.occupant = null; this.reserved = null; this.haunted = false;
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z); this.group.rotation.y = slot.rotY;
    game.scene.add(this.group);
    this.base = B.makeStationBase(slot.vip, slot.id % 3 === 0 ? 1 : 0);
    this.group.add(this.base);
    game.scene.updateMatrixWorld(false); this.group.updateMatrixWorld(true);
    B.bakeGroup(this.base);
    this.parts = new THREE.Group(); this.group.add(this.parts);
    this.chairGroup = new THREE.Group(); this.group.add(this.chairGroup);
    this.buildParts(); this.buildChair();
    // world colliders: desk + divider
    const w = game.world;
    this.colliders = [w.colliderLocal(this.group, 0, -0.39, 0.74, 0.4, 0, 0.77, { tag: 'desk' })];
    this.colliders.push(w.colliderLocal(this.group, -0.7, -0.39, 0.03, 0.4, 0.77, 1.3, { nav: false, tag: 'divider' }));
    this.colliders.push(w.colliderLocal(this.group, 0, -0.77, 0.72, 0.03, 0.77, 1.25, { nav: false, tag: 'divider' }));
    this.hit = w.hitbox(1.4, 0.9, 0.75, slot.toWorld(0, -0.38).setY(1.1), slot.rotY, { type: 'station', station: this });
    this.chairOffset = new THREE.Vector3(0, 0, 0.62);
    this.chairYawOff = (Math.random() - 0.5) * 0.6;
    this.setChairSeated(false);
    this.dirt = 0;
    this.trash = [];
  }

  buildParts() {
    const p = this.parts; while (p.children.length) p.remove(p.children[0]);
    const t = this.tier;
    const top = 0.7575;
    const mon = B.makeMonitor(t); mon.position.set(0, top, -0.5); p.add(mon);
    this.monitor = mon;
    const big = t >= 3;
    const tower = B.makeTower(t);
    if (big) tower.position.set(0.5, top, -0.45); else tower.position.set(0.48, 0, -0.42);
    p.add(tower); this.tower = tower; this.fans = tower.userData.fans;
    const kb = B.makeKeyboard(t); kb.position.set(-0.05, top, -0.17); p.add(kb); this.keyboard = kb;
    const ms = B.makeMouse(t); ms.position.set(0.3, top, -0.17); p.add(ms); this.mouse = ms;
    if (t >= 2) { const hp = B.makeHeadphones(); hp.position.set(-0.5, top, -0.45); hp.rotation.set(-Math.PI / 2 + 0.1, 0, 0.3); hp.position.y += 0.03; p.add(hp); }
    if (t >= 3) { const can = B.makeCan(this.slot.id); can.position.set(-0.55, top + 0.055, -0.2); p.add(can); }
    B.noSmallShadows(p, 0.14);
    if (this.screen) this.game.screens.remove(this.screen);
    this.screen = new Screen(mon.userData.screen, { curved: !!mon.userData.curved, intensity: t === 1 ? 1.1 : 1.6 });
    this.game.screens.add(this.screen);
    this.refreshScreen();
  }

  buildChair() {
    const g = this.chairGroup; while (g.children.length) g.remove(g.children[0]);
    const c = B.makeChair(this.chairTier); g.add(c); this.chair = c;
  }

  setTier(t) { this.tier = t; this.buildParts(); this.game.fx.sparkle(this.slot.deskCenter.clone().setY(1.2), [0.4, 1, 1]); }
  setChairTier(t) { this.chairTier = t; this.buildChair(); this.setChairSeated(!!this.occupant && this.occupant.seated); }

  setChairSeated(seated) {
    if (seated) { this.chairGroup.position.set(0, 0, 0.5); this.chairGroup.rotation.y = 0; }
    else { this.chairGroup.position.set(0.05, 0, 0.75); this.chairGroup.rotation.y = this.chairYawOff; }
  }

  get available() { return !this.occupant && !this.reserved && !this.broken && !this.fire && this.game.world.power; }
  get world() { return this.game.world; }

  refreshScreen() {
    const s = this.screen; if (!s) return;
    if (this.fire) s.setMode('bsod');
    else if (this.broken) s.setMode('bsod');
    else if (this.haunted) s.setMode('haunted');
    else if (this.game.world.disco) s.setMode('disco');
    else if (this.occupant && this.occupant.seated) s.setMode(this.occupant.screenMode || 'shooter');
    else s.setMode('desktop');
  }

  breakPC() {
    if (this.broken) return;
    this.broken = true; this.refreshScreen();
    this.game.fx.sparks(this.tower.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 25);
    this.smokeT = 6;
  }
  repair() { this.broken = false; this.smokeT = 0; this.refreshScreen(); }

  update(dt, t) {
    const spin = this.broken || !this.game.world.power ? 0 : (this.occupant && this.occupant.seated ? 30 : 12);
    for (const f of this.fans) f.rotation.z += spin * dt;
    if (this.smokeT > 0) { this.smokeT -= dt; if (Math.random() < dt * 8) this.game.fx.smoke(this.tower.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.45, 0))); }
    if (this.fire) {
      this.fire.t += dt;
      const p = this.tower.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0));
      this.game.fx.fire(p, Math.min(2.5, this.fire.hp / 40 + 0.5));
      if (!this.fireLight) { this.fireLight = new THREE.PointLight(0xff6a20, 8, 6, 2); this.game.scene.add(this.fireLight); }
      this.fireLight.position.copy(p).add(new THREE.Vector3(0, 0.4, 0)); this.fireLight.intensity = 6 + Math.sin(t * 25) * 2 + Math.random() * 2;
    } else if (this.fireLight) { this.game.scene.remove(this.fireLight); this.fireLight.dispose(); this.fireLight = null; }
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.game.screens.remove(this.screen);
    for (const c of this.colliders) this.game.world.removeCollider(c);
    const w = this.game.world; w.hitGroup.remove(this.hit); const i = w.interactables.indexOf(this.hit); if (i >= 0) w.interactables.splice(i, 1);
  }
}

// translucent "build here" ghost for empty slots while carrying a station box
export function makeGhost(slot) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x35f2ff, transparent: true, opacity: 0.18, depthWrite: false });
  const e = new THREE.MeshBasicMaterial({ color: 0x35f2ff, transparent: true, opacity: 0.6, wireframe: true });
  B.add(g, B.bx(1.4, 0.75, 0.75), m, 0, 0.375, -0.375, { cast: false, recv: false });
  B.add(g, B.bx(1.4, 0.75, 0.75), e, 0, 0.375, -0.375, { cast: false, recv: false });
  B.add(g, B.bx(0.5, 0.35, 0.03), m, 0, 1.0, -0.5, { cast: false, recv: false });
  g.position.set(slot.x, 0, slot.z); g.rotation.y = slot.rotY;
  return g;
}
