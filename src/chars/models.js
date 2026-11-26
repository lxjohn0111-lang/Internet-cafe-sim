import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Character pipeline: loads Mixamo-rigged models, measures their T-pose, retargets animations
// between rigs in world space and procedurally authors extra poses (sitting, typing, cheering...).

export const canon = (n) => n.replace(/^mixamorig[:_]?/i, '').replace(/^mixamorig/, '');
const DIR_CHILD = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToe_End',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToe_End',
};
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export class BaseModel {
  constructor(name, gltf, restClipName) {
    this.name = name;
    this.scene = gltf.scene;
    this.clipsNative = {};
    for (const c of gltf.animations) this.clipsNative[c.name] = c;
    const scene = this.scene;
    scene.updateMatrixWorld(true);
    this.bones = {}; this.order = [];
    scene.traverse((o) => { if (o.isBone) { const c = canon(o.name); this.bones[c] = o; this.order.push(c); } });
    // T-pose rest
    let mixer = null;
    if (restClipName && this.clipsNative[restClipName]) {
      mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(this.clipsNative[restClipName]).play();
      mixer.update(0);
    }
    scene.updateMatrixWorld(true);
    this.rest = {};
    for (const c of this.order) {
      const b = this.bones[c];
      const parentIsBone = !!(b.parent && b.parent.isBone);
      const pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq);
      this.rest[c] = {
        localQ: b.quaternion.clone(), localP: b.position.clone(),
        worldQ: b.getWorldQuaternion(new THREE.Quaternion()), worldP: b.getWorldPosition(new THREE.Vector3()),
        parent: parentIsBone ? canon(b.parent.name) : null,
        parentStaticQ: parentIsBone ? null : pq,
        parentInv: parentIsBone ? null : new THREE.Matrix4().copy(b.parent.matrixWorld).invert(),
      };
    }
    for (const c of this.order) {
      const ch = DIR_CHILD[c];
      if (ch && this.rest[ch]) this.rest[c].dir = this.rest[ch].worldP.clone().sub(this.rest[c].worldP).normalize();
      else if (this.rest[c].parent) this.rest[c].dir = this.rest[c].worldP.clone().sub(this.rest[this.rest[c].parent].worldP).normalize();
      else this.rest[c].dir = new THREE.Vector3(0, 1, 0);
    }
    // facing: in T-pose the left arm points to the character's left (+X when facing +Z)
    const la = this.rest.LeftArm, lf = this.rest.LeftForeArm;
    this.facesPosZ = !(la && lf) || (lf.worldP.x - la.worldP.x) > 0;
    this.facingQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facesPosZ ? 0 : Math.PI);
    const top = this.rest.HeadTop_End ? this.rest.HeadTop_End.worldP.y : (this.rest.Head.worldP.y + 0.18);
    let minY = Infinity; for (const c of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) if (this.rest[c]) minY = Math.min(minY, this.rest[c].worldP.y);
    this.footY = Math.min(0, minY - 0.05);
    this.height = top - this.footY;
    this.hipsH = this.rest.Hips.worldP.y - this.footY;
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(scene); }
    scene.updateMatrixWorld(true);
    this.clips = {};
    // material polish
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.isMeshStandardMaterial) { m.envMapIntensity = 0.55; if (m.roughness < 0.35) m.roughness = 0.45; } });
      }
    });
  }

  // world-space conversions between "character space" (+Z forward) and native model space
  toNativeQ(q) { return _q2.copy(this.facingQ).multiply(q).multiply(_q.copy(this.facingQ).invert()); }
}

