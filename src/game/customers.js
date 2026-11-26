import * as THREE from 'three';
import { NPC, gamerTag, randomName } from '../chars/npc.js';
import { audio } from '../core/audio.js';
import { PC_TIERS, CHAIR_TIERS } from './stations.js';
import { stars, TIME_SCALE } from './state.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const R = (a, b) => a + Math.random() * (b - a);

export const LINES = {
  enter: ['Is the WiFi fast here?', 'One PC please!', 'I heard you have snacks.', 'My mom thinks I\'m at school.', 'Time to touch some keyboard.', 'Don\'t tell my boss.', 'I need to finish my 400-hour quest.', 'Is this the place with the pigeons?'],
  full: ['All full?! Ugh.', 'No free PCs? I\'m going home.', 'Busier than my inbox.'],
  wait: ['How long is the wait?', 'Any PC opening soon?', 'I could be gaming right now…'],
  waitLeave: ['Forget it, I\'m leaving!', 'Too slow! One star!', 'I\'ll go to the library instead. The LIBRARY.'],
  happy: ['GG EZ!', 'Let\'s gooo!', 'Best café ever!', 'New high score!', '10/10 would lag again.', 'This chair hugs me.'],
  rage: ['WHO PUT THAT WALL THERE', 'LAG!!!', 'My team is so bad', 'UNINSTALLING', 'That was a bug!', 'Report that guy!!'],
  thanks: ['Thanks!', 'Lifesaver!', 'You\'re the best!', 'Mmm, sweet sweet sugar.', 'Five stars!'],
  hurt: ['OW! What was that for?!', 'Are you CRAZY?!', 'I\'m calling my mom!', 'Is this part of the service?', 'My spine!', 'I just wanted to play!'],
  hurtLeave: ['I\'m out of here!', 'Never coming back!', 'One star! ONE!', 'I\'m telling the internet!'],
  chat: ['Your café rocks!', 'Do you ever sleep?', 'I saw a pigeon earlier.', 'The guy next to me smells like cheese.', 'Can I live here?', 'Is the fridge haunted?', 'My PC has more RGB than my life.', 'Nice punch technique, boss.', 'Pineapple on pizza: yes or no?'],
  lagReq: ['The internet is LAGGING!', 'My ping is 9000!', 'WiFi died again!'],
  thugEnter: ['Nice place you got here…', 'Heh heh heh.', 'What\'s in the register?', 'I\'m just looking. Totally.'],
  thugHit: ['Hey! Watch it!', 'You\'ll regret that!', 'That tickled!', 'OK that one hurt.'],
  thugKO: ['OK OK I\'m leaving!', 'Sorry boss!!', 'I didn\'t touch anything!', 'Please not the face!'],
  thugSteal: ['Mine now! Bye!', 'Free money!', 'Yoink!'],
  ped: ['Nice neon.', 'Is that a net café? In this economy?', '…', 'Hmm.'],
};

const PERSONAS = [
  { id: 'gamer', w: 6, modes: ['shooter', 'arena', 'racer', 'blocks'], anim: 'sitGame', stay: [70, 170], needs: 1.0 },
  { id: 'student', w: 3, modes: ['office', 'chat'], anim: 'sitType', stay: [50, 110], needs: 0.7 },
  { id: 'social', w: 2, modes: ['chat', 'cards'], anim: 'sitType', stay: [40, 90], needs: 0.9 },
  { id: 'grinder', w: 2, modes: ['blocks', 'arena'], anim: 'sitGame', stay: [150, 260], needs: 1.4 },
];
const BASES = ['soldier', 'michelle', 'xbot', 'michelle', 'soldier'];
const TINTS = [0xffffff, 0xffd6d6, 0xd6e6ff, 0xd8ffd8, 0xfff0c8, 0xe0d0ff, 0xc8c8c8, 0xffe0f0];
const XBOT_TINTS = [0x6aa8ff, 0xff7a7a, 0x8aff9a, 0xffd36a, 0xd08aff, 0xffffff, 0x50e0e0, 0xff9ad0];
const ACCS = ['cap', 'beanie', 'headphones', 'glasses', 'shades', 'backpack', 'headphones', null, null];

export class Customers {
  constructor(game) {
    this.game = game;
    this.spawnAcc = 0; this.pedAcc = 2; this.thugAcc = 0;
    this.queueSpots = [new THREE.Vector3(1.15, 0, -4.7), new THREE.Vector3(2.05, 0, -4.7), new THREE.Vector3(2.6, 0, 3.3), new THREE.Vector3(1.6, 0, 3.6), new THREE.Vector3(0.9, 0, 2.6)];
    this.doorOut = new THREE.Vector3(0, 0, 7.3); this.doorIn = new THREE.Vector3(0, 0, 4.8);
  }

