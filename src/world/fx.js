import * as THREE from 'three';

// Pooled GPU particle systems (CPU simulated) for sparks, smoke, fire, spray, confetti, dust, rain.
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

class System {
  constructor(scene, max, blending, tex, { square = false } = {}) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max); this.grow = new Float32Array(max);
    this.alpha = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('color', this.colAttr); geo.setAttribute('size', this.sizeAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, scale: { value: window.innerHeight * 0.5 }, square: { value: square ? 1 : 0 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D tex; uniform float square; varying vec4 vC;
        void main(){ vec4 t = square > 0.5 ? vec4(1.0) : texture2D(tex, gl_PointCoord); if (t.a * vC.a < 0.01) discard; gl_FragColor = vec4(vC.rgb, t.a * vC.a); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    window.addEventListener('resize', () => { mat.uniforms.scale.value = window.innerHeight * 0.5; });
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, size, { grow = 0, alpha = 1, grav = 0, drag = 0 } = {}) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.alpha[i] = alpha; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let j = 0;
    const P = this.posAttr.array, Cc = this.colAttr.array, S = this.sizeAttr.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (j !== i) {
        for (let k = 0; k < 3; k++) { this.p[j * 3 + k] = this.p[i * 3 + k]; this.v[j * 3 + k] = this.v[i * 3 + k]; this.c[j * 3 + k] = this.c[i * 3 + k]; }
        this.life[j] = this.life[i]; this.maxLife[j] = this.maxLife[i]; this.size[j] = this.size[i]; this.grow[j] = this.grow[i]; this.alpha[j] = this.alpha[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i];
      }
      const d = 1 - Math.min(1, this.drag[j] * dt);
      this.v[j * 3] *= d; this.v[j * 3 + 1] = this.v[j * 3 + 1] * d - this.grav[j] * dt; this.v[j * 3 + 2] *= d;
      this.p[j * 3] += this.v[j * 3] * dt; this.p[j * 3 + 1] += this.v[j * 3 + 1] * dt; this.p[j * 3 + 2] += this.v[j * 3 + 2] * dt;
      if (this.p[j * 3 + 1] < 0.01) { this.p[j * 3 + 1] = 0.01; this.v[j * 3 + 1] *= -0.3; this.v[j * 3] *= 0.6; this.v[j * 3 + 2] *= 0.6; }
      this.size[j] += this.grow[j] * dt;
      const k = this.life[j] / this.maxLife[j];
      P[j * 3] = this.p[j * 3]; P[j * 3 + 1] = this.p[j * 3 + 1]; P[j * 3 + 2] = this.p[j * 3 + 2];
      Cc[j * 4] = this.c[j * 3]; Cc[j * 4 + 1] = this.c[j * 3 + 1]; Cc[j * 4 + 2] = this.c[j * 3 + 2]; Cc[j * 4 + 3] = this.alpha[j] * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 12 + 0.2);
      S[j] = this.size[j];
      j++;
    }
    this.n = j;
    this.points.geometry.setDrawRange(0, j);
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true; this.sizeAttr.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    const t = softTex();
    this.glow = new System(scene, 1400, THREE.AdditiveBlending, t);
    this.soft = new System(scene, 900, THREE.NormalBlending, t);
    this.flat = new System(scene, 700, THREE.NormalBlending, t, { square: true });
    this.emitters = [];
  }
  r(a = 1) { return (Math.random() - 0.5) * 2 * a; }
  sparks(p, n = 14, col = [1, 0.8, 0.3]) { for (let i = 0; i < n; i++) this.glow.emit(p.x, p.y, p.z, this.r(2.5), Math.random() * 3, this.r(2.5), col[0], col[1], col[2], 0.35 + Math.random() * 0.4, 0.04, { grav: 9, drag: 1 }); }
  hit(p) { for (let i = 0; i < 18; i++) this.glow.emit(p.x, p.y, p.z, this.r(4), this.r(4), this.r(4), 1, 0.95, 0.7, 0.18, 0.08, { drag: 6 }); this.dust(p, 6); }
  mega(p) { for (let i = 0; i < 60; i++) this.glow.emit(p.x, p.y, p.z, this.r(9), this.r(6), this.r(9), 1, 0.6 + Math.random() * 0.3, 0.2, 0.4, 0.12, { drag: 4 }); this.dust(p, 20); }
  dust(p, n = 10) { for (let i = 0; i < n; i++) this.soft.emit(p.x + this.r(0.2), Math.max(0.05, p.y - 0.2), p.z + this.r(0.2), this.r(0.8), Math.random() * 0.5, this.r(0.8), 0.6, 0.57, 0.52, 0.8 + Math.random() * 0.6, 0.15, { grow: 0.5, alpha: 0.35, drag: 2 }); }
  smoke(p, dark = true) { this.soft.emit(p.x + this.r(0.1), p.y, p.z + this.r(0.1), this.r(0.15), 0.6 + Math.random() * 0.5, this.r(0.15), dark ? 0.12 : 0.6, dark ? 0.12 : 0.6, dark ? 0.13 : 0.62, 2.2, 0.25, { grow: 0.6, alpha: 0.55, drag: 0.3 }); }
  fire(p, k = 1) {
    for (let i = 0; i < 5 * k; i++) this.glow.emit(p.x + this.r(0.15), p.y + Math.random() * 0.15, p.z + this.r(0.15), this.r(0.25), 0.9 + Math.random() * 1.4, this.r(0.25), 1, 0.3 + Math.random() * 0.35, 0.04, 0.55 + Math.random() * 0.35, 0.26 + Math.random() * 0.16, { grow: -0.3, drag: 0.5 });
    if (Math.random() < 0.4) this.smoke(new THREE.Vector3(p.x, p.y + 0.4, p.z));
  }
  spray(p, dir) { for (let i = 0; i < 4; i++) this.soft.emit(p.x, p.y, p.z, dir.x * 7 + this.r(0.8), dir.y * 7 + this.r(0.8), dir.z * 7 + this.r(0.8), 0.92, 0.95, 1, 0.7, 0.08, { grow: 1.2, alpha: 0.6, drag: 3, grav: 0.5 }); }
  confetti(p, n = 80) { for (let i = 0; i < n; i++) { const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); this.flat.emit(p.x, p.y, p.z, this.r(3), 2 + Math.random() * 4, this.r(3), c.r, c.g, c.b, 2.5 + Math.random(), 0.035, { grav: 3, drag: 1.5 }); } }
  water(p, dir) { for (let i = 0; i < 3; i++) this.soft.emit(p.x, p.y, p.z, dir.x * 4 + this.r(0.5), dir.y * 4 + Math.random(), dir.z * 4 + this.r(0.5), 0.5, 0.7, 1, 0.6, 0.06, { grav: 9, alpha: 0.7 }); }
  rain(minX, maxX, minZ, maxZ, y, n) { for (let i = 0; i < n; i++) this.soft.emit(minX + Math.random() * (maxX - minX), y, minZ + Math.random() * (maxZ - minZ), 0, -7, 0, 0.6, 0.75, 1, 0.5, 0.025, { alpha: 0.6 }); }
  zap(p) { for (let i = 0; i < 25; i++) this.glow.emit(p.x, p.y, p.z, this.r(5), this.r(5), this.r(5), 0.5, 0.8, 1, 0.25, 0.05, { drag: 3 }); }
  sparkle(p, col = [1, 1, 0.6]) { for (let i = 0; i < 20; i++) this.glow.emit(p.x + this.r(0.4), p.y + this.r(0.4), p.z + this.r(0.4), this.r(0.5), Math.random(), this.r(0.5), col[0], col[1], col[2], 0.8, 0.05, { drag: 2 }); }
  disco(center, t) { for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 0.8; const c = new THREE.Color().setHSL(Math.random(), 1, 0.6); this.glow.emit(center.x, center.y, center.z, Math.cos(a) * 9, -Math.sin(e) * 6, Math.sin(a) * 9, c.r, c.g, c.b, 0.6, 0.025, {}); } }
  addEmitter(fn) { this.emitters.push(fn); return fn; }
  removeEmitter(fn) { const i = this.emitters.indexOf(fn); if (i >= 0) this.emitters.splice(i, 1); }
  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) if (this.emitters[i](dt) === false) this.emitters.splice(i, 1);
    this.glow.update(dt); this.soft.update(dt); this.flat.update(dt);
  }
}