// Retarget a clip from src rig to dst rig, baked at fps.
export function retarget(src, dst, clip, { fps = 30, name = clip.name, inPlace = true } = {}) {
  const mixer = new THREE.AnimationMixer(src.scene);
  const action = mixer.clipAction(clip); action.play();
  const frames = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const mapped = dst.order.filter((c) => src.bones[c] && src.rest[c] && !/End$/.test(c));
  const qd = {}; mapped.forEach((c) => { qd[c] = new Float32Array(frames * 4); });
  const pd = new Float32Array(frames * 3);
  const fix = new THREE.Quaternion().copy(dst.facingQ).multiply(new THREE.Quaternion().copy(src.facingQ).invert());
  const fixInv = fix.clone().invert();
  const scale = dst.hipsH / src.hipsH;
  const W = {};
  const sq = new THREE.Quaternion(), delta = new THREE.Quaternion(), pW = new THREE.Quaternion(), loc = new THREE.Quaternion();
  const hp = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration * 0.9999;
    times[f] = (f / (frames - 1)) * clip.duration;
    mixer.setTime(t);
    src.scene.updateMatrixWorld(true);
    for (const c of dst.order) {
      const r = dst.rest[c];
      if (r.parent) pW.copy(W[r.parent]); else pW.copy(r.parentStaticQ);
      if (!W[c]) W[c] = new THREE.Quaternion();
      if (qd[c]) {
        src.bones[c].getWorldQuaternion(sq);
        delta.copy(sq).multiply(_q.copy(src.rest[c].worldQ).invert());
        delta.premultiply(fix).multiply(fixInv);
        W[c].copy(delta).multiply(r.worldQ);
        loc.copy(pW).invert().multiply(W[c]);
        loc.toArray(qd[c], f * 4);
      } else {
        W[c].copy(pW).multiply(r.localQ);
      }
    }
    src.bones.Hips.getWorldPosition(hp);
    hp.sub(src.rest.Hips.worldP).multiplyScalar(scale).applyQuaternion(fix).add(dst.rest.Hips.worldP);
    hp.applyMatrix4(dst.rest.Hips.parentInv);
    hp.toArray(pd, f * 3);
  }
  if (inPlace) {
    // remove horizontal drift (keep sway): subtract linear trend in x/z of native space
    const p0 = new THREE.Vector3().fromArray(pd, 0).applyMatrix4(_m.copy(dst.rest.Hips.parentInv).invert());
    const p1 = new THREE.Vector3().fromArray(pd, (frames - 1) * 3).applyMatrix4(_m);
    const drift = p1.sub(p0); drift.y = 0;
    const back = new THREE.Matrix4().copy(dst.rest.Hips.parentInv);
    const fwd = new THREE.Matrix4().copy(back).invert();
    for (let f = 0; f < frames; f++) {
      const v = new THREE.Vector3().fromArray(pd, f * 3).applyMatrix4(fwd);
      v.addScaledVector(drift, -f / (frames - 1));
      v.applyMatrix4(back).toArray(pd, f * 3);
    }
  }
  action.stop(); mixer.uncacheRoot(src.scene);
  const tracks = mapped.map((c) => new THREE.QuaternionKeyframeTrack(`${dst.bones[c].name}.quaternion`, times, qd[c]));
  tracks.push(new THREE.VectorKeyframeTrack(`${dst.bones.Hips.name}.position`, times, pd));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

// Procedural pose authoring. spec(t) => { hips:[x,y,z] meters offset (character space), bones:{ Canon: {dir:[x,y,z]} | {rot:[x,y,z]} } }
// dirs are absolute world directions in character space (+Z forward, +Y up, +X character's left).
export function bakePose(dst, name, specFn, { duration = 1, fps = 24, subset = null, normH = 1.75 } = {}) {
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const list = dst.order.filter((c) => !/End$/.test(c) && (!subset || subset.includes(c)));
  const all = dst.order.filter((c) => !/End$/.test(c));
  const qd = {}; list.forEach((c) => { qd[c] = new Float32Array(frames * 4); });
  const pd = new Float32Array(frames * 3);
  const W = {};
  const pW = new THREE.Quaternion(), delta = new THREE.Quaternion(), loc = new THREE.Quaternion();
  const d = new THREE.Vector3(), e = new THREE.Euler();
  const k = dst.height / normH; // meters -> native
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * duration;
    times[f] = t;
    const spec = specFn(t / duration, t) || {};
    const bs = spec.bones || {};
    for (const c of all) {
      const r = dst.rest[c];
      if (r.parent) pW.copy(W[r.parent]); else pW.copy(r.parentStaticQ);
      if (!W[c]) W[c] = new THREE.Quaternion();
      const s = bs[c];
      if (s && s.dir) {
        d.set(s.dir[0], s.dir[1], s.dir[2]).normalize().applyQuaternion(dst.facingQ);
        delta.setFromUnitVectors(r.dir, d);
        if (s.twist) delta.premultiply(_q.setFromAxisAngle(d, s.twist));
        W[c].copy(delta).multiply(r.worldQ);
      } else if (s && s.rot) {
        e.set(s.rot[0], s.rot[1], s.rot[2], 'YXZ');
        delta.setFromEuler(e); delta.copy(dst.toNativeQ(delta));
        W[c].copy(delta).multiply(r.worldQ);
      } else {
        W[c].copy(pW).multiply(r.localQ);
      }
      if (qd[c]) { loc.copy(pW).invert().multiply(W[c]); loc.toArray(qd[c], f * 4); }
    }
    const h = spec.hips || [0, 0, 0];
    const hp = new THREE.Vector3(h[0] * k, h[1] * k, h[2] * k).applyQuaternion(dst.facingQ).add(dst.rest.Hips.worldP);
    hp.applyMatrix4(dst.rest.Hips.parentInv).toArray(pd, f * 3);
  }
  const tracks = list.map((c) => new THREE.QuaternionKeyframeTrack(`${dst.bones[c].name}.quaternion`, times, qd[c]));
  if (!subset) tracks.push(new THREE.VectorKeyframeTrack(`${dst.bones.Hips.name}.position`, times, pd));
  return new THREE.AnimationClip(name, duration, tracks);
}

