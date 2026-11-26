import * as THREE from 'three';
import * as B from '../world/builders.js';
import { M } from '../world/materials.js';
import { audio } from '../core/audio.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const R = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const insideCafe = (p) => p.x > -8 && p.x < 8 && p.z > -11.5 && p.z < 6;

// "Something weird always happens" — the chaos director.
export class Events {
  constructor(game) {
    this.game = game;
    this.timer = 22; // first event soon after start
    this.active = [];
    this.history = [];
    this.defs = this.buildDefs();
  }

  get busy() { return this.active.length > 0; }

  update(dt) {
    const g = this.game;
    for (const ev of this.active.slice()) {
      ev.t += dt;
      let keep = true;
      try { keep = ev.def.update ? ev.def.update(g, ev, dt) !== false : ev.t < (ev.dur || 10); } catch (e) { console.warn(e); keep = false; }
      if (!keep) this.finish(ev);
    }
    if (g.dayEnding || g.paused) return;
    this.timer -= dt;
    if (this.timer <= 0 && this.active.length < 2) {
      this.timer = R(38, 75) * (this.active.length ? 1.5 : 1);
      this.trigger();
    }
  }

  trigger(id) {
    const g = this.game;
    const list = this.defs.filter((d) => (!id || d.id === id) && (!d.cond || d.cond(g)) && !this.active.some((a) => a.def.id === d.id) && (id || this.history.slice(-4).indexOf(d.id) < 0));
    if (!list.length) return null;
    let def;
    if (id) def = list[0];
    else { const tot = list.reduce((a, d) => a + (d.w || 1), 0); let r = Math.random() * tot; for (const d of list) { r -= d.w || 1; if (r <= 0) { def = d; break; } } def = def || list[0]; }
    const ev = { def, t: 0, data: {} };
    this.history.push(def.id);
    if (def.banner !== false) {
      g.hud.banner(def.kicker || 'WEIRD EVENT', def.name, def.desc);
      audio.play('event');
      g.world.tvScreen.state.headline = def.news || def.name;
    }
    try { if (def.start(g, ev) === false) return null; } catch (e) { console.warn('event start failed', def.id, e); return null; }
    this.active.push(ev);
    return ev;
  }

  finish(ev) {
    const g = this.game;
    const i = this.active.indexOf(ev); if (i >= 0) this.active.splice(i, 1);
    try { ev.def.end && ev.def.end(g, ev); } catch (e) { console.warn(e); }
    if (ev.def.countable !== false) { g.dayStat('events', 1); g.state.stats.events++; g.addXP(8); if (g.state.stats.events >= 10) g.unlock('events10'); }
  }

  // called by customer AI
  rageQuit(npc) { if (!this.active.some((a) => a.def.id === 'ragequit')) { const ev = this.trigger('ragequit'); if (ev) ev.data.forced = npc; } }
  streamerResult(npc, sat) {
    const g = this.game;
    if (sat > 70) { g.hud.banner('VIRAL!', 'Your café is trending!', `${npc.name} told 50,000 viewers about you`); g.rep(8); g.state.marketing = (g.state.marketing || 0) + 1; audio.play('levelup'); g.fx.confetti(npc.headPos().clone()); g.sdkHappy(); }
    else { g.hud.toast(`📉 ${npc.name} roasted your café on stream…`, 'bad'); g.rep(-6); }
  }
  inspectorPunched(npc) {
    const g = this.game;
    g.hud.banner('OH NO', 'You punched the health inspector', 'Fined $250 for "aggressive hospitality"');
    g.spend(250, 'fine'); g.rep(-5);
    npc.say('THIS IS GOING IN MY REPORT!', 3, { shout: true });
    const ev = this.active.find((a) => a.def.id === 'inspector'); if (ev) ev.data.failed = true;
    g.customers.leave(npc, { angry: true, run: true });
  }