  get open() { const h = this.game.hours; return h >= 8 && h < 23.5 && !this.game.closedForced; }

  makeNPC(opts = {}) {
    const g = this.game;
    const baseName = opts.base || pick(BASES);
    const base = g.chars.bases[baseName];
    const tint = opts.tint ?? (baseName === 'xbot' ? pick(XBOT_TINTS) : pick(TINTS));
    let accessories = opts.accessories;
    if (!accessories) { accessories = []; const a = pick(ACCS); if (a) accessories.push(a); if (Math.random() < 0.15) accessories.push('backpack'); if (Math.random() < 0.04) accessories.push('party'); }
    const npc = new NPC(g, base, { ...opts, tint, accessories });
    g.npcs.push(npc);
    return npc;
  }

  sidewalkPoint(side) { return new THREE.Vector3(side * R(21, 23), 0, R(7.0, 9.2)); }

  // ---------------- spawning ----------------
  spawnCustomer(opts = {}) {
    const g = this.game;
    const side = Math.random() < 0.5 ? -1 : 1;
    const npc = this.makeNPC(opts);
    npc.setPos(opts.pos || this.sidewalkPoint(side));
    npc.face(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const persona = opts.persona || this._persona();
    npc.ai = {
      role: opts.role || 'customer', state: 'arrive', t: 0, side, persona, sat: 70 + R(-5, 5),
      stayMin: R(persona.stay[0], persona.stay[1]) * (g.state.upgrades.ac ? 1.25 : 1) * (g.state.upgrades.fiber ? 1.1 : 1),
      usedMin: 0, reqT: R(15, 40), trashT: R(25, 60), toiletT: R(60, 160), mood: 0, special: opts.special || null,
      tag: opts.tag || (Math.random() < 0.5 ? gamerTag() : randomName()), paidExtra: 0, hits: 0,
    };
    npc.name = npc.ai.tag;
    npc.screenMode = pick(persona.modes);
    if (opts.special === 'streamer') npc.screenMode = 'stream';
    npc.onGetUp = () => this.onGetUp(npc);
    npc.goTo(this.doorOut);
    return npc;
  }
  _persona() { const tot = PERSONAS.reduce((a, p) => a + p.w, 0); let r = Math.random() * tot; for (const p of PERSONAS) { r -= p.w; if (r <= 0) return p; } return PERSONAS[0]; }

  spawnPedestrian() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const npc = this.makeNPC();
    npc.setPos(this.sidewalkPoint(side));
    npc.ai = { role: 'ped', state: 'walk', t: 0 };
    npc.onGetUp = () => { npc.say(pick(LINES.hurt), 2.5, { shout: true }); this.game.rep(-1.5); npc.goTo(this.sidewalkPoint(-Math.sign(npc.root.position.x || 1)), { run: true }); npc.ai.state = 'walk'; };
    npc.goTo(this.sidewalkPoint(-side));
    if (Math.random() < 0.15) setTimeout(() => npc.alive && npc.say(pick(LINES.ped), 2.5), 3000);
  }