const S = Math.sin, C = Math.cos;
// pose library ----------------------------------------------------------
function sitBase(hipDrop) {
  return {
    hips: [0, -hipDrop, -0.08],
    bones: {
      LeftUpLeg: { dir: [0.12, -0.08, 1] }, RightUpLeg: { dir: [-0.12, -0.08, 1] },
      LeftLeg: { dir: [0.03, -1, 0.12] }, RightLeg: { dir: [-0.03, -1, 0.12] },
      LeftFoot: { dir: [0, -0.35, 1] }, RightFoot: { dir: [0, -0.35, 1] },
      Spine: { rot: [0.1, 0, 0] },
      LeftArm: { dir: [0.28, -0.8, 0.5] }, RightArm: { dir: [-0.28, -0.8, 0.5] },
      LeftForeArm: { dir: [-0.25, -0.05, 1] }, RightForeArm: { dir: [0.2, -0.05, 1] },
      Head: { rot: [0.12, 0, 0] },
    },
  };
}
export const POSES = {
  sitType: (u, t) => {
    const p = sitBase(0.5);
    const a = S(t * 22) * 0.05, b = S(t * 19 + 1) * 0.05;
    p.bones.LeftForeArm = { dir: [-0.28 + b * 0.5, -0.08 + a, 1] };
    p.bones.RightForeArm = { dir: [0.18 + S(t * 3) * 0.08, -0.1 + b * 0.4, 1] };
    p.bones.LeftHand = { dir: [-0.2, -0.25 + a * 2, 1] }; p.bones.RightHand = { dir: [0.05, -0.3, 1] };
    p.bones.Head = { rot: [0.1 + S(t * 1.3) * 0.03, S(t * 0.7) * 0.08, 0] };
    return p;
  },
  sitGame: (u, t) => {
    const p = sitBase(0.5);
    p.bones.Spine = { rot: [0.22 + S(t * 2) * 0.03, S(t * 1.7) * 0.06, 0] };
    p.bones.LeftForeArm = { dir: [-0.3, -0.06 + S(t * 9) * 0.04, 1] };
    p.bones.RightForeArm = { dir: [0.25 + S(t * 4.3) * 0.12, -0.12, 1] };
    p.bones.LeftHand = { dir: [-0.1, -0.35, 1] }; p.bones.RightHand = { dir: [0.1, -0.4, 1] };
    p.bones.Head = { rot: [0.05, S(t * 3.3) * 0.05, 0] };
    return p;
  },
  sitIdle: (u, t) => {
    const p = sitBase(0.5);
    p.bones.Spine = { rot: [-0.08, 0, 0] };
    p.bones.LeftArm = { dir: [0.35, -0.9, 0.2] }; p.bones.RightArm = { dir: [-0.35, -0.9, 0.2] };
    p.bones.LeftForeArm = { dir: [0.1, -0.3, 1] }; p.bones.RightForeArm = { dir: [-0.1, -0.3, 1] };
    p.bones.Head = { rot: [0.05, S(t * 0.9) * 0.35, 0] };
    return p;
  },
  sitSleep: (u, t) => {
    const p = sitBase(0.5);
    p.bones.Spine = { rot: [0.55, 0, 0] };
    p.bones.Neck = { rot: [0.9 + S(t * 1.1) * 0.03, 0, 0.1] };
    p.bones.LeftArm = { dir: [0.4, -0.3, 0.85] }; p.bones.RightArm = { dir: [-0.4, -0.3, 0.85] };
    p.bones.LeftForeArm = { dir: [-0.9, 0.05, 0.3] }; p.bones.RightForeArm = { dir: [0.9, 0.05, 0.3] };
    return p;
  },
  sitCheer: (u, t) => {
    const p = sitBase(0.5);
    const w = S(t * 10) * 0.25;
    p.bones.Spine = { rot: [-0.15, 0, 0] };
    p.bones.LeftArm = { dir: [0.35, 1, 0.1] }; p.bones.RightArm = { dir: [-0.35, 1, 0.1] };
    p.bones.LeftForeArm = { dir: [0.1 + w, 1, 0.2] }; p.bones.RightForeArm = { dir: [-0.1 - w, 1, 0.2] };
    p.bones.Head = { rot: [-0.25, 0, 0] };
    return p;
  },
  sitRage: (u, t) => {
    const p = sitBase(0.5);
    const w = S(t * 18);
    p.bones.Spine = { rot: [0.25, w * 0.1, 0] };
    p.bones.LeftArm = { dir: [0.3, 0.2 + w * 0.3, 0.9] }; p.bones.RightArm = { dir: [-0.3, 0.2 - w * 0.3, 0.9] };
    p.bones.LeftForeArm = { dir: [-0.2, -0.6 + w * 0.6, 0.8] }; p.bones.RightForeArm = { dir: [0.2, -0.6 - w * 0.6, 0.8] };
    p.bones.Head = { rot: [-0.1, w * 0.2, 0] };
    return p;
  },
  sitStream: (u, t) => {
    const p = POSES.sitGame(u, t);
    if (S(t * 0.9) > 0.6) { p.bones.Spine = { rot: [-0.1, 0, 0] }; p.bones.RightArm = { dir: [-0.35, 0.9, 0.3] }; p.bones.RightForeArm = { dir: [-0.1, 1, 0.1 + S(t * 12) * 0.2] }; p.bones.Head = { rot: [-0.2, 0.5, 0] }; }
    return p;
  },
  standPhone: (u, t) => ({
    bones: {
      LeftArm: { dir: [0.15, -1, 0.05] }, LeftForeArm: { dir: [0.1, -1, 0.15] },
      RightArm: { dir: [-0.2, -0.9, 0.25] }, RightForeArm: { dir: [0.35, 0.55, 0.75] }, RightHand: { dir: [0.4, 0.2, 0.8] },
      Head: { rot: [0.4, 0.15, 0] }, Spine: { rot: [0.05, 0, 0] },
    },
  }),
  standArms: (u, t) => ({ // arms crossed, waiting
    bones: {
      LeftArm: { dir: [0.2, -0.9, 0.3] }, RightArm: { dir: [-0.2, -0.9, 0.3] },
      LeftForeArm: { dir: [-1, 0.1, 0.35] }, RightForeArm: { dir: [1, 0.15, 0.3] },
      Head: { rot: [0.02, S(t * 0.7) * 0.4, 0] },
    },
  }),
  cheer: (u, t) => {
    const w = S(t * 10) * 0.3;
    return { hips: [0, Math.abs(S(t * 5)) * 0.08, 0], bones: { LeftArm: { dir: [0.35, 1, 0.1] }, RightArm: { dir: [-0.35, 1, 0.1] }, LeftForeArm: { dir: [0.1 + w, 1, 0.2] }, RightForeArm: { dir: [-0.1 - w, 1, 0.2] }, Head: { rot: [-0.2, 0, 0] } } };
  },
  angry: (u, t) => {
    const w = S(t * 14);
    return { bones: { Spine: { rot: [0.15, w * 0.1, 0] }, LeftArm: { dir: [0.5, -0.4, 0.6] }, RightArm: { dir: [-0.5, -0.4, 0.6] }, LeftForeArm: { dir: [0, 0.4 + w * 0.5, 1] }, RightForeArm: { dir: [0, 0.4 - w * 0.5, 1] }, Head: { rot: [0.1, w * 0.15, 0] } } };
  },
  handsUp: (u, t) => ({ bones: { LeftArm: { dir: [0.9, 0.4, 0.1] }, RightArm: { dir: [-0.9, 0.4, 0.1] }, LeftForeArm: { dir: [0.1, 1, 0.1] }, RightForeArm: { dir: [-0.1, 1, 0.1] }, Head: { rot: [0.1, S(t * 3) * 0.2, 0] } } }),
  shrug: (u, t) => { const k = Math.max(0, S(u * Math.PI * 2)); return { bones: { LeftArm: { dir: [0.6, -0.6 + k * 0.4, 0.3] }, RightArm: { dir: [-0.6, -0.6 + k * 0.4, 0.3] }, LeftForeArm: { dir: [0.8, 0.1, 0.6] }, RightForeArm: { dir: [-0.8, 0.1, 0.6] }, Head: { rot: [0, 0, 0.2 * k] } } }; },
  wave: (u, t) => ({ bones: { RightArm: { dir: [-0.6, 0.8, 0.1] }, RightForeArm: { dir: [-0.1 + S(t * 9) * 0.5, 1, 0.2] }, LeftArm: { dir: [0.2, -1, 0.05] }, LeftForeArm: { dir: [0.1, -1, 0.2] } } }),
  carry: (u, t) => ({ bones: { LeftArm: { dir: [0.25, -0.7, 0.7] }, RightArm: { dir: [-0.25, -0.7, 0.7] }, LeftForeArm: { dir: [-0.5, 0.15, 1] }, RightForeArm: { dir: [0.5, 0.15, 1] } } }),
  kick: (u, t) => {
    const k = S(Math.min(1, u * 1.5) * Math.PI);
    return { bones: { RightUpLeg: { dir: [-0.1, -1 + k * 1.1, k * 1.2] }, RightLeg: { dir: [-0.05, -1 + k * 0.9, k * 1.2] }, Spine: { rot: [-0.25 * k, 0, 0] }, LeftArm: { dir: [0.9, -0.2, -0.2] }, RightArm: { dir: [-0.9, -0.2, -0.2] } } };
  },
  punch: (u, t) => {
    const k = S(Math.min(1, u * 1.6) * Math.PI);
    return { bones: { Spine: { rot: [0.05, -0.4 * k, 0] }, RightArm: { dir: [-0.3 + k * 0.25, -0.5 + k * 0.5, 0.3 + k * 0.8] }, RightForeArm: { dir: [-0.1 + k * 0.1, 0.1 - k * 0.1, 1] }, LeftArm: { dir: [0.35, -0.5, 0.6] }, LeftForeArm: { dir: [-0.3, 0.6, 0.8] } } };
  },
  flail: (u, t) => ({ bones: { LeftArm: { dir: [0.5, 0.9 + S(t * 13) * 0.4, S(t * 11) * 0.5] }, RightArm: { dir: [-0.5, 0.9 + S(t * 12 + 1) * 0.4, S(t * 10 + 2) * 0.5] }, LeftForeArm: { dir: [0.3, 1, S(t * 15) * 0.8] }, RightForeArm: { dir: [-0.3, 1, S(t * 14 + 1) * 0.8] }, Head: { rot: [-0.2, S(t * 9) * 0.3, 0] } } }),
  dance2: (u, t) => {
    const b = S(t * 8.4);
    return { hips: [b * 0.05, Math.abs(b) * 0.06, 0], bones: { Spine: { rot: [0, b * 0.3, b * 0.12] }, LeftArm: { dir: [0.7, 0.5 + b * 0.5, 0.3] }, RightArm: { dir: [-0.7, 0.5 - b * 0.5, 0.3] }, LeftForeArm: { dir: [0.2, 1, b] }, RightForeArm: { dir: [-0.2, 1, -b] }, LeftUpLeg: { dir: [0.15, -1, Math.max(0, b) * 0.5] }, RightUpLeg: { dir: [-0.15, -1, Math.max(0, -b) * 0.5] }, Head: { rot: [S(t * 16.8) * 0.15, 0, 0] } } };
  },
  sneeze: (u, t) => {
    const k = u < 0.75 ? -u / 0.75 * 0.35 : 0.9 * S((u - 0.75) / 0.25 * Math.PI);
    return { bones: { Spine: { rot: [k, 0, 0] }, Neck: { rot: [k * 0.6, 0, 0] }, LeftArm: { dir: [0.3, -0.9, 0.3] }, RightArm: { dir: [-0.3, -0.5, 0.8] }, RightForeArm: { dir: [0.4, 0.7, 0.5] } } };
  },
  sitSofa: (u, t) => { const p = sitBase(0.55); p.hips = [0, -0.55, -0.12]; p.bones.Spine = { rot: [-0.25, 0, 0] }; p.bones.LeftArm = { dir: [0.4, -0.9, -0.1] }; p.bones.RightArm = { dir: [-0.2, -0.8, 0.3] }; p.bones.RightForeArm = { dir: [0.3, 0.5, 0.8] }; p.bones.LeftForeArm = { dir: [0.1, -0.6, 0.7] }; p.bones.Head = { rot: [0.35, 0, 0] }; return p; },
  toilet: (u, t) => { const p = sitBase(0.5); p.bones.Spine = { rot: [0.45, 0, 0] }; p.bones.LeftArm = { dir: [0.3, -0.6, 0.7] }; p.bones.RightArm = { dir: [-0.3, -0.6, 0.7] }; p.bones.LeftForeArm = { dir: [-0.3, 0.6, 0.6] }; p.bones.RightForeArm = { dir: [0.3, 0.6, 0.6] }; p.bones.Head = { rot: [0.2, 0, 0] }; return p; },
};

