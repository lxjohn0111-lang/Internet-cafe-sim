import * as THREE from 'three';
import { stars, xpFor, WEEKDAYS } from '../game/state.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.cash = $('hud-cash'); this.reg = $('hud-register'); this.clock = $('hud-clock'); this.day = $('hud-day'); this.wday = $('hud-weekday'); this.open = $('hud-open');
    this.lvl = $('hud-lvl'); this.xp = $('hud-xp'); this.xpText = $('hud-xptext'); this.stars = $('hud-stars');
    this.objList = $('hud-objlist'); this.feed = $('feed'); this.bannerEl = $('banner');
    this.prompt = $('prompt'); this.cross = $('crosshair'); this.ring = $('hold-ring'); this.arc = $('hold-arc'); this.carry = $('carry');
    this.charge = $('charge'); this.chargeFill = $('charge-fill');
    this.pops = $('pops'); this.bubbles = $('bubbles'); this.wp = $('waypoint'); this.wpLabel = $('wp-label');
    this.shownMoney = 0; this._last = {};
    this.bannerT = 0;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  set(el, key, val) { if (this._last[key] !== val) { this._last[key] = val; el.textContent = val; } }

  update(dt) {
    const g = this.game, s = g.state;
    // money counter animates
    const target = Math.round(s.money);
    this.shownMoney += (target - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(target - this.shownMoney) < 0.5) this.shownMoney = target;
    this.set(this.cash, 'cash', Math.round(this.shownMoney).toLocaleString());
    this.cash.parentElement.classList.toggle('neg', s.money < 0);
    this.set(this.reg, 'reg', '$' + Math.round(s.register));
    const h = Math.floor(g.hours) % 24, m = Math.floor((g.hours * 60) % 60);
    this.set(this.clock, 'clock', `${String(h).padStart(2, '0')}:${String(m - m % 5).padStart(2, '0')}`);
    this.set(this.day, 'day', `DAY ${s.day}`);
    this.set(this.wday, 'wday', WEEKDAYS[(s.day - 1) % 7]);
    const open = g.customers.open;
    this.set(this.open, 'open', open ? 'OPEN' : 'CLOSED'); this.open.className = open ? 'open' : 'closed';
    this.set(this.lvl, 'lvl', String(s.level));
    const need = xpFor(s.level);
    const xpW = Math.min(100, s.xp / need * 100).toFixed(1) + '%';
    if (this._last.xpw !== xpW) { this._last.xpw = xpW; this.xp.style.width = xpW; }
    this.set(this.xpText, 'xpt', `${Math.floor(s.xp)} / ${need} XP`);
    const st = stars(s.rep); const full = Math.floor(st + 0.25);
    const starsHtml = '★'.repeat(full) + `<span class="off">${'★'.repeat(5 - full)}</span>`;
    if (this._last.stars !== starsHtml) { this._last.stars = starsHtml; this.stars.innerHTML = starsHtml; }
    // objectives
    const objHtml = s.objectives.map((o) => `<div class="obj ${o.done ? 'done' : ''}"><div class="ot"><span>${o.text}</span><span class="rw">+$${o.reward}</span></div><div class="ob"><i style="width:${Math.min(100, o.progress / o.target * 100)}%"></i></div></div>`).join('');
    if (this._last.obj !== objHtml) { this._last.obj = objHtml; this.objList.innerHTML = objHtml; }
    // banner
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    this.updateBubbles();
    this.updateWaypoint();
  }

  setPrompt(act, holdProg) {
    const html = act ? (act.text + (act.sub ? `<span class="sub">${act.sub}</span>` : '')) : '';
    if (this._last.prompt !== html) { this._last.prompt = html; this.prompt.innerHTML = html; }
    this.cross.classList.toggle('active', !!(act && act.run));
    this.ring.classList.toggle('show', holdProg > 0.01);
    this.arc.style.strokeDashoffset = String(163.4 * (1 - holdProg));
  }
  setCarry(text) { if (this._last.carry !== text) { this._last.carry = text; this.carry.innerHTML = text; } }
  setCharge(k) { this.charge.classList.toggle('show', k > 0.02); this.chargeFill.style.width = (k * 100) + '%'; }
  hitMarker() { this.cross.classList.add('hit'); clearTimeout(this._hm); this._hm = setTimeout(() => this.cross.classList.remove('hit'), 140); }

  toast(text, kind = '', dur = 4200) {
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = text;
    this.feed.prepend(d);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, dur);
  }
  banner(kicker, title, desc, dur = 3.6) {
    $('banner-kicker').textContent = kicker; $('banner-title').textContent = title; $('banner-desc').textContent = desc || '';
    this.bannerEl.classList.add('show'); this.bannerT = dur;
  }
  bumpMoney() { const el = this.cash.parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  // floating text from a world position (or screen center when pos null)
  pop(text, pos, cls = '') {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
    let x = window.innerWidth / 2, y = window.innerHeight / 2 - 60;
    if (pos) {
      _v.copy(pos).project(this.game.player.camera);
      if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) { x = (_v.x * 0.5 + 0.5) * window.innerWidth; y = (-_v.y * 0.5 + 0.5) * window.innerHeight; }
    }
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.pops.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  updateBubbles() {
    const g = this.game; const cam = g.player.camera; const W = window.innerWidth, H = window.innerHeight;
    const camPos = cam.position;
    for (const n of g.npcs) {
      const show = (n.sayText || n.need || n.ai && (n.ai.role === 'thug' || n.ai.special)) && n.alive;
      if (!show) { if (n.bubble) n.bubble.style.display = 'none'; continue; }
      const hp = n.headPos(); const dist = hp.distanceTo(camPos);
      _v.copy(hp); _v.y += 0.35 * (n.headScale || 1) * Math.max(0.7, n.sizeK);
      _v.project(cam);
      const vis = _v.z < 1 && _v.x > -1.2 && _v.x < 1.2 && _v.y > -1.2 && _v.y < 1.2 && dist < 18;
      if (!n.bubble) { n.bubble = document.createElement('div'); n.bubble.className = 'bub'; this.bubbles.appendChild(n.bubble); n._bubDirty = true; }
      if (!vis) { n.bubble.style.display = 'none'; continue; }
      n.bubble.style.display = '';
      if (n._bubDirty || (n.need && Math.abs((n._lastP || 0) - n.need.p) > 0.01)) {
        n._bubDirty = false; n._lastP = n.need ? n.need.p : 0;
        let html = '<div class="stack">';
        if (n.sayText) html += `<div class="say ${n.sayShout ? 'shout' : ''}">${n.sayText}</div>`;
        if (n.need) html += `<div class="need ${n.need.p < 0.3 ? 'angry' : ''}" style="--p:${(n.need.p * 100).toFixed(0)}%;--c:${n.need.color || '#4dff9a'}">${n.need.icon}</div>`;
        const role = n.ai && n.ai.role;
        if (dist < 9 || role === 'thug') html += `<div class="nametag ${role === 'thug' ? 'thug' : n.ai && n.ai.special ? 'vip' : ''}">${role === 'thug' ? '😈 ' : ''}${n.name}</div>`;
        html += '</div>';
        n.bubble.innerHTML = html;
      }
      const sc = Math.max(0.55, Math.min(1.15, 4 / dist));
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      n.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
    }
  }

  updateWaypoint() {
    const g = this.game; const p = g.waypoint;
    if (!p) { this.wp.style.display = 'none'; return; }
    _v.copy(p.pos).project(g.player.camera);
    if (_v.z > 1) { this.wp.style.display = 'none'; return; }
    const x = Math.max(30, Math.min(window.innerWidth - 30, (_v.x * 0.5 + 0.5) * window.innerWidth));
    const y = Math.max(60, Math.min(window.innerHeight - 30, (-_v.y * 0.5 + 0.5) * window.innerHeight));
    this.wp.style.display = 'block'; this.wp.style.left = x + 'px'; this.wp.style.top = y + 'px';
    const d = p.pos.distanceTo(g.player.pos);
    this.wpLabel.textContent = `${p.label} · ${d.toFixed(0)}m`;
  }
}