  spawnThug() {
    const g = this.game;
    const npc = this.makeNPC({ base: pick(['soldier', 'xbot']), tint: 0x555555, accessories: [pick(['mohawk', 'beanie', 'shades', 'cap']), 'shades'], kind: 'thug', hp: 3, height: 1.82 + Math.random() * 0.08 });
    const side = Math.random() < 0.5 ? -1 : 1;
    npc.setPos(this.sidewalkPoint(side));
    npc.ai = { role: 'thug', state: 'arrive', t: 0, side, hits: 0, plan: null, tag: pick(['Shady Steve', 'Sneaky Pete', 'Big Trouble', 'Lil Menace', 'Chaos Carl', 'Grabby Gus']) };
    npc.name = npc.ai.tag;
    npc.onGetUp = () => this.onGetUp(npc);
    npc.goTo(this.doorOut, { speed: 1.6 });
    return npc;
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const g = this.game; const s = g.state;
    const h = g.hours;
    // spawn customers based on reputation, time of day & price
    if (this.open && !g.dayEnding) {
      const tod = h < 11 ? 0.65 : h < 14 ? 1.0 : h < 18 ? 1.15 : h < 22 ? 1.4 : 0.6;
      const fair = 6 * (1 + (g.avgTierMult() - 1) * 0.8) * (s.upgrades.vip ? 1.1 : 1);
      const priceK = Math.max(0.25, Math.min(1.5, 1.6 - s.price / fair * 0.6));
      const perHour = (1.6 + stars(s.rep) * 0.9 + g.stations.length * 0.45) * tod * priceK * (1 + (s.marketing || 0) * 0.4) * (s.day === 1 ? 1.2 : 1);
      const perSec = perHour * TIME_SCALE / 60;
      this.spawnAcc += perSec * dt;
      const active = g.npcs.filter((n) => n.ai && n.ai.role === 'customer').length;
      const cap = g.stations.length + 3;
      if (this.spawnAcc >= 1) { this.spawnAcc = 0; if (active < cap) this.spawnCustomer(); }
      // troublemakers
      const thugPerHour = (0.22 + Math.min(1.2, s.day * 0.12)) * (s.upgrades.camera ? 0.6 : 1) * (h > 18 ? 1.5 : 1);
      this.thugAcc += thugPerHour * TIME_SCALE / 60 * dt;
      if (this.thugAcc >= 1 && s.day >= 1 && g.npcs.filter((n) => n.ai && n.ai.role === 'thug').length < 2 && g.elapsed > 70) { this.thugAcc = 0; this.spawnThug(); g.hud.toast('😈 A troublemaker is heading for your café…', 'bad'); }
    }
    // pedestrians always
    this.pedAcc -= dt;
    if (this.pedAcc <= 0) { this.pedAcc = R(5, 12); if (g.npcs.length < 26) this.spawnPedestrian(); }

    for (const npc of g.npcs.slice()) {
      if (!npc.alive || !npc.ai) continue;
      const ai = npc.ai; ai.t += dt;
      if (npc.rag) continue;
      if (ai.override) { if (ai.override(dt) === false) ai.override = null; continue; }
      switch (ai.role) {
        case 'customer': this.customerAI(npc, ai, dt); break;
        case 'ped': if (!npc.moving) this.despawn(npc); break;
        case 'thug': this.thugAI(npc, ai, dt); break;
        case 'leaver': if (!npc.moving) this.despawn(npc); break;
      }
    }
  }

  despawn(npc) {
    const g = this.game;
    if (npc.ai && npc.ai.station) { const st = npc.ai.station; if (st.occupant === npc) st.occupant = null; if (st.reserved === npc) st.reserved = null; st.setChairSeated(false); st.refreshScreen(); }
    npc.dispose();
    const i = g.npcs.indexOf(npc); if (i >= 0) g.npcs.splice(i, 1);
  }

  leave(npc, { angry = false, run = false } = {}) {
    const ai = npc.ai;
    if (ai.station) { const st = ai.station; if (st.occupant === npc) st.occupant = null; if (st.reserved === npc) st.reserved = null; st.setChairSeated(false); st.refreshScreen(); ai.station = null; }
    npc.seated = false; npc.setNeed(null);
    ai.state = 'exit1'; ai.angry = angry;
    npc.lockAnim = false;
    npc.goTo(this.doorIn, { run });
  }

  freeStation(npc) {
    const g = this.game;
    const list = g.stations.filter((s) => s.available);
    if (!list.length) return null;
    // streamers want the best PC
    if (npc.ai.special === 'streamer') list.sort((a, b) => b.tier - a.tier);
    else list.sort((a, b) => a.slot.approach.distanceTo(this.doorIn) - b.slot.approach.distanceTo(this.doorIn) + (Math.random() - 0.5) * 3);
    return list[0];
  }

