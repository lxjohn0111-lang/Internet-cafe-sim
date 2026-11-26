import * as THREE from 'three';
import { faceCanvas } from './textures.js';

// Animated canvas screens for monitors. Each screen draws an original fake game / app.
const W = 256, H = 160;
export const MODES = ['shooter', 'racer', 'arena', 'blocks', 'chat', 'office', 'stream', 'cards'];

export class Screen {
  constructor(mesh, { curved = false, w = W, h = H, intensity = 1.6 } = {}) {
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: intensity, roughness: 0.2, metalness: 0.1, envMapIntensity: 0.6 });
    if (curved) { this.tex.wrapS = THREE.RepeatWrapping; }
    this.baseIntensity = intensity;
    this.mesh = mesh; mesh.material = this.mat;
    this.mode = 'off'; this.t = Math.random() * 10; this.seed = Math.random() * 1000;
    this.state = {}; this.power = true; this.brightness = 1;
    this.w = w; this.h = h;
    this.draw();
  }
  setMode(m) { if (this.mode === m) return; this.mode = m; this.state = {}; this.draw(); }
  setPower(on) { this.power = on; this.draw(); }
  update(dt) { this.t += dt; this.draw(); }

  // average color estimate for light tinting
  glowColor() {
    switch (this.mode) {
      case 'shooter': return 0x9ab8ff; case 'racer': return 0xffb070; case 'arena': return 0x60ff90; case 'blocks': return 0x80d0ff;
      case 'bsod': return 0x2050ff; case 'haunted': return 0xa0c8ff; case 'stream': return 0xc070ff; case 'disco': return 0xff40c0;
      case 'off': return 0x000000; default: return 0xd0e0ff;
    }
  }

  draw() {
    const c = this.ctx, w = this.w, h = this.h, t = this.t;
    if (!this.power || this.mode === 'off') { c.fillStyle = '#020203'; c.fillRect(0, 0, w, h); this.tex.needsUpdate = true; this.mat.emissiveIntensity = 0; return; }
    this.mat.emissiveIntensity = this.baseIntensity * this.brightness;
    const fn = this['d_' + this.mode]; if (fn) fn.call(this, c, w, h, t); else this.d_desktop(c, w, h, t);
    // scanline-ish subtle overlay
    c.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    this.tex.needsUpdate = true;
  }

  d_desktop(c, w, h, t) {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#102a4a'); g.addColorStop(1, '#3a1050'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(53,242,255,.85)'; c.font = '900 22px Arial'; c.textAlign = 'center'; c.fillText('PING', w / 2 - 34, h / 2); c.fillStyle = 'rgba(255,63,164,.9)'; c.fillText('PALACE', w / 2 + 36, h / 2);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '10px Arial'; c.fillText('Log in to start your session', w / 2, h / 2 + 18);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, h - 14, w, 14);
    for (let i = 0; i < 5; i++) { c.fillStyle = ['#35f2ff', '#ff3fa4', '#ffd34d', '#4dff9a', '#fff'][i]; c.fillRect(8 + i * 16, h - 11, 10, 8); }
  }
  d_shooter(c, w, h, t) {
    const sway = Math.sin(t * 0.7 + this.seed) * 30;
    const g = c.createLinearGradient(0, 0, 0, h * 0.55); g.addColorStop(0, '#5a7fb8'); g.addColorStop(1, '#c8d4e0'); c.fillStyle = g; c.fillRect(0, 0, w, h * 0.55);
    c.fillStyle = '#6a6458'; c.fillRect(0, h * 0.55, w, h * 0.45);
    for (let i = 0; i < 7; i++) { const x = ((i * 53 + sway * (1 + i * 0.1)) % (w + 60)) - 30; const bh = 30 + (i * 37 % 40); c.fillStyle = i % 2 ? '#4a4a52' : '#5a5650'; c.fillRect(x, h * 0.55 - bh, 40, bh); c.fillStyle = '#2a2a30'; c.fillRect(x + 8, h * 0.55 - bh + 8, 8, 8); c.fillRect(x + 24, h * 0.55 - bh + 8, 8, 8); }
    // enemies
    for (let i = 0; i < 2; i++) { const ex = (w / 2 + Math.sin(t * (1.1 + i) + i * 3) * 70); c.fillStyle = '#a02020'; c.fillRect(ex - 4, h * 0.55 - 26, 8, 20); c.beginPath(); c.arc(ex, h * 0.55 - 30, 4, 0, 7); c.fill(); }
    // gun
    c.fillStyle = '#222'; c.beginPath(); c.moveTo(w * 0.62, h); c.lineTo(w * 0.7, h * 0.72); c.lineTo(w * 0.78, h * 0.72); c.lineTo(w * 0.86, h); c.fill();
    c.fillStyle = '#444'; c.fillRect(w * 0.69, h * 0.7, w * 0.1, 8);
    if (Math.sin(t * 9 + this.seed) > 0.85) { c.fillStyle = '#ffe070'; c.beginPath(); c.arc(w * 0.735, h * 0.68, 10, 0, 7); c.fill(); }
    c.strokeStyle = '#0f0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(w / 2 - 6, h / 2); c.lineTo(w / 2 + 6, h / 2); c.moveTo(w / 2, h / 2 - 6); c.lineTo(w / 2, h / 2 + 6); c.stroke();
    c.fillStyle = '#fff'; c.font = '700 11px monospace'; c.textAlign = 'left'; c.fillText('HP 87', 6, h - 8); c.textAlign = 'right'; c.fillText(`${24 - Math.floor(t * 2) % 24}/90`, w - 6, h - 8);
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(w - 50, 4, 46, 46); c.fillStyle = '#4dff9a'; c.fillRect(w - 28, 26, 3, 3); c.fillStyle = '#f44'; c.fillRect(w - 40 + Math.sin(t) * 10, 14, 3, 3);
  }
  d_racer(c, w, h, t) {
    const g = c.createLinearGradient(0, 0, 0, h * 0.45); g.addColorStop(0, '#ff8a3a'); g.addColorStop(1, '#ffd8a0'); c.fillStyle = g; c.fillRect(0, 0, w, h * 0.45);
    c.fillStyle = '#3a8a3a'; c.fillRect(0, h * 0.45, w, h);
    const curve = Math.sin(t * 0.5 + this.seed) * 40;
    c.fillStyle = '#333'; c.beginPath(); c.moveTo(w / 2 + curve - 6, h * 0.45); c.lineTo(w / 2 + curve + 6, h * 0.45); c.lineTo(w * 0.95, h); c.lineTo(w * 0.05, h); c.fill();
    for (let i = 0; i < 6; i++) { const p = ((t * 2 + i / 6) % 1); const y = h * 0.45 + p * p * h * 0.55; const x = w / 2 + curve * (1 - p); c.fillStyle = '#fff'; c.fillRect(x - 1 - p * 3, y, 2 + p * 6, 2 + p * 8); }
    for (let i = 0; i < 6; i++) { const p = ((t * 2 + i / 6) % 1); const y = h * 0.45 + p * p * h * 0.55; c.fillStyle = i % 2 ? '#f22' : '#fff'; const x1 = w / 2 + curve * (1 - p) - (6 + p * 110); c.fillRect(x1 - 4 * p, y, 4 + p * 8, 3 + p * 6); const x2 = w / 2 + curve * (1 - p) + (6 + p * 110); c.fillRect(x2, y, 4 + p * 8, 3 + p * 6); }
    c.fillStyle = '#d02030'; c.fillRect(w / 2 - 22, h - 38, 44, 22); c.fillStyle = '#111'; c.fillRect(w / 2 - 24, h - 20, 10, 8); c.fillRect(w / 2 + 14, h - 20, 10, 8); c.fillStyle = '#ff6'; c.fillRect(w / 2 - 18, h - 34, 36, 6);
    c.fillStyle = '#fff'; c.font = '700 14px monospace'; c.textAlign = 'right'; c.fillText(`${180 + Math.floor(Math.sin(t) * 20)} KM/H`, w - 6, h - 8);
    c.textAlign = 'left'; c.fillText(`LAP 2/3`, 6, 16);
  }
  d_arena(c, w, h, t) {
    c.fillStyle = '#1e3a1e'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#6a5a3a'; c.lineWidth = 10; c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.stroke(); c.beginPath(); c.moveTo(0, h * 0.2); c.lineTo(w * 0.8, h); c.stroke();
    c.fillStyle = '#2a5aa0'; c.beginPath(); c.arc(20, h - 20, 16, 0, 7); c.fill(); c.fillStyle = '#a02a2a'; c.beginPath(); c.arc(w - 20, 20, 16, 0, 7); c.fill();
    for (let i = 0; i < 10; i++) { const p = (t * 0.1 + i / 10) % 1; c.fillStyle = i % 2 ? '#6af' : '#f66'; const x = i % 2 ? p * w : (1 - p) * w; const y = i % 2 ? h - p * h : p * h; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    const hx = w / 2 + Math.sin(t * 0.8) * 50, hy = h / 2 + Math.cos(t * 0.6) * 30; c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(hx, hy, 6, 0, 7); c.fill();
    if (Math.sin(t * 5) > 0.7) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(hx, hy, 14, 0, 7); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, h - 22, w, 22); for (let i = 0; i < 6; i++) { c.fillStyle = '#334'; c.fillRect(70 + i * 20, h - 19, 16, 16); c.fillStyle = `hsl(${i * 60},70%,55%)`; c.fillRect(72 + i * 20, h - 17, 12, 12 * ((t * 0.3 + i * 0.2) % 1)); }
    c.fillStyle = '#4dff9a'; c.fillRect(6, h - 16, 50 * (0.5 + Math.sin(t) * 0.3), 4); c.fillStyle = '#35a0ff'; c.fillRect(6, h - 9, 40, 4);
  }
  d_blocks(c, w, h, t) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#78b8ff'); g.addColorStop(1, '#c8e8ff'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const off = (t * 10) % 16;
    for (let x = -16; x < w + 16; x += 16) { const hh = 50 + Math.floor((Math.sin((x + this.seed + Math.floor(t * 10 / 16) * 16) * 0.05) + 1) * 3) * 10; for (let y = h - hh; y < h; y += 16) { c.fillStyle = y === h - hh ? '#5aa03a' : (y < h - hh + 40 ? '#8a5a3a' : '#7a7a7a'); c.fillRect(x - off, y, 15, 15); } }
    c.fillStyle = '#fff'; c.fillRect(30 + (t * 8 % w), 20, 40, 10); c.fillRect(40 + (t * 8 % w), 14, 20, 8);
    c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(w / 2 - 5, h / 2); c.lineTo(w / 2 + 5, h / 2); c.moveTo(w / 2, h / 2 - 5); c.lineTo(w / 2, h / 2 + 5); c.stroke();
    for (let i = 0; i < 9; i++) { c.fillStyle = i === 2 ? '#fff' : 'rgba(0,0,0,.5)'; c.fillRect(w / 2 - 72 + i * 16, h - 18, 15, 15); }
  }
  d_chat(c, w, h, t) {
    c.fillStyle = '#1b1f2a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#12151d'; c.fillRect(0, 0, 50, h);
    for (let i = 0; i < 6; i++) { c.fillStyle = `hsl(${i * 50 + 200},60%,55%)`; c.beginPath(); c.arc(25, 18 + i * 24, 9, 0, 7); c.fill(); }
    const lines = Math.floor(t * 0.8) % 8;
    for (let i = 0; i < 7; i++) {
      const y = 14 + i * 20; const k = (i + lines) % 9;
      c.fillStyle = `hsl(${k * 40},70%,65%)`; c.fillRect(58, y, 30, 5);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(58, y + 8, 60 + (k * 37) % 120, 4);
    }
    c.fillStyle = '#2a3040'; c.fillRect(56, h - 18, w - 62, 12);
    if (Math.floor(t * 2) % 2) { c.fillStyle = '#fff'; c.fillRect(60 + (t * 30 % 100), h - 15, 2, 7); }
  }
  d_office(c, w, h, t) {
    c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#217346'; c.fillRect(0, 0, w, 16);
    c.strokeStyle = '#ddd'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 16); c.lineTo(x, h); c.stroke(); }
    for (let y = 16; y < h; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = '#333'; c.font = '8px monospace';
    for (let r = 0; r < 11; r++) for (let q = 0; q < 8; q++) if ((r * 7 + q * 3 + Math.floor(t)) % 5) c.fillText(String((r * 37 + q * 91) % 997), q * 32 + 3, 26 + r * 12);
    c.strokeStyle = '#1a7af0'; c.lineWidth = 2; c.strokeRect(((Math.floor(t) % 8)) * 32, 16 + (Math.floor(t * 1.7) % 11) * 12, 32, 12);
  }
  d_stream(c, w, h, t) {
    this.d_shooter(c, w * 0.74, h, t);
    c.fillStyle = '#18181f'; c.fillRect(w * 0.74, 0, w * 0.26, h);
    for (let i = 0; i < 9; i++) { const k = (i + Math.floor(t * 3)) % 14; c.fillStyle = `hsl(${k * 26},80%,65%)`; c.fillRect(w * 0.75, 6 + i * 16, 18, 4); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(w * 0.75 + 20, 6 + i * 16, 20 + (k * 13) % 30, 4); }
    c.fillStyle = '#e02020'; c.fillRect(6, 6, 30, 12); c.fillStyle = '#fff'; c.font = '700 9px Arial'; c.textAlign = 'left'; c.fillText('LIVE', 10, 15);
    c.fillText(`👁 ${1200 + Math.floor(t * 13) % 900}`, 40, 15);
  }
  d_cards(c, w, h, t) {
    c.fillStyle = '#0d6a2f'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { c.fillStyle = '#fff'; c.fillRect(10 + i * 34, 14, 28, 38); c.fillStyle = i % 2 ? '#c00' : '#111'; c.font = '700 12px Arial'; c.textAlign = 'left'; c.fillText(['A', 'K', '7', '3', 'Q', '9', 'J'][i], 13 + i * 34, 28); }
    const p = (t * 0.6) % 1; c.fillStyle = '#fff'; c.fillRect(20 + p * 180, 70 + Math.sin(p * 3) * 30, 28, 38);
  }
  d_bsod(c, w, h, t) {
    c.fillStyle = '#1f3fbf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '700 34px Arial'; c.fillText(':(', 14, 44);
    c.font = '11px Arial'; c.fillText('PingOS ran into a problem and', 14, 70); c.fillText('needs a human to bonk it.', 14, 84);
    c.font = '9px monospace'; c.fillText(`ERROR 0xCAFE${(Math.floor(t * 3) % 16).toString(16).toUpperCase()}BABE`, 14, 104);
    c.fillText(`${Math.min(100, Math.floor(t * 7) % 101)}% complete`, 14, 120);
    c.fillStyle = '#fff'; c.fillRect(w - 50, h - 50, 36, 36); c.fillStyle = '#1f3fbf'; c.fillRect(w - 44, h - 44, 8, 8); c.fillRect(w - 28, h - 44, 8, 8); c.fillRect(w - 44, h - 28, 8, 8);
  }
  d_haunted(c, w, h, t) {
    if (!Screen._face) Screen._face = faceCanvas();
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const j = Math.random() < 0.2 ? (Math.random() - 0.5) * 10 : 0;
    c.globalAlpha = 0.6 + Math.sin(t * 13) * 0.3; c.drawImage(Screen._face, j, 0, w, h); c.globalAlpha = 1;
    c.fillStyle = '#f33'; c.font = '700 12px monospace'; c.textAlign = 'center'; if (Math.floor(t * 3) % 2) c.fillText('LET ME PLAY TOO', w / 2, h - 10);
  }
  d_disco(c, w, h, t) {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { c.fillStyle = `hsl(${(i * 40 + j * 60 + t * 200) % 360},90%,55%)`; c.fillRect(i * w / 8, j * h / 5, w / 8, h / 5); }
    c.fillStyle = '#fff'; c.font = '900 26px Arial'; c.textAlign = 'center'; c.fillText('DANCE!', w / 2, h / 2 + 8);
  }
  d_admin(c, w, h, t) {
    c.fillStyle = '#0c1220'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#35f2ff'; c.font = '700 13px Arial'; c.textAlign = 'left'; c.fillText('PingOS · Café Manager', 8, 16);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '10px Arial'; c.fillText('Press [E] to open', 8, 32);
    const st = this.state.stats || {};
    c.fillStyle = '#4dff9a'; c.font = '700 22px monospace'; c.fillText('$' + (st.money ?? 0), 8, 62);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '10px Arial'; c.fillText(`Customers: ${st.customers ?? 0}   PCs: ${st.pcs ?? 0}`, 8, 80);
    c.strokeStyle = '#ff3fa4'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < 30; i++) { const x = 8 + i * 8; const y = 140 - (Math.sin(i * 0.5 + t) * 10 + i * 1.2 + 10); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  d_arcade(c, w, h, t) {
    c.fillStyle = '#05010f'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 8; q++) { if ((r + q + Math.floor(t)) % 7 === 0) continue; c.fillStyle = ['#ff3fa4', '#35f2ff', '#ffd34d', '#4dff9a'][r]; const x = 20 + q * 28 + Math.sin(t) * 12; const y = 20 + r * 16; c.fillRect(x, y, 16, 8); c.fillRect(x + 4, y + 8, 3, 3); c.fillRect(x + 10, y + 8, 3, 3); }
    c.fillStyle = '#fff'; c.fillRect(w / 2 + Math.sin(t * 1.4) * 90 - 10, h - 20, 20, 8); c.fillRect(w / 2 + Math.sin(t * 1.4) * 90 - 2, h - 26, 4, 6);
    c.fillStyle = '#ff0'; c.fillRect(w / 2 + Math.sin(t * 1.4 - 0.5) * 90, h - 30 - ((t * 120) % 100), 2, 6);
    c.fillStyle = '#fff'; c.font = '700 10px monospace'; c.textAlign = 'left'; c.fillText('SCORE ' + String(Math.floor(t * 130)).padStart(6, '0'), 6, 12);
  }
  d_news(c, w, h, t) {
    const st = this.state;
    c.fillStyle = '#0b1530'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#13264f'); g.addColorStop(1, '#0b1530'); c.fillStyle = g; c.fillRect(0, 0, w, h * 0.72);
    c.fillStyle = '#c41f26'; c.fillRect(0, h * 0.72, w * 0.28, h * 0.14); c.fillStyle = '#fff'; c.font = `900 ${Math.round(h * 0.08)}px Arial`; c.textAlign = 'center'; c.fillText('BREAKING', w * 0.14, h * 0.81);
    c.fillStyle = '#fff'; c.fillRect(w * 0.28, h * 0.72, w * 0.72, h * 0.14); c.fillStyle = '#111'; c.textAlign = 'left'; c.font = `700 ${Math.round(h * 0.075)}px Arial`; c.fillText(st.headline || 'Local net café still standing, experts baffled', w * 0.3, h * 0.81);
    c.fillStyle = '#e8a020'; c.fillRect(0, h * 0.86, w, h * 0.14);
    c.fillStyle = '#111'; c.font = `700 ${Math.round(h * 0.06)}px Arial`;
    const ticker = (st.ticker || 'PING PALACE: WiFi fast, snacks faster • Weather: 100% chance of lag • Pigeons spotted downtown • Crypto up 4000%, then down 4001% • ');
    const tw = c.measureText(ticker).width; const x = w - ((t * 60) % (tw + w));
    c.fillText(ticker, x, h * 0.95); c.fillText(ticker, x + tw, h * 0.95);
    // anchor silhouette (original simple figure)
    c.fillStyle = '#d8b898'; c.beginPath(); c.arc(w * 0.5, h * 0.3, h * 0.11, 0, 7); c.fill();
    c.fillStyle = '#26324a'; c.beginPath(); c.moveTo(w * 0.33, h * 0.72); c.quadraticCurveTo(w * 0.5, h * 0.35, w * 0.67, h * 0.72); c.fill();
    c.fillStyle = '#c41f26'; c.fillRect(w * 0.49, h * 0.45, w * 0.02, h * 0.18);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `700 ${Math.round(h * 0.06)}px Arial`; c.textAlign = 'left'; c.fillText('PNN 24/7', 8, h * 0.1);
  }
}

export class ScreenManager {
  constructor() { this.list = []; this.cursor = 0; this.perFrame = 4; this.acc = 0; }
  add(s) { this.list.push(s); return s; }
  remove(s) { const i = this.list.indexOf(s); if (i >= 0) this.list.splice(i, 1); }
  update(dt) {
    // round-robin redraw ~ every list.length/perFrame frames
    this.acc += dt;
    const n = Math.min(this.list.length, this.perFrame);
    for (let i = 0; i < n; i++) {
      this.cursor = (this.cursor + 1) % this.list.length;
      const s = this.list[this.cursor];
      s.t += this.acc * (this.list.length / n);
      if (s.power && s.mode !== 'off') s.draw();
    }
    if (n) this.acc = 0;
  }
}
