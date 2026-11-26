import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export const G_STATIC = 1, G_PROP = 2, G_RAGDOLL = 4, G_KINEMATIC = 8;

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 12;
    w.defaultContactMaterial.friction = 0.45;
    w.defaultContactMaterial.restitution = 0.12;
    w.defaultContactMaterial.contactEquationStiffness = 1e7;
    w.defaultContactMaterial.contactEquationRelaxation = 4;
    this.synced = [];
    this.statics = [];
    this.timeScale = 1;
    // floor
    const floor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_RAGDOLL });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(floor);
    this.floor = floor;
  }

  addStaticBox(cx, cy, cz, hx, hy, hz, rotY = 0) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_RAGDOLL });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(cx, cy, cz);
    if (rotY) b.quaternion.setFromEuler(0, rotY, 0);
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }

  removeBody(b) { if (b && b.world) this.world.removeBody(b); }

  // dynamic prop linked to a mesh
  addProp(mesh, shape, mass, opts = {}) {
    const b = new CANNON.Body({
      mass, shape,
      linearDamping: opts.linearDamping ?? 0.05, angularDamping: opts.angularDamping ?? 0.2,
      collisionFilterGroup: G_PROP, collisionFilterMask: G_STATIC | G_PROP | G_RAGDOLL | G_KINEMATIC,
      allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6,
    });
    b.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    b.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    this.world.addBody(b);
    const entry = { body: b, mesh };
    this.synced.push(entry);
    b.userData = { mesh };
    return b;
  }

  removeProp(body) {
    this.removeBody(body);
    const i = this.synced.findIndex((e) => e.body === body);
    if (i >= 0) this.synced.splice(i, 1);
  }

  addKinematic(radius, height) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: G_KINEMATIC, collisionFilterMask: G_PROP });
    b.addShape(new CANNON.Cylinder(radius, radius, height, 8));
    this.world.addBody(b);
    return b;
  }

  step(dt) {
    const sdt = Math.min(dt, 1 / 20) * this.timeScale;
    this.world.step(1 / 60, sdt, 4);
    for (const e of this.synced) {
      const b = e.body;
      if (b.sleepState === CANNON.Body.SLEEPING) continue;
      e.mesh.position.set(b.position.x, b.position.y, b.position.z);
      e.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
  }
}

export function vec3(v) { return new CANNON.Vec3(v.x, v.y, v.z); }
export function tv3(v) { return new THREE.Vector3(v.x, v.y, v.z); }
export { CANNON };