  customerAI(npc, ai, dt) {
    const g = this.game;
    switch (ai.state) {
      case 'arrive': {
        if (npc.moving) return;
        if (!this.open || g.dayEnding) { ai.role = 'leaver'; npc.goTo(this.sidewalkPoint(-ai.side)); if (Math.random() < 0.4) npc.say('Closed?! Aww.'); return; }
        const st = this.freeStation(npc);
        if (st) {
          st.reserved = npc; ai.station = st; ai.state = 'toStation'; npc.goTo(st.slot.approach);
          audio.play('bell', { pos: g.world.door.position });
          if (Math.random() < 0.45) npc.say(pick(LINES.enter));
        } else {
          const qn = g.npcs.filter((n) => n.ai && n.ai.state === 'queue').length;
          if (qn < this.queueSpots.length) { ai.state = 'queue'; ai.qSpot = this.queueSpots[qn]; ai.patience = 50; npc.goTo(ai.qSpot); npc.say(pick(LINES.wait)); g.hud.toast(`${npc.name} is waiting for a free PC`, ''); }
          else { npc.say(pick(LINES.full)); g.dayStat('lost', 1); g.rep(-0.6); ai.role = 'leaver'; npc.goTo(this.sidewalkPoint(-ai.side)); }
        }
        break;
      }
      case 'queue': {
        if (!npc.moving) { npc.play('standArms', 0.4); npc.lookAt(g.player.pos); }
        ai.patience -= dt;
        npc.setNeed('⏳', Math.max(0, ai.patience / 50));
        const st = this.freeStation(npc);
        if (st) { npc.setNeed(null); st.reserved = npc; ai.station = st; ai.state = 'toStation'; npc.goTo(st.slot.approach); npc.say('Finally!'); }
        else if (ai.patience <= 0) { npc.setNeed(null); npc.say(pick(LINES.waitLeave), 2.5, { shout: true }); g.dayStat('lost', 1); g.rep(-2); this.leave(npc, { angry: true }); }
        break;
      }
      case 'toStation': {
        if (npc.moving) return;
        const st = ai.station;
        if (!st || st.broken || st.fire || (st.occupant && st.occupant !== npc)) { if (st && st.reserved === npc) st.reserved = null; ai.station = null; ai.state = 'arrive'; return; }
        ai.state = 'sitting'; ai.sitT = 0; ai.from = npc.root.position.clone();
        st.occupant = npc; st.reserved = null;
        break;
      }
      case 'sitting': {
        const st = ai.station; ai.sitT += dt;
        const k = Math.min(1, ai.sitT / 0.55);
        npc.root.position.lerpVectors(ai.from, st.slot.chairPos, k);
        let d = st.slot.faceYaw - npc.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        npc.face(npc.yaw + d * Math.min(1, dt * 10));
        if (ai.sitT > 0.05 && !npc.seated) { npc.seated = true; npc.play(ai.persona.anim, 0.45); st.setChairSeated(true); }
        if (k >= 1) { npc.face(st.slot.faceYaw); ai.state = 'using'; st.refreshScreen(); if (!ai.counted) { ai.counted = true; g.dayStat('customers', 1); } }
        break;
      }
      case 'using': this.usingAI(npc, ai, dt); break;
      case 'standing': {
        ai.sitT += dt;
        const k = Math.min(1, ai.sitT / 0.5);
        npc.root.position.lerpVectors(ai.from, ai.to, k);
        if (k >= 1) {
          npc.seated = false;
          if (ai.next === 'toilet') { ai.state = 'toToilet'; npc.goTo(g.world.toiletSpot); }
          else if (ai.next === 'dance') { ai.state = 'dancing'; }
          else { this.pay(npc); this.leave(npc); }
        }
        break;
      }
      case 'toToilet': {
        if (npc.moving) return;
        ai.state = 'onToilet'; ai.tt = 0; npc.face(Math.PI); npc.root.position.copy(new THREE.Vector3(2.3, 0, -10.7)); npc.play('toilet', 0.3); npc.seated = true;
        break;
      }
      case 'onToilet': {
        ai.tt += dt;
        if (ai.tt > 7) {
          audio.play('flush', { pos: g.world.toiletSpot });
          if (Math.random() < 0.25 && !g.toiletClogged) { g.toiletClogged = true; npc.say('Uh… the toilet is… not okay.', 3); g.hud.toast('🚽 The toilet is clogged! Unclog it in the back room.', 'bad'); g.items.addDecal('water', new THREE.Vector3(2.3, 0, -10.2), 1.2); }
          npc.seated = false; npc.root.position.copy(g.world.toiletSpot); npc.play('idle', 0.2);
          if (ai.station && ai.station.occupant === npc) { ai.state = 'toStation'; npc.goTo(ai.station.slot.approach); }
          else { this.pay(npc); this.leave(npc); }
        }
        break;
      }
      case 'exit1': if (!npc.moving) { ai.state = 'exit2'; npc.goTo(this.doorOut, { run: npc.run }); } break;
      case 'exit2': if (!npc.moving) { ai.role = 'leaver'; npc.goTo(this.sidewalkPoint(Math.random() < 0.5 ? -1 : 1), { run: npc.run }); } break;
      case 'dancing': break;
      case 'returning': if (!npc.moving) { ai.state = 'toStation'; } break;
    }
  }

