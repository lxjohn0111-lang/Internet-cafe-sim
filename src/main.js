import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SDK } from './sdk.js';
import { audio } from './core/audio.js';
import { Input } from './core/input.js';
import { Renderer } from './core/renderer.js';
import { Physics, CANNON } from './core/physics.js';
import { loadTextures, buildMaterials, M } from './world/materials.js';
import * as B from './world/builders.js';
import { World, H } from './world/cafe.js';
import { Sky } from './world/sky.js';
import { FX } from './world/fx.js';
import { ScreenManager, Screen } from './world/screens.js';
import { loadCharacters } from './chars/models.js';
import { Nav } from './game/nav.js';
import { Player } from './game/player.js';
import { ItemManager } from './game/items.js';
import { Station, makeGhost, PC_TIERS } from './game/stations.js';
import { Customers, LINES } from './game/customers.js';
import { Events } from './game/events.js';
import { Robot } from './game/robot.js';
import { HUD } from './ui/hud.js';
import { OS } from './ui/os.js';
import { defaultState, freshDay, makeObjectives, xpFor, LEVEL_UNLOCKS, ACHIEVEMENTS, SHOP, PC_UPGRADE, CHAIR_UPGRADE, dayBills, stars, TIME_SCALE, OPEN_H } from './game/state.js';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const R = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ASSETS = 'assets/';
const K = (k) => `<kbd>${k}</kbd>`;

const TIPS = [
  'Tip: Hold the left mouse button to charge a MEGA punch.',
  'Tip: Throw trash into a bin from far away for trick-shot bonuses.',
  'Tip: Customers pay into the register. Collect it before someone else does.',
  'Tip: Cheap PCs break more often. Upgrade them in the Café Manager.',
  'Tip: If the lights go out, the fuse box is at the back right.',
  'Tip: Pigeons can be punched. Pigeons should be punched.',
  'Tip: Press Tab anywhere to open the shop on your phone.',
  'Tip: A clean café gets better reviews. A dirty one gets pigeons.',
];
const QUIPS = ['Nobody was seriously injured. Probably.', 'The pigeons will remember this.', 'Somewhere, a keyboard is still flying.', 'Your mom called. She is proud. Kind of.', 'The toilet survived. Barely.', 'Rated 4.9 stars by people who were not punched.', '"Best café I\'ve been ragdolled in" — a customer'];

class Game {
  constructor() {
    this.npcs = []; this.punchables = []; this.extraInteract = [];
    this.elapsed = 0; this.paused = false; this.started = false; this.dayEnding = false; this.closedForced = false;
    this.toiletClogged = false; this.pizzaAvailable = false; this.waypoint = null;
    this.timeScale = 1; this.slowT = 0; this.streakN = 0; this.streakT = 0; this.osOpen = false; this.overlay = null;
    this.ghosts = []; this.chatCd = 0; this.saveT = 0; this.tutorialT = 0;
  }

