import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { G_STATIC, G_PROP, G_RAGDOLL } from '../core/physics.js';

// Segment table: [id, drivenBone, fromBone, toPoint, halfW, halfD, mass, parent, coneAngle, twist]
const SEGS = [
  ['pelvis', 'Hips', 'Hips', 'Spine1', 0.15, 0.1, 12, null, 0, 0],
  ['torso', 'Spine1', 'Spine1', 'Neck', 0.17, 0.11, 16, 'pelvis', 0.45, 0.35],
  ['head', 'Neck', 'Neck', '#headtop', 0.095, 0.11, 5, 'torso', 0.7, 0.7],
  ['uarmL', 'LeftArm', 'LeftArm', 'LeftForeArm', 0.05, 0.05, 2.5, 'torso', 1.6, 0.8],
  ['farmL', 'LeftForeArm', 'LeftForeArm', '#handL', 0.043, 0.043, 1.8, 'uarmL', 1.4, 0.4],
  ['uarmR', 'RightArm', 'RightArm', 'RightForeArm', 0.05, 0.05, 2.5, 'torso', 1.6, 0.8],
  ['farmR', 'RightForeArm', 'RightForeArm', '#handR', 0.043, 0.043, 1.8, 'uarmR', 1.4, 0.4],
  ['thighL', 'LeftUpLeg', 'LeftUpLeg', 'LeftLeg', 0.075, 0.075, 7, 'pelvis', 1.1, 0.4],
  ['shinL', 'LeftLeg', 'LeftLeg', '#footL', 0.058, 0.058, 4, 'thighL', 1.2, 0.3],
  ['thighR', 'RightUpLeg', 'RightUpLeg', 'RightLeg', 0.075, 0.075, 7, 'pelvis', 1.1, 0.4],
  ['shinR', 'RightLeg', 'RightLeg', '#footR', 0.058, 0.058, 4, 'thighR', 1.2, 0.3],
];
export const DRIVEN = SEGS.map((s) => s[1]);

const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

function wp(bone) { return bone.getWorldPosition(new THREE.Vector3()); }