  usingAI(npc, ai, dt) {
    const g = this.game; const st = ai.station;
    const gmin = dt * TIME_SCALE;
    if (!g.world.power) { ai.sat -= dt * 0.8; if (Math.random() < dt * 0.15) npc.say(pick(['Hey! The power is out!', 'MY GAME!!!', 'Who turned off the lights?']), 2, { shout: true }); npc.play('sitIdle', 0.5); return; }
    if (st.broken || st.fire) {
      if (!ai.req || ai.req.type !== 'fix') this.makeRequest(npc, 'fix');
    } else {
      ai.usedMin += gmin;
      if (npc.curName !== ai.persona.anim && !ai.mood) npc.play(npc.screenMode === 'stream' ? 'sitStream' : ai.persona.anim, 0.4);
    }
    // keyboard sounds
    if (Math.random() < dt * 1.4) audio.play('type', { pos: st.slot.deskCenter.clone().setY(0.8) });
    // mood flashes
    if (ai.mood > 0) { ai.mood -= dt; if (ai.mood <= 0) { ai.mood = 0; npc.play(ai.persona.anim, 0.4); } }
    else if (Math.random() < dt * 0.012) {
      if (Math.random() < 0.6 + st.tier * 0.08) { npc.play('sitCheer', 0.2); ai.mood = 1.8; npc.say(pick(LINES.happy), 2, { shout: true }); audio.play('yay', { pos: npc.headPos(), pitch: npc.pitch }); ai.sat += 2; }
      else { npc.play('sitRage', 0.15); ai.mood = 2.2; npc.say(pick(LINES.rage), 2, { shout: true }); audio.play('angry', { pos: npc.headPos(), pitch: npc.pitch }); if (Math.random() < 0.12) g.events.rageQuit(npc); }
    }
    // requests
    if (!ai.req) {
      ai.reqT -= dt * ai.persona.needs;
      if (ai.reqT <= 0) { ai.reqT = R(30, 70); this.makeRequest(npc); }
      // random PC failures (worse on cheap PCs)
      if (Math.random() < dt * 0.0016 * PC_TIERS[st.tier].breakChance * (1 + g.state.day * 0.05)) { st.breakPC(); g.hud.toast(`💥 PC at station ${st.slot.id + 1} crashed!`, 'bad'); audio.play('glitch', { pos: st.slot.deskCenter }); }
    } else {
      const r = ai.req;
      r.left -= dt;
      npc.setNeed(r.icon, Math.max(0, r.left / r.max), r.left / r.max < 0.3 ? '#ff4d5e' : r.left / r.max < 0.6 ? '#ffd34d' : '#4dff9a');
      if (r.left <= 0) {
        npc.setNeed(null); ai.req = null; ai.sat -= 18; g.rep(-1.2);
        npc.say(pick(['Forget it then!', 'Worst service ever!', 'Hello?! Anyone?!']), 2.5, { shout: true }); audio.play('angry', { pos: npc.headPos(), pitch: npc.pitch });
        if (st.broken && Math.random() < 0.6) { this.standUpAndLeave(npc, true); return; }
      }
    }
    // litter
    ai.trashT -= dt;
    if (ai.trashT <= 0) { ai.trashT = R(40, 90); g.spawnTrashNear(st); }
    // toilet trip
    ai.toiletT -= dt;
    if (ai.toiletT <= 0 && !ai.req) { ai.toiletT = 9999; this.standUp(npc, 'toilet'); return; }
    // satisfaction drift from environment
    const clean = g.cleanliness();
    ai.sat += dt * ((clean - 70) / 900 + (g.state.upgrades.speakers ? 0.004 : 0) + (g.state.upgrades.decor ? 0.003 : 0));
    // done?
    if (ai.usedMin >= ai.stayMin || (g.hours >= 23.7)) this.standUpAndLeave(npc);
  }

  makeRequest(npc, type) {
    const g = this.game; const ai = npc.ai; const s = g.state;
    if (!type) {
      const opts = ['drink', 'drink', 'snack'];
      if (s.upgrades.coffee) opts.push('coffee', 'coffee');
      if (g.pizzaAvailable) opts.push('food');
      if (!s.upgrades.fiber) opts.push('lag');
      type = pick(opts);
    }
    const icons = { drink: '🥤', snack: '🍟', coffee: '☕', food: '🍕', fix: '🔧', lag: '📶' };
    const max = type === 'fix' ? 60 : type === 'lag' ? 45 : R(45, 65);
    ai.req = { type, icon: icons[type], left: max, max };
    npc.setNeed(icons[type], 1);
    const say = { drink: ['Can I get a soda?', 'I\'m so thirsty…', 'Drink please!'], snack: ['Got any chips?', 'Snack time!', 'I\'m starving!'], coffee: ['Coffee. Now. Please.', 'Need caffeine!'], food: ['Is that pizza I smell?'], fix: ['My PC died!', 'Blue screen!!', 'Help, it\'s broken!'], lag: LINES.lagReq }[type];
    npc.say(pick(say), 2.4);
    audio.play('notify', {});
  }