const UPPER = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const POSE_CFG = {
  sitType: { duration: 2 }, sitGame: { duration: 3 }, sitIdle: { duration: 6 }, sitSleep: { duration: 4 }, sitCheer: { duration: 1.2 }, sitRage: { duration: 1 },
  sitStream: { duration: 7 }, standPhone: { duration: 2 }, standArms: { duration: 8 }, cheer: { duration: 1.2 }, angry: { duration: 0.9 }, handsUp: { duration: 2 },
  shrug: { duration: 1.4 }, wave: { duration: 1.4 }, kick: { duration: 0.7 }, punch: { duration: 0.5 }, dance2: { duration: 1.5 }, sneeze: { duration: 1.4 },
  sitSofa: { duration: 2 }, toilet: { duration: 2 },
  carry: { duration: 1, subset: UPPER }, flail: { duration: 2, subset: UPPER },
};

export async function loadCharacters(base, onProgress) {
  const loader = new GLTFLoader();
  const files = { soldier: 'models/Soldier.glb', xbot: 'models/Xbot.glb', michelle: 'models/Michelle.glb', robot: 'models/RobotExpressive.glb' };
  const g = {}; let n = 0;
  await Promise.all(Object.entries(files).map(([k, f]) => new Promise((res, rej) => loader.load(base + f, (gl) => { g[k] = gl; n++; onProgress && onProgress(n / 4); res(); }, undefined, rej))));
  const bases = {
    soldier: new BaseModel('soldier', g.soldier, 'TPose'),
    xbot: new BaseModel('xbot', g.xbot, null),
    michelle: new BaseModel('michelle', g.michelle, 'TPose'),
  };
  const sol = bases.soldier;
  for (const b of Object.values(bases)) {
    const own = b === sol;
    b.clips.idle = own ? sol.clipsNative.Idle : retarget(sol, b, sol.clipsNative.Idle, { name: 'idle' });
    b.clips.walk = own ? sol.clipsNative.Walk : retarget(sol, b, sol.clipsNative.Walk, { name: 'walk' });
    b.clips.run = own ? sol.clipsNative.Run : retarget(sol, b, sol.clipsNative.Run, { name: 'run' });
    b.clips.dance = b === bases.michelle ? b.clipsNative.SambaDance : retarget(bases.michelle, b, bases.michelle.clipsNative.SambaDance, { name: 'dance' });
    b.clips.nod = b === bases.xbot ? b.clipsNative.agree : retarget(bases.xbot, b, bases.xbot.clipsNative.agree, { name: 'nod', inPlace: true });
    b.clips.headShake = b === bases.xbot ? b.clipsNative.headShake : retarget(bases.xbot, b, bases.xbot.clipsNative.headShake, { name: 'headShake', inPlace: true });
    for (const [name, fn] of Object.entries(POSES)) b.clips[name] = bakePose(b, name, fn, POSE_CFG[name] || {});
  }
  return { bases, robotGltf: g.robot };
}

export function instantiate(base) {
  const model = SkeletonUtils.clone(base.scene);
  const bones = {}; const meshes = [];
  model.traverse((o) => {
    if (o.isBone) bones[canon(o.name)] = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      meshes.push(o);
    }
  });
  return { model, bones, meshes };
}
