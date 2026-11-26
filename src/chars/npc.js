import * as THREE from 'three';
import { instantiate } from './models.js';
import { Ragdoll, DRIVEN } from './ragdoll.js';
import { audio } from '../core/audio.js';
import * as B from '../world/builders.js';
import { M } from '../world/materials.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const FIRST = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Quinn', 'Kai', 'Robin', 'Avery', 'Rowan', 'Skyler', 'Dana', 'Noel', 'Remy', 'Toni', 'Blake', 'Ezra', 'Milo', 'Nova', 'Zane', 'Ivy', 'Leo', 'Luna', 'Max', 'Finn', 'Ada'];
const TAGS = ['xX', 'Pro', 'Noob', 'Lagz', '360', 'GG', 'Tryhard', 'AFK', 'Clutch', 'Sweaty', 'Toxic', 'Chill', 'Turbo', 'Mega', 'Sir'];
export function randomName() { return FIRST[Math.floor(Math.random() * FIRST.length)]; }
export function gamerTag() { const t = TAGS[Math.floor(Math.random() * TAGS.length)]; const n = FIRST[Math.floor(Math.random() * FIRST.length)]; return Math.random() < 0.5 ? `${t}${n}${Math.floor(Math.random() * 99)}` : `${n}_${t}`; }