  fulfil(npc, kind) {
    const g = this.game; const ai = npc.ai;
    if (!ai || !ai.req) return false;
    const map = { soda: 'drink', chips: 'snack', coffee: 'coffee', pizza: 'food' };
    if (map[kind] !== ai.req.type) return false;
    const prices = { drink: 3, snack: 3, coffee: 4, food: 6 };
    const fast = ai.req.left / ai.req.max;
    const tip = fast > 0.7 ? 2 : fast > 0.4 ? 1 : 0;
    const total = prices[ai.req.type] + tip;
    ai.req = null; npc.setNeed(null); ai.sat += 10 + tip * 3;
    npc.say(pick(LINES.thanks), 2); audio.play('give');
    g.earn(total, npc.headPos(), { sale: true, tip });
    g.dayStat('sold', 1); g.addXP(4);
    g.streak();
    if (kind === 'soda' || kind === 'coffee') ai.trashT = Math.min(ai.trashT, R(15, 35));
    return true;
  }

  fixed(st) {
    const npc = st.occupant;
    if (npc && npc.ai && npc.ai.req && npc.ai.req.type === 'fix') { npc.ai.req = null; npc.setNeed(null); npc.ai.sat += 6; npc.say('You\'re a wizard!', 2); }
  }
  lagFixed() {
    for (const n of this.game.npcs) if (n.ai && n.ai.req && n.ai.req.type === 'lag') { n.ai.req = null; n.setNeed(null); n.ai.sat += 6; n.say(pick(['Ping is back!', 'Smooth again!', 'Thank you!!']), 2); this.game.earn(1, n.headPos(), { tip: 1 }); }
  }

  standUp(npc, next) {
    const ai = npc.ai; const st = ai.station;
    ai.state = 'standing'; ai.sitT = 0; ai.next = next;
    ai.from = npc.root.position.clone(); ai.to = st ? st.slot.approach.clone() : npc.root.position.clone();
    npc.play('idle', 0.3);
    if (st && next !== 'toilet') { /* keep */ }
    if (st) st.setChairSeated(false);
  }
  standUpAndLeave(npc, angry = false) {
    const ai = npc.ai;
    if (angry) ai.sat -= 20;
    this.standUp(npc, 'leave');
  }

  pay(npc) {
    const g = this.game; const ai = npc.ai; const st = ai.station; const s = g.state;
    if (ai.paid) return; ai.paid = true;
    const tier = st ? st.tier : 1;
    const chair = st ? st.chairTier : 1;
    ai.sat += (tier - 1) * 5 + CHAIR_TIERS[chair].sat * 0.6 - Math.max(0, s.price - 6 * PC_TIERS[tier].mult) * 2.2;
    ai.sat = Math.max(0, Math.min(100, ai.sat));
    const hours = Math.max(0.5, ai.usedMin / 60);
    let bill = hours * s.price * PC_TIERS[tier].mult * (st && st.slot.vip ? 1.5 : 1) * (ai.special === 'alien' ? 5 : 1);
    if (ai.sat < 25) bill *= 0.5;
    const tip = ai.sat > 70 ? bill * (ai.sat - 70) / 100 * (ai.special === 'streamer' ? 3 : 1) : 0;
    bill = Math.round(bill); const tipR = Math.round(tip);
    if (st && st.occupant === npc) { st.occupant = null; st.refreshScreen(); }
    g.earn(bill + tipR, npc.headPos(), { tip: tipR, toRegister: true });
    g.dayStat('served', 1); g.state.stats.served++;
    g.addXP(10 + Math.round(ai.sat / 10));
    g.rep((ai.sat - g.state.rep) * 0.09 * (s.upgrades.decor ? 1.15 : 1));
    const face = ai.sat > 82 ? '😍' : ai.sat > 60 ? '🙂' : ai.sat > 35 ? '😐' : '😡';
    if (ai.sat > 82) g.dayStat('happy', 1);
    npc.say(`${face} ${ai.sat > 82 ? 'Amazing!' : ai.sat > 60 ? 'Nice place.' : ai.sat > 35 ? 'It was OK.' : 'Never again!'}`, 2.5, { voice: true });
    g.unlock('first_cust');
    if (ai.special === 'streamer') g.events.streamerResult(npc, ai.sat);
  }