  // ---------------- definitions ----------------
  buildDefs() {
    return [
      {
        id: 'gravity', name: 'GRAVITY GLITCH', desc: 'Physics.exe has stopped working', news: 'Local café briefly forgets how gravity works', w: 3,
        start: (g, ev) => {
          g.physics.world.gravity.set(0, 1.6, 0); g.player.lowGrav = 10; audio.play('glitch', {});
          g.items.items.forEach((it) => { if (it.body) { it.body.wakeUp(); it.body.velocity.y += R(0.5, 2); } });
          g.insideNPCs().slice(0, 4).forEach((n, i) => setTimeout(() => n.alive && !n.rag && (n.knock(V(R(-0.3, 0.3), 1, R(-0.3, 0.3)).normalize(), 3.5), audio.play('scream', { pos: n.headPos(), pitch: n.pitch })), i * 300));
          g.renderer.grade.uniforms.wobble.value = 0.6;
        },
        update: (g, ev) => { if (Math.random() < 0.05) g.items.items.forEach((it) => it.body && it.body.wakeUp()); return ev.t < 9; },
        end: (g) => { g.physics.world.gravity.set(0, -9.82, 0); g.renderer.grade.uniforms.wobble.value = 0; g.items.items.forEach((it) => it.body && it.body.wakeUp()); },
      },
      {
        id: 'disco', name: 'DISCO FEVER', desc: 'Nobody knows who turned it on. Everybody dances.', news: 'Spontaneous dance party erupts at net café', w: 3,
        cond: (g) => g.world.power && g.insideNPCs().length >= 2,
        start: (g, ev) => this.startDisco(g, ev, 18),
        update: (g, ev, dt) => this.updateDisco(g, ev, dt),
        end: (g, ev) => this.endDisco(g, ev),
      },
      {
        id: 'sneeze', name: 'SNEEZE OF DOOM', desc: 'Bless you. And everyone near you.', news: 'Sneeze measured at 7.2 on the Richter scale', w: 3,
        cond: (g) => g.insideNPCs().length >= 1,
        start: (g, ev) => {
          const n = pick(g.insideNPCs()); ev.data.n = n; n.say('Ah… AH…', 1.2, { voice: false });
          audio.play('sneeze', { pos: n.headPos(), pitch: n.pitch });
          if (!n.seated) { n.stop(); n.play('sneeze', 0.1, { once: true }); }
        },
        update: (g, ev) => {
          const n = ev.data.n;
          if (ev.t > 1.05 && !ev.data.boom && n.alive) {
            ev.data.boom = true; n.say('CHOOOO!!!', 1.5, { shout: true, voice: false });
            const p = n.pos.clone(); const fwd = V(Math.sin(n.yaw), 0, Math.cos(n.yaw));
            for (let i = 0; i < 40; i++) g.fx.soft.emit(p.x, 1.5, p.z, fwd.x * R(3, 8) + R(-1, 1), R(-0.5, 1.5), fwd.z * R(3, 8) + R(-1, 1), 0.8, 0.95, 0.7, 0.8, 0.05, { grav: 4, alpha: 0.7 });
            n.knock(fwd.clone().multiplyScalar(-1).add(V(0, 0.5, 0)).normalize(), 10);
            g.player.addTrauma(0.5);
            for (const o of g.npcs) if (o !== n && !o.rag && o.pos.distanceTo(p) < 3) { const d = o.pos.clone().sub(p).setY(0.6).normalize(); o.knock(d, 6); audio.play('scream', { pos: o.headPos(), pitch: o.pitch }); }
            const pd = g.player.pos.clone().sub(p); if (pd.length() < 3) { g.player.vel.addScaledVector(pd.setY(0).normalize(), 6); g.player.vel.y = 4; }
          }
          return ev.t < 3;
        },
      },
      {
        id: 'ragequit', name: 'RAGE QUIT', desc: 'Somebody lost a ranked match. Duck!', news: 'Keyboard sighted flying at 80 km/h', w: 2,
        cond: (g) => g.seatedCustomers().length > 0,
        start: (g, ev) => {
          const n = ev.data.forced || pick(g.seatedCustomers()); ev.data.n = n;
          n.play('sitRage', 0.1); n.say('THIS GAME IS RIGGED!!!', 2.2, { shout: true }); audio.play('scream', { pos: n.headPos(), pitch: n.pitch });
        },
        update: (g, ev) => {
          const n = ev.data.n; if (!n.alive) return false;
          if (ev.t > 1.2 && !ev.data.thrown && n.ai && n.ai.station) {
            ev.data.thrown = true;
            const st = n.ai.station;
            const p = st.slot.deskCenter.clone().setY(0.95);
            const dir = V(R(-1, 1), 0, R(-1, 1)).normalize(); const kb = g.items.spawn('keyboard', p, { vel: dir.multiplyScalar(R(6, 9)).add(V(0, 4, 0)) });
            kb.body.angularVelocity.set(R(-12, 12), R(-12, 12), R(-12, 12));
            st.keyboard.visible = false; ev.data.st = st;
            setTimeout(() => { if (st.keyboard) st.keyboard.visible = true; }, 25000);
            audio.play('whoosh', { vol: 1 });
            g.customers.standUpAndLeave(n, true);
            n.ai.sat = Math.min(n.ai.sat, 30);
          }
          return ev.t < 5;
        },
      },
      {
        id: 'banana', name: 'BANANA STREAKER', desc: 'Catch the banana for a $60 bounty!', news: 'Man in banana suit refuses to explain himself', w: 2, kicker: 'BOUNTY',
        start: (g, ev) => {
          const n = g.customers.makeNPC({ base: pick(['soldier', 'xbot']), tint: 0xffe26a, accessories: ['banana'], speedMul: 1.0, name: 'Banana Guy' });
          n.setPos(V(0, 0, 8)); n.ai = { role: 'special', state: 'run', t: 0 }; n.name = 'BANANA'; n.layer('flail');
          n.onGetUp = () => { if (!ev.data.caught) { ev.data.caught = true; g.earn(60, n.headPos(), { gold: true, toRegister: false }); g.unlock('banana'); g.hud.toast('🍌 Banana caught! +$60 bounty', 'gold'); n.say('You\'ll never peel me again!', 2.5, { shout: true }); } n.layer(null); n.goTo(V(0, 0, 7.5), { run: true }); n.ai.override = () => { if (!n.moving) { n.goTo(V(R(-22, 22) > 0 ? 24 : -24, 0, 8), { run: true }); n.ai.role = 'leaver'; return false; } return true; }; };
          ev.data.n = n; ev.data.next = 0;
        },
        update: (g, ev, dt) => {
          const n = ev.data.n; if (!n.alive) return false;
          if (!ev.data.caught && !n.rag) {
            if (!n.moving) { const pts = [V(-5, 0, 5), V(-5, 0, -5), V(0.5, 0, -3), V(2.5, 0, 4), V(-1, 0, 0.5), V(-5.2, 0, 0)]; n.goTo(pick(pts), { run: true, speed: 4.4 }); }
            ev.data.next -= dt; if (ev.data.next <= 0) { ev.data.next = R(1.2, 2.5); n.say(pick(['WOOOOO!', 'POTASSIUM!!!', 'YOU CAN\'T CATCH ME!', 'I\'M A-PEELING!']), 1.2, { shout: true }); audio.play('yay', { pos: n.headPos(), pitch: n.pitch * 1.3 }); }
            if (ev.t > 30) { ev.data.caught = true; n.layer(null); n.say('BYE LOSERS!', 2, { shout: true }); n.goTo(V(0, 0, 7.5), { run: true }); n.ai.role = 'leaver'; n.ai.override = () => { if (!n.moving) { n.goTo(V(24, 0, 8), { run: true }); return false; } return true; }; }
          }
          return !ev.data.caught || ev.t < 32;
        },
      },
      {
        id: 'pigeons', name: 'PIGEON INVASION', desc: 'Punch them out before they poop on everything!', news: 'Pigeons demand free WiFi, refuse to leave', w: 3,
        start: (g, ev) => {
          ev.data.birds = [];
          for (let i = 0; i < 6; i++) {
            const m = B.makePigeon(); m.position.set(R(-1, 1), 2.2 + R(0, 0.5), 8 + R(0, 2)); g.scene.add(m);
            const b = { m, target: V(R(-6, 6), R(1.6, 2.9), R(-5, 4.5)), ph: R(0, 6), state: 'fly', poopT: R(3, 9), vel: V() };
            b.punch = { pos: () => m.position, r: 0.35, hit: (dir) => { if (b.state !== 'fly') return; b.state = 'shoo'; b.vel.copy(dir).multiplyScalar(8).add(V(0, 3, 0)); audio.play('coo', { pos: m.position }); g.fx.dust(m.position.clone(), 8); for (let k = 0; k < 6; k++) g.fx.soft.emit(m.position.x, m.position.y, m.position.z, R(-2, 2), R(-1, 2), R(-2, 2), 0.5, 0.5, 0.55, 1.5, 0.04, { grav: 0.6, drag: 1 }); g.earn(4, m.position.clone(), { toRegister: false }); } };
            g.punchables.push(b.punch); ev.data.birds.push(b);
          }
          audio.play('flap', { pos: V(0, 2, 6) });
        },
        update: (g, ev, dt) => {
          let alive = 0;
          for (const b of ev.data.birds) {
            const m = b.m; b.ph += dt * 22;
            m.userData.wl.rotation.z = Math.sin(b.ph) * 0.9; m.userData.wr.rotation.z = -Math.sin(b.ph) * 0.9;
            if (b.state === 'fly') {
              alive++;
              const d = b.target.clone().sub(m.position); if (d.length() < 0.4) b.target.set(R(-7, 7), R(1.4, 3.0), R(-5.5, 5));
              b.vel.lerp(d.normalize().multiplyScalar(3.2), dt * 2); m.position.addScaledVector(b.vel, dt);
              m.lookAt(m.position.clone().add(b.vel));
              b.poopT -= dt; if (b.poopT <= 0 && insideCafe(m.position)) { b.poopT = R(5, 10); g.items.addDecal('poop', V(m.position.x, 0, m.position.z), 0.9); audio.play('splat', { pos: m.position }); }
              if (Math.random() < dt * 0.4) audio.play('coo', { pos: m.position });
              if (Math.random() < dt * 1.5) audio.play('flap', { pos: m.position });
              if (ev.t > 45) { b.state = 'shoo'; b.vel.set(0, 1, 4); }
            } else {
              b.vel.y -= dt * 2; m.position.addScaledVector(b.vel, dt); b.vel.lerp(V(0, 2, 6), dt * 0.8);
              m.rotation.x += dt * 8;
              if (m.position.z > 14 || m.position.y > 12 || m.position.length() > 30) { g.scene.remove(m); b.state = 'gone'; }
            }
          }
          return alive > 0 || ev.data.birds.some((b) => b.state === 'shoo');
        },
        end: (g, ev) => { for (const b of ev.data.birds) { g.scene.remove(b.m); const i = g.punchables.indexOf(b.punch); if (i >= 0) g.punchables.splice(i, 1); } },
      },
      {
        id: 'power', name: 'POWER OUTAGE', desc: 'Reset the breaker in the fuse box (back of the café)!', news: 'Entire block goes dark, net café hardest hit', w: 2,
        cond: (g) => g.world.power,
        start: (g, ev) => { g.world.setPower(false); audio.play('powerdown'); g.setWaypoint(V(7.8, 1.5, -4.6), 'FUSE BOX'); g.insideNPCs().forEach((n) => Math.random() < 0.5 && n.say(pick(['NOOO my save!', 'Who turned off the sun?', 'AAAA it\'s dark!']), 2.5, { shout: true })); },
        update: (g, ev, dt) => { g.world.emergency.intensity = g.world.power ? 0 : 4 + Math.sin(ev.t * 6) * 3; if (ev.t > 50 && !ev.data.left) { ev.data.left = true; g.seatedCustomers().slice(0, 2).forEach((n) => g.customers.standUpAndLeave(n, true)); } if (ev.t > 150 && !g.world.power) { g.world.setPower(true); g.stations.forEach((st) => st.refreshScreen()); g.hud.toast('⚡ The power company fixed it for you. Next time: fuse box!', ''); } return !g.world.power; },
        end: (g) => { g.setWaypoint(null); },
      },
      {
        id: 'fire', name: 'PC ON FIRE!', desc: 'Grab the extinguisher by the fuse box and SPRAY (hold LMB)!', news: 'Gamer\'s PC "literally too hot to handle"', w: 2, kicker: 'EMERGENCY',
        cond: (g) => g.stations.some((s) => !s.fire && !s.broken),
        start: (g, ev) => {
          const occ = g.stations.filter((s) => s.occupant && s.occupant.seated && !s.fire);
          const st = occ.length ? pick(occ) : pick(g.stations.filter((s) => !s.fire && !s.broken));
          st.fire = { hp: 100, t: 0 }; st.breakPC(); ev.data.st = st;
          audio.play('explode', { pos: st.slot.deskCenter }); g.player.addTrauma(0.3);
          if (st.occupant) { const n = st.occupant; n.say('MY PC IS ON FIRE!!!', 2.5, { shout: true }); audio.play('scream', { pos: n.headPos(), pitch: n.pitch }); g.customers.standUpAndLeave(n, false); n.layer('flail'); setTimeout(() => n.alive && n.layer(null), 5000); }
          const ext = g.items.items.find((i) => i.kind === 'extinguisher');
          g.setWaypoint(ext && ext.state === 'world' ? ext.obj.position : st.slot.deskCenter.clone().setY(1.2), ext && ext.state === 'world' ? 'EXTINGUISHER' : 'FIRE');
        },
        update: (g, ev, dt) => {
          const st = ev.data.st; if (!st.fire) return false;
          if (Math.random() < dt * 1.2) audio.play('fire', { pos: st.slot.deskCenter });
          if (Math.random() < dt * 0.6) audio.play('alarm', { pos: V(0, 3, 0) });
          const ext = g.player.held && g.player.held.kind === 'extinguisher';
          if (ext) g.setWaypoint(st.slot.deskCenter.clone().setY(1.2), 'FIRE');
          if (st.fire.t > 45 && !ev.data.melted) { ev.data.melted = true; if (st.tier > 1) { st.setTier(st.tier - 1); g.hud.toast('🔥 The fire melted the PC down a tier!', 'bad'); } g.rep(-3); }
          return true;
        },
        end: (g, ev) => { g.setWaypoint(null); },
      },
      {
        id: 'money', name: 'CRYPTO MILLIONAIRE', desc: 'A rich weirdo is making it rain. Grab the cash!', news: 'Man who bought "MoonPotato Coin" now richer than you', w: 2, kicker: 'JACKPOT',
        start: (g, ev) => {
          const n = g.customers.makeNPC({ base: 'soldier', tint: 0xffe08a, accessories: ['tophat', 'shades'], name: 'Mr. Moneybags' });
          n.setPos(V(-3, 0, 8)); n.ai = { role: 'special', state: 'in', t: 0 }; n.name = 'MR. MONEYBAGS';
          n.goTo(V(1.2, 0, 1.0)); ev.data.n = n; n.say('I just sold my digital potatoes!', 3);
          n.onGetUp = () => { n.say('My monocle!!', 2, { shout: true }); for (let i = 0; i < 8; i++) g.items.spawnBill(n.headPos().clone().add(V(R(-0.4, 0.4), 0.4, R(-0.4, 0.4))), 5); };
        },
        update: (g, ev, dt) => {
          const n = ev.data.n; if (!n.alive) return false;
          if (!n.moving && !n.rag && n.ai.state === 'in') { n.ai.state = 'rain'; n.play('cheer', 0.3); n.say('MONEY FOR EVERYONE!!!', 3, { shout: true }); audio.play('laugh', { pos: n.headPos(), pitch: n.pitch }); }
          if (n.ai.state === 'rain') {
            ev.data.acc = (ev.data.acc || 0) + dt;
            while (ev.data.acc > 0.18) { ev.data.acc -= 0.18; g.items.spawnBill(n.root.position.clone().add(V(R(-2.5, 2.5), 3.1, R(-2.5, 2.5))), 5); }
            if (ev.t > 12) { n.ai.state = 'out'; n.play('idle'); n.goTo(V(0, 0, 7.5)); n.say('Toodles, peasants!', 2); }
          }
          if (n.ai.state === 'out' && !n.moving) { n.ai.role = 'leaver'; n.goTo(V(24, 0, 8)); return false; }
          return ev.t < 40;
        },
      },
      {
        id: 'tiny', name: 'TINY CUSTOMER', desc: '"I\'m 34, I swear."', news: 'Very small person demands very big monitor', w: 2,
        start: (g) => { const n = g.customers.spawnCustomer({ height: 0.95, pitch: 420 }); n.ai.tag = n.name = 'Lil ' + n.name; setTimeout(() => n.alive && n.say('Don\'t look down on me!', 2.5), 4000); },
        update: (g, ev) => ev.t < 2,
      },
      {
        id: 'giant', name: 'VERY TALL GAMER', desc: 'Mind the ceiling fans', news: 'Basketball team spotted ordering energy drinks', w: 2,
        start: (g) => { const n = g.customers.spawnCustomer({ height: 2.5, pitch: 70, base: 'xbot' }); n.ai.tag = n.name = 'Big ' + n.name; setTimeout(() => n.alive && n.say('Ow, my head. Every. Single. Door.', 3), 5000); },
        update: (g, ev) => ev.t < 2,
      },
      {
        id: 'speedrun', name: 'SPEEDRUNNER', desc: 'Any% café%. Pays double, leaves fast.', news: 'Speedrunner finishes entire game before ordering', w: 2,
        start: (g) => { const n = g.customers.spawnCustomer({ speedMul: 3.2, accessories: ['headphones'] }); n.ai.stayMin = 12; n.ai.usedMin = 0; n.screenMode = 'racer'; n.ai.tag = n.name = 'SpeedyRunz'; n.mixer.timeScale = 2.5; const orig = n.ai.special; n.ai.special = 'speed'; setTimeout(() => n.alive && n.say('FRAME PERFECT!', 2, { shout: true }), 9000); },
        update: (g, ev) => ev.t < 2,
      },
      {
        id: 'alien', name: 'CLOSE ENCOUNTER', desc: 'An alien wants WiFi. Pays in space credits (×5)!', news: 'Unidentified flying customer lands on Main Street', w: 1.5, kicker: 'UFO',
        start: (g, ev) => {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x80ffb0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          beam.position.set(-3, 15, 13); g.scene.add(beam); ev.data.beam = beam;
          const light = new THREE.PointLight(0x80ffb0, 30, 20, 1.5); light.position.set(-3, 3, 13); g.scene.add(light); ev.data.light = light;
          audio.play('ufo', { pos: V(-3, 3, 13) });
          setTimeout(() => {
            const n = g.customers.spawnCustomer({ base: 'xbot', tint: 0x60ff80, accessories: ['antennae'], pos: V(-3, 0, 13), pitch: 330, special: 'alien' });
            n.headScale = 1.7; n.ai.tag = n.name = 'Zorp'; n.say('Greetings. Your WiFi. Give.', 3);
          }, 1500);
        },
        update: (g, ev) => { ev.data.beam.material.opacity = 0.2 + Math.sin(ev.t * 10) * 0.08; return ev.t < 4; },
        end: (g, ev) => { g.scene.remove(ev.data.beam); g.scene.remove(ev.data.light); ev.data.light.dispose(); },
      },
      {
        id: 'spill', name: 'SLIPPERY SITUATION', desc: 'Someone spilled soda. Grab the mop!', news: 'Floor reaches dangerous levels of stickiness', w: 2,
        start: (g, ev) => { const p = pick([V(0.3, 0, 3.0), V(-5.0, 0, 0.5), V(1.5, 0, -1.5), V(-0.2, 0, -3.0)]); ev.data.d = g.items.addDecal('puddle', p, 1.4); audio.play('splat', { pos: p }); const mop = g.items.items.find((i) => i.kind === 'mop'); if (mop && mop.state === 'world') g.setWaypoint(mop.obj.position, 'MOP'); ev.data.cool = new Map(); },
        update: (g, ev, dt) => {
          if (g.items.decals.indexOf(ev.data.d) < 0) return false;
          if (g.player.held && g.player.held.kind === 'mop') g.setWaypoint(ev.data.d.pos.clone().setY(0.2), 'SPILL');
          for (const n of g.npcs) {
            if (n.rag || !n.moving || n.seated) continue;
            const c = ev.data.cool.get(n) || 0; if (ev.t < c) continue;
            const d = ev.data.d; if ((n.root.position.x - d.pos.x) ** 2 + (n.root.position.z - d.pos.z) ** 2 < d.r * d.r) {
              ev.data.cool.set(n, ev.t + 6);
              const f = V(Math.sin(n.yaw), 0.3, Math.cos(n.yaw)); n.knock(f.normalize(), 6.5, null, 'thighL'); audio.play('slip', { pos: n.root.position }); audio.play('scream', { pos: n.headPos(), pitch: n.pitch }); g.rep(-0.5);
            }
          }
          return ev.t < 240;
        },
        end: (g) => g.setWaypoint(null),
      },
      {
        id: 'cat', name: 'CAT BURGLAR', desc: 'A cat is knocking things off desks. Pet it (E)?', news: 'Local cat refuses to pay for PC time', w: 2,
        start: (g, ev) => {
          const cat = B.makeCat(); cat.position.set(0, 0, 7); g.scene.add(cat); ev.data.cat = cat; ev.data.target = V(0, 0, 4); ev.data.wait = 0;
          const hb = new THREE.Mesh(B.bx(0.5, 0.5, 0.6), new THREE.MeshBasicMaterial({ visible: false })); hb.userData.ent = { type: 'cat', ev }; cat.add(hb); hb.position.y = 0.25; g.extraInteract.push(hb); ev.data.hb = hb;
          ev.data.punch = { pos: () => cat.position.clone().setY(cat.position.y + 0.25), r: 0.4, hit: (dir) => { if (ev.data.flying) return; ev.data.flying = true; ev.data.fv = dir.clone().multiplyScalar(7).add(V(0, 4, 0)); audio.play('meow', { pos: cat.position }); g.rep(-2); g.hud.toast('😾 You punched a cat. The internet will not forgive this.', 'bad'); } };
          g.punchables.push(ev.data.punch);
          audio.play('meow', { pos: cat.position });
        },
        update: (g, ev, dt) => {
          const cat = ev.data.cat; const ud = cat.userData;
          if (ev.data.flying) { ev.data.fv.y -= 12 * dt; cat.position.addScaledVector(ev.data.fv, dt); cat.rotation.x += dt * 12; if (cat.position.y < 0) { cat.position.y = 0; ev.data.fv.multiplyScalar(0.4); ev.data.fv.y = Math.abs(ev.data.fv.y) * 0.5; } if (ev.data.fv.length() < 0.6) { ev.data.flying = false; cat.rotation.x = 0; ev.data.leaving = true; ev.data.target = V(0, 0, 9); } return true; }
          const d = ev.data.target.clone().sub(cat.position); d.y = 0;
          const moving = d.length() > 0.1;
          if (moving) { const sp = ev.data.leaving ? 3 : 1.1; cat.position.addScaledVector(d.normalize(), Math.min(sp * dt, d.length())); cat.rotation.y = Math.atan2(d.x, d.z); }
          ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ev.t * 12 + i * Math.PI / 2 * (i % 2 ? 1 : 3)) * 0.5 : 0; }); ud.tail.rotation.z = Math.sin(ev.t * 3) * 0.4;
          if (!moving && !ev.data.leaving) {
            ev.data.wait -= dt;
            if (ev.data.wait <= 0) {
              ev.data.wait = R(2, 4);
              // jump onto a random desk and knock something off
              const st = pick(g.stations); const p = st.slot.toWorld(R(-0.4, 0.4), -0.3); p.y = 0.76; ev.data.target = p; cat.position.y = p.y;
              if (Math.random() < 0.6) setTimeout(() => { if (!cat.parent) return; const it = g.items.spawn(pick(['trash_can', 'trash_cup', 'trash_wrap']), cat.position.clone().add(V(0, 0.2, 0)), { vel: V(R(-2, 2), 1, R(-2, 2)) }); audio.play('meow', { pos: cat.position }); }, 1200);
            }
          }
          if (ev.data.leaving && !moving) return false;
          if (ev.t > 50 && !ev.data.leaving) { ev.data.leaving = true; ev.data.target = V(0, 0, 9); cat.position.y = 0; }
          return true;
        },
        end: (g, ev) => { g.scene.remove(ev.data.cat); const i = g.punchables.indexOf(ev.data.punch); if (i >= 0) g.punchables.splice(i, 1); const j = g.extraInteract.indexOf(ev.data.hb); if (j >= 0) g.extraInteract.splice(j, 1); },
      },
      {
        id: 'sprinkler', name: 'SPRINKLER MALFUNCTION', desc: 'It\'s raining… indoors.', news: 'Café accidentally becomes water park', w: 2,
        start: (g, ev) => { audio.setLoop('rain', 0.5); g.insideNPCs().forEach((n) => { n.say(pick(['MY KEYBOARD!', 'IT\'S WET!', 'AAAH']), 2, { shout: true }); n.layer('flail'); }); for (let i = 0; i < 3; i++) g.items.addDecal('water', V(R(-6, 4), 0, R(-5, 5)), 1.1); },
        update: (g, ev, dt) => { g.fx.rain(-8, 8, -6, 6, 3.3, Math.floor(dt * 900)); return ev.t < 12; },
        end: (g) => { audio.setLoop('rain', 0); g.npcs.forEach((n) => n.layer(null)); },
      },
      {
        id: 'flashmob', name: 'FLASH MOB', desc: 'Strangers burst in and dance. They tip!', news: 'Choreographed chaos spotted in local café', w: 2,
        cond: (g) => g.world.power,
        start: (g, ev) => {
          ev.data.mob = [];
          for (let i = 0; i < 6; i++) {
            const n = g.customers.makeNPC({ accessories: [pick(['party', 'shades', 'cap', 'headphones'])] });
            n.setPos(V(R(-2, 2), 0, R(7.5, 9))); n.ai = { role: 'special', state: 'in', t: 0 };
            n.goTo(V(R(-0.3, 2.8), 0, R(-2.5, 3.5)), { run: true }); ev.data.mob.push(n);
          }
          this.startDisco(g, ev, 16, true);
        },
        update: (g, ev, dt) => {
          for (const n of ev.data.mob) if (n.alive && !n.moving && !n.rag && n.ai.state === 'in') { n.ai.state = 'dance'; n.play(Math.random() < 0.5 ? 'dance' : 'dance2', 0.3); }
          this.updateDisco(g, ev, dt);
          if (ev.t > 16 && !ev.data.out) { ev.data.out = true; ev.data.mob.forEach((n) => { if (!n.alive) return; n.play('idle'); n.ai.role = 'leaver'; n.goTo(V(0, 0, 7.5)); n.ai.override = () => { if (!n.moving) { n.goTo(V(pick([-24, 24]), 0, 8)); return false; } return true; }; g.earn(5, n.headPos(), { tip: 5, toRegister: true }); }); }
          return ev.t < 18;
        },
        end: (g, ev) => this.endDisco(g, ev),
      },
      {
        id: 'inspector', name: 'HEALTH INSPECTOR', desc: 'Keep it clean! Pass = $150. (Do NOT punch her.)', news: 'Inspector "cautiously optimistic" about café', w: 1.5, kicker: 'INSPECTION',
        cond: (g) => g.state.day >= 2 || g.elapsed > 300,
        start: (g, ev) => {
          const n = g.customers.makeNPC({ base: 'michelle', tint: 0xb8c8e8, accessories: ['glasses', 'clipboard'], name: 'Inspector Kim' });
          n.setPos(V(0, 0, 8.5)); n.name = 'INSPECTOR'; n.ai = { role: 'customer', special: 'inspector', state: 'inspect', t: 0, sat: 60 };
          n.onGetUp = () => this.inspectorPunched(n);
          ev.data.n = n; ev.data.pts = [V(0, 0, 4.5), V(4.0, 0, 3.0), V(-5.2, 0, 1.0), V(-2.5, 0, -2.8), V(5.0, 0, -5.4), V(0.5, 0, 0.5)]; ev.data.i = 0; ev.data.wait = 0;
          n.goTo(ev.data.pts[0]); n.say('Health inspection. Act natural.', 3);
        },
        update: (g, ev, dt) => {
          const n = ev.data.n; if (!n.alive) return false;
          if (ev.data.failed) return ev.t < 3 || n.alive && n.moving;
          if (n.rag) return true;
          if (!n.moving && !ev.data.done) {
            ev.data.wait += dt;
            if (ev.data.wait === dt) { n.play('standPhone', 0.3); if (Math.random() < 0.6) n.say(pick(['Hmm.', '*scribbles*', 'Is that… a pigeon feather?', 'Interesting.', 'Mhm.']), 2); }
            if (ev.data.wait > 2.5) { ev.data.wait = 0; ev.data.i++; if (ev.data.i < ev.data.pts.length) { n.goTo(ev.data.pts[ev.data.i]); } else ev.data.done = true; }
          }
          if (ev.data.done && !ev.data.verdict) {
            ev.data.verdict = true;
            const clean = g.cleanliness() - (g.toiletClogged ? 25 : 0);
            if (clean >= 65) { n.say(`Grade A! Score: ${Math.round(clean)}`, 3); g.earn(150, n.headPos(), { gold: true }); g.rep(4); g.unlock('inspector'); g.hud.banner('PASSED', 'Inspection passed!', `Cleanliness ${Math.round(clean)}% · +$150 bonus`); }
            else { n.say(`Disgusting. Score: ${Math.round(clean)}`, 3); g.spend(100, 'fine'); g.rep(-4); g.hud.banner('FAILED', 'Inspection failed', `Cleanliness ${Math.round(clean)}% · $100 fine`); }
            n.play('idle'); n.ai.role = 'leaver'; n.goTo(V(0, 0, 7.5)); n.ai.override = () => { if (!n.moving) { n.goTo(V(-24, 0, 8)); return false; } return true; };
          }
          return !ev.data.verdict || ev.t < 120 && n.moving;
        },
      },
      {
        id: 'haunted', name: 'HAUNTED PC', desc: 'Something is playing on station without a body… Exorcise it (hold E)!', news: 'Paranormal gamer achieves impossible high score', w: 2, kicker: 'SPOOKY',
        cond: (g) => g.hours >= 18 && g.stations.some((s) => !s.occupant && !s.broken && !s.reserved),
        start: (g, ev) => {
          const st = pick(g.stations.filter((s) => !s.occupant && !s.broken && !s.reserved)); st.haunted = true; st.reserved = 'ghost'; st.refreshScreen(); ev.data.st = st;
          audio.play('ghost', { pos: st.slot.deskCenter }); audio.setMusicStyle('spooky');
          g.setWaypoint(st.slot.deskCenter.clone().setY(1.3), 'HAUNTED PC');
        },
        update: (g, ev, dt) => {
          const st = ev.data.st; if (!st.haunted) return false;
          st.chairGroup.rotation.y += dt * 6; st.setChairSeated && (st.chairGroup.position.y = Math.abs(Math.sin(ev.t * 3)) * 0.1);
          if (Math.random() < dt * 2) audio.play('type', { pos: st.slot.deskCenter });
          if (Math.random() < dt * 0.25) { audio.play('ghost', { pos: st.slot.deskCenter }); g.items.items.filter((i) => i.body && i.obj.position.distanceTo(st.slot.deskCenter) < 4).forEach((i) => { i.body.wakeUp(); i.body.velocity.set(R(-2, 2), R(2, 4), R(-2, 2)); }); }
          if (Math.random() < dt * 0.3) { for (const l of g.world.lights.interior) l.intensity *= 0.2; setTimeout(() => g.world.power && g.world.lights.interior.forEach((l) => { l.intensity = l.userData.base; }), 120); }
          if (ev.t > 60) { st.haunted = false; }
          return st.haunted;
        },
        end: (g, ev) => { const st = ev.data.st; st.haunted = false; st.reserved = null; st.chairGroup.position.y = 0; st.setChairSeated(false); st.refreshScreen(); audio.setMusicStyle('lofi'); g.setWaypoint(null); },
      },
      {
        id: 'bobble', name: 'BOBBLEHEAD VIRUS', desc: 'Highly contagious. Mostly harmless.', news: 'Doctors baffled by outbreak of enormous heads', w: 2,
        cond: (g) => g.npcs.length > 2,
        start: (g, ev) => { audio.play('boing', {}); },
        update: (g, ev) => { const k = 1 + Math.min(1, ev.t / 1.5) * 1.3 * (ev.t > 18 ? Math.max(0, 1 - (ev.t - 18) / 1.5) : 1); g.npcs.forEach((n) => { if (!n.opts.keepHead) n.headScale = k; }); return ev.t < 19.6; },
        end: (g) => g.npcs.forEach((n) => { n.headScale = n.opts.special === 'alien' ? 1.7 : null; if (n.bones.Head) n.bones.Head.scale.setScalar(n.headScale || 1); }),
      },
      {
        id: 'raid', name: 'GANG RAID', desc: 'Three troublemakers at once. Defend your café!', news: 'Local hooligans "just here for the vibes"', w: 1.5, kicker: 'DANGER',
        cond: (g) => g.state.day >= 2 || g.elapsed > 400,
        start: (g) => { for (let i = 0; i < 3; i++) setTimeout(() => g.customers.spawnThug(), i * 1500); audio.play('alert'); },
        update: (g, ev) => ev.t < 4,
      },
      {
        id: 'ducks', name: 'DUCK DELIVERY', desc: 'Someone ordered 60 rubber ducks. Bin them: $1 each!', news: 'Duck shipment "lost in the mail" lands in café', w: 2,
        start: (g, ev) => { g.dropDucks(60); },
        update: (g, ev) => ev.t < 3,
      },
      {
        id: 'streamer', name: 'A WILD STREAMER APPEARS', desc: 'Keep them happy and you go viral!', news: 'Famous streamer spotted, chat goes wild', w: 2, kicker: 'OPPORTUNITY',
        cond: (g) => g.stations.some((s) => s.available),
        start: (g) => { const n = g.customers.spawnCustomer({ special: 'streamer', accessories: ['headphones', 'crown'], tag: 'xX_StreamQueen' }); n.ai.tag = n.name = pick(['xX_StreamQueen', 'TTV_ChaosKing', 'LaggyMcLagface']); n.ai.stayMin = 100; n.ai.persona = { ...n.ai.persona, needs: 1.6, anim: 'sitStream' }; setTimeout(() => n.alive && n.say('Chat, look at this place!', 3), 3000); },
        update: (g, ev) => ev.t < 2,
      },
      {
        id: 'pizza', name: 'PIZZA MIX-UP', desc: '8 free pizzas delivered by mistake. Sell them for $6!', news: 'Pizza driver "100% sure" this was the address', w: 2,
        start: (g) => { for (let i = 0; i < 8; i++) g.items.spawn('pizza', V(4.0 + (i % 4) * 0.4, 1.12 + Math.floor(i / 4) * 0.06, 2.0 + (i > 3 ? 0.05 : -0.05)), {}); g.pizzaAvailable = true; },
        update: (g, ev) => { if (!g.items.items.some((i) => i.kind === 'pizza')) { g.pizzaAvailable = false; return false; } return ev.t < 400; },
        end: (g) => { g.pizzaAvailable = false; },
      },
      {
        id: 'rocket', name: 'CHAIR MALFUNCTION', desc: 'That gas lift was NOT up to code', news: 'Office chair achieves low orbit', w: 2,
        cond: (g) => g.seatedCustomers().length > 0,
        start: (g, ev) => { const n = pick(g.seatedCustomers()); ev.data.n = n; n.say('Why is my chair hissing?', 1.4); audio.play('powerup', {}); },
        update: (g, ev) => {
          const n = ev.data.n;
          if (ev.t > 1.3 && !ev.data.go && n.alive) { ev.data.go = true; n.knock(V(R(-0.2, 0.2), 1, R(-0.2, 0.2)).normalize(), 16, null, 'pelvis'); audio.play('boing', { pos: n.root.position }); audio.play('scream', { pos: n.headPos(), pitch: n.pitch }); g.fx.dust(n.root.position.clone(), 14); if (n.ai) n.ai.sat += 5; }
          return ev.t < 3;
        },
      },
    ];
  }

  // ---------------- disco helpers ----------------
  startDisco(g, ev, dur, mobOnly = false) {
    if (g.world.disco) { ev.data.noDisco = true; return; }
    g.world.disco = true; ev.data.dur = dur;
    audio.setMusicStyle('disco');
    ev.data.colors = g.world.lights.interior.map((l) => l.color.clone());
    const ball = B.makeDiscoBall(); ball.position.set(-0.5, 3.6, 0.5); g.scene.add(ball); ev.data.ball = ball;
    g.stations.forEach((s) => s.refreshScreen());
    ev.data.dancers = [];
    if (!mobOnly) {
      for (const n of g.insideNPCs()) {
        if (!n.ai || n.ai.role !== 'customer' || n.rag) continue;
        if (n.ai.state === 'using' && n.seated) { g.customers.standUp(n, 'dance'); ev.data.dancers.push(n); }
        else if (!n.seated && (n.ai.state === 'queue')) { n.stop(); n.play('dance', 0.3); ev.data.dancers.push(n); }
      }
    }
  }
  updateDisco(g, ev, dt) {
    if (ev.data.noDisco) return ev.t < (ev.data.dur || 16);
    const b = ev.data.ball; b.position.y = Math.max(2.7, b.position.y - dt * 0.6); b.userData.ball.rotation.y += dt * 1.5;
    g.fx.disco(b.position, ev.t);
    for (const n of ev.data.dancers) if (n.alive && !n.rag && n.ai && n.ai.state === 'dancing' && n.curName !== 'dance' && n.curName !== 'dance2') n.play(Math.random() < 0.6 ? 'dance' : 'dance2', 0.3);
    return ev.t < ev.data.dur;
  }
  endDisco(g, ev) {
    if (ev.data.noDisco) return;
    g.world.disco = false; audio.setMusicStyle('lofi');
    g.world.lights.interior.forEach((l, i) => l.color.copy(ev.data.colors[i]));
    g.scene.remove(ev.data.ball);
    g.stations.forEach((s) => s.refreshScreen());
    for (const n of ev.data.dancers) {
      if (!n.alive || !n.ai) continue;
      n.ai.sat += 12;
      if (n.ai.station && (n.ai.state === 'dancing' || n.ai.state === 'standing')) { n.ai.state = 'returning'; n.ai.station.occupant = null; n.ai.station.reserved = n; n.play('idle'); n.goTo(n.ai.station.slot.approach); }
      else if (n.ai.state === 'queue') n.play('standArms');
    }
  }
}