function accessoryMesh(kind) {
  const g = new THREE.Group();
  const col = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const randCol = () => new THREE.Color().setHSL(Math.random(), 0.6, 0.45);
  switch (kind) {
    case 'cap': { const m = col(randCol()); B.add(g, new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0, 0); B.add(g, B.cy(0.1, 0.1, 0.012, 18), m, 0, 0.004, 0.09, { sz: 1.0, sx: 1.0 }).scale.set(1, 1, 0.9); break; }
    case 'beanie': { const m = col(randCol(), 0.95); B.add(g, new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), m, 0, -0.01, 0, { sy: 1.15 }); B.add(g, B.sph(0.03, 8, 6), m, 0, 0.13, 0); break; }
    case 'headphones': { const m = col(Math.random() < 0.5 ? 0x111111 : randCol(), 0.4); B.add(g, new THREE.TorusGeometry(0.12, 0.012, 8, 24, Math.PI), m, 0, -0.02, 0); for (const x of [-0.12, 0.12]) B.add(g, B.cy(0.045, 0.045, 0.035, 16), m, x, -0.06, 0, { rz: Math.PI / 2 }); if (Math.random() < 0.5) for (const x of [-0.14, 0.14]) B.add(g, B.cy(0.03, 0.03, 0.006, 16), M.rgb, x, -0.06, 0, { rz: Math.PI / 2, cast: false }); break; }
    case 'glasses': { const m = col(0x111111, 0.3, 0.5); for (const x of [-0.035, 0.035]) B.add(g, new THREE.TorusGeometry(0.022, 0.004, 6, 16), m, x, 0, 0, {}); B.add(g, B.bx(0.02, 0.004, 0.004), m, 0, 0.004, 0); for (const x of [-0.035, 0.035]) B.add(g, B.pl(0.04, 0.04), new THREE.MeshPhysicalMaterial({ color: 0x223344, transparent: true, opacity: 0.4, roughness: 0.05 }), x, 0, 0.001, { cast: false }); break; }
    case 'shades': { const m = col(0x050505, 0.15, 0.6); B.add(g, B.rbox(0.13, 0.035, 0.01, 0.01), m, 0, 0, 0); break; }
    case 'party': { const m = col(randCol(), 0.5); B.add(g, new THREE.ConeGeometry(0.07, 0.2, 16), m, 0, 0.1, 0); B.add(g, B.sph(0.02, 8, 6), col(0xffffff), 0, 0.2, 0); break; }
    case 'crown': { const m = col(0xffc83a, 0.25, 1); B.add(g, B.cy(0.09, 0.09, 0.05, 20, true), m, 0, 0.02, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.add(g, new THREE.ConeGeometry(0.018, 0.05, 6), m, Math.cos(a) * 0.09, 0.065, Math.sin(a) * 0.09); } break; }
    case 'antennae': { const m = col(0x30ff60, 0.4); for (const x of [-0.05, 0.05]) { B.add(g, B.cy(0.006, 0.006, 0.18, 6), m, x, 0.09, 0, { rz: -x * 4 }); B.add(g, B.sph(0.025, 10, 8), M.ledGreen, x * 1.7, 0.18, 0, { cast: false }); } break; }
    case 'mohawk': { const m = col(0xff2050, 0.7); for (let i = 0; i < 7; i++) B.add(g, new THREE.ConeGeometry(0.018, 0.09, 6), m, 0, 0.03, -0.07 + i * 0.025, { rx: -0.2 + i * 0.06 }); break; }
    case 'backpack': { const m = col(randCol(), 0.8); B.add(g, B.rbox(0.28, 0.36, 0.14, 0.04, 3), m, 0, 0, 0); B.add(g, B.rbox(0.2, 0.14, 0.05, 0.02), m, 0, -0.06, -0.08); break; }
    case 'clipboard': { B.add(g, B.rbox(0.22, 0.3, 0.012, 0.004), col(0x8a5a2a), 0, 0, 0); B.add(g, B.pl(0.19, 0.25), M.paper, 0, -0.01, 0.007, { cast: false }); B.add(g, B.bx(0.08, 0.02, 0.02), M.metal, 0, 0.15, 0.008); break; }
    case 'banana': return B.makeBanana();
    case 'tophat': { const m = col(0x111111, 0.4); B.add(g, B.cy(0.085, 0.085, 0.18, 20), m, 0, 0.09, 0); B.add(g, B.cy(0.14, 0.14, 0.01, 24), m, 0, 0.005, 0); B.add(g, B.cy(0.087, 0.087, 0.03, 20), col(0xb01020), 0, 0.03, 0); break; }
    case 'halo': { B.add(g, new THREE.TorusGeometry(0.1, 0.012, 8, 24), M.ledWarm, 0, 0.12, 0, { rx: Math.PI / 2, cast: false }); break; }
  }
  return g;
}
const ACC_SPOT = {
  cap: ['Head', [0, 0.1, 0.01]], beanie: ['Head', [0, 0.1, 0]], headphones: ['Head', [0, 0.13, 0]], glasses: ['Head', [0, 0.06, 0.1]], shades: ['Head', [0, 0.06, 0.105]],
  party: ['Head', [0, 0.17, 0]], crown: ['Head', [0, 0.17, 0]], antennae: ['Head', [0, 0.15, 0]], mohawk: ['Head', [0, 0.15, -0.01]], tophat: ['Head', [0, 0.17, 0]], halo: ['Head', [0, 0.17, 0]],
  backpack: ['Spine2', [0, 0.02, -0.16]], clipboard: ['LeftHand', [0.02, -0.08, 0.06]], banana: ['Spine', [0, 0.05, 0]],
};