  // ---------------- thugs ----------------
  thugAI(npc, ai, dt) {
    const g = this.game;
    switch (ai.state) {
      case 'arrive': {
        if (npc.moving) return;
        audio.play('bell', { pos: g.world.door.position });
        npc.say(pick(LINES.thugEnter), 2.5);
        const plans = [];
        if (g.state.register > 15) plans.push('steal', 'steal');
        if (g.stations.some((s) => !s.broken)) plans.push('smash');
        if (g.npcs.some((n) => n.seated && n.ai && n.ai.role === 'customer')) plans.push('harass', 'harass');
        plans.push('trash');
        ai.plan = pick(plans); ai.state = 'go';
        if (ai.plan === 'steal') { npc.goTo(new THREE.Vector3(5.0, 0, 2.95)); }
        else if (ai.plan === 'smash') { ai.target = pick(g.stations.filter((s) => !s.broken)); npc.goTo(ai.target.slot.approach.clone().lerp(ai.target.slot.chairPos, 0.2).add(new THREE.Vector3(0.4, 0, 0.0))); }
        else if (ai.plan === 'harass') { ai.target = pick(g.npcs.filter((n) => n.seated && n.ai && n.ai.role === 'customer')); npc.goTo(ai.target.ai.station.slot.approach); }
        else { npc.goTo(new THREE.Vector3(R(-5, 2), 0, R(-4, 4))); }
        break;
      }
      case 'go': {
        if (npc.moving) return;
        ai.state = 'act'; ai.actT = 0;
        if (ai.plan === 'steal') { npc.face(Math.PI); npc.play('standPhone', 0.3); g.hud.toast(`🚨 ${npc.name} is robbing your register! Punch them!`, 'bad'); audio.play('alert'); }
        if (ai.plan === 'smash' && ai.target) { npc.lookAt(ai.target.slot.deskCenter); npc.play('kick', 0.15, { once: true }); }
        if (ai.plan === 'harass' && ai.target) { npc.lookAt(ai.target.root.position); npc.play('punch', 0.15, { once: true }); npc.say('Move it, nerd!', 2, { shout: true }); }
        if (ai.plan === 'trash') { npc.play('kick', 0.15, { once: true }); }
        break;
      }
      case 'act': {
        ai.actT += dt;
        if (ai.plan === 'steal' && ai.actT > 4) {
          const stolen = Math.round(g.state.register * 0.6);
          if (stolen > 0) { g.state.register -= stolen; g.dayStat('stolen', stolen); g.hud.toast(`💸 ${npc.name} stole $${stolen} from the register!`, 'bad'); audio.play('cash', { pos: npc.root.position }); }
          npc.say(pick(LINES.thugSteal), 2, { shout: true }); g.rep(-2);
          this.thugFlee(npc);
        } else if (ai.plan === 'smash' && ai.actT > 0.4 && !ai.done) {
          ai.done = true; if (ai.target) { ai.target.breakPC(); audio.play('punch', { pos: ai.target.slot.deskCenter, vol: 0.8 }); g.hud.toast(`😡 ${npc.name} smashed a PC!`, 'bad'); }
          npc.say('Heh. Oops.', 2); audio.play('laugh', { pos: npc.headPos(), pitch: npc.pitch * 0.8 });
        } else if (ai.plan === 'harass' && ai.actT > 0.25 && !ai.done) {
          ai.done = true;
          if (ai.target && ai.target.alive && !ai.target.rag) { const d = ai.target.root.position.clone().sub(npc.root.position).setY(0.4).normalize(); ai.target.knock(d, 6.5); audio.play('punch', { pos: ai.target.root.position }); ai.target.ai && (ai.target.ai.sat -= 30); audio.play('scream', { pos: ai.target.headPos(), pitch: ai.target.pitch }); g.rep(-1.5); }
          audio.play('laugh', { pos: npc.headPos(), pitch: npc.pitch * 0.8 });
        } else if (ai.plan === 'trash' && ai.actT > 0.4 && !ai.done) {
          ai.done = true; for (let i = 0; i < 4; i++) g.items.spawn(pick(['trash_can', 'trash_wrap', 'trash_cup']), npc.root.position.clone().add(new THREE.Vector3(R(-0.5, 0.5), 0.5, R(-0.5, 0.5))), { vel: new THREE.Vector3(R(-2, 2), 2, R(-2, 2)) });
          npc.say('Littering is my cardio.', 2.5); audio.play('laugh', { pos: npc.headPos(), pitch: npc.pitch * 0.8 });
        }
        if (ai.plan !== 'steal' && ai.actT > 2.2) {
          // another round or leave
          if (Math.random() < 0.35 && !ai.round2) { ai.round2 = true; ai.state = 'arrive'; ai.done = false; npc.moving = false; }
          else this.thugFlee(npc);
        }
        // fight back if player close
        this.thugFight(npc, ai, dt);
        break;
      }
      case 'fight': {
        this.thugFight(npc, ai, dt);
        if (ai.t - ai.fightStart > 8) this.thugFlee(npc);
        break;
      }
      case 'flee': if (!npc.moving) { ai.state = 'flee2'; npc.goTo(this.doorOut, { run: true }); } break;
      case 'flee2': if (!npc.moving) { ai.role = 'leaver'; npc.goTo(this.sidewalkPoint(Math.random() < 0.5 ? -1 : 1), { run: true }); } break;
    }
  }
  thugFight(npc, ai, dt) {
    const g = this.game;
    if (!ai.angry) return;
    const pp = g.player.pos; const d = npc.root.position.distanceTo(new THREE.Vector3(pp.x, 0, pp.z));
    ai.fightCd = (ai.fightCd || 0) - dt;
    if (d > 1.1) { if (!npc.moving || ai.chaseT <= 0) { npc.goTo(new THREE.Vector3(pp.x, 0, pp.z), { speed: 2.4 }); ai.chaseT = 0.6; } ai.chaseT -= dt; }
    else if (ai.fightCd <= 0) {
      npc.stop(); npc.lookAt(pp); npc.play('punch', 0.1, { once: true }); ai.fightCd = 1.4;
      setTimeout(() => { if (!npc.alive || npc.rag) return; const d2 = npc.root.position.distanceTo(new THREE.Vector3(g.player.pos.x, 0, g.player.pos.z)); if (d2 < 1.4) g.playerHit(npc); }, 220);
    }
  }
  thugFlee(npc) { const ai = npc.ai; ai.state = 'flee'; npc.lockAnim = false; npc.goTo(this.doorIn, { run: true }); }