  async init() {
    const loadFill = $('load-fill'), loadText = $('load-text');
    $('load-tip').textContent = pick(TIPS);
    const prog = (k, t) => { loadFill.style.width = (k * 100).toFixed(0) + '%'; if (t) loadText.textContent = t; };
    prog(0.02, 'Connecting to CrazyGames…');
    await SDK.init();
    SDK.loadingStart();
    SDK.onAdStart = () => { this.adPause = true; audio.setMuted(true); };
    SDK.onAdEnd = () => { this.adPause = false; audio.setMuted(SDK.muted); };
    SDK.onMuteChange = (m) => audio.setMuted(m);

    // state
    const saved = SDK.loadData('save');
    this.state = saved && saved.v === defaultState().v ? Object.assign(defaultState(), saved) : defaultState();
    this.state.day_ = Object.assign({}, saved && saved.day_ ? saved.day_ : {}, {});
    this.state.day_ = Object.assign(freshDayState(), this.state.day_);
    const st = this.state.settings;

    // renderer / scenes
    const canvas = $('game');
    this.renderer = new Renderer(canvas);
    this.scene = new THREE.Scene();
    this.viewScene = new THREE.Scene();
    this.physics = new Physics();
    this.input = new Input(canvas);
    prog(0.06, 'Loading textures…');
    await loadTextures(ASSETS, (k) => prog(0.06 + k * 0.22));
    buildMaterials();
    const pmrem = new THREE.PMREMGenerator(this.renderer.r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.viewScene.environment = this.scene.environment;
    prog(0.3, 'Building the café…');
    await tick();
    this.fx = new FX(this.scene);
    this.world = new World(this.scene, this.physics);
    this.world.build();
    // ceiling collider for ragdolls & thrown items
    this.physics.addStaticBox(0, H + 0.25, -2.75, 8.2, 0.25, 8.9);
    this.screens = new ScreenManager(); this.screens.list = this.world.screens;
    this.sky = new Sky(this.scene);
    prog(0.42, 'Loading the sky…');
    await this.sky.load(ASSETS);
    prog(0.5, 'Waking up the customers…');
    this.chars = await loadCharacters(ASSETS, (k) => prog(0.5 + k * 0.3));
    prog(0.85, 'Plugging in the PCs…');
    await tick();
    this.nav = new Nav(this.world);
    this.player = new Player(this);
    this.player.sens = st.sens; this.player.baseFov = st.fov; this.player.invert = st.invert;
    this.items = new ItemManager(this);
    this.hud = new HUD(this);
    this.os = new OS(this);
    this.customers = new Customers(this);
    this.events = new Events(this);
    this.renderer.setup(this.scene, this.viewScene, this.player.camera);
    if (st.quality && st.quality !== 'auto') this.renderer.setQuality(st.quality);
    this.renderer.onQualityChange = (q) => this.world.setScreenLightCount(q.lights);
    this.world.setScreenLightCount(this.renderer.q.lights);
    this.buildExtras();
    this.stations = [];
    for (const d of this.state.stations) this.addStation(d, true);
    for (const k of Object.keys(this.state.upgrades)) this.applyUpgrade(k, true);
    for (let i = 0; i < (this.state.pendingBoxes || 0); i++) this.spawnStationBox();
    this.updateMenu();
    this.nav.rebuild();
    // tools
    this.items.spawn('mop', V(this.world.mopSpot.x, 0.66, this.world.mopSpot.z), { static: true, rotY: 0.3 }).obj.rotation.z = 0.12;
    this.items.spawn('extinguisher', V(this.world.extinguisherSpot.x, 0.25, this.world.extinguisherSpot.z), {});
    // a little starting mess so the café feels lived-in
    for (let i = 0; i < 3; i++) this.items.spawn(pick(['trash_can', 'trash_wrap', 'trash_cup']), V(R(-5, 2), 0.2, R(-4, 4)), {});
    // first customers so the action starts immediately
    if (this.state.minutes < OPEN_H * 60) this.state.minutes = OPEN_H * 60;
    this.customers.spawnCustomer({ pos: V(-6, 0, 8) });
    setTimeout(() => this.customers.spawnCustomer({ pos: V(9, 0, 8.4) }), 2500);
    for (let i = 0; i < 3; i++) this.customers.spawnPedestrian();
    // settings UI
    this.setupMenus();
    prog(1, 'Opening the doors!');
    // warm up shaders
    this.renderer.r.compile(this.scene, this.player.camera);
    this.renderer.render(0.016);
    SDK.loadingStop();
    $('loading').classList.add('fade'); setTimeout(() => $('loading').remove(), 900);
    this.hud.show(true);
    $('clicktoplay').classList.remove('hidden');
    this.started = true;
    SDK.gameplayStart();
    this.tutorialT = this.state.day === 1 && this.state.stats.served === 0 ? 0 : 999;
    this.last = performance.now();
    requestAnimationFrame(() => this.loop());
    setInterval(() => this.updateCrypto(), 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.started) this.save(); });
    window.addEventListener('beforeunload', () => this.save());
  }

  // ---------- extras: router, robot, ghost slots ----------
  buildExtras() {
    const r = new THREE.Group();
    B.add(r, B.rbox(0.26, 0.05, 0.16, 0.015), M.blackPlastic, 0, 0.025, 0);
    for (const x of [-0.09, 0, 0.09]) B.add(r, B.cy(0.006, 0.006, 0.18, 6), M.blackPlastic, x, 0.13, -0.06, { rz: x * 2 });
    this.routerLeds = [];
    for (let i = 0; i < 5; i++) { const l = B.add(r, B.bx(0.012, 0.006, 0.004), M.ledGreen.clone(), -0.08 + i * 0.04, 0.03, 0.081, { cast: false }); this.routerLeds.push(l); }
    r.position.set(6.95, 1.05, 1.8); this.scene.add(r); this.router = r;
    this.world.hitbox(0.35, 0.3, 0.25, V(6.95, 1.15, 1.8), 0, { type: 'router' });
  }

  // ---------- helpers ----------
  get hours() { return this.state.minutes / 60; }
  clockText() { const h = Math.floor(this.hours) % 24, m = Math.floor(this.state.minutes % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  avgTierMult() { if (!this.stations || !this.stations.length) return 1; return this.stations.reduce((a, s) => a + PC_TIERS[s.tier].mult, 0) / this.stations.length; }
  insideNPCs() { return this.npcs.filter((n) => n.alive && n.ai && !n.rag && (n.ai.role === 'customer' || n.ai.role === 'thug') && n.root.position.z < 6 && n.root.position.z > -11.5 && Math.abs(n.root.position.x) < 8); }
  seatedCustomers() { return this.npcs.filter((n) => n.alive && n.seated && n.ai && n.ai.role === 'customer' && n.ai.state === 'using'); }
  freeSlots() { const used = new Set(this.stations.map((s) => s.slot.id)); return this.world.slots.filter((s) => !used.has(s.id) && (!s.vip || this.state.upgrades.vip)); }
  pendingBoxes() { return this.items.items.filter((i) => i.kind === 'box_station').length; }
  cleanliness() {
    const trash = this.items.items.filter((i) => i.def.trash && i.state === 'world' && i.obj.position.z < 6).length;
    const dec = this.items.decals.reduce((a, d) => a + (d.kind === 'poop' ? 4 : 7), 0);
    return Math.max(0, Math.min(100, 100 - trash * 3.5 - dec - (this.toiletClogged ? 10 : 0)));
  }
  setWaypoint(pos, label) { this.waypoint = pos ? { pos: pos.clone ? pos : V(pos.x, pos.y, pos.z), label } : null; if (pos && pos.isVector3) this.waypoint.pos = pos; }
  sdkHappy() { SDK.happytime(); }

  dayStat(k, n) {
    const d = this.state.day_; d[k] = (d[k] || 0) + n;
    for (const o of this.state.objectives) {
      if (o.done || o.stat !== k) continue;
      o.progress = Math.min(o.target, o.progress + n);
      if (o.progress >= o.target) { o.done = true; this.state.money += o.reward; this.state.day_.bonus += o.reward; this.hud.toast(`✅ Goal complete: <b>${o.text}</b> +$${o.reward}`, 'good'); audio.play('achieve'); this.hud.pop(`+$${o.reward}`, null, 'gold big'); this.addXP(25); }
    }
  }
  earn(amount, pos, { tip = 0, toRegister = false, sale = false, gold = false } = {}) {
    amount = Math.round(amount); if (amount <= 0) return;
    if (toRegister) this.state.register += amount; else { this.state.money += amount; this.hud.bumpMoney(); }
    this.state.day_.income += amount; this.state.day_.tips += tip; if (sale) this.state.day_.sales += amount;
    this.state.stats.totalEarned += amount;
    this.dayStat('earned', amount);
    this.hud.pop(`+$${amount}${tip ? ` (tip $${tip})` : ''}`, pos, gold ? 'gold big' : '');
    audio.play(toRegister ? 'coin' : 'cash', { pos: pos || undefined });
    if (this.state.money >= 1000) this.unlock('rich1k'); if (this.state.money >= 10000) this.unlock('rich10k');
  }
  spend(amount, why) { this.state.money -= amount; this.state.day_.expenses += amount; this.hud.pop(`-$${amount}`, null, 'bad'); }
  rep(d) { const s = this.state; s.rep = Math.max(0, Math.min(100, s.rep + d)); if (stars(s.rep) >= 4.95) this.unlock('five_star'); }
  addXP(n) {
    const s = this.state; s.xp += n;
    if (n >= 8) this.hud.pop(`+${n} XP`, null, 'xp');
    while (s.xp >= xpFor(s.level)) {
      s.xp -= xpFor(s.level); s.level++;
      audio.play('levelup'); this.fx.confetti(this.player.camera.position.clone().add(this.player.forward.multiplyScalar(1.5)), 120);
      const un = LEVEL_UNLOCKS[s.level];
      $('lu-num').textContent = s.level; $('lu-unlocks').innerHTML = un ? 'Unlocked: ' + un.join(' · ') : 'Bonus: +$' + (s.level * 25);
      if (!un) s.money += s.level * 25;
      const lu = $('levelup'); lu.classList.add('hidden'); void lu.offsetWidth; lu.classList.remove('hidden'); clearTimeout(this._lu); this._lu = setTimeout(() => lu.classList.add('hidden'), 3300);
      this.hud.toast(`⭐ <b>LEVEL ${s.level}!</b> ${un ? 'New stuff in the shop!' : ''}`, 'gold');
      SDK.happytime();
    }
  }
  unlock(id) {
    const s = this.state; if (s.ach[id]) return; const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return;
    s.ach[id] = true; s.money += 50; this.addXP(30);
    this.hud.toast(`🏆 <b>${a.name}</b> — ${a.desc} (+$50)`, 'gold', 5500); audio.play('achieve');
  }
  streak() {
    this.streakN = this.streakT > 0 ? this.streakN + 1 : 1; this.streakT = 25;
    if (this.streakN >= 3) { const b = this.streakN * 2; this.state.money += b; this.hud.pop(`SERVICE STREAK ×${this.streakN}! +$${b}`, null, 'gold'); audio.play('sparkle', {}); }
  }

  // ---------- stations ----------
  addStation(d, fromLoad) {
    const slot = this.world.slots.find((s) => s.id === d.slot);
    const st = new Station(this, slot, d);
    this.stations.push(st);
    if (!fromLoad) { this.state.stations.push({ slot: slot.id, tier: 1, chair: 1 }); this.nav.rebuild(); this.fx.confetti(slot.deskCenter.clone().setY(1.2), 60); audio.play('buy'); this.addXP(20); if (this.stations.length >= 8) this.unlock('stations8'); }
    return st;
  }
  stationData(st) { return this.state.stations.find((d) => d.slot === st.slot.id); }
  spawnStationBox() { return this.items.spawn('box_station', V(R(0.6, 2.2), 0.4, R(4.0, 5.0)), { payload: { type: 'station' } }); }
  refreshGhosts() {
    const want = this.player.held && this.player.held.kind === 'box_station';
    if (want && !this.ghosts.length) {
      for (const slot of this.freeSlots()) {
        const gh = makeGhost(slot); this.scene.add(gh);
        const hb = this.world.hitbox(1.4, 1.0, 0.9, slot.toWorld(0, -0.35).setY(0.6), slot.rotY, { type: 'slot', slot });
        this.ghosts.push({ gh, hb });
      }
    } else if (!want && this.ghosts.length) {
      for (const { gh, hb } of this.ghosts) { this.scene.remove(gh); this.world.hitGroup.remove(hb); const i = this.world.interactables.indexOf(hb); if (i >= 0) this.world.interactables.splice(i, 1); }
      this.ghosts = [];
    }
    if (this.ghosts.length) { const t = performance.now() / 1000; for (const { gh } of this.ghosts) gh.children.forEach((c) => { c.material.opacity = c.material.wireframe ? 0.4 + Math.sin(t * 5) * 0.2 : 0.12 + Math.sin(t * 5) * 0.06; }); }
  }

  // ---------- shop ----------
  buy(id) {
    const s = this.state; const it = SHOP.find((x) => x.id === id); if (!it) return;
    const price = it.price(s);
    if (s.money < price) { audio.play('error'); return; }
    if (s.level < it.lvl) return;
    s.money -= price; s.day_.expenses += price; audio.play('buy');
    switch (id) {
      case 'station': this.spawnStationBox(); this.hud.toast('📦 Your PC station box is at the entrance. Carry it to a glowing slot!', 'good'); this.setWaypoint(V(1.4, 0.6, 4.5), 'BOX'); setTimeout(() => this.waypoint && this.waypoint.label === 'BOX' && this.setWaypoint(null), 12000); break;
      case 'soda': s.stock.soda += 12; this.updateFridge(); break;
      case 'chips': s.stock.chips += 12; this.updateFridge(); break;
      case 'beans': s.stock.coffee += 15; break;
      case 'flyers': s.marketing = (s.marketing || 0) + 1; this.hud.toast('📰 Flyers everywhere! More customers incoming.', 'good'); break;
      case 'influencer': this.events.trigger('streamer'); break;
      case 'ducks': this.dropDucks(50); break;
      case 'moon': this.player.lowGrav = 60; this.hud.toast('🌙 Moon boots ON. Jump!', 'good'); break;
      case 'party': this.events.trigger('disco'); break;
      default: s.upgrades[id] = true; this.applyUpgrade(id); this.hud.toast(`${it.em} <b>${it.name}</b> installed!`, 'good');
    }
    this.save();
    if (this.os.open) this.os.render();
  }
  applyUpgrade(id, fromLoad) {
    const w = this.world; const u = w.upgradeObjs;
    const pop = (obj) => { if (!obj) return; obj.visible = true; if (!fromLoad) { const p = obj.getWorldPosition(new THREE.Vector3()); this.fx.confetti(p.add(V(0, 1, 0)), 50); audio.play('sparkle', { pos: p }); } };
    switch (id) {
      case 'coffee': pop(u.coffee); this.world.hitbox(0.4, 0.5, 0.4, V(7.3, 1.3, 1.85), 0, { type: 'coffee' }); break;
      case 'ac': pop(u.ac); break;
      case 'speakers': u.speakers.forEach((s) => pop(s)); audio.setMusicQuality(1); this.radioOff = true; break;
      case 'decor': pop(u.decor); break;
      case 'camera': pop(u.camera); break;
      case 'arcade': pop(u.arcade); this.screens.add(this.world.arcadeScreen); this.world.colliderLocal(u.arcade, 0, 0, 0.38, 0.4, 0, 1.8); this.world.hitbox(0.8, 1.8, 0.8, V(3.3, 0.9, -4.7), 0, { type: 'arcade' }); this.nav.rebuild(); break;
      case 'vending': pop(u.vending); this.world.collider(2.2, 3.2, 5.05, 5.85, 0, 2); this.nav.rebuild(); break;
      case 'robot': this.robot = new Robot(this, this.chars.robotGltf); break;
      case 'vip': {
        const planks = w.openVIP();
        if (!fromLoad) {
          this.hud.banner('EXPANSION', 'VIP LOUNGE OPEN', '5 premium slots unlocked. Customers pay ×1.5 in there.');
          planks.forEach((p) => { const wp = p.getWorldPosition(new THREE.Vector3()); p.parent.remove(p); const box = new THREE.Mesh(p.geometry, p.material); box.castShadow = true; box.position.copy(wp); this.scene.add(box); const body = this.physics.addProp(box, new CANNON.Box(new CANNON.Vec3(0.49, 1.39, 0.02)), 6); body.velocity.set(R(-1, 1), 2, R(1, 4)); body.angularVelocity.set(R(-3, 3), 0, R(-3, 3)); });
          audio.play('explode', { pos: V(-3.5, 1, -6) }); this.player.addTrauma(0.6); this.fx.dust(V(-3.5, 1, -6), 40); this.unlock('vip');
        } else planks.forEach((p) => p.parent.remove(p));
        this.world.vipBlock.visible = !fromLoad;
        this.world.collider(this.world.vipSofaCol.minX, this.world.vipSofaCol.maxX, this.world.vipSofaCol.minZ, this.world.vipSofaCol.maxZ, 0, 0.75);
        this.nav.rebuild();
        break;
      }
      case 'fiber': this.lagFree = true; this.customers.lagFixed(); break;
    }
  }
  upgradePC(slotId) {
    const st = this.stations.find((s) => s.slot.id === slotId); if (!st) return;
    const up = PC_UPGRADE[st.tier + 1]; if (!up || this.state.level < up.lvl || this.state.money < up.price) { audio.play('error'); return; }
    this.state.money -= up.price; this.state.day_.expenses += up.price;
    st.setTier(st.tier + 1); this.stationData(st).tier = st.tier; audio.play('buy'); this.addXP(15);
    if (st.tier === 4) this.unlock('titan');
    this.hud.toast(`🖥️ Station ${slotId + 1} upgraded to <b>${PC_TIERS[st.tier].name}</b>`, 'good'); this.save();
  }
  upgradeChair(slotId) {
    const st = this.stations.find((s) => s.slot.id === slotId); if (!st) return;
    const up = CHAIR_UPGRADE[st.chairTier + 1]; if (!up || this.state.level < up.lvl || this.state.money < up.price) { audio.play('error'); return; }
    this.state.money -= up.price; this.state.day_.expenses += up.price;
    st.setChairTier(st.chairTier + 1); this.stationData(st).chair = st.chairTier; audio.play('buy'); this.addXP(8); this.save();
  }
  updateFridge() {
    const s = this.state;
    const inst = this.world.fridge.userData.cans; inst.count = Math.min(48, Math.ceil(s.stock.soda / 12 * 48 / 2)); inst.instanceMatrix.needsUpdate = true;
    const bags = this.world.shelf.userData.bags; bags.forEach((b, i) => { b.visible = i < Math.min(bags.length, Math.ceil(s.stock.chips * 1.5)); });
    this.updateMenu();
  }
  updateMenu() {
    const s = this.state;
    this.world.menuScreen.state.items = [['PC time / hour', '$' + s.price], ['Gamer RGB / hour', '$' + (s.price * 2.1).toFixed(0)], ['Soda', '$3'], ['Chips', '$3'], ['Coffee', s.upgrades.coffee ? '$4' : 'soon']];
    this.world.menuScreen.draw();
  }
  dropDucks(n) {
    audio.play('squeak', {});
    for (let i = 0; i < n; i++) setTimeout(() => { const it = this.items.spawn('duck', V(R(-3, 3), H - 0.3, R(-3, 4)), { vel: V(R(-1, 1), 0, R(-1, 1)) }); }, i * 40);
  }

  // ---------- interaction ----------
  describe(ent, player) {
    const s = this.state; const held = player.held;
    switch (ent.type) {
      case 'npc': {
        const n = ent.npc; const ai = n.ai || {};
        if (n.rag) return { text: `${n.name} is seeing stars 💫`, sub: 'LMB to keep juggling' };
        if (ai.role === 'thug') return { text: `😈 <b>${n.name}</b> — ${K('LMB')} punch them out!`, sub: `${Math.max(0, (n.hp || 3) - (ai.hits || 0))} hits left` };
        if (ai.special === 'inspector') return { text: '📋 Health Inspector', sub: 'Keep the café clean. Do NOT punch.' };
        if (ai.req) {
          const want = { drink: 'soda', snack: 'chips', coffee: 'coffee', food: 'pizza' }[ai.req.type];
          if (want && held && held.kind === want) return { text: `${K('E')} Give ${held.def.name} to ${n.name}`, run: () => { if (this.customers.fulfil(n, held.kind)) { const it = held; player.held = null; player.holdAnchor.remove(it.obj); this.items.remove(it); } } };
          const where = { drink: 'Soda from the fridge', snack: 'Chips from the shelf', coffee: 'Coffee from the machine', food: 'A pizza from the counter', fix: 'Hold E on their PC to fix it', lag: 'Reboot the router on the counter' }[ai.req.type];
          return { text: `${n.name} wants: ${ai.req.icon}`, sub: where };
        }
        if (ai.role === 'customer' || ai.role === 'special') return { text: `${K('E')} Chat with ${n.name}`, run: () => { if (this.chatCd > 0) return; this.chatCd = 2; n.say(pick(LINES.chat), 2.8); if (n.ai && n.ai.sat !== undefined) n.ai.sat += 1; } };
        return { text: n.name };
      }
      case 'item': {
        const it = ent.item; if (it.state !== 'world') return null;
        return { text: `${K('E')} Pick up ${it.def.name}`, sub: it.def.tool === 'ext' ? 'Hold LMB to spray' : it.def.tool === 'mop' ? 'LMB to mop spills & poop' : it.def.trash ? 'Throw it in a bin (RMB to throw)' : it.def.heavy ? 'Carry it to a glowing slot' : '', run: () => this.player.pickUp(it) };
      }
      case 'slot': {
        if (!held || held.kind !== 'box_station') return null;
        return { text: `${K('E')} Build PC station here`, run: () => { const it = held; player.held = null; player.holdAnchor.remove(it.obj); this.items.remove(it); this.addStation({ slot: ent.slot.id, tier: 1, chair: 1 }); this.hud.toast('🛠️ New PC station built!', 'good'); this.refreshGhosts(); this.save(); } };
      }
      case 'station': {
        const st = ent.station;
        if (st.fire) return { text: '🔥 FIRE! Grab the extinguisher and hold LMB', sub: held && held.kind === 'extinguisher' ? 'Spray it!' : 'Extinguisher is by the fuse box' };
        if (st.haunted) return { text: `${K('Hold E')} Exorcise the haunted PC 👻`, hold: 2.5, key: 'ex' + st.slot.id, tick: () => { if (Math.random() < 0.2) this.fx.sparkle(st.slot.deskCenter.clone().setY(1.1), [0.6, 0.8, 1]); }, run: () => { st.haunted = false; audio.play('powerup'); this.earn(40, st.slot.deskCenter.clone().setY(1.2), { gold: true }); this.hud.toast('👻 Ghost evicted! +$40', 'good'); } };
        if (st.broken) return { text: `${K('Hold E')} Repair PC`, sub: PC_TIERS[st.tier].name, hold: 2.4, key: 'fix' + st.slot.id, tick: () => { audio.play('repair', { pos: st.slot.deskCenter }); if (Math.random() < 0.3) this.fx.sparks(st.tower.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)), 4); }, run: () => { st.repair(); audio.play('fixed'); this.customers.fixed(st); this.dayStat('fixed', 1); this.state.stats.fixed++; this.addXP(12); if (this.state.stats.fixed >= 5) this.unlock('fixer'); this.hud.pop('FIXED!', st.slot.deskCenter.clone().setY(1.3), 'gold'); } };
        return { text: `Station ${st.slot.id + 1} · ${PC_TIERS[st.tier].name}${st.slot.vip ? ' · VIP' : ''}`, sub: st.occupant ? `In use by ${st.occupant.name}` : `${K('E')} Manage stations`, run: st.occupant ? null : () => this.openOS('manage') };
      }
      case 'fridge': return s.stock.soda > 0 ? { text: `${K('E')} Take a soda`, sub: `${s.stock.soda} left`, run: () => { s.stock.soda--; this.updateFridge(); const it = this.items.spawn('soda', player.camera.position.clone(), {}); player.pickUp(it); audio.play('door', { pos: V(7.4, 1, 0.3) }); } } : { text: 'Fridge is empty!', sub: 'Buy a soda crate on the laptop / phone (Tab)' };
      case 'shelf': return s.stock.chips > 0 ? { text: `${K('E')} Take chips`, sub: `${s.stock.chips} left`, run: () => { s.stock.chips--; this.updateFridge(); const it = this.items.spawn('chips', player.camera.position.clone(), {}); player.pickUp(it); } } : { text: 'Shelf is empty!', sub: 'Buy chips on the laptop / phone (Tab)' };
      case 'coffee': return s.stock.coffee > 0 ? { text: `${K('Hold E')} Brew coffee`, sub: `${s.stock.coffee} cups of beans left`, hold: 1.6, key: 'coffee', tick: () => { if (Math.random() < 0.3) this.fx.smoke(V(7.3, 1.4, 1.95), false); }, run: () => { s.stock.coffee--; const it = this.items.spawn('coffee', player.camera.position.clone(), {}); player.pickUp(it); audio.play('pop', {}); } } : { text: 'Out of coffee beans', sub: 'Buy beans in the shop' };
      case 'register': return s.register > 0 ? { text: `${K('E')} Collect $${Math.round(s.register)}`, run: () => { const v = Math.round(s.register); s.register = 0; s.money += v; audio.play('register'); this.hud.pop(`+$${v}`, null, 'gold big'); this.hud.bumpMoney(); this.save(); if (s.money >= 1000) this.unlock('rich1k'); if (s.money >= 10000) this.unlock('rich10k'); } } : { text: 'Register is empty', sub: 'Customers pay here when they leave' };
      case 'admin': return { text: `${K('E')} Open Café Manager`, sub: 'Shop · Upgrades · Prices · Crypto', run: () => this.openOS('shop') };
      case 'bin': {
        if (held && held.def.trash) return { text: `${K('E')} Throw away ${held.def.name}`, run: () => { const it = held; player.held = null; player.holdAnchor.remove(it.obj); this.scene.add(it.obj); this.onTrashBinned(it, ent.bin, true); } };
        return { text: 'Trash bin', sub: 'Throw trash in from far away for trick-shot bonuses!' };
      }
      case 'fuse': return !this.world.power ? { text: `${K('Hold E')} Reset the breaker`, hold: 1.8, key: 'fuse', tick: () => { if (Math.random() < 0.2) this.fx.zap(V(7.75, 1.5, -4.6)); }, run: () => { this.world.setPower(true); audio.play('powerup'); this.addXP(15); this.hud.toast('⚡ Power restored!', 'good'); this.stations.forEach((st) => st.refreshScreen()); } } : { text: 'Fuse box', sub: 'Everything is fine. For now.' };
      case 'bed': {
        const h = this.hours;
        if (h >= 21 || h < 6) return { text: `${K('E')} Sleep — end Day ${s.day}`, sub: 'Customers will pay and leave', run: () => this.endDay(false) };
        return { text: 'Your bed', sub: 'You can sleep after 21:00' };
      }
      case 'toilet': return this.toiletClogged ? { text: `${K('Hold E')} Unclog toilet 🪠`, hold: 3, key: 'toilet', tick: () => audio.play('mop', { pos: this.world.toiletSpot }), run: () => { this.toiletClogged = false; audio.play('flush', { pos: this.world.toiletSpot }); this.addXP(12); this.earn(5, null, {}); this.hud.toast('🚽 Toilet unclogged. You deserve a medal.', 'good'); } } : { text: `${K('E')} Flush`, run: () => audio.play('flush', { pos: this.world.toiletSpot }) };
      case 'radio': return { text: `${K('E')} Change music`, sub: this.state.upgrades.speakers ? 'Sound system' : 'Tiny radio', run: () => { const styles = ['lofi', 'chill', 'disco']; const i = (styles.indexOf(audio.musicStyle) + 1) % styles.length; audio.setMusicStyle(styles[i]); this.hud.toast(`🎵 Now playing: ${{ lofi: 'Lo-fi Lag Beats', chill: 'Chillwave Ping', disco: 'Disco Defrag' }[styles[i]]}`); } };
      case 'cooler': return { text: `${K('E')} Drink water`, run: () => { audio.play('pop', {}); player.speedBoost = 0.25; this.hud.toast('💧 Hydrated! Moving faster for a bit.'); } };
      case 'decal': {
        const d = ent.decal;
        if (held && held.kind === 'mop') return { text: `${K('Hold E')} Mop up`, hold: 1.4, key: 'mop' + this.items.decals.indexOf(d), tick: () => audio.play('mop', { pos: d.pos }), run: () => this.cleanDecal(d) };
        return { text: d.kind === 'poop' ? 'Pigeon poop 🤢' : 'Spill — slippery!', sub: 'Grab the mop (back wall)' };
      }
      case 'cat': return { text: `${K('E')} Pet the cat`, run: () => { audio.play('meow', { pos: player.pos }); this.rep(1); this.hud.pop('purrrr ❤️', ent.ev.data.cat.position.clone().setY(0.8), 'gold'); this.addXP(3); } };
      case 'router': return { text: `${K('Hold E')} Reboot router`, sub: this.state.upgrades.fiber ? 'Fiber: never lags' : 'Fixes lag complaints', hold: 1.5, key: 'router', tick: () => { this.routerLeds.forEach((l) => { l.visible = Math.random() < 0.5; }); }, run: () => { this.routerLeds.forEach((l) => { l.visible = true; }); this.customers.lagFixed(); audio.play('fixed'); this.addXP(5); } };
      case 'arcade': return { text: `${K('E')} Play arcade`, run: () => { if (this.chatCd > 0) return; this.chatCd = 3; const sc = Math.floor(R(1000, 99999)); this.hud.toast(`🕹️ You scored ${sc.toLocaleString()}! ${sc > 80000 ? 'NEW HIGH SCORE!' : 'Not bad.'}`); audio.play('coin', {}); this.addXP(2); } };
    }
    return null;
  }

  // ---------- combat ----------
  resolvePunch(player, charge, shove = false) {
    const cam = player.camera; const o = cam.position.clone(); const dir = player.forward;
    const mega = charge > 0.4;
    const range = mega ? 2.5 : shove ? 1.7 : 1.8;
    let best = null, bestT = Infinity;
    const segDist = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
    const rayPointDist = (p) => { const t = Math.max(0, Math.min(range, p.clone().sub(o).dot(dir))); return { d: p.distanceTo(o.clone().addScaledVector(dir, t)), t }; };
    for (const n of this.npcs) {
      if (!n.alive) continue;
      if (n.rag) {
        for (const k in n.rag.bodies) { const b = n.rag.bodies[k].position; const r = rayPointDist(V(b.x, b.y, b.z)); if (r.d < (mega ? 0.45 : 0.3) && r.t < bestT) { bestT = r.t; best = { n, point: o.clone().addScaledVector(dir, r.t), part: k }; } }
      } else {
        const a = n.root.position.clone().setY(0.3 * n.sizeK + (n.root.position.y || 0)), b = n.root.position.clone().setY(n.heightM - 0.2);
        // sample along ray
        for (let t = 0.2; t <= range; t += 0.1) { const p = o.clone().addScaledVector(dir, t); if (segDist(p, a, b) < 0.3 * n.sizeK + (mega ? 0.15 : 0.08)) { if (t < bestT) { bestT = t; best = { n, point: p }; } break; } }
      }
    }
    if (best) {
      const n = best.n;
      const power = shove ? 5.5 : mega ? 13 + charge * 15 : 7;
      const d = dir.clone(); d.y = Math.max(d.y, 0) + (mega ? 0.45 : 0.22); d.normalize();
      n.knock(d, power, best.point, best.part);
      audio.play('punch', { pos: best.point, mega, vol: mega ? 1 : 0.85 });
      if (mega) { this.fx.mega(best.point); this.slowT = 0.45; this.unlock('mega'); player.addTrauma(0.8); this.renderer.grade.uniforms.flash.value = 0.25; }
      else { this.fx.hit(best.point); player.addTrauma(0.25); this.slowT = Math.max(this.slowT, 0.06); }
      audio.play(Math.random() < 0.5 || mega ? 'scream' : 'oof', { pos: n.headPos(), pitch: n.pitch });
      this.hud.hitMarker();
      this.onNpcPunched(n, mega);
      return;
    }
    // creatures
    for (const p of this.punchables) {
      const r = rayPointDist(p.pos()); if (r.d < p.r + (mega ? 0.2 : 0.05) && r.t < range) { p.hit(dir.clone(), mega ? 2 : 1); audio.play('punch', { pos: p.pos(), vol: 0.6 }); this.fx.hit(p.pos().clone()); this.hud.hitMarker(); player.addTrauma(0.15); return; }
    }
    if (this.robot) { const rp = this.robot.root.position.clone().setY(0.6); const r = rayPointDist(rp); if (r.d < 0.45 && r.t < range) { this.robot.hit(dir.clone(), mega); audio.play('clank', { pos: rp, vol: 0.9 }); audio.play('punch', { pos: rp }); this.fx.sparks(rp, 20); this.hud.hitMarker(); return; } }
    // physics props
    let bi = null, bt = Infinity;
    for (const it of this.items.items) { if (it.state !== 'world' || !it.obj.parent) continue; const r = rayPointDist(it.obj.position); if (r.d < 0.25 && r.t < bt && r.t < range) { bt = r.t; bi = it; } }
    if (bi) {
      if (!bi.body) bi.addBody();
      bi.body.wakeUp(); const imp = (mega ? 12 : 5) * Math.max(0.5, bi.def.mass);
      bi.body.applyImpulse(new (bi.body.velocity.constructor)(dir.x * imp, (dir.y + 0.35) * imp, dir.z * imp));
      audio.play(bi.def.sound || 'clank', { pos: bi.obj.position }); this.fx.hit(bi.obj.position.clone()); return;
    }
    // stations / walls
    player.ray.setFromCamera({ x: 0, y: 0 }, cam); player.ray.far = range;
    const hits = player.ray.intersectObjects(this.world.interactables, false);
    if (hits.length) {
      const e = hits[0].object.userData.ent;
      audio.play('thud', { pos: hits[0].point, vol: mega ? 1 : 0.6 }); this.fx.dust(hits[0].point, 4); player.addTrauma(0.15);
      if (e && e.type === 'station' && !e.station.broken) {
        if (mega) { e.station.breakPC(); this.hud.toast('💥 You MEGA-punched your own PC. It did not survive.', 'bad'); }
        else if (Math.random() < 0.08) { e.station.breakPC(); this.hud.toast('🤦 You punched the PC. Now it\'s broken.', 'bad'); }
      }
      if (e && e.type === 'register' && mega) { const v = Math.round(this.state.register); if (v > 0) { this.state.register = 0; for (let i = 0; i < Math.min(12, Math.ceil(v / 5)); i++) this.items.spawnBill(V(5.0, 1.4, 2.4).add(V(R(-0.5, 0.5), 0, R(0, 1))), Math.max(1, Math.round(v / Math.min(12, Math.ceil(v / 5))))); this.hud.toast('💸 Cash explosion!'); } }
    }
  }
  onNpcPunched(n, mega) {
    const ai = n.ai; if (!ai) return;
    ai.hits = (ai.hits || 0) + 1;
    if (ai.role === 'thug') {
      if (ai.hits >= (n.hp || 3) && !ai.koCounted) {
        ai.koCounted = true; this.state.stats.kos++; this.dayStat('kos', 1);
        const bounty = 20 + this.state.day * 5; this.earn(bounty, n.headPos(), { gold: true }); this.addXP(25); this.unlock('first_ko');
        this.hud.toast(`🥊 <b>${n.name}</b> knocked out! +$${bounty} bounty`, 'gold'); this.rep(1.5);
        if (ai.plan === 'steal' && ai.state === 'act') { ai.state = 'flee'; }
      }
      ai.angry = true;
    } else if (ai.role === 'customer' && ai.special !== 'inspector') {
      if (ai.hits === 1) { this.state.stats.punchedCustomers++; this.dayStat('punched', 1); this.unlock('oops'); }
      if (ai.station && n.seated === false && ai.station.occupant === n) { ai.station.setChairSeated(false); }
    }
  }
  playerHit(npc) {
    const p = this.player; p.addTrauma(0.7); audio.play('punch', { pos: p.pos }); audio.play('oof', { pitch: 120 });
    p.vel.addScaledVector(p.pos.clone().sub(npc.root.position).setY(0).normalize(), 7); p.vel.y = 3;
    this.renderer.grade.uniforms.damage.value = 1;
    const lost = Math.min(5, Math.max(0, Math.floor(this.state.money)));
    if (lost > 0) { this.state.money -= lost; this.hud.pop(`-$${lost}`, null, 'bad'); }
    npc.say(pick(['Take that!', 'Ha! Gotcha!', 'Who\'s laughing now?']), 2, { shout: true });
  }

  // ---------- trash / money ----------
  spawnTrashNear(st) {
    if (this.items.items.length > 70) return;
    const p = Math.random() < 0.55 ? st.slot.toWorld(R(-0.5, 0.5), -0.25).setY(0.85) : st.slot.toWorld(R(-0.6, 0.6), R(0.6, 1.0)).setY(0.15);
    this.items.spawn(pick(['trash_can', 'trash_wrap', 'trash_cup', 'trash_can']), p, { rotY: R(0, 6) });
  }
  onTrashBinned(it, bin, direct = false) {
    const p = bin.pos.clone().setY(0.7);
    let dist = it.thrownFrom ? it.thrownFrom.distanceTo(bin.pos) : 0;
    this.items.remove(it);
    bin.fill = Math.min(1, bin.fill + 0.04); bin.obj.userData.fill.position.y = 0.03 + bin.fill * 0.5;
    this.dayStat('binned', 1); this.state.stats.binned = (this.state.stats.binned || 0) + 1;
    if (it.def.duck) { this.state.stats.ducks++; if (this.state.stats.ducks >= 20) this.unlock('duck'); }
    if (!direct && dist >= 4) {
      const bonus = Math.round(2 + dist * 1.5);
      this.state.money += bonus; this.hud.pop(`SWISH! ${dist.toFixed(1)}m +$${bonus}`, p, 'gold big'); audio.play('swish'); this.fx.confetti(p, 40);
      this.state.stats.shots++; this.dayStat('shots', 1); this.addXP(8); this.unlock('swish'); if (this.state.stats.shots >= 10) this.unlock('swish10');
    } else { audio.play('drop'); this.addXP(1); if (it.def.duck) this.earn(1, p, {}); }
  }
  collectBill(b) { this.state.money += b.value; this.state.day_.income += b.value; this.hud.pop(`+$${b.value}`, b.m.position, 'gold'); audio.play('coin', {}); this.hud.bumpMoney(); }
  cleanDecal(d) { this.items.removeDecal(d); this.addXP(4); this.hud.pop('Sparkling ✨', d.pos.clone().setY(0.4), 'gold'); audio.play('sparkle', { pos: d.pos }); }

  useExtinguisher(player, dt) {
    const cam = player.camera; const fwd = player.forward;
    const nozzle = cam.position.clone().addScaledVector(fwd, 0.55).add(V(0, -0.25, 0));
    this.fx.spray(nozzle, fwd); audio.play('spray', {});
    for (const st of this.stations) {
      if (!st.fire) continue;
      const tp = st.tower.getWorldPosition(new THREE.Vector3()).add(V(0, 0.35, 0));
      const to = tp.clone().sub(cam.position); const d = to.length(); to.normalize();
      if (d < 4 && to.dot(fwd) > 0.86) {
        st.fire.hp -= dt * 55;
        if (st.fire.hp <= 0) { st.fire = null; st.smokeT = 5; this.hud.toast('🧯 Fire is out! Now repair the PC.', 'good'); this.addXP(20); this.unlock('firefighter'); this.earn(25, tp, { gold: true }); this.setWaypoint(null); st.refreshScreen(); }
      }
    }
    for (const n of this.npcs) { if (n.rag || !n.alive) continue; const to = n.headPos().clone().sub(cam.position); const d = to.length(); if (d < 3 && to.normalize().dot(fwd) > 0.93 && Math.random() < dt * 2) n.say(pick(['HEY!', 'I\'m not on fire!', 'Cold! COLD!']), 1.5, { shout: true }); }
  }
  useMop(player) {
    audio.play('mop', { pos: player.pos });
    const fwd = player.forward; fwd.y = 0; fwd.normalize();
    const front = player.pos.clone().addScaledVector(fwd, 0.9);
    for (const d of this.items.decals.slice()) { if (d.pos.distanceTo(front.clone().setY(d.pos.y)) < d.r + 0.6) { d.clean += 0.34; d.m.material.opacity = 1 - d.clean; if (d.clean >= 1) this.cleanDecal(d); } }
  }

  // ---------- OS / menus ----------
  openOS(tab) {
    if (this.osOpen) return;
    this.osOpen = true; this.os.show(tab); audio.play('ui');
    if (this.player.held && this.player.held.def.heavy) { /* keep holding */ }
    this.input.unlock();
  }
  closeOS(byClick) {
    if (!this.osOpen) return;
    this.osOpen = false; this.os.hide(); audio.play('click');
    if (byClick) this.input.lock(); else $('clicktoplay').classList.remove('hidden');
  }
  setupMenus() {
    const st = this.state.settings;
    $('clicktoplay').addEventListener('click', () => { audio.init(); audio.setMuted(SDK.muted); audio.setMusicVolume(st.music); audio.setSfxVolume(st.sfx); this.input.lock(); if (this.input.touchMode) { $('clicktoplay').classList.add('hidden'); } });
    this.input.onLockChange = (locked) => {
      if (locked) { $('clicktoplay').classList.add('hidden'); $('pause').classList.add('hidden'); if (this.paused && !this.overlay) { this.paused = false; SDK.gameplayStart(); } }
      else if (!this.osOpen && !this.overlay && this.started) this.pause();
    };
    $('btn-resume').addEventListener('click', () => { audio.init(); this.input.lock(); if (this.input.touchMode) this.resume(); });
    const q = $('set-quality'); q.value = st.quality || 'auto';
    q.addEventListener('change', () => { st.quality = q.value; if (q.value === 'auto') { this.renderer.auto = true; this.renderer.setQuality('high', true); } else this.renderer.setQuality(q.value); this.save(); });
    const bind = (id, key, fn) => { const el = $(id); el.value = st[key]; el.addEventListener('input', () => { st[key] = Number(el.value); fn(st[key]); }); el.addEventListener('change', () => this.save()); };
    bind('set-sens', 'sens', (v) => { this.player.sens = v; });
    bind('set-fov', 'fov', (v) => { this.player.baseFov = v; });
    bind('set-music', 'music', (v) => audio.setMusicVolume(v));
    bind('set-sfx', 'sfx', (v) => audio.setSfxVolume(v));
    const inv = $('set-invert'); inv.checked = !!st.invert; inv.addEventListener('change', () => { st.invert = inv.checked; this.player.invert = inv.checked; this.save(); });
    $('btn-reset').addEventListener('click', () => { if (confirm('Start a brand new café? All progress will be lost.')) { SDK.clearData('save'); this.noSave = true; location.reload(); } });
    $('btn-nextday').addEventListener('click', () => this.nextDay());
    $('btn-double').addEventListener('click', async () => {
      const b = $('btn-double'); b.disabled = true; b.textContent = 'Loading ad…';
      const ok = await SDK.requestAd('rewarded');
      if (ok && !this.doubled) { this.doubled = true; const v = Math.max(0, Math.round(this.lastDayIncome)); this.state.money += v; b.textContent = `✔ +$${v} added!`; audio.play('register'); $('sum-profit').textContent = '$' + Math.round(this.lastProfit + v); }
      else { b.textContent = 'Ad not available right now'; setTimeout(() => { b.disabled = false; b.textContent = '📺 Watch ad: DOUBLE today\'s income'; }, 2500); }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.started && !this.overlay && !this.paused) { e.preventDefault(); if (this.osOpen) this.closeOS(false); else this.openOS('shop'); }
      if (e.code === 'Escape' && this.osOpen) this.closeOS(false);
    });
  }
  pause() { if (this.paused) return; this.paused = true; $('pause').classList.remove('hidden'); SDK.gameplayStop(); this.save(); }
  resume() { this.paused = false; $('pause').classList.add('hidden'); SDK.gameplayStart(); }

  // ---------- day cycle ----------
  endDay(passedOut) {
    if (this.dayEnding) return;
    this.dayEnding = true;
    const s = this.state;
    $('fade').classList.add('on');
    if (this.player.held) this.player.drop(0);
    setTimeout(() => {
      // everyone inside pays and leaves
      for (const n of this.npcs.slice()) { if (n.ai && n.ai.role === 'customer' && n.ai.station && !n.ai.paid) this.customers.pay(n); this.customers.despawn(n); }
      if (this.robot) this.robot.reset();
      this.events.active.slice().forEach((e) => this.events.finish(e));
      this.world.setPower(true);
      s.money += s.register; s.register = 0;
      const bills = dayBills(s);
      s.money -= bills.total;
      let extra = 0;
      if (passedOut) { extra = 25; s.money -= extra; this.unlock('sleepy'); }
      const d = s.day_;
      const profit = d.income + d.bonus - bills.total - extra - d.expenses;
      this.lastDayIncome = d.income; this.lastProfit = profit; this.doubled = false;
      s.stats.bestDay = Math.max(s.stats.bestDay, profit);
      s.history.push({ day: s.day, profit: Math.round(profit) });
      $('sum-title').textContent = passedOut ? `Day ${s.day} — You passed out on the floor` : `Day ${s.day} Complete`;
      const st = stars(s.rep); const full = Math.round(st);
      $('sum-stars').innerHTML = '★'.repeat(full) + `<span class="off">${'★'.repeat(5 - full)}</span>`;
      const row = (k, v, c = '') => `<div><span>${k}</span><b class="${c}">${v}</b></div>`;
      $('sum-grid').innerHTML = row('Customers served', d.served) + row('Customers lost', d.lost, d.lost ? 'neg' : '') + row('Income', '$' + Math.round(d.income), 'pos') + row('Tips', '$' + Math.round(d.tips), 'pos') + row('Goal bonuses', '$' + Math.round(d.bonus), 'pos') + row('Stolen', '-$' + Math.round(d.stolen || 0), d.stolen ? 'neg' : '') + row('Purchases', '-$' + Math.round(d.expenses), 'neg') + row('Rent', '-$' + bills.rent, 'neg') + row('Electricity', '-$' + bills.elec, 'neg') + row('Internet', '-$' + bills.net, 'neg') + (extra ? row('Back pain treatment', '-$' + extra, 'neg') : '') + row('Troublemakers KO\'d', d.kos) + row('Weird events', d.events) + row('Customers punched', d.punched, d.punched ? 'neg' : '');
      const pe = $('sum-profit'); pe.textContent = (profit < 0 ? '-$' : '$') + Math.abs(Math.round(profit)); pe.classList.toggle('neg', profit < 0);
      $('btn-nextday').textContent = `☀ Start Day ${s.day + 1}`;
      const bd = $('btn-double'); bd.disabled = d.income <= 0; bd.textContent = `📺 Watch ad: DOUBLE today's income (+$${Math.round(d.income)})`;
      $('sum-funny').textContent = pick(QUIPS);
      $('summary').classList.remove('hidden');
      this.overlay = 'summary'; this.input.unlock(); SDK.gameplayStop();
      s.day++; s.minutes = OPEN_H * 60; s.day_ = freshDayState(); s.objectives = makeObjectives(s.day); s.marketing = 0;
      if (s.day >= 8) this.unlock('week');
      this.save();
      $('fade').classList.remove('on');
    }, 700);
  }
  async nextDay() {
    $('btn-nextday').disabled = true;
    await SDK.requestAd('midgame');
    $('btn-nextday').disabled = false;
    $('summary').classList.add('hidden'); this.overlay = null;
    this.dayEnding = false;
    this.player.pos.set(6.4, 0, -8.6); this.player.yaw = Math.PI * 0.6; this.player.vel.set(0, 0, 0);
    this.hud.banner(`DAY ${this.state.day}`, 'Rise and grind!', 'The café opens at 08:00. Customers are already waiting.');
    this.events.timer = 25;
    setTimeout(() => this.customers.spawnCustomer(), 1500);
    this.input.lock();
    $('clicktoplay').classList.remove('hidden');
    SDK.gameplayStart();
  }

  // ---------- save ----------
  save() {
    if (this.noSave || !this.state) return;
    const s = this.state;
    s.pendingBoxes = this.items ? this.pendingBoxes() : 0;
    SDK.saveData('save', s);
  }

  updateCrypto() {
    if (!this.state || this.paused) return;
    const c = this.state.crypto;
    const shock = Math.random() < 0.02 ? (Math.random() < 0.5 ? 0.6 : 1.7) : 1;
    c.price = Math.max(3, c.price * (1 + (Math.random() - 0.485) * 0.06) * shock);
    c.hist.push(c.price); if (c.hist.length > 200) c.hist.shift();
    if (this.os.open && this.os.tab === 'crypto') this.os.render();
  }

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const rdt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.frame(rdt, true);
  }
  // debug / test helper: advance the simulation quickly without rendering every step
  simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) this.frame(dt, false); this.frame(dt, true); }

  frame(rdt, render) {
    let dt = rdt;
    if (this.slowT > 0) { this.slowT -= rdt; dt *= 0.25; }
    const simRunning = !this.paused && !this.osOpen && !this.overlay && !this.adPause;
    const active = (this.input.locked || this.input.touchMode) && simRunning;
    const g = this.renderer.grade.uniforms;
    g.damage.value = Math.max(0, g.damage.value - rdt * 1.8);
    g.flash.value = Math.max(0, g.flash.value - rdt * 1.5);
    if (simRunning) {
      this.elapsed += dt;
      const s = this.state;
      const prevH = this.hours;
      s.minutes += dt * TIME_SCALE;
      const h = this.hours;
      if (prevH < 23 && h >= 23) this.hud.toast('🌙 Closing at midnight. Finish up!', '');
      if (prevH < 24 && h >= 24) { this.hud.toast('🛏️ Café closed. Go to bed in the back room to end the day.', 'gold', 8000); this.setWaypoint(V(7.3, 0.8, -9.9), 'BED'); }
      if (prevH < 21 && h >= 21) this.hud.toast('😴 You can sleep after 21:00 (bed in the back room) — or keep earning until midnight.', '');
      if (h >= 26 && !this.dayEnding) this.endDay(true);
      // passive income
      if (Math.floor(prevH) !== Math.floor(h) && this.customers.open) {
        if (s.upgrades.arcade) this.earn(8, V(3.3, 1.6, -4.7), { toRegister: true });
        if (s.upgrades.vending) this.earn(10, V(2.7, 1.6, 5.4), { toRegister: true });
      }
      this.physics.step(dt);
      this.player.update(dt, this.input, active);
      for (const n of this.npcs) n.update(dt);
      this.customers.update(dt);
      this.items.update(dt);
      this.events.update(dt);
      if (this.robot) this.robot.update(dt);
      for (const st of this.stations) st.update(dt, this.elapsed);
      this.world.update(dt, this.elapsed, { hours: h });
      this.fx.update(dt);
      this.refreshGhosts();
      if (this.streakT > 0) this.streakT -= dt;
      if (this.chatCd > 0) this.chatCd -= dt;
      this.saveT += dt; if (this.saveT > 30) { this.saveT = 0; this.save(); }
      // ambience
      const occ = this.stations.filter((s2) => s2.occupant).length;
      audio.setLoop('hum', this.world.power ? 0.02 + occ * 0.006 : 0);
      const dz = this.player.pos.z; audio.setLoop('city', dz > 5 ? 0.25 : 0.09, dz > 5 ? 900 : 380);
      audio.setLoop('fire', this.stations.some((s2) => s2.fire) ? 0.25 : 0);
      this.tutorial(dt);
    } else {
      this.player.update(0, this.input, false);
    }
    // time of day
    this.world.setTimeOfDay(this.hours % 24, (hh, day, warm) => this.sky.setTime(hh, day, warm));
    this.sky.update(rdt, this.player.camera.position);
    this.screens.update(rdt);
    this.assignScreenLights();
    // HUD
    const act = this.player.focusAction;
    this.hud.setPrompt(active ? act : null, this.player.holdProg);
    const held = this.player.held;
    this.hud.setCarry(held ? `Holding: <b>${held.def.name}</b> · ${K('RMB')} throw · ${K('Q')} drop` : '');
    this.hud.setCharge(this.player.charge);
    this.hud.update(rdt);
    this.adminTick = (this.adminTick || 0) + rdt;
    if (this.adminTick > 1) { this.adminTick = 0; this.world.adminScreen.state.stats = { money: Math.round(this.state.money), customers: this.state.day_.served, pcs: this.stations.length }; }
    if (render) { this.renderer.render(rdt); this.renderer.trackFps(rdt); }
    this.input.endFrame();
  }

  assignScreenLights() {
    this._slT = (this._slT || 0) - 1;
    if (this._slT > 0) return; this._slT = 20;
    const lights = this.world.screenLights; const n = this.world.screenLightCount || 0;
    const pp = this.player.pos;
    const list = this.stations.filter((s) => s.screen && s.screen.power && s.screen.mode !== 'off').sort((a, b) => a.slot.deskCenter.distanceToSquared(pp) - b.slot.deskCenter.distanceToSquared(pp));
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]; const st = list[i];
      if (!st || i >= n) { l.intensity = 0; continue; }
      const p = st.slot.toWorld(0, -0.1); p.y = 1.15;
      l.position.copy(p); l.color.setHex(st.screen.glowColor()); l.intensity = st.occupant ? 1.6 : 0.6;
    }
  }

  tutorial(dt) {
    if (this.tutorialT > 900) return;
    const prev = this.tutorialT; this.tutorialT += dt;
    const steps = [
      [1.5, `👋 Welcome to <b>PING PALACE</b>! Customers pay into the register when they leave.`],
      [8, `🥤 Customers ask for things — grab a soda from the <b>fridge</b> (${K('E')}) and press ${K('E')} on them.`],
      [16, `💵 Collect cash at the <b>register</b>. Buy PCs & upgrades on the <b>laptop</b> or press ${K('Tab')}.`],
      [26, `🥊 Troublemakers? ${K('LMB')} punch them. Hold ${K('LMB')} for a <b>MEGA PUNCH</b>.`],
      [38, `🗑️ Pick up trash and throw it (${K('RMB')}) into a bin from far away for trick-shot cash!`],
    ];
    for (const [t, msg] of steps) if (prev < t && this.tutorialT >= t) this.hud.toast(msg, 'good', 7000);
  }
}

function freshDayState() { return freshDay(); }
function tick() { return new Promise((r) => setTimeout(r, 0)); }

const game = new Game();
window.__game = game; window.THREE = THREE; window.__audio = audio;
game.init().catch((e) => { console.error(e); const t = document.getElementById('load-text'); if (t) t.textContent = 'Error: ' + e.message; });
