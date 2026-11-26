import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { M } from '../world/materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const RAD = 0.3, HEIGHT = 1.75, EYE = 1.63, STEP = 0.42;

function makeArm(side) {
  // side: 1 right, -1 left. Arm group origin = wrist; sleeve extends back (+z)
  const g = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xc58c6c, roughness: 0.58, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x8a2a1a), sheenRoughness: 0.5, envMapIntensity: 0.5 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.95 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x0f141c, roughness: 0.7, emissive: 0x35f2ff, emissiveIntensity: 0.25 });
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.066, 0.6, 18), sleeve); s.rotation.x = Math.PI / 2; s.position.set(0, -0.005, 0.34); g.add(s);
  const c = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 20), cuff); c.position.set(0, -0.005, 0.045); g.add(c);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.07, 14), skin); wrist.rotation.x = Math.PI / 2; wrist.position.set(0, -0.005, 0.03); g.add(wrist);
  const hand = new THREE.Group(); hand.position.set(0, 0, -0.035); g.add(hand);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.082, 0.042, 0.088, 3, 0.017), skin); palm.position.set(0, 0, -0.03); hand.add(palm);
  const fingers = [];
  const lens = [[0.024, 0.02, 0.016], [0.027, 0.022, 0.018], [0.026, 0.021, 0.017], [0.021, 0.017, 0.014]];
  for (let i = 0; i < 4; i++) {
    const r = i === 3 ? 0.0095 : 0.0108;
    const f = new THREE.Group(); f.position.set(-0.03 + i * 0.02, 0.004, -0.072); hand.add(f);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), skin); f.add(knuckle);
    let parent = f; const joints = [];
    lens[i].forEach((L, k) => {
      const seg = new THREE.Group(); if (k > 0) seg.position.z = -lens[i][k - 1]; parent.add(seg);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - k * 0.08), L, 3, 10), skin); m.rotation.x = Math.PI / 2; m.position.z = -L / 2; seg.add(m);
      joints.push(seg); parent = seg;
    });
    fingers.push({ f, j: joints[1], j2: joints[2] });
  }
  const th = new THREE.Group(); th.position.set(-side * 0.0 + 0.044 * (side === 1 ? -1 : 1), -0.012, -0.035); th.rotation.set(0, side * -0.7, side * 0.4); hand.add(th);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.03, 3, 10), skin); t1.rotation.x = Math.PI / 2; t1.position.z = -0.02; th.add(t1);
  const tj = new THREE.Group(); tj.position.z = -0.038; th.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.022, 3, 10), skin); t2.rotation.x = Math.PI / 2; t2.position.z = -0.012; tj.add(t2);
  g.userData = { hand, fingers, thumb: th, thumbTip: tj, side, cuff };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
