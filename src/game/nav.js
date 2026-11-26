import * as THREE from 'three';

// Grid navigation with A* and line-of-sight smoothing.
export class Nav {
  constructor(world, { minX = -26, maxX = 26, minZ = -12, maxZ = 21, cell = 0.25, inflate = 0.28 } = {}) {
    this.world = world; this.minX = minX; this.minZ = minZ; this.cell = cell; this.inflate = inflate;
    this.w = Math.ceil((maxX - minX) / cell); this.h = Math.ceil((maxZ - minZ) / cell);
    this.grid = new Uint8Array(this.w * this.h);
    this.rebuild();
  }
  rebuild() {
    const g = this.grid; g.fill(0);
    const c = this.cell, inf = this.inflate;
    for (const col of this.world.colliders) {
      if (!col.nav) continue;
      if (col.maxY < 0.25 || col.minY > 1.9) continue;
      const x0 = Math.max(0, Math.floor((col.minX - inf - this.minX) / c)), x1 = Math.min(this.w - 1, Math.floor((col.maxX + inf - this.minX) / c));
      const z0 = Math.max(0, Math.floor((col.minZ - inf - this.minZ) / c)), z1 = Math.min(this.h - 1, Math.floor((col.maxZ + inf - this.minZ) / c));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z * this.w + x] = 1;
    }
  }
  idx(p) { const x = Math.floor((p.x - this.minX) / this.cell), z = Math.floor((p.z - this.minZ) / this.cell); return [Math.min(this.w - 1, Math.max(0, x)), Math.min(this.h - 1, Math.max(0, z))]; }
  center(x, z) { return new THREE.Vector3(this.minX + (x + 0.5) * this.cell, 0, this.minZ + (z + 0.5) * this.cell); }
  blocked(x, z) { return x < 0 || z < 0 || x >= this.w || z >= this.h || this.grid[z * this.w + x] === 1; }
  walkablePoint(p) { const [x, z] = this.idx(p); return !this.blocked(x, z); }

  nearestCell(x, z) {
    if (!this.blocked(x, z)) return [x, z];
    for (let r = 1; r < 24; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
      if (!this.blocked(x + dx, z + dz)) return [x + dx, z + dz];
    }
    return [x, z];
  }
  nearestWalkable(p) { const [x, z] = this.idx(p); if (!this.blocked(x, z)) return p.clone(); const [nx, nz] = this.nearestCell(x, z); return this.center(nx, nz); }

  los(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz); const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < n; i++) { const t = i / n; const [x, z] = this.idx({ x: a.x + dx * t, z: a.z + dz * t }); if (this.blocked(x, z)) return false; }
    return true;
  }

  findPath(from, to) {
    let [sx, sz] = this.idx(from); let [tx, tz] = this.idx(to);
    [sx, sz] = this.nearestCell(sx, sz); [tx, tz] = this.nearestCell(tx, tz);
    const W = this.w, N = W * this.h;
    if (!this._g || this._g.length !== N) { this._g = new Float32Array(N); this._came = new Int32Array(N); this._seen = new Uint32Array(N); this._gen = 0; this._closed = new Uint32Array(N); }
    const gen = ++this._gen;
    const G = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const start = sz * W + sx, goal = tz * W + tx;
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hfn = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    G[start] = 0; seen[start] = gen; came[start] = -1; push(start, hfn(start));
    let found = false, iter = 0;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length && iter++ < 40000) {
      const [, cur] = pop();
      if (closed[cur] === gen) continue; closed[cur] = gen;
      if (cur === goal) { found = true; break; }
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
        const ni = nz * W + nx; const ng = G[cur] + cost;
        if (seen[ni] !== gen || ng < G[ni]) { seen[ni] = gen; G[ni] = ng; came[ni] = cur; push(ni, ng + hfn(ni)); }
      }
    }
    if (!found) return [to.clone()];
    const cells = []; for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => this.center(i % W, (i / W) | 0));
    pts[pts.length - 1] = new THREE.Vector3(to.x, 0, to.z);
    // smoothing
    const out = []; let a = new THREE.Vector3(from.x, 0, from.z); let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.los(a, pts[j])) j--;
      out.push(pts[j]); a = pts[j]; i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }
}
