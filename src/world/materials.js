import * as THREE from 'three';
import * as T from './textures.js';

// Central PBR material library.
export const M = {};
export const TX = {};

function loadTex(loader, url, srgb, repeat) {
  return new Promise((res) => {
    loader.load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      if (repeat) t.repeat.set(repeat[0], repeat[1]);
      res(t);
    }, undefined, () => res(null));
  });
}

export async function loadTextures(base, onProgress) {
  const L = new THREE.TextureLoader();
  const list = [
    ['woodD', 'textures/hardwood2_diffuse.jpg', true], ['woodB', 'textures/hardwood2_bump.jpg', false], ['woodR', 'textures/hardwood2_roughness.jpg', false],
    ['brickD', 'textures/brick_diffuse.jpg', true], ['brickB', 'textures/brick_bump.jpg', false], ['brickR', 'textures/brick_roughness.jpg', false],
    ['tileD', 'textures/floor_tile_diffuse.jpg', true], ['tileN', 'textures/floor_tile_normal.jpg', false],
    ['carbon', 'textures/carbon.png', true], ['carbonN', 'textures/carbon_normal.png', false],
  ];
  let n = 0;
  await Promise.all(list.map(async ([k, url, srgb]) => { TX[k] = await loadTex(L, base + url, srgb); n++; onProgress && onProgress(n / list.length); }));
}

function rep(t, x, y) { if (!t) return null; const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; }