function setFist(arm, k) {
  // k: 0 open, 1 fist
  for (const { f, j, j2 } of arm.userData.fingers) { f.rotation.x = -1.45 * k - 0.12; j.rotation.x = -1.75 * k - 0.1; j2.rotation.x = -1.1 * k - 0.08; }
  arm.userData.thumb.rotation.x = -0.5 * k; arm.userData.thumbTip.rotation.x = -0.6 * k;
  arm.userData.thumb.rotation.y = arm.userData.side * (-0.7 + 0.9 * k);
}

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.03, 600);
    this.pos = new THREE.Vector3(5.4, 0, 0.6);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.82; this.pitch = -0.05;
    this.onGround = true; this.crouch = 0; this.bob = 0; this.bobAmt = 0; this.land = 0; this.trauma = 0;
    this.baseFov = 74; this.fov = 74;
    this.sens = 1; this.invert = false;
    this.held = null;
    this.punchT = 1; this.punchSide = 1; this.punchCd = 0; this.charge = 0; this.charging = false;
    this.interactT = 0; this.focus = null; this.holdProg = 0; this.holdKey = null;
    this.stepDist = 0; this.slip = 0;
    this.lowGrav = 0; this.speedBoost = 0;
    this.ray = new THREE.Raycaster(); this.ray.far = 2.5;
    // viewmodel
    const vm = this.vm = new THREE.Group(); game.viewScene.add(vm);
    this.armR = makeArm(1); this.armL = makeArm(-1); vm.add(this.armR); vm.add(this.armL);
    this.holdAnchor = new THREE.Group(); vm.add(this.holdAnchor);
    this.armRPose = { p: new THREE.Vector3(0.24, -0.25, -0.42), r: new THREE.Euler(0.15, -0.2, 0.15) };
    this.armLPose = { p: new THREE.Vector3(-0.24, -0.25, -0.42), r: new THREE.Euler(0.15, 0.2, -0.15) };
    this.armR.position.copy(this.armRPose.p); this.armL.position.copy(this.armLPose.p);
    setFist(this.armR, 0.6); setFist(this.armL, 0.6);
    this.sway = new THREE.Vector2();
    // view scene lights
    const hl = new THREE.HemisphereLight(0xdde8ff, 0x302820, 0.45); game.viewScene.add(hl);
    const dl = new THREE.DirectionalLight(0xfff2e0, 0.9); dl.position.set(0.5, 1, 0.3); game.viewScene.add(dl); game.viewScene.add(dl.target);
    this.vmLight = dl;
    this.flashlight = null;
  }

  get eye() { return _v2.set(this.pos.x, this.pos.y + EYE - this.crouch * 0.55, this.pos.z); }
  get forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  addTrauma(k) { this.trauma = Math.min(1, this.trauma + k); }

  // ---------- collisions ----------
  collide() {
    const p = this.pos; const cols = this.game.world.colliders;
    let ground = 0;
    const headY = p.y + HEIGHT - this.crouch * 0.55;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of cols) {
        if (!c.player) continue;
        if (c.maxY < p.y + 0.02 && iter === 0) { // potential ground
          if (p.x > c.minX - RAD * 0.6 && p.x < c.maxX + RAD * 0.6 && p.z > c.minZ - RAD * 0.6 && p.z < c.maxZ + RAD * 0.6) ground = Math.max(ground, c.maxY);
          continue;
        }
        if (c.minY > headY || c.maxY < p.y + 0.02) continue;
        if (c.maxY <= p.y + STEP && this.onGround) { // step up
          if (p.x > c.minX - RAD * 0.5 && p.x < c.maxX + RAD * 0.5 && p.z > c.minZ - RAD * 0.5 && p.z < c.maxZ + RAD * 0.5) { ground = Math.max(ground, c.maxY); }
          continue;
        }
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 < RAD * RAD) {
          if (d2 < 1e-8) { // inside: push out along smallest axis
            const l = p.x - c.minX, r = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z; const m = Math.min(l, r, b, f);
            if (m === l) p.x = c.minX - RAD; else if (m === r) p.x = c.maxX + RAD; else if (m === b) p.z = c.minZ - RAD; else p.z = c.maxZ + RAD;
          } else {
            const d = Math.sqrt(d2); const push = RAD - d; dx /= d; dz /= d; p.x += dx * push; p.z += dz * push;
            const vn = this.vel.x * dx + this.vel.z * dz; if (vn < 0) { this.vel.x -= vn * dx; this.vel.z -= vn * dz; }
          }
        }
      }
    }
    // NPCs push the player
    for (const n of this.game.npcs) {
      if (n.rag) continue;
      const np = n.root.position; const dx = p.x - np.x, dz = p.z - np.z; const d2 = dx * dx + dz * dz; const r = RAD + 0.25 * n.sizeK;
      if (d2 < r * r && d2 > 1e-6 && p.y < n.heightM) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
    }
    return ground;
  }

  // ---------- update ----------
  update(dt, input, active) {
    const g = this.game;
    // look
    if (active) {
      const k = 0.0022 * this.sens;
      this.yaw -= (input.mouse.dx + input.touch.look.dx) * k;
      this.pitch -= (input.mouse.dy + input.touch.look.dy) * k * (this.invert ? -1 : 1);
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
      this.sway.x += (input.mouse.dx * 0.00025 - this.sway.x) * Math.min(1, dt * 8);
      this.sway.y += (input.mouse.dy * 0.00025 - this.sway.y) * Math.min(1, dt * 8);
    }
    // move
    let fx = 0, fz = 0;
    if (active) {
      if (input.down('KeyW') || input.down('ArrowUp')) fz -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) fz += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
      fx += input.touch.move.x; fz += input.touch.move.y;
    }
    const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const sprint = active && (input.down('ShiftLeft') || input.down('ShiftRight') || input.touch.sprint) && fz < 0.2 && !(this.held && this.held.def.heavy);
    const wantCrouch = active && (input.down('KeyC') || input.down('ControlLeft'));
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    let speed = (sprint ? 5.6 : 3.3) * (1 - this.crouch * 0.5) * (this.held && this.held.def.heavy ? 0.75 : 1) * (1 + this.speedBoost);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
    const slick = g.items.slipperyAt(this.pos);
    const accel = this.onGround ? (slick ? 1.2 : 14) : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);
    if (slick && this.onGround && Math.hypot(this.vel.x, this.vel.z) > 3 && Math.random() < dt * 0.8) { this.addTrauma(0.4); audio.play('slip', { pos: this.pos }); g.hud.toast('Whoa! Slippery floor — grab the mop!', 'bad'); this.vel.multiplyScalar(1.6); this.pitch = 0.6; }
    // gravity / jump
    const grav = this.lowGrav > 0 ? 4 : 20;
    if (active && (input.hit('Space')) && this.onGround) { this.vel.y = this.lowGrav > 0 ? 9 : 6.3; this.onGround = false; audio.play('jump'); }
    this.vel.y -= grav * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    const ground = this.collide();
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -3) { this.land = Math.min(1, -this.vel.y / 12); audio.play('land', { vol: this.land }); }
      this.pos.y = ground; this.vel.y = Math.max(0, this.vel.y); this.onGround = true;
    } else if (this.pos.y > ground + 0.05) this.onGround = false;
    if (this.lowGrav > 0) this.lowGrav -= dt;
    if (this.speedBoost > 0) this.speedBoost = Math.max(0, this.speedBoost - dt * 0.02);
    g.world.nudgeDoor(this.pos);
    // footsteps & bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 2.2; this.bobAmt += (Math.min(1, hs / 5) - this.bobAmt) * dt * 6;
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 0.85 : 0.7)) { this.stepDist = 0; const surf = this.pos.z < -6 && this.pos.x > 1.5 ? 'tile' : 'wood'; audio.play('step', { surface: surf, vol: sprint ? 0.45 : 0.32 }); }
    } else this.bobAmt += (0 - this.bobAmt) * dt * 6;
    // camera
    this.land = Math.max(0, this.land - dt * 3);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma; const t = performance.now() / 1000;
    const eye = this.eye;
    this.camera.position.set(eye.x, eye.y + Math.sin(this.bob * 2) * 0.035 * this.bobAmt - this.land * 0.12, eye.z);
    _e.set(this.pitch + Math.sin(t * 31) * 0.03 * sh, this.yaw + Math.sin(t * 27) * 0.04 * sh, Math.sin(this.bob) * 0.008 * this.bobAmt + Math.sin(t * 23) * 0.03 * sh - this.sway.x * 0.5);
    this.camera.quaternion.setFromEuler(_e);
    const targetFov = this.baseFov + (sprint && hs > 4 ? 7 : 0) + this.charge * 10;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 6);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    audio.setListener(this.camera.position, this.forward);

    if (active) this.handleActions(dt, input);
    this.updateViewmodel(dt, hs, sprint);
  }

  // ---------- actions ----------
  handleActions(dt, input) {
    const g = this.game;
    this.punchCd -= dt;
    // interaction focus (ray + generous assists so small things are easy to use)
    this.pickFocus();
    const act = this.focusAction;
    // E interact / hold
    const eDown = input.down('KeyE'), eHit = input.hit('KeyE');
    // hold timers use real time so they feel the same on slow devices
    const now = performance.now(); const hdt = Math.min(0.15, Math.max(0, (now - (this._holdClock || now)) / 1000)); this._holdClock = now;
    if (act && act.hold) {
      if (eDown) {
        if (this.holdKey !== act.key) { this.holdKey = act.key; this.holdProg = 0; }
        this.holdProg += hdt / act.hold;
        if (act.tick) act.tick(hdt);
        if (this.holdProg >= 1) { this.holdProg = 0; this.holdKey = null; act.run(); this.reach(); }
      } else { this.holdProg = Math.max(0, this.holdProg - hdt * 2); }
    } else {
      this.holdProg = 0; this.holdKey = null;
      if (eHit) {
        if (act && act.run) { act.run(); this.reach(); }
        else if (act) g.hud.nudge();
      }
    }
    if (input.hit('KeyQ') && this.held) this.drop(0.8);
    // throw
    if (input.mouse.pressed[2] && this.held) this.drop(this.held.def.heavy ? 4 : 11);
    else if (input.mouse.pressed[2] && !this.held) this.shove();
    // tools / punching
    const tool = this.held && this.held.def.tool;
    if (tool === 'ext') {
      if (input.mouse.down[0]) { this.spraying = true; g.useExtinguisher(this, dt); } else this.spraying = false;
      return;
    }
    if (tool === 'mop') {
      if (input.mouse.pressed[0]) { this.punchT = 0; this.punchSide = 1; g.useMop(this); }
      return;
    }
    if (input.mouse.pressed[0] && this.punchCd <= 0) { this.charging = true; this.charge = 0; this.chargeT = 0; }
    if (this.charging) {
      this.chargeT += dt;
      if (this.chargeT > 0.3) { this.charge = Math.min(1, (this.chargeT - 0.3) / 0.9); if (this.charge > 0.2) this.addTrauma(dt * this.charge * 0.6); }
      if (!input.mouse.down[0] || input.mouse.released[0]) { this.charging = false; this.punch(this.charge); this.charge = 0; }
    }
  }

  reach() { this.reachT = 0; }

  pickFocus() {
    const g = this.game;
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.ray.far = 2.7;
    const R = this.ray.ray, o = R.origin, d = R.direction;
    const objs = g.world.interactables.concat(g.items.items.filter((i) => i.state === 'world').map((i) => i.obj)).concat(g.extraInteract || []);
    const hits = this.ray.intersectObjects(objs, true);
    const cands = []; const seen = new Set();
    const add = (ent, t, point) => { const key = ent.item || ent.npc || ent.station || ent.decal || ent.bin || ent.slot || ent; if (seen.has(key)) return; seen.add(key); cands.push({ ent, t, point }); };
    for (const h of hits) { let ob = h.object; while (ob && !ob.userData.ent) ob = ob.parent; if (ob && ob.userData.ent) add(ob.userData.ent, h.distance, h.point); }
    const v = new THREE.Vector3();
    // small items close to the crosshair
    for (const it of g.items.items) {
      if (it.state !== 'world') continue;
      v.copy(it.obj.position).sub(o); const t = v.dot(d); if (t < 0.15 || t > 2.6) continue;
      const off = v.addScaledVector(d, -t).length();
      if (off < 0.13 + t * 0.03) add(it.obj.userData.ent || { type: 'item', item: it }, t, it.obj.position);
    }
    // customers who want what you're holding / bins when holding trash
    const held = this.held;
    if (held) {
      const want = { soda: 'drink', chips: 'snack', coffee: 'coffee', pizza: 'food' }[held.kind];
      if (want) for (const n of g.npcs) {
        if (!n.ai || !n.ai.req || n.ai.req.type !== want || n.rag) continue;
        const hp = n.headPos(); v.copy(hp).sub(o); const dist = v.length(); if (dist > 2.6) continue;
        if (v.normalize().dot(d) > 0.9) add(n.hitbox.userData.ent, dist * 0.5, hp.clone());
      }
      if (held.def.trash) for (const b of g.world.bins) {
        v.copy(b.pos).setY(0.6).sub(o); const dist = v.length(); if (dist > 2.4) continue;
        if (v.normalize().dot(d) > 0.85) add({ type: 'bin', bin: b }, dist * 0.6, b.pos);
      }
    }
    // walls block interaction
    const wallT = g.world.rayWallDistance(o, d, 2.8);
    let best = null, bestS = Infinity;
    const PEN = { station: 0.3, npc: 0.1, item: -0.2, slot: -0.4, decal: 0.25, bin: 0.05 };
    for (const c of cands) {
      if (c.t > wallT + 0.05) continue;
      const act = g.describe(c.ent, this);
      if (!act) continue;
      // real actions beat 'nice to have' actions, which beat plain info; distance breaks ties
      const tier = (act.run || act.hold) ? (act.secondary ? 1.5 : 0) : 2.5;
      const score = tier + c.t + (PEN[c.ent.type] || 0);
      if (score < bestS) { bestS = score; best = { c, act }; }
    }
    this.focus = best ? best.c.ent : null; this.focusPoint = best ? best.c.point : null;
    this.focusAction = best ? best.act : null;
  }

  punch(charge) {
    const g = this.game;
    this.punchT = 0; this.punchSide = this.punchSide === 1 ? -1 : 1;
    if (charge > 0.4) this.punchSide = 1;
    this.punchCd = charge > 0.4 ? 0.6 : 0.32;
    audio.play('whoosh', { vol: 0.7 + charge });
    const mega = charge > 0.4;
    setTimeout(() => g.resolvePunch(this, mega ? charge : 0), 70);
  }
  shove() {
    if (this.punchCd > 0) return;
    this.punchCd = 0.5; this.punchT = 0; this.punchSide = 0;
    audio.play('whoosh', { vol: 0.6 });
    setTimeout(() => this.game.resolvePunch(this, 0, true), 60);
  }

  pickUp(item) {
    const g = this.game;
    if (this.held) this.drop(0.5);
    item.removeBody();
    item.state = 'held';
    this.held = item;
    this.holdAnchor.add(item.obj);
    item.obj.position.set(0, 0, 0); item.obj.quaternion.identity();
    const h = item.def.hold || [0.2, -0.3, -0.5];
    if (item.def.tool === 'mop') { item.obj.position.set(0.28, -0.55, -0.55); item.obj.rotation.set(-0.35, 0, -0.2); }
    else if (item.def.tool === 'ext') { item.obj.position.set(0.18, -0.55, -0.5); item.obj.rotation.set(0.2, 0, 0); }
    else item.obj.position.set(h[0], h[1], h[2]);
    item.obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    audio.play('pickup');
    g.onPickup && g.onPickup(item);
  }
  drop(force = 0) {
    const item = this.held; if (!item) return;
    const g = this.game;
    this.held = null;
    this.holdAnchor.remove(item.obj);
    g.scene.add(item.obj);
    const fwd = this.forward;
    const start = this.camera.position.clone().addScaledVector(fwd, item.def.heavy ? 0.7 : 0.5).add(new THREE.Vector3(0, -0.15, 0));
    // don't spawn inside walls
    item.obj.position.copy(start);
    item.obj.quaternion.copy(this.camera.quaternion);
    item.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const vel = fwd.clone().multiplyScalar(force).add(new THREE.Vector3(this.vel.x, this.vel.y + (force > 2 ? 1.2 : 0), this.vel.z));
    item.addBody(vel);
    if (force > 2) { item.body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); audio.play('throw'); }
    item.state = 'world'; item.thrownFrom = force > 2 ? this.pos.clone() : null; item.age = 0;
    this.punchT = force > 2 ? 0 : 1; this.punchSide = 1;
    g.onDrop && g.onDrop(item, force);
  }

  // ---------- viewmodel ----------
  updateViewmodel(dt, hs, sprint) {
    const vm = this.vm;
    vm.position.copy(this.camera.position); vm.quaternion.copy(this.camera.quaternion);
    this.vmLight.position.copy(this.camera.position).add(new THREE.Vector3(1, 3, 1)); this.vmLight.target.position.copy(this.camera.position);
    const t = performance.now() / 1000;
    const bx = Math.sin(this.bob) * 0.012 * this.bobAmt, by = Math.abs(Math.cos(this.bob)) * 0.014 * this.bobAmt;
    const idle = Math.sin(t * 1.6) * 0.004;
    const swx = -this.sway.x * 0.6, swy = this.sway.y * 0.6;
    this.punchT += dt; if (this.reachT !== undefined) this.reachT += dt;
    const held = this.held; const tool = held && held.def.tool;
    // base poses
    const R = this.armR, L = this.armL;
    let rp = _v.set(0.2 + bx + swx, -0.235 - by + idle + swy - (sprint ? 0.05 : 0), -0.4), rr = [0.35, -0.25, 1.05];
    let lp = new THREE.Vector3(-0.2 + bx + swx, -0.235 - by + idle + swy - (sprint ? 0.05 : 0), -0.4), lr = [0.35, 0.25, -1.05];
    let fistR = 1, fistL = 1;
    if (held && !tool) {
      const heavy = held.def.heavy;
      rp.set(heavy ? 0.3 : 0.1 + bx + swx, (heavy ? -0.42 : -0.25) - by + swy, heavy ? -0.6 : -0.38); rr = [0.3, -0.3, 0.6];
      lp.set(heavy ? -0.3 : -0.18 + bx + swx, (heavy ? -0.42 : -0.3) - by + swy, heavy ? -0.6 : -0.42); lr = [0.4, 0.3, -0.6];
      fistR = 0.3; fistL = 0.3;
      if (!heavy) { lp.set(-0.3, -0.42, -0.3); }
      held.obj.position.y = (held.def.hold ? held.def.hold[1] : -0.3) - by * 0.8 + swy;
    } else if (tool === 'mop') {
      rp.set(0.26 + bx, -0.3 - by, -0.42); rr = [0.6, 0, 0.3]; lp.set(0.05, -0.38 - by, -0.45); lr = [0.6, 0, -0.4]; fistR = 0.9; fistL = 0.9;
      held.obj.rotation.x = -0.35 + (this.punchT < 0.4 ? Math.sin(this.punchT / 0.4 * Math.PI) * 0.7 : 0);
    } else if (tool === 'ext') {
      rp.set(0.2 + bx, -0.3 - by, -0.38); rr = [0.4, -0.2, 0.2]; lp.set(0.12, -0.42 - by, -0.42); lr = [0.4, 0.2, -0.3]; fistR = 0.9; fistL = 0.9;
      held.obj.position.set(0.17 + (this.spraying ? (Math.random() - 0.5) * 0.01 : 0), -0.6 - by, -0.5);
    }
    // charging
    if (this.charging && this.charge > 0) { rp.x += 0.04 * this.charge; rp.z += 0.12 * this.charge; rp.y -= 0.03 * this.charge; rp.x += (Math.random() - 0.5) * 0.01 * this.charge; rr = [0.3, -0.5, 0.3]; fistR = 1; }
    // punch animation
    if (this.punchT < 0.32 && !tool) {
      const k = this.punchT < 0.09 ? this.punchT / 0.09 : 1 - (this.punchT - 0.09) / 0.23;
      const e = Math.max(0, k);
      if (this.punchSide === 1) { rp.lerp(new THREE.Vector3(0.04, -0.09, -0.76), e); rr = [0.1, 0.0, 0.25].map((v, i) => rr[i] * (1 - e) + v * e); fistR = 1; }
      else if (this.punchSide === -1) { lp.lerp(new THREE.Vector3(-0.04, -0.09, -0.76), e); lr = [0.1, 0.0, -0.25].map((v, i) => lr[i] * (1 - e) + v * e); fistL = 1; }
      else { rp.lerp(new THREE.Vector3(0.18, -0.12, -0.72), e); lp.lerp(new THREE.Vector3(-0.18, -0.12, -0.72), e); fistR = 0; fistL = 0; rr = [-0.6 * e, 0, 0]; lr = [-0.6 * e, 0, 0]; }
    }
    if (this.reachT !== undefined && this.reachT < 0.3 && !held) {
      const e = Math.sin(this.reachT / 0.3 * Math.PI);
      rp.lerp(new THREE.Vector3(0.12, -0.15, -0.65), e * 0.8); fistR = 0.65 - e * 0.6;
    }
    R.position.lerp(rp, Math.min(1, dt * 22)); L.position.lerp(lp, Math.min(1, dt * 22));
    R.rotation.set(R.rotation.x + (rr[0] - R.rotation.x) * Math.min(1, dt * 18), R.rotation.y + (rr[1] - R.rotation.y) * Math.min(1, dt * 18), R.rotation.z + (rr[2] - R.rotation.z) * Math.min(1, dt * 18));
    L.rotation.set(L.rotation.x + (lr[0] - L.rotation.x) * Math.min(1, dt * 18), L.rotation.y + (lr[1] - L.rotation.y) * Math.min(1, dt * 18), L.rotation.z + (lr[2] - L.rotation.z) * Math.min(1, dt * 18));
    this._fR = (this._fR ?? 0.6) + (fistR - (this._fR ?? 0.6)) * Math.min(1, dt * 15);
    this._fL = (this._fL ?? 0.6) + (fistL - (this._fL ?? 0.6)) * Math.min(1, dt * 15);
    setFist(R, this._fR); setFist(L, this._fL);
    // glowing fist when charging
    const cuff = R.userData.cuff; cuff.emissiveIntensity = 0.25 + this.charge * 6; cuff.emissive.setRGB(0.2 + this.charge * 0.8, 0.95 - this.charge * 0.6, 1 - this.charge * 0.8);
  }
}