export class NPC {
  constructor(game, base, opts = {}) {
    this.game = game; this.base = base; this.opts = opts;
    this.kind = opts.kind || 'customer';
    this.id = NPC._id = (NPC._id || 0) + 1;
    this.name = opts.name || randomName();
    this.root = new THREE.Group(); game.scene.add(this.root);
    this.inner = new THREE.Group(); this.root.add(this.inner);
    const inst = instantiate(base);
    this.model = inst.model; this.bones = inst.bones; this.meshes = inst.meshes;
    this.inner.add(this.model);
    this.heightM = opts.height || (base.name === 'michelle' ? 1.66 : 1.76) + (Math.random() - 0.5) * 0.14;
    this.sizeK = this.heightM / 1.75;
    this.scale = this.heightM / base.height;
    this.inner.scale.setScalar(this.scale);
    this.inner.rotation.y = base.facesPosZ ? 0 : Math.PI;
    this.inner.position.y = -base.footY * this.scale;
    this.pitch = opts.pitch || (base.name === 'michelle' ? 210 + Math.random() * 50 : 115 + Math.random() * 50) / Math.sqrt(this.sizeK);
    if (opts.tint) this.tint(opts.tint);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {}; this.cur = null; this.layerAction = null;
    this.yaw = 0; this.vel = new THREE.Vector3(); this.speed = 1.35;
    this.path = null; this.pathI = 0; this.moving = false; this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.rag = null; this.blend = null; this.hits = 0; this.hp = opts.hp || 1;
    this.acc = [];
    // hitbox for interaction & punches
    const hb = new THREE.Mesh(new THREE.CapsuleGeometry(0.27 * this.sizeK, this.heightM - 0.54 * this.sizeK, 2, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hb.userData.ent = { type: 'npc', npc: this };
    this.hitbox = hb; game.world.hitGroup.add(hb); game.world.interactables.push(hb);
    this.kin = game.physics.addKinematic(0.25 * this.sizeK, this.heightM);
    this.bubble = null; this.sayT = 0; this.need = null;
    this.stepT = 0;
    this.play('idle', 0);
    this.root.updateMatrixWorld(true);
    (opts.accessories || []).forEach((a) => this.addAccessory(a));
    this.alive = true;
  }

  tint(c) {
    const col = new THREE.Color(c);
    for (const m of this.meshes) { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mm) => mm.color && mm.color.multiply(col)); }
  }
  setEmissive(c, k) { for (const m of this.meshes) { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mm) => { if (mm.emissive) { mm.emissive.set(c); mm.emissiveIntensity = k; } }); } }

  addAccessory(kind) {
    const spot = ACC_SPOT[kind]; if (!spot) return;
    const bone = this.bones[spot[0]]; if (!bone) return;
    const mesh = accessoryMesh(kind);
    this.root.updateMatrixWorld(true);
    const bq = bone.getWorldQuaternion(new THREE.Quaternion());
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const bs = bone.getWorldScale(new THREE.Vector3());
    const bp = bone.getWorldPosition(new THREE.Vector3());
    const off = new THREE.Vector3(...spot[1]).multiplyScalar(this.sizeK).applyQuaternion(rq);
    const target = bp.add(off);
    bone.add(mesh);
    mesh.position.copy(bone.worldToLocal(target));
    mesh.quaternion.copy(bq.invert().multiply(rq));
    mesh.scale.setScalar(this.sizeK / bs.x);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.acc.push(mesh);
    return mesh;
  }

  // ---------- animation ----------
  action(name) {
    if (this.actions[name]) return this.actions[name];
    const clip = this.base.clips[name]; if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    this.actions[name] = a; return a;
  }
  play(name, fade = 0.25, { once = false, speed = 1 } = {}) {
    const a = this.action(name); if (!a) return;
    if (this.cur === a) { a.timeScale = speed; return; }
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.cur && fade > 0) { a.play(); this.cur.crossFadeTo(a, fade, false); }
    else { if (this.cur) this.cur.stop(); a.play(); }
    this.cur = a; this.curName = name;
  }
  layer(name, weight = 6) {
    if (this.layerName === name) return;
    if (this.layerAction) { this.layerAction.fadeOut(0.2); }
    this.layerName = name; this.layerAction = null;
    if (!name) return;
    const a = this.action(name); if (!a) return;
    a.reset(); a.setEffectiveWeight(weight); a.fadeIn(0.2); a.play();
    this.layerAction = a;
  }

  // ---------- movement ----------
  get pos() { return this.rag ? this.rag.pelvisPos.clone().setY(0) : this.root.position; }
  setPos(p) { this.root.position.set(p.x, 0, p.z); }
  face(yaw) { this.yaw = yaw; this.root.rotation.y = yaw; }
  lookAt(p) { this.face(Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z)); }

  goTo(target, { run = false, speed } = {}) {
    const path = this.game.nav.findPath(this.root.position, target);
    this.path = path && path.length ? path : [target.clone()];
    this.pathI = 0; this.moving = true; this.run = run;
    this.speed = speed || (run ? 3.6 : 1.3 + Math.random() * 0.25) * Math.sqrt(this.sizeK) * (this.opts.speedMul || 1);
    this.stuckT = 0;
  }
  stop() { this.moving = false; this.path = null; }

  _move(dt) {
    if (!this.moving || !this.path) return false;
    const tgt = this.path[this.pathI];
    const p = this.root.position;
    const dx = tgt.x - p.x, dz = tgt.z - p.z; const d = Math.hypot(dx, dz);
    const last = this.pathI >= this.path.length - 1;
    if (d < (last ? 0.12 : 0.35)) {
      if (last) { this.moving = false; this.path = null; return true; }
      this.pathI++; return false;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 9);
    this.root.rotation.y = this.yaw;
    const align = Math.max(0.15, Math.cos(diff));
    let sp = this.speed * align * (last && d < 0.6 ? Math.max(0.35, d / 0.6) : 1);
    // separation from others
    let sx = 0, sz = 0;
    for (const o of this.game.npcs) {
      if (o === this || o.rag || o.seated) continue;
      const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z; const od = ox * ox + oz * oz;
      if (od < 0.36 && od > 1e-4) { const k = (0.6 - Math.sqrt(od)) * 2.5; sx += ox * k; sz += oz * k; }
    }
    const pl = this.game.player.pos; const px = p.x - pl.x, pz = p.z - pl.z; const pd = Math.hypot(px, pz);
    if (pd < 0.7 && !this.ignorePlayer) { sp *= 0.3; sx += (px / (pd + 1e-3)) * 0.8; sz += (pz / (pd + 1e-3)) * 0.8; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    p.x += (fx * sp + sx * 0.6) * dt; p.z += (fz * sp + sz * 0.6) * dt;
    this.curSpeed = sp;
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (p.distanceTo(this.lastPos) < 0.15) { this.pathI = Math.min(this.pathI + 1, this.path.length - 1); p.x += (Math.random() - 0.5) * 0.3; p.z += (Math.random() - 0.5) * 0.3; }
      this.lastPos.copy(p); this.stuckT = 0;
    }
    this.game.world.nudgeDoor(p);
    return false;
  }

  // ---------- ragdoll ----------
  knock(dir, power, hitPoint, part) {
    if (this.blend) this.blend = null;
    if (!this.rag) {
      this.seated = false;
      this.mixer.stopAllAction(); this.cur = null; this.curName = null; this.layerAction = null; this.layerName = null;
      this.root.updateMatrixWorld(true);
      this.rag = new Ragdoll(this.game.physics.world, this.bones, this.sizeK, {
        velocity: this.vel,
        onImpact: (v, p) => { audio.play('thud', { pos: p, vol: Math.min(1, v / 8), id: this.id }); if (v > 5 && this.game.fx) this.game.fx.dust(p); },
      });
      this.moving = false;
    }
    const pt = part || (hitPoint ? this.rag.nearestPart(hitPoint) : 'torso');
    this.rag.impulse(dir, power, pt);
    this.ragT = 0;
  }

  _endRagdoll() {
    const rag = this.rag;
    // snapshot world transforms of driven bones
    const snapQ = {}; DRIVEN.forEach((c) => { if (this.bones[c]) snapQ[c] = this.bones[c].getWorldQuaternion(new THREE.Quaternion()); });
    const hipsW = this.bones.Hips.getWorldPosition(new THREE.Vector3());
    const pp = rag.pelvisPos.clone();
    rag.dispose(); this.rag = null;
    // move root under the pelvis (stay on walkable ground)
    const np = this.game.nav.nearestWalkable(new THREE.Vector3(pp.x, 0, pp.z));
    this.root.position.set(np.x, 0, np.z);
    this.root.updateMatrixWorld(true);
    for (const c of DRIVEN) {
      const b = this.bones[c]; if (!b) continue;
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(snapQ[c]));
      if (c === 'Hips') { b.parent.updateWorldMatrix(true, false); b.position.copy(hipsW.clone().applyMatrix4(new THREE.Matrix4().copy(b.parent.matrixWorld).invert())); }
      b.updateMatrixWorld(true);
    }
    const from = {}; for (const c in this.bones) from[c] = this.bones[c].quaternion.clone();
    this.blend = { t: 0, dur: 0.75, from, hipsFrom: this.bones.Hips.position.clone() };
    this.play(this.afterRagdollAnim || 'idle', 0);
    if (this.onGetUp) this.onGetUp();
  }

  // ---------- speech ----------
  say(text, dur = 2.6, { shout = false, voice = true } = {}) {
    this.sayText = text; this.sayT = dur; this.sayShout = shout; this._bubDirty = true;
    if (voice) audio.play('babble', { pos: this.headPos(), pitch: this.pitch * (shout ? 1.25 : 1), syl: Math.min(9, 2 + Math.floor(text.length / 6)), vol: shout ? 0.8 : 0.45 });
  }
  setNeed(icon, patience = 1, color) { this.need = icon ? { icon, p: patience, color } : null; this._bubDirty = true; }
  headPos() { return this.bones.Head ? this.bones.Head.getWorldPosition(_v2) : _v2.copy(this.root.position).setY(1.7); }

  // ---------- main update ----------
  update(dt) {
    if (this.rag) {
      this.ragT += dt;
      this.rag.update(dt);
      const pp = this.rag.pelvisPos;
      this.hitbox.position.set(pp.x, Math.max(0.3, pp.y), pp.z);
      this.kin.position.set(pp.x, -5, pp.z);
      if (this.rag && this.rag.settled && !this.stayDown) this._endRagdoll();
    } else {
      const before = _v.copy(this.root.position);
      const bx = before.x, bz = before.z;
      const arrived = this._move(dt);
      if (arrived && this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); }
      const mvx = this.root.position.x - bx, mvz = this.root.position.z - bz;
      this.vel.set(mvx / Math.max(dt, 1e-4), 0, mvz / Math.max(dt, 1e-4));
      if (this.moving && !this.lockAnim) {
        const sp = this.curSpeed || 0;
        if (this.run || sp > 2.4) this.play('run', 0.2, { speed: Math.max(0.6, sp / 3.6 / this.sizeK) });
        else this.play('walk', 0.25, { speed: Math.max(0.5, sp / 1.35 / this.sizeK) });
        this.stepT -= dt * sp;
        if (this.stepT <= 0) { this.stepT = 0.7; audio.play('npcstep', { pos: this.root.position }); }
      } else if (!this.moving && !this.lockAnim && (this.curName === 'walk' || this.curName === 'run')) this.play(this.idleAnim || 'idle', 0.3);
      this.mixer.update(dt);
      if (this.blend) {
        const bl = this.blend; bl.t += dt; const k = Math.min(1, bl.t / bl.dur); const e = k * k * (3 - 2 * k);
        for (const c in bl.from) { const b = this.bones[c]; if (b) b.quaternion.slerpQuaternions(bl.from[c], b.quaternion, e); }
        this.bones.Hips.position.lerpVectors(bl.hipsFrom, this.bones.Hips.position, e);
        if (k >= 1) this.blend = null;
      }
      if (this.headScale) { const h = this.bones.Head; if (h) h.scale.setScalar(this.headScale); }
      this.hitbox.position.set(this.root.position.x, (this.seated ? 0.65 : this.heightM / 2) + (this.root.position.y || 0), this.root.position.z);
      this.kin.position.set(this.root.position.x, this.heightM / 2, this.root.position.z);
      this.kin.velocity.set(this.vel.x, 0, this.vel.z);
    }
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) { this.sayText = null; this._bubDirty = true; } }
  }

  dispose() {
    this.alive = false;
    if (this.rag) { this.rag.dispose(); this.rag = null; }
    this.mixer.stopAllAction();
    this.game.scene.remove(this.root);
    this.game.world.hitGroup.remove(this.hitbox);
    const i = this.game.world.interactables.indexOf(this.hitbox); if (i >= 0) this.game.world.interactables.splice(i, 1);
    this.game.physics.removeBody(this.kin);
    if (this.bubble) { this.bubble.remove(); this.bubble = null; }
    this.meshes.forEach((m) => { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mm) => mm.dispose()); });
  }
}
