import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { audio } from '../core/audio.js';

// RoboJanitor 3000 — cleans trash, survives punches (CC0 robot model by Tomás Laulhé).
export class Robot {
  constructor(game, gltf) {
    this.game = game;
    this.root = new THREE.Group(); game.scene.add(this.root);
    const model = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(model); const h = box.max.y - box.min.y || 1;
    model.scale.setScalar(1.05 / h); model.position.y = -box.min.y * (1.05 / h);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); if (o.material.color && o.material.name === 'Main') o.material.color.set(0x2aa8c8); } });
    this.inner = new THREE.Group(); this.inner.add(model); this.root.add(this.inner);
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {}; for (const c of gltf.animations) this.clips[c.name] = c;
    this.cur = null; this.play('Idle');
    this.root.position.set(6.0, 0, -4.8);
    this.carry = 0; this.target = null; this.path = null; this.pi = 0; this.state = 'idle'; this.t = 0;
    this.fly = null; this.yaw = 0;
    this.say = document.createElement('div'); this.say.className = 'pop xp'; this.say.style.display = 'none';
    game.hud.toast('🤖 RoboJanitor 3000 online. BEEP BOOP. TRASH WILL BE ELIMINATED.', 'good', 6000);
  }
  play(name, fade = 0.25, once = false) {
    const c = this.clips[name]; if (!c) return; const a = this.mixer.clipAction(c);
    if (this.cur === a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a;
  }
  reset() { this.root.position.set(6.0, 0, -4.8); this.fly = null; this.state = 'idle'; this.carry = 0; this.inner.rotation.set(0, 0, 0); }

  hit(dir, mega) {
    const v = dir.clone().multiplyScalar(mega ? 12 : 6); v.y = mega ? 7 : 3.5;
    this.fly = { v, spin: (Math.random() - 0.5) * 18, t: 0 };
    this.play('Death', 0.1, true);
    this.game.hud.pop(pick(['BEEP?!', 'ERROR 404: DIGNITY', 'OUCH.EXE', 'REPORTING TO HR']), this.root.position.clone().setY(1.4), 'xp');
    audio.play('zap', { pos: this.root.position });
    this.state = 'idle'; this.path = null;
  }

  update(dt) {
    const g = this.game; this.t += dt;
    this.mixer.update(dt);
    const p = this.root.position;
    if (this.fly) {
      const f = this.fly; f.t += dt; f.v.y -= 18 * dt; p.addScaledVector(f.v, dt);
      this.inner.rotation.x += f.spin * dt * 0.3; this.inner.rotation.z += f.spin * dt * 0.2;
      if (p.y < 0) { p.y = 0; f.v.y = Math.abs(f.v.y) * 0.35; f.v.x *= 0.6; f.v.z *= 0.6; if (Math.abs(f.v.y) > 1) audio.play('clank', { pos: p, vol: 0.7 }); }
      // keep inside the building
      p.x = Math.max(-7.6, Math.min(7.6, p.x)); p.z = Math.max(-11.2, Math.min(5.6, p.z));
      if (f.t > 2.2 && p.y <= 0.01) { this.fly = null; this.inner.rotation.set(0, 0, 0); this.play('Standing', 0.2, true); this.state = 'recover'; this.t = 0; }
      return;
    }
    if (this.state === 'recover') { if (this.t > 1.6) { this.state = 'idle'; this.play('Idle'); } return; }
    if (this.state === 'idle') {
      if (this.t > 1.2) {
        this.t = 0;
        if (this.carry >= 3) { const bin = g.world.bins.slice().sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0]; this.goal = { type: 'bin', bin }; this.go(bin.pos.clone().add(new THREE.Vector3(0.45, 0, 0.45))); }
        else {
          const trash = g.items.items.filter((i) => i.def.trash && i.state === 'world' && i.obj.position.z < 5.8 && i.obj.position.z > -11.4 && Math.abs(i.obj.position.x) < 7.8 && i.obj.position.y < 1.2);
          if (trash.length) { trash.sort((a, b) => a.obj.position.distanceTo(p) - b.obj.position.distanceTo(p)); const it = trash[0]; this.goal = { type: 'trash', it }; this.go(it.obj.position.clone().setY(0)); }
        }
      }
      return;
    }
    if (this.state === 'move') {
      const tgt = this.path[this.pi];
      const d = new THREE.Vector3(tgt.x - p.x, 0, tgt.z - p.z); const dist = d.length();
      if (dist < 0.25) { this.pi++; if (this.pi >= this.path.length) { this.arrive(); return; } return; }
      const want = Math.atan2(d.x, d.z); let df = want - this.yaw; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      this.yaw += df * Math.min(1, dt * 7); this.root.rotation.y = this.yaw;
      const sp = 1.6 * Math.max(0.2, Math.cos(df));
      p.x += Math.sin(this.yaw) * sp * dt; p.z += Math.cos(this.yaw) * sp * dt;
      if (this.goal && this.goal.type === 'trash' && this.goal.it.state !== 'world') { this.state = 'idle'; this.play('Idle'); }
      if (this.t > 15) { this.state = 'idle'; this.play('Idle'); }
    }
  }
  go(to) { this.path = this.game.nav.findPath(this.root.position, to); this.pi = 0; this.state = 'move'; this.t = 0; this.play('Walking'); }
  arrive() {
    const g = this.game; this.state = 'idle'; this.t = 0; this.play('Idle');
    if (!this.goal) return;
    if (this.goal.type === 'trash' && this.goal.it.state === 'world' && this.goal.it.obj.position.distanceTo(this.root.position) < 1.2) {
      g.items.remove(this.goal.it); this.carry++; audio.play('pickup', {}); this.play('Yes', 0.1, true); g.addXP(1);
    } else if (this.goal.type === 'bin') {
      this.carry = 0; audio.play('drop', {}); this.play('ThumbsUp', 0.1, true); g.dayStat('binned', 3);
      g.hud.pop('BEEP! TRASH ELIMINATED', this.root.position.clone().setY(1.4), 'xp');
    }
    this.goal = null;
  }
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
