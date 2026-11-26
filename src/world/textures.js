import * as THREE from 'three';

// ---------- seeded random ----------
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// tileable fbm value noise field 0..1
export function fbm(w, h, { scale = 8, octaves = 5, seed = 1, gain = 0.5, stretchX = 1, stretchY = 1 } = {}) {
  const out = new Float32Array(w * h);
  const rand = mulberry(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const lx = Math.max(1, Math.round(scale * stretchX * (1 << o)));
    const ly = Math.max(1, Math.round(scale * stretchY * (1 << o)));
    const lat = new Float32Array(lx * ly);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * ly; const y0 = Math.floor(fy); const ty = fy - y0; const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % ly) * lx, r1 = ((y0 + 1) % ly) * lx;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * lx; const x0 = Math.floor(fx); const tx = fx - x0; const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % lx, c1 = (x0 + 1) % lx;
        const a = lat[r0 + c0], b = lat[r0 + c1], c = lat[r1 + c0], d = lat[r1 + c1];
        out[y * w + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function normalFromHeight(field, w, h, strength = 2) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = field[y * w + ((x - 1 + w) % w)], r = field[y * w + ((x + 1) % w)];
    const u = field[((y - 1 + h) % h) * w + x], dn = field[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function fieldToCanvas(field, w, h, fn) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  for (let i = 0; i < w * h; i++) { const [r, g, b] = fn(field[i], i % w, Math.floor(i / w)); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function tex(canvas, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function hexToRgb(hex) { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; }

// ---------- material texture sets ----------
export function plasterSet(seed = 3) {
  const S = 256;
  const f = fbm(S, S, { scale: 6, octaves: 6, seed });
  const fine = fbm(S, S, { scale: 48, octaves: 2, seed: seed + 9 });
  const hf = new Float32Array(S * S); for (let i = 0; i < hf.length; i++) hf[i] = f[i] * 0.6 + fine[i] * 0.4;
  const color = fieldToCanvas(hf, S, S, (v) => { const k = 235 + (v - 0.5) * 22; return [k, k, k]; });
  const rough = fieldToCanvas(fine, S, S, (v) => { const k = 210 + (v - 0.5) * 50; return [k, k, k]; });
  return { map: color, normal: normalFromHeight(hf, S, S, 1.6), rough };
}

export function concreteSet(seed = 5, base = 0x8a8a86) {
  const S = 512;
  const f = fbm(S, S, { scale: 4, octaves: 7, seed });
  const sp = fbm(S, S, { scale: 64, octaves: 2, seed: seed + 3 });
  const rgb = hexToRgb(base);
  const rnd = mulberry(seed + 11);
  const color = fieldToCanvas(f, S, S, (v, x, y) => { const s = sp[y * S + x]; const k = 0.82 + v * 0.32 + (s > 0.72 ? -0.12 : 0) + (rnd() - 0.5) * 0.05; return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; });
  const hf = new Float32Array(S * S); for (let i = 0; i < hf.length; i++) hf[i] = f[i] * 0.5 + sp[i] * 0.5;
  const rough = fieldToCanvas(f, S, S, (v) => { const k = 190 + v * 60; return [k, k, k]; });
  return { map: color, normal: normalFromHeight(hf, S, S, 3), rough };
}

export function asphaltSet(seed = 7) {
  const S = 512;
  const f = fbm(S, S, { scale: 5, octaves: 6, seed });
  const rnd = mulberry(seed);
  const n = new Float32Array(S * S); for (let i = 0; i < n.length; i++) n[i] = rnd();
  const color = fieldToCanvas(f, S, S, (v, x, y) => { const s = n[y * S + x]; const k = 38 + v * 26 + (s > 0.93 ? 40 : 0) + (s < 0.05 ? -14 : 0); return [k, k, k * 1.02]; });
  const hf = new Float32Array(S * S); for (let i = 0; i < hf.length; i++) hf[i] = n[i] * 0.6 + f[i] * 0.4;
  const rough = fieldToCanvas(f, S, S, (v) => { const k = 200 + v * 50; return [k, k, k]; });
  return { map: color, normal: normalFromHeight(hf, S, S, 2.4), rough };
}

export function fabricSet(base = 0x2b3442, seed = 9) {
  const S = 256;
  const rgb = hexToRgb(base);
  const f = fbm(S, S, { scale: 16, octaves: 3, seed });
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wv = (Math.sin(x * Math.PI / 2) * 0.5 + 0.5) * ((y >> 1) % 2 ? 1 : 0.4) + (Math.sin(y * Math.PI / 2) * 0.5 + 0.5) * ((x >> 1) % 2 ? 0.4 : 1);
    h[y * S + x] = wv * 0.5 + f[y * S + x] * 0.5;
  }
  const color = fieldToCanvas(h, S, S, (v) => { const k = 0.78 + v * 0.35; return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; });
  return { map: color, normal: normalFromHeight(h, S, S, 2.2) };
}

export function leatherSet(base = 0x151515, seed = 13) {
  const S = 256;
  const rgb = hexToRgb(base);
  const f = fbm(S, S, { scale: 24, octaves: 4, seed });
  const cr = fbm(S, S, { scale: 6, octaves: 3, seed: seed + 1 });
  const h = new Float32Array(S * S); for (let i = 0; i < h.length; i++) h[i] = Math.abs(f[i] - 0.5) * 1.6 + cr[i] * 0.2;
  const color = fieldToCanvas(h, S, S, (v) => { const k = 0.85 + v * 0.3; return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; });
  const rough = fieldToCanvas(h, S, S, (v) => { const k = 120 + v * 90; return [k, k, k]; });
  return { map: color, normal: normalFromHeight(h, S, S, 2.5), rough };
}

export function brushedSet(seed = 17) {
  const S = 256;
  const f = fbm(S, S, { scale: 2, octaves: 5, seed, stretchX: 0.05, stretchY: 12 });
  const rough = fieldToCanvas(f, S, S, (v) => { const k = 80 + v * 90; return [k, k, k]; });
  return { rough, normal: normalFromHeight(f, S, S, 0.8) };
}

export function woodGrainSet(base = 0x6b4a2e, seed = 21) {
  const W = 512, H = 512;
  const rgb = hexToRgb(base);
  const f = fbm(W, H, { scale: 3, octaves: 4, seed, stretchX: 0.25, stretchY: 4 });
  const fine = fbm(W, H, { scale: 6, octaves: 3, seed: seed + 5, stretchX: 0.1, stretchY: 18 });
  const h = new Float32Array(W * H);
  for (let i = 0; i < h.length; i++) { const v = f[i] * 10; h[i] = (v - Math.floor(v)) * 0.6 + fine[i] * 0.4; }
  const color = fieldToCanvas(h, W, H, (v) => { const k = 0.72 + v * 0.45; return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; });
  const rough = fieldToCanvas(h, W, H, (v) => { const k = 120 + v * 60; return [k, k, k]; });
  return { map: color, normal: normalFromHeight(h, W, H, 0.9), rough };
}

export function graniteSet(seed = 23) {
  const S = 512; const rnd = mulberry(seed);
  const f = fbm(S, S, { scale: 10, octaves: 5, seed });
  const color = fieldToCanvas(f, S, S, (v) => {
    const r = rnd(); let k = 30 + v * 40;
    if (r > 0.985) k = 190; else if (r > 0.95) k = 110; else if (r < 0.02) k = 8;
    return [k, k * 0.98, k * 0.96];
  });
  const rough = fieldToCanvas(f, S, S, (v) => { const k = 40 + v * 60; return [k, k, k]; });
  return { map: color, rough };
}

export function carpetSet(base = 0x3a1830, seed = 31) {
  const S = 256; const rgb = hexToRgb(base); const rnd = mulberry(seed);
  const f = fbm(S, S, { scale: 20, octaves: 3, seed });
  const h = new Float32Array(S * S); for (let i = 0; i < h.length; i++) h[i] = f[i] * 0.5 + rnd() * 0.5;
  const color = fieldToCanvas(h, S, S, (v, x, y) => {
    const pat = ((Math.floor(x / 32) + Math.floor(y / 32)) % 2) ? 1.0 : 0.88;
    const k = (0.75 + v * 0.4) * pat; return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  });
  return { map: color, normal: normalFromHeight(h, S, S, 1.8) };
}

export function ceilingTileSet() {
  const S = 256; const c = makeCanvas(S, S); const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9d6cf'; ctx.fillRect(0, 0, S, S);
  const rnd = mulberry(77);
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = `rgba(80,80,80,${0.15 + rnd() * 0.25})`; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.2, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#8a8a86'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = '#b8b6af'; ctx.lineWidth = 2; ctx.strokeRect(5, 5, S - 10, S - 10);
  const h = new Float32Array(S * S);
  const d = ctx.getImageData(0, 0, S, S).data; for (let i = 0; i < S * S; i++) h[i] = d[i * 4] / 255;
  return { map: c, normal: normalFromHeight(h, S, S, 3) };
}

// ---------- decals / labels ----------
const BRANDS = [
  { name: 'VOLT', sub: 'ENERGY', bg: '#0b0b10', fg: '#b6ff2e', acc: '#3fe0ff' },
  { name: 'FIZZ', sub: 'COLA', bg: '#c4141c', fg: '#ffffff', acc: '#ffd54d' },
  { name: 'BYTE', sub: 'BOOST', bg: '#1a2cff', fg: '#ffffff', acc: '#ff3fa4' },
  { name: 'LAGG', sub: 'LEMON', bg: '#ffe23d', fg: '#1d1d1d', acc: '#2fbf4a' },
  { name: 'GRAPE', sub: 'GLITCH', bg: '#5b1c86', fg: '#fff', acc: '#c39bff' },
];
export function canLabel(i) {
  const b = BRANDS[i % BRANDS.length];
  const c = makeCanvas(256, 128); const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, b.bg); g.addColorStop(0.5, shade(b.bg, 1.25)); g.addColorStop(1, b.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = b.acc; ctx.beginPath(); ctx.moveTo(0, 90); ctx.bezierCurveTo(80, 60, 160, 120, 256, 80); ctx.lineTo(256, 100); ctx.bezierCurveTo(160, 140, 80, 80, 0, 110); ctx.fill();
  ctx.fillStyle = b.fg; ctx.font = '900 44px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.name, 64, 50); ctx.fillText(b.name, 192, 50);
  ctx.font = '700 14px Arial'; ctx.fillText(b.sub, 64, 80); ctx.fillText(b.sub, 192, 80);
  return c;
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

const SNACKS = [
  { name: 'CRUNCHOS', bg: '#ff7a00', fg: '#fff', acc: '#ffd400' },
  { name: 'NACHO.EXE', bg: '#e01f3d', fg: '#fff', acc: '#ffb700' },
  { name: 'PIXEL PUFFS', bg: '#1ba3ff', fg: '#fff', acc: '#ff4fd8' },
  { name: 'SALT MINE', bg: '#2e7d32', fg: '#fff', acc: '#c5e1a5' },
];
export function snackLabel(i) {
  const s = SNACKS[i % SNACKS.length];
  const c = makeCanvas(128, 160); const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 160); g.addColorStop(0, s.bg); g.addColorStop(1, shade(s.bg, 0.7));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = s.acc; ctx.beginPath(); ctx.arc(64, 95, 38, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffcc33'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(44 + (k % 3) * 20, 85 + Math.floor(k / 3) * 18, 10, 7, k, 0, 7); ctx.fill(); }
  ctx.fillStyle = s.fg; ctx.font = '900 17px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.fillText(s.name, 64, 34);
  ctx.font = '700 10px Arial'; ctx.fillText('EXTRA CRUNCH', 64, 50);
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(0, 0, 128, 10); ctx.fillRect(0, 150, 128, 10);
  return c;
}

const POSTERS = [
  { title: 'NEON STRIKE', sub: 'SEASON 9', c1: '#ff2fa0', c2: '#2a0a4a', glyph: 'tri' },
  { title: 'SPACE GOATS', sub: 'BAAA-TTLE ROYALE', c1: '#2fffe0', c2: '#06142a', glyph: 'planet' },
  { title: 'KART CHAOS', sub: 'DRIFT OR DIE', c1: '#ffb12f', c2: '#3a0e05', glyph: 'stripes' },
  { title: 'DUNGEON DOGE', sub: 'MUCH LOOT', c1: '#a6ff2f', c2: '#0d2205', glyph: 'sword' },
  { title: 'LAG IS A LIE', sub: 'PING PALACE PRESENTS', c1: '#35f2ff', c2: '#0a0a1a', glyph: 'wave' },
  { title: 'TAX EVASION 3', sub: 'THE SIMULATOR', c1: '#ff4d5e', c2: '#1a0505', glyph: 'sun' },
];
export function posterCanvas(i) {
  const p = POSTERS[i % POSTERS.length];
  const W = 256, H = 360; const c = makeCanvas(W, H); const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, p.c2); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.c1; ctx.fillStyle = p.c1; ctx.lineWidth = 4; ctx.shadowColor = p.c1; ctx.shadowBlur = 18;
  const cx = W / 2, cy = 150;
  if (p.glyph === 'tri') { ctx.beginPath(); ctx.moveTo(cx, cy - 80); ctx.lineTo(cx + 80, cy + 60); ctx.lineTo(cx - 80, cy + 60); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 40); ctx.lineTo(cx + 40, cy + 35); ctx.lineTo(cx - 40, cy + 35); ctx.closePath(); ctx.stroke(); }
  if (p.glyph === 'planet') { ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy, 100, 22, -0.3, 0, 7); ctx.stroke(); for (let k = 0; k < 30; k++) ctx.fillRect(Math.random() * W, Math.random() * 260, 2, 2); }
  if (p.glyph === 'stripes') { for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(0, 60 + k * 30); ctx.lineTo(W, 20 + k * 34); ctx.stroke(); } }
  if (p.glyph === 'sword') { ctx.beginPath(); ctx.moveTo(cx, cy - 90); ctx.lineTo(cx, cy + 60); ctx.moveTo(cx - 40, cy + 30); ctx.lineTo(cx + 40, cy + 30); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + 75, 12, 0, 7); ctx.stroke(); }
  if (p.glyph === 'wave') { for (let k = 0; k < 5; k++) { ctx.beginPath(); for (let x = 0; x <= W; x += 6) ctx.lineTo(x, cy + Math.sin(x * 0.05 + k) * (20 + k * 10) - 40 + k * 20); ctx.stroke(); } }
  if (p.glyph === 'sun') { ctx.beginPath(); ctx.arc(cx, cy, 55, Math.PI, 0); ctx.fill(); for (let k = 0; k < 6; k++) ctx.fillRect(cx - 80, cy + 8 + k * 12, 160, 4); }
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '900 30px Arial Black, Arial'; ctx.shadowColor = p.c1; ctx.shadowBlur = 12;
  ctx.fillText(p.title, cx, 285); ctx.shadowBlur = 0; ctx.font = '700 13px Arial'; ctx.fillStyle = p.c1; ctx.fillText(p.sub, cx, 310);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '10px Arial'; ctx.fillText('COMING SOON TO A PC NEAR YOU', cx, 340);
  return c;
}