export function buildMaterials(anisotropy = 8) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);

  // --- floors ---
  M.floorWood = std({ map: rep(TX.woodD, 5, 5), bumpMap: rep(TX.woodB, 5, 5), bumpScale: 0.6, roughnessMap: rep(TX.woodR, 5, 5), roughness: 0.85, metalness: 0, color: 0xd8c8b8, envMapIntensity: 0.9 });
  M.floorTile = std({ map: rep(TX.tileD, 3, 3), normalMap: rep(TX.tileN, 3, 3), roughness: 0.28, color: 0xffffff, envMapIntensity: 1.0 });
  const carpet = T.carpetSet(0x3a1430);
  M.carpet = std({ map: T.tex(carpet.map, { repeat: [6, 3] }), normalMap: T.tex(carpet.normal, { srgb: false, repeat: [6, 3] }), roughness: 0.95, envMapIntensity: 0.2 });

  // --- walls ---
  const pl = T.plasterSet(3);
  const plMap = T.tex(pl.map, { repeat: [4, 2] }), plN = T.tex(pl.normal, { srgb: false, repeat: [4, 2] }), plR = T.tex(pl.rough, { srgb: false, repeat: [4, 2] });
  M.wall = std({ color: 0x2d3a46, map: plMap, normalMap: plN, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: plR, roughness: 0.9, envMapIntensity: 0.35 });
  M.wallLight = std({ color: 0xcfc8bc, map: plMap, normalMap: plN, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: plR, roughness: 0.9, envMapIntensity: 0.35 });
  M.wallAccent = std({ color: 0x5b1f3d, map: plMap, normalMap: plN, roughness: 0.85, envMapIntensity: 0.35 });
  M.brick = std({ map: rep(TX.brickD, 3, 1.5), bumpMap: rep(TX.brickB, 3, 1.5), bumpScale: 2.0, roughnessMap: rep(TX.brickR, 3, 1.5), roughness: 1, color: 0xd0c0b0, envMapIntensity: 0.3 });
  M.brickExt = std({ map: rep(TX.brickD, 6, 3), bumpMap: rep(TX.brickB, 6, 3), bumpScale: 2.0, roughnessMap: rep(TX.brickR, 6, 3), roughness: 1, color: 0xb0a090, envMapIntensity: 0.3 });
  const ct = T.ceilingTileSet();
  M.ceiling = std({ map: T.tex(ct.map, { repeat: [16, 12] }), normalMap: T.tex(ct.normal, { srgb: false, repeat: [16, 12] }), roughness: 0.95, color: 0xbdbab2, envMapIntensity: 0.2 });
  M.baseboard = std({ color: 0x15181c, roughness: 0.5, metalness: 0.1 });
  M.trim = std({ color: 0x0e1013, roughness: 0.4, metalness: 0.6 });

  // --- exterior ---
  const cs = T.concreteSet(5, 0x9a9892);
  M.sidewalk = std({ map: T.tex(cs.map, { repeat: [10, 2] }), normalMap: T.tex(cs.normal, { srgb: false, repeat: [10, 2] }), roughnessMap: T.tex(cs.rough, { srgb: false, repeat: [10, 2] }), roughness: 1, envMapIntensity: 0.3 });
  M.concrete = std({ map: T.tex(cs.map, { repeat: [2, 2] }), normalMap: T.tex(cs.normal, { srgb: false, repeat: [2, 2] }), roughness: 0.95, envMapIntensity: 0.3 });
  const as = T.asphaltSet(7);
  M.asphalt = std({ map: T.tex(as.map, { repeat: [14, 2] }), normalMap: T.tex(as.normal, { srgb: false, repeat: [14, 2] }), roughnessMap: T.tex(as.rough, { srgb: false, repeat: [14, 2] }), roughness: 1, envMapIntensity: 0.5 });
  M.roadLine = std({ color: 0xe8e2c8, roughness: 0.7 });

  // --- furniture ---
  const wg = T.woodGrainSet(0x7a5434, 21);
  M.deskWood = std({ map: T.tex(wg.map, { repeat: [1, 1] }), normalMap: T.tex(wg.normal, { srgb: false }), roughnessMap: T.tex(wg.rough, { srgb: false }), roughness: 0.7, envMapIntensity: 0.6 });
  M.deskBlack = std({ color: 0x18191c, roughness: 0.42, metalness: 0.05, normalMap: T.tex(wg.normal, { srgb: false }), normalScale: new THREE.Vector2(0.2, 0.2), envMapIntensity: 0.8 });
  M.deskWhite = std({ color: 0xe6e6e2, roughness: 0.35, envMapIntensity: 0.8 });
  const gr = T.graniteSet();
  M.granite = std({ map: T.tex(gr.map, { repeat: [3, 1] }), roughnessMap: T.tex(gr.rough, { srgb: false, repeat: [3, 1] }), roughness: 0.3, metalness: 0, envMapIntensity: 1.1 });
  const brushed = T.brushedSet();
  M.metal = std({ color: 0x9aa0a6, metalness: 1, roughness: 0.35, roughnessMap: T.tex(brushed.rough, { srgb: false }), envMapIntensity: 1.0 });
  M.metalDark = std({ color: 0x2a2d31, metalness: 0.9, roughness: 0.4, roughnessMap: T.tex(brushed.rough, { srgb: false }), envMapIntensity: 1.0 });
  M.chrome = std({ color: 0xffffff, metalness: 1, roughness: 0.08, envMapIntensity: 1.2 });
  M.blackPlastic = std({ color: 0x0d0e10, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 });
  M.greyPlastic = std({ color: 0x4a4e55, roughness: 0.5, envMapIntensity: 0.7 });
  M.whitePlastic = std({ color: 0xe8e8e4, roughness: 0.4, envMapIntensity: 0.7 });
  M.rubber = std({ color: 0x101010, roughness: 0.9 });
  M.carbon = std({ map: rep(TX.carbon, 4, 4), normalMap: rep(TX.carbonN, 4, 4), roughness: 0.35, metalness: 0.3, color: 0x777777 });
  const fab = T.fabricSet(0x2b3442);
  M.fabric = std({ map: T.tex(fab.map, { repeat: [2, 2] }), normalMap: T.tex(fab.normal, { srgb: false, repeat: [2, 2] }), roughness: 0.95, envMapIntensity: 0.25 });
  const fabR = T.fabricSet(0x6a1e2c, 19);
  M.fabricRed = std({ map: T.tex(fabR.map, { repeat: [2, 2] }), normalMap: T.tex(fabR.normal, { srgb: false, repeat: [2, 2] }), roughness: 0.95, envMapIntensity: 0.25 });
  const fabG = T.fabricSet(0x3a4a3a, 29);
  M.fabricSofa = std({ map: T.tex(fabG.map, { repeat: [3, 3] }), normalMap: T.tex(fabG.normal, { srgb: false, repeat: [3, 3] }), roughness: 0.95, envMapIntensity: 0.25 });
  const lth = T.leatherSet(0x151515);
  M.leather = std({ map: T.tex(lth.map, { repeat: [2, 2] }), normalMap: T.tex(lth.normal, { srgb: false, repeat: [2, 2] }), roughnessMap: T.tex(lth.rough, { srgb: false, repeat: [2, 2] }), roughness: 0.6, envMapIntensity: 0.6 });
  const lthR = T.leatherSet(0xb0141f, 41);
  M.leatherRed = std({ map: T.tex(lthR.map, { repeat: [2, 2] }), normalMap: T.tex(lthR.normal, { srgb: false, repeat: [2, 2] }), roughnessMap: T.tex(lthR.rough, { srgb: false, repeat: [2, 2] }), roughness: 0.55, envMapIntensity: 0.6 });
  const lthC = T.leatherSet(0x0fa3b8, 43);
  M.leatherCyan = std({ map: T.tex(lthC.map, { repeat: [2, 2] }), normalMap: T.tex(lthC.normal, { srgb: false, repeat: [2, 2] }), roughnessMap: T.tex(lthC.rough, { srgb: false, repeat: [2, 2] }), roughness: 0.55, envMapIntensity: 0.6 });
  M.plasticChair = std({ color: 0xe0e0dc, roughness: 0.35 });
  M.plasticChairBlue = std({ color: 0x2856a8, roughness: 0.38 });
  M.cardboard = std({ color: 0xb08a5a, roughness: 0.95 });
  M.tape = std({ color: 0xc9a46a, roughness: 0.5 });
  M.paper = std({ color: 0xf2f0ea, roughness: 0.9 });
  M.mattress = std({ color: 0xe8e4dc, roughness: 0.95 });
  M.blanket = M.fabricRed;
  M.porcelain = phys({ color: 0xf4f4f2, roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  M.soil = std({ color: 0x2a1d12, roughness: 1 });
  M.terracotta = std({ color: 0xa65a3a, roughness: 0.85 });
  M.leaf = std({ color: 0x2f6b2a, roughness: 0.6, side: THREE.DoubleSide });
  M.leafDark = std({ color: 0x1f4a1c, roughness: 0.6, side: THREE.DoubleSide });
  M.skin = std({ color: 0xd9a07c, roughness: 0.55 });
  M.yellowPlastic = std({ color: 0xffd21f, roughness: 0.4 });
  M.redPaint = std({ color: 0xc41f26, roughness: 0.4, metalness: 0.2 });

  // glass
  M.glass = phys({ color: 0xaecbd6, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide });
  M.glassDark = phys({ color: 0x223038, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.5, envMapIntensity: 1.4, depthWrite: false });
  M.glassTint = phys({ color: 0x80a0b0, roughness: 0.05, transparent: true, opacity: 0.25, envMapIntensity: 1.2, depthWrite: false });

  // emissive
  M.screenOff = std({ color: 0x050607, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.2 });
  M.lightPanel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 3.2, roughness: 1 });
  M.ledCyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x35f2ff, emissiveIntensity: 3 });
  M.ledPink = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3fa4, emissiveIntensity: 3 });
  M.ledWarm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb060, emissiveIntensity: 3 });
  M.ledRed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2020, emissiveIntensity: 4 });
  M.ledGreen = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x30ff60, emissiveIntensity: 4 });
  M.rgb = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff00ff, emissiveIntensity: 3.5 }); // animated hue
  M.fridgeLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 1.05 });

  return M;
}

export function labelMat(canvas, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: T.tex(canvas, {}), roughness: opts.rough ?? 0.4, metalness: opts.metal ?? 0, envMapIntensity: opts.env ?? 0.8, transparent: !!opts.transparent });
}
