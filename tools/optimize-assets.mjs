// Shrinks source assets in public/assets into web/mobile-friendly versions in src/assets
// (they get embedded into the single-file build).
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, textureCompress, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const SRC = 'assets-src', OUT = 'src/assets';
for (const d of ['models', 'textures', 'sky']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const MODELS = {
  'Soldier.glb': { keep: ['Idle', 'Walk', 'Run', 'TPose'], tex: 512, ratio: 1 },
  'Xbot.glb': { keep: ['agree', 'headShake'], tex: 512, ratio: 0.4 },
  'Michelle.glb': { keep: ['SambaDance', 'TPose'], tex: 512, ratio: 0.6 },
  'RobotExpressive.glb': { keep: ['Idle', 'Walking', 'Death', 'Standing', 'Yes', 'ThumbsUp'], tex: 256, ratio: 1 },
};
for (const [f, o] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(SRC, 'models', f));
  for (const a of doc.getRoot().listAnimations()) if (!o.keep.includes(a.getName())) a.dispose();
  const steps = [prune(), dedup(), resample({ tolerance: 1e-4 })];
  if (o.ratio < 1) steps.push(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: o.ratio, error: 0.004, lockBorder: true }));
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [o.tex, o.tex], quality: 78 }), prune());
  await doc.transform(...steps);
  const out = path.join(OUT, 'models', f);
  await io.write(out, doc);
  console.log(f, (fs.statSync(path.join(SRC, 'models', f)).size / 1024).toFixed(0) + 'KB ->', (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}

const TEX = { 'hardwood2_diffuse.jpg': 1024, 'hardwood2_bump.jpg': 512, 'hardwood2_roughness.jpg': 512, 'brick_diffuse.jpg': 1024, 'brick_bump.jpg': 512, 'brick_roughness.jpg': 512, 'floor_tile_diffuse.jpg': 512, 'floor_tile_normal.jpg': 512, 'carbon.png': 128, 'carbon_normal.png': 128 };
for (const [f, size] of Object.entries(TEX)) {
  const out = path.join(OUT, 'textures', f.replace(/\.(jpg|png)$/, '.webp'));
  await sharp(path.join(SRC, 'textures', f)).resize(size, size, { fit: 'fill' }).webp({ quality: f.includes('normal') ? 88 : 76 }).toFile(out);
  console.log(f, '->', (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}

// HDR skies -> tone-mapped LDR equirect webp (no HDR decoding needed at runtime)
const SKY = { 'pedestrian_overpass_1k.hdr': ['day.webp', 0.9], 'venice_sunset_1k.hdr': ['sunset.webp', 0.8], 'moonless_golf_1k.hdr': ['night.webp', 6.0] };
for (const [f, [name, exposure]] of Object.entries(SKY)) {
  const buf = fs.readFileSync(path.join(SRC, 'hdr', f));
  const loader = new RGBELoader(); loader.setDataType(THREE.FloatType);
  const r = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const { width: w, height: h, data } = r;
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) {
    let v = data[i * 4 + c] * exposure; v = v / (1 + v * 0.35) * 1.1; // soft shoulder
    v = Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
    px[i * 3 + c] = Math.round(v * 255);
  }
  // RGBELoader output rows are bottom-up already flipped for GL; write as-is and mark flipY=false at runtime
  const out = path.join(OUT, 'sky', name);
  await sharp(px, { raw: { width: w, height: h, channels: 3 } }).resize(1024, 512).webp({ quality: 80 }).toFile(out);
  console.log(f, '->', name, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}