  // ---------------- ragdoll recovery ----------------
  onGetUp(npc) {
    const g = this.game; const ai = npc.ai; if (!ai) return;
    npc.seated = false;
    if (ai.role === 'thug') {
      if (ai.hits >= (npc.hp || 3)) {
        npc.play('handsUp', 0.3); npc.say(pick(LINES.thugKO), 3, { shout: true });
        ai.override = (dt) => { ai.koT = (ai.koT || 0) + dt; if (ai.koT > 1.6) { this.thugFlee(npc); return false; } return true; };
      } else { ai.angry = true; ai.state = 'fight'; ai.fightStart = ai.t; npc.say(pick(LINES.thugHit), 2, { shout: true }); }
      return;
    }
    if (ai.role === 'customer') {
      ai.sat -= 22;
      if (ai.special === 'inspector') { g.events.inspectorPunched(npc); return; }
      if ((ai.hits || 0) >= 2 || ai.sat < 15) {
        npc.say(pick(LINES.hurtLeave), 2.5, { shout: true }); g.rep(-3);
        if (ai.station) { const st = ai.station; if (st.occupant === npc) st.occupant = null; if (st.reserved === npc) st.reserved = null; st.refreshScreen(); }
        ai.paid = true; this.leave(npc, { angry: true, run: true });
      } else {
        npc.say(pick(LINES.hurt), 2.5, { shout: true }); g.rep(-1);
        if (ai.station && (ai.state === 'using' || ai.state === 'sitting' || ai.state === 'standing')) { ai.state = 'returning'; ai.station.occupant = null; ai.station.reserved = npc; ai.station.setChairSeated(false); npc.goTo(ai.station.slot.approach); }
        else if (ai.state === 'queue') npc.goTo(ai.qSpot);
        else if (ai.state === 'toStation' && ai.station) npc.goTo(ai.station.slot.approach);
        else if (ai.state === 'exit1') npc.goTo(this.doorIn);
        else if (ai.state === 'exit2' || ai.state === 'arrive') npc.goTo(this.doorOut);
        else if (ai.state === 'toToilet' || ai.state === 'onToilet') { ai.state = 'toToilet'; npc.goTo(g.world.toiletSpot); }
        else if (ai.state === 'dancing') { /* keep dancing */ npc.play('dance', 0.3); }
      }
      return;
    }
    if (ai.role === 'leaver' && !npc.moving) npc.goTo(this.sidewalkPoint(Math.random() < 0.5 ? -1 : 1), { run: true });
  }
}