export function signCanvas(lines, { w = 512, h = 256, bg = '#111', fg = '#fff', accent = '#35f2ff', font = 'Arial', border = true } = {}) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = accent; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    const size = l.size || 40;
    ctx.font = `${l.weight || 800} ${size}px ${l.font || font}`; ctx.fillStyle = l.color || fg;
    ctx.fillText(l.text, w / 2, h * (i + 1) / (n + 1) + (l.dy || 0));
  });
  return c;
}

export function neonCanvas(text, color, { w = 1024, h = 256, size = 150, font = '900 150px Arial Black, Arial' } = {}) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font.replace('150px', size + 'px');
  ctx.shadowColor = color; ctx.shadowBlur = 40; ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2); ctx.shadowBlur = 20; ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(text, w / 2, h / 2);
  return c;
}

export function facadeCanvas(seed, { cols = 6, rows = 5, base = '#2a2622' } = {}) {
  const W = 512, H = 512; const c = makeCanvas(W, H); const ctx = c.getContext('2d'); const rnd = mulberry(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0.03)`; ctx.fillRect(rnd() * W, rnd() * H, 3, 3); }
  const cw = W / cols, rh = H / rows;
  const lit = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = q * cw + cw * 0.18, y = r * rh + rh * 0.2, w = cw * 0.64, h = rh * 0.55;
    ctx.fillStyle = '#151a20'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#0c1118'; ctx.fillRect(x, y, w, h);
    const on = rnd() < 0.45; lit.push(on);
    if (on) { const warm = rnd() < 0.7; const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, warm ? '#ffd9a0' : '#a8d8ff'); g.addColorStop(1, warm ? '#e8a060' : '#6ca0e0'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); if (rnd() < 0.4) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y, w * (0.3 + rnd() * 0.5), h); } }
    ctx.fillStyle = '#3a342e'; ctx.fillRect(x - 5, y + h + 3, w + 10, 5);
  }
  return c;
}

export function emissiveFromFacade(seed, opts) {
  // a second canvas where only lit windows are bright
  const W = 512, H = 512; const c = makeCanvas(W, H); const ctx = c.getContext('2d'); const rnd = mulberry(seed);
  const cols = opts.cols || 6, rows = opts.rows || 5;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { rnd(); rnd(); rnd(); rnd(); rnd(); }
  const cw = W / cols, rh = H / rows;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = q * cw + cw * 0.18, y = r * rh + rh * 0.2, w = cw * 0.64, h = rh * 0.55;
    const on = rnd() < 0.45;
    if (on) { const warm = rnd() < 0.7; ctx.fillStyle = warm ? '#ffc27a' : '#8cc4ff'; ctx.fillRect(x, y, w, h); if (rnd() < 0.4) { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w * (0.3 + rnd() * 0.5), h); } }
  }
  return c;
}

export function dollarCanvas() {
  const c = makeCanvas(128, 64); const ctx = c.getContext('2d');
  ctx.fillStyle = '#7fb069'; ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#2f5a24'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 120, 56);
  ctx.fillStyle = '#d7ebc8'; ctx.beginPath(); ctx.ellipse(64, 32, 18, 22, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2f5a24'; ctx.font = '900 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 64, 33);
  ctx.font = '900 14px Arial'; ctx.fillText('100', 20, 18); ctx.fillText('100', 108, 48);
  return c;
}

export function puddleCanvas(color = 'rgba(120,70,20,1)') {
  const S = 256; const c = makeCanvas(S, S); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = color; ctx.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) { const r = 90 + Math.sin(a * 3) * 14 + Math.sin(a * 7) * 8; ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  ctx.fill();
  for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(S / 2 + (Math.random() - 0.5) * 220, S / 2 + (Math.random() - 0.5) * 220, 6 + Math.random() * 12, 0, 7); ctx.fill(); }
  return c;
}

export function clockFaceCanvas() {
  const S = 256; const c = makeCanvas(S, S); const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(128, 128, 124, 0, 7); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = '#222';
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r1 = i % 5 ? 108 : 98; ctx.save(); ctx.translate(128, 128); ctx.rotate(a); ctx.fillRect(-(i % 5 ? 1 : 3), -116, i % 5 ? 2 : 6, 116 - r1); ctx.restore(); }
  ctx.font = '700 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillText(String(i), 128 + Math.sin(a) * 78, 128 - Math.cos(a) * 78); }
  ctx.font = '700 11px Arial'; ctx.fillStyle = '#c0283a'; ctx.fillText('PING PALACE', 128, 170);
  return c;
}

export function faceCanvas() {
  // spooky original face for the haunted PC event
  const c = makeCanvas(256, 160); const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#e8f4ff'; ctx.shadowColor = '#9cf'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.ellipse(128, 80, 50, 64, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.ellipse(108, 68, 12, 18, 0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(148, 68, 12, 18, -0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(128, 112, 16, 22, 0, 0, 7); ctx.fill();
  return c;
}