export class Ragdoll {
  constructor(world, bones, scale, opts = {}) {
    this.world = world; this.bones = bones; this.scale = scale;
    this.bodies = {}; this.constraints = []; this.segs = [];
    this.t = 0; this.still = 0;
    this.onImpact = opts.onImpact;
    const s = scale;
    const P = (n) => wp(bones[n]);
    const pts = {};
    const extend = (a, b, k) => { const pa = P(a), pb = P(b); return pb.clone().add(pb.clone().sub(pa).multiplyScalar(k)); };
    pts['#headtop'] = extend('Neck', 'Head', 1.6);
    pts['#handL'] = extend('LeftForeArm', 'LeftHand', 0.35);
    pts['#handR'] = extend('RightForeArm', 'RightHand', 0.35);
    pts['#footL'] = bones.LeftFoot ? P('LeftFoot').add(new THREE.Vector3(0, -0.04 * s, 0)) : extend('LeftUpLeg', 'LeftLeg', 1);
    pts['#footR'] = bones.RightFoot ? P('RightFoot').add(new THREE.Vector3(0, -0.04 * s, 0)) : extend('RightUpLeg', 'RightLeg', 1);
    const pt = (n) => pts[n] || P(n);
    const hipSide = P('LeftUpLeg').sub(P('RightUpLeg')).normalize();
    const shSide = P('LeftArm').sub(P('RightArm')).normalize();
    const vel = opts.velocity || new THREE.Vector3();
    for (const [id, driven, from, to, hw, hd, mass, parent, cone, twist] of SEGS) {
      if (!bones[driven] || !bones[from]) continue;
      const a = P(from), b = pt(to);
      let len = a.distanceTo(b);
      if (len < 0.05 * s) len = 0.05 * s;
      const dir = b.clone().sub(a).normalize();
      // basis: y along segment, x roughly along character's left side
      const side = (id === 'pelvis' || id.startsWith('thigh') || id.startsWith('shin')) ? hipSide : shSide;
      const x = side.clone().addScaledVector(dir, -side.dot(dir));
      if (x.lengthSq() < 1e-4) x.set(1, 0, 0).addScaledVector(dir, -dir.x);
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, dir).normalize();
      _m.makeBasis(x, dir, z);
      const q = new THREE.Quaternion().setFromRotationMatrix(_m);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const body = new CANNON.Body({
        mass, position: new CANNON.Vec3(mid.x, mid.y, mid.z), quaternion: new CANNON.Quaternion(q.x, q.y, q.z, q.w),
        linearDamping: 0.08, angularDamping: 0.45, collisionFilterGroup: G_RAGDOLL, collisionFilterMask: G_STATIC | G_PROP,
        allowSleep: false,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(hw * s, Math.max(0.02, len / 2), hd * s)));
      body.velocity.set(vel.x, vel.y, vel.z);
      world.addBody(body);
      this.bodies[id] = body;
      const bone = bones[driven];
      const bq = bone.getWorldQuaternion(new THREE.Quaternion());
      const seg = { id, bone, body, offQ: q.clone().invert().multiply(bq), len, dir };
      if (driven === 'Hips') {
        seg.offP = wp(bone).sub(mid).applyQuaternion(q.clone().invert());
      }
      this.segs.push(seg);
      if (parent && this.bodies[parent]) {
        const pb = this.bodies[parent];
        const pq = new THREE.Quaternion(pb.quaternion.x, pb.quaternion.y, pb.quaternion.z, pb.quaternion.w);
        const pqi = pq.clone().invert();
        const pivotA = a.clone().sub(new THREE.Vector3(pb.position.x, pb.position.y, pb.position.z)).applyQuaternion(pqi);
        const axisA = dir.clone().applyQuaternion(pqi);
        const c = new CANNON.ConeTwistConstraint(pb, body, {
          pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z), pivotB: new CANNON.Vec3(0, -len / 2, 0),
          axisA: new CANNON.Vec3(axisA.x, axisA.y, axisA.z), axisB: new CANNON.Vec3(0, 1, 0),
          angle: cone, twistAngle: twist, collideConnected: false, maxForce: 1e6,
        });
        world.addConstraint(c); this.constraints.push(c);
      }
      if (this.onImpact && (id === 'pelvis' || id === 'head' || id === 'torso')) {
        body.addEventListener('collide', (e) => {
          const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (v > 2.2) this.onImpact(v, body.position);
        });
      }
    }
  }

  impulse(dir, power, part = 'torso') {
    const b = this.bodies[part] || this.bodies.torso;
    for (const k in this.bodies) {
      const bb = this.bodies[k];
      bb.velocity.x += dir.x * power * 0.45; bb.velocity.y += dir.y * power * 0.45; bb.velocity.z += dir.z * power * 0.45;
    }
    b.applyImpulse(new CANNON.Vec3(dir.x * power * b.mass * 0.6, dir.y * power * b.mass * 0.6, dir.z * power * b.mass * 0.6));
    b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    this.still = 0;
  }

  nearestPart(p) {
    let best = 'torso', bd = Infinity;
    for (const k in this.bodies) { const b = this.bodies[k].position; const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2 + (b.z - p.z) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  }

  get pelvisPos() { const p = this.bodies.pelvis.position; return _v.set(p.x, p.y, p.z); }

  update(dt) {
    this.t += dt;
    for (const s of this.segs) {
      const b = s.body;
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const worldQ = _q2.copy(_q).multiply(s.offQ);
      const bone = s.bone;
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(worldQ));
      if (s.offP) {
        const wpos = _v2.copy(s.offP).applyQuaternion(_q).add(_v.set(b.position.x, b.position.y, b.position.z));
        bone.parent.updateWorldMatrix(true, false);
        bone.position.copy(wpos.applyMatrix4(_m.copy(bone.parent.matrixWorld).invert()));
      }
      bone.updateMatrixWorld(true);
    }
    let maxV = 0;
    for (const k in this.bodies) { const v = this.bodies[k].velocity; maxV = Math.max(maxV, v.x * v.x + v.y * v.y + v.z * v.z); }
    if (maxV < 0.25 * 0.25) this.still += dt; else this.still = 0;
  }

  get settled() { return (this.t > 1.4 && this.still > 0.7) || this.t > 6; }

  dispose() {
    for (const c of this.constraints) this.world.removeConstraint(c);
    for (const k in this.bodies) this.world.removeBody(this.bodies[k]);
    this.constraints = []; this.bodies = {};
  }
}
