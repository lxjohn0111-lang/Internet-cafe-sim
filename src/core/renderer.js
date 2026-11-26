import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.32 },
    grain: { value: 0.035 },
    aberration: { value: 0.006 },
    saturation: { value: 1.06 },
    contrast: { value: 1.05 },
    tint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    flash: { value: 0 },
    flashColor: { value: new THREE.Vector3(1, 1, 1) },
    damage: { value: 0 },
    blackout: { value: 0 },
    wobble: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, vignette, grain, aberration, saturation, contrast, flash, damage, blackout, wobble;
    uniform vec3 tint, flashColor; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (wobble > 0.0) { uv.x += sin(uv.y * 18.0 + time * 6.0) * 0.006 * wobble; uv.y += cos(uv.x * 14.0 + time * 5.0) * 0.006 * wobble; }
      vec2 c = uv - 0.5; float d = dot(c, c);
      vec2 off = c * (aberration + damage * 0.02) * (0.4 + d * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      // gentle filmic split-tone: cool shadows, warm highlights
      col = mix(col * vec3(0.94, 0.98, 1.06), col * vec3(1.04, 1.0, 0.95), smoothstep(0.2, 0.8, l));
      col *= tint;
      col *= 1.0 - vignette * smoothstep(0.08, 0.6, d * 1.6);
      float n = hash(uv * vec2(1920.0, 1080.0) + fract(time) * 100.0);
      col += (n - 0.5) * grain;
      col = mix(col, vec3(0.55, 0.0, 0.02), damage * smoothstep(0.05, 0.5, d * 2.2));
      col = mix(col, flashColor, flash);
      col *= 1.0 - blackout;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export const QUALITY = {
  ultra: { pr: 2, shadow: 2048, ao: 'full', bloom: true, smaa: true, lights: 8, spotShadow: true },
  high: { pr: 1.5, shadow: 2048, ao: 'half', bloom: true, smaa: true, lights: 6, spotShadow: true },
  medium: { pr: 1, shadow: 1024, ao: null, bloom: true, smaa: true, lights: 3, spotShadow: false },
  // low = phones: render straight to the screen (no post-processing), no shadows, fewer lights
  low: { pr: 1, shadow: 0, ao: null, bloom: false, smaa: false, lights: 0, spotShadow: false, direct: true, lean: true },
};

export class Renderer {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.grade = new ShaderPass(GradeShader);
    this.qualityName = 'high';
    this.q = QUALITY.high;
    this.time = 0;
    this.onQualityChange = null;
    this._fpsSamples = [];
    this._autoSteps = 0;
    this.auto = true;
  }

  setup(scene, viewScene, camera) {
    this.scene = scene; this.viewScene = viewScene; this.camera = camera;
    this._build();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _build() {
    const r = this.r;
    if (this.composer) { this.composer.passes.forEach((p) => p.dispose && p.dispose()); this.composer.dispose(); this.composer = null; }
    const wantShadows = this.q.shadow > 0;
    if (r.shadowMap.enabled !== wantShadows) {
      r.shadowMap.enabled = wantShadows;
      [this.scene, this.viewScene].forEach((sc) => sc && sc.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); }));
    }
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    r.setPixelRatio(pr);
    r.setSize(w, h, false);
    if (this.q.direct) { this.aoPass = null; this.bloom = null; return; }
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 0 });
    const composer = this.composer = new EffectComposer(r, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    if (this.q.ao) {
      const ao = this.aoPass = new N8AOPass(this.scene, this.camera, w, h);
      ao.configuration.gammaCorrection = false;
      ao.configuration.aoRadius = 0.9;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 2.6;
      ao.configuration.halfRes = this.q.ao === 'half';
      ao.setQualityMode(this.q.ao === 'full' ? 'High' : 'Medium');
      composer.addPass(ao);
    } else {
      this.aoPass = null;
      composer.addPass(new RenderPass(this.scene, this.camera));
    }
    const vp = new RenderPass(this.viewScene, this.camera);
    vp.clear = false; vp.clearDepth = true;
    composer.addPass(vp);
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.45, 0.88);
      composer.addPass(this.bloom);
    } else this.bloom = null;
    composer.addPass(new OutputPass());
    const prevU = this.grade && this.grade.uniforms;
    this.grade = new ShaderPass(GradeShader);
    if (prevU) for (const k of ['damage', 'flash', 'wobble', 'blackout']) this.grade.uniforms[k].value = prevU[k].value;
    composer.addPass(this.grade);
    if (this.q.smaa) composer.addPass(new SMAAPass(w * pr, h * pr));
  }

  setQuality(name, fromAuto = false) {
    if (!QUALITY[name]) return;
    if (!fromAuto) this.auto = false;
    if (name === this.qualityName && this.composer !== undefined && (this.composer || this.q.direct)) { if (this.onQualityChange) this.onQualityChange(this.q); return; }
    this.qualityName = name;
    this.q = QUALITY[name];
    this._build();
    if (this.onQualityChange) this.onQualityChange(this.q);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.aoPass) this.aoPass.setSize(w * pr, h * pr);
  }

  // automatic downgrade if the machine struggles
  trackFps(dt) {
    if (!this.auto || this._autoSteps >= 3) return;
    this._fpsSamples.push(dt);
    if (this._fpsSamples.length >= 150) {
      const s = this._fpsSamples.slice().sort((a, b) => a - b);
      const med = s[Math.floor(s.length / 2)];
      this._fpsSamples.length = 0;
      const fps = 1 / med;
      const order = ['ultra', 'high', 'medium', 'low'];
      const i = order.indexOf(this.qualityName);
      if (fps < 38 && i < order.length - 1) { this._autoSteps++; this.setQuality(order[i + 1], true); console.info('[Renderer] auto quality ->', order[i + 1], fps.toFixed(1)); }
      else if (fps > 58) this._autoSteps = 3; // stable, stop checking
    }
  }

  render(dt) {
    this.time += dt;
    this.grade.uniforms.time.value = this.time;
    if (!this.composer) {
      const r = this.r;
      r.render(this.scene, this.camera);
      r.autoClear = false; r.clearDepth(); r.render(this.viewScene, this.camera); r.autoClear = true;
      return;
    }
    this.composer.render(dt);
  }
}
