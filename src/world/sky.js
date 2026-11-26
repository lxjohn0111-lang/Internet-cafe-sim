import * as THREE from 'three';
import { assetUrl } from '../assets.js';

// Photographic sky dome blending real HDR captures (day / sunset / night) by time of day.
export class Sky {
  constructor(scene) {
    this.uniforms = {
      tDay: { value: null }, tSunset: { value: null }, tNight: { value: null },
      wDay: { value: 1 }, wSunset: { value: 0 }, wNight: { value: 0 },
      exposure: { value: 1 }, time: { value: 0 }, hasTex: { value: 0 }, flash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform sampler2D tDay, tSunset, tNight; uniform float wDay, wSunset, wNight, exposure, time, hasTex, flash; varying vec3 vDir;
        #define PI 3.141592653589793
        vec2 eq(vec3 d, float yaw){ float a = atan(d.z, d.x) + yaw; return vec2(a / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5); }
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          vec3 col;
          float h = max(d.y, 0.0);
          // procedural fallback
          vec3 dayG = mix(vec3(0.75, 0.85, 1.0), vec3(0.25, 0.45, 0.85), pow(h, 0.5));
          vec3 setG = mix(vec3(1.2, 0.55, 0.25), vec3(0.25, 0.2, 0.45), pow(h, 0.4));
          vec3 nightG = mix(vec3(0.03, 0.04, 0.08), vec3(0.005, 0.008, 0.02), pow(h, 0.5));
          col = dayG * wDay + setG * wSunset + nightG * wNight;
          if (hasTex > 0.5) {
            vec3 a = texture2D(tDay, eq(d, 1.2)).rgb * 2.4;
            vec3 b = texture2D(tSunset, eq(d, 2.6)).rgb * 2.6;
            vec3 c = texture2D(tNight, eq(d, 0.0)).rgb * 0.9;
            col = a * wDay + b * wSunset + c * wNight;
          }
          // stars at night
          vec3 sd = floor(d * 300.0);
          float s = step(0.9975, hash(sd)) * wNight * smoothstep(0.05, 0.3, d.y);
          col += vec3(s) * (0.6 + 0.4 * sin(time * 3.0 + hash(sd) * 40.0));
          col *= exposure;
          col += vec3(0.7, 0.9, 1.0) * flash;
          col = mix(vec3(0.02, 0.02, 0.025) * (wDay + 0.2), col, smoothstep(-0.05, 0.02, d.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
    this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  async load() {
    const L = new THREE.TextureLoader();
    const get = (f) => new Promise((res) => L.load(assetUrl('sky/' + f), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; res(t); }, undefined, () => res(null)));
    const [d, s, n] = await Promise.all([get('day.webp'), get('sunset.webp'), get('night.webp')]);
    if (d && s && n) { this.uniforms.tDay.value = d; this.uniforms.tSunset.value = s; this.uniforms.tNight.value = n; this.uniforms.hasTex.value = 1; }
  }

  setTime(hours, day, warm) {
    // weights
    const sunsetW = Math.max(0, 1 - Math.abs(hours - 19.2) / 1.6) + Math.max(0, 1 - Math.abs(hours - 6.6) / 1.0) * 0.7;
    let wN = 1 - day; let wS = Math.min(1, sunsetW) * (1 - wN * 0.6); let wD = Math.max(0, day - wS);
    const sum = wN + wS + wD || 1;
    this.uniforms.wDay.value = wD / sum; this.uniforms.wSunset.value = wS / sum; this.uniforms.wNight.value = wN / sum;
    this.uniforms.exposure.value = 0.55 + day * 0.35;
  }

  update(dt, cameraPos) { this.uniforms.time.value += dt; this.mesh.position.copy(cameraPos); }
}
