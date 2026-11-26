import * as THREE from 'three';
import { stars, xpFor, WEEKDAYS } from '../game/state.js';
import { audio } from '../core/audio.js';

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
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { this.bannerEl.classList.remove('show'); this._obsT = 0; } }
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
    const max = window.innerHeight < 430 ? 2 : (window.innerHeight < 560 || window.innerWidth < 761) ? 3 : 5;
    while (this.feed.children.length > max) this.feed.lastChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, dur);
    this._obsT = 0;
  }
  // feedback when E is pressed on something that has no action
  nudge() {
    this.prompt.classList.remove('nudge'); void this.prompt.offsetWidth; this.prompt.classList.add('nudge');
    audio.play('error');
  }
  banner(kicker, title, desc, dur = 3.6) {
    $('banner-kicker').textContent = kicker; $('banner-title').textContent = title; $('banner-desc').textContent = desc || '';
    this.bannerEl.classList.add('show'); this.bannerT = dur; this._obsT = 0;
  }
  bumpMoney() { const el = this.cash.parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  // floating text from a world position (or screen center when pos null); stacks instead of overlapping
  pop(text, pos, cls = '') {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
    let x = window.innerWidth / 2, y = window.innerHeight / 2 - 70;
    if (pos) {
      _v.copy(pos).project(this.game.player.camera);
      if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) { x = (_v.x * 0.5 + 0.5) * window.innerWidth; y = (-_v.y * 0.5 + 0.5) * window.innerHeight; }
    }
    const now = performance.now();
    this._pops = (this._pops || []).filter((p) => now - p.t < 1000);
    for (let i = 0; i < 8; i++) { const hit = this._pops.find((p) => Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 30); if (!hit) break; y = hit.y - 32; }
    x = Math.max(80, Math.min(window.innerWidth - 80, x)); y = Math.max(110, Math.min(window.innerHeight - 120, y));
    this._pops.push({ x, y, t: now });
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.pops.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  // notifications never sit on top of (or under) the event banner
  hideToastsUnderBanner() {
    const toasts = this.feed.querySelectorAll('.toast');
    if (!this.bannerEl.classList.contains('show')) { toasts.forEach((t) => t.classList.remove('under-banner')); return; }
    const b = this.bannerEl.getBoundingClientRect();
    toasts.forEach((t) => { t.classList.remove('under-banner'); const r = t.getBoundingClientRect(); if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) t.classList.add('under-banner'); });
  }

  // screen rectangles that speech bubbles and markers must not cover
  obstacles() {
    const out = [];
    const sel = ['#hud-tl', '#hud-money', '#hud-tr', '#hud-obj', '#feed .toast:not(.under-banner)', '#banner.show', '#prompt', '#carry', '#hints', '#charge.show', '#t-top', '.t-btns', '#t-stick', '#crosshair'];
    for (const q of sel) document.querySelectorAll(q).forEach((el) => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      if ((q === '#prompt' || q === '#carry') && !el.textContent.trim()) return;
      out.push({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 });
    });
    return out;
  }

  updateBubbles() {
    const g = this.game; const cam = g.player.camera; const W = window.innerWidth, H = window.innerHeight;
    const camPos = cam.position;
    this._obsT = (this._obsT || 0) - 1;
    if (this._obsT <= 0 || !this._obs) { this.hideToastsUnderBanner(); this._obs = this.obstacles(); this._obsT = 8; }
    const placed = this._obs.slice();
    const list = [];
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
      if (n._bubDirty || (n.need && Math.abs((n._lastP || 0) - n.need.p) > 0.01) || (dist < 9) !== n._near) {
        n._bubDirty = false; n._lastP = n.need ? n.need.p : 0; n._near = dist < 9;
        let html = '<div class="stack">';
        if (n.sayText) html += `<div class="say ${n.sayShout ? 'shout' : ''}">${n.sayText}</div>`;
        if (n.need) html += `<div class="need ${n.need.p < 0.3 ? 'angry' : ''}" style="--p:${(n.need.p * 100).toFixed(0)}%;--c:${n.need.color || '#4dff9a'}">${n.need.icon}</div>`;
        const role = n.ai && n.ai.role;
        if (dist < 9 || role === 'thug') html += `<div class="nametag ${role === 'thug' ? 'thug' : n.ai && n.ai.special ? 'vip' : ''}">${role === 'thug' ? '😈 ' : ''}${n.name}</div>`;
        html += '</div>';
        n.bubble.innerHTML = html;
        n._bw = n.bubble.offsetWidth; n._bh = n.bubble.offsetHeight;
      }
      list.push({ n, dist, x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H });
    }
    // nearest first: they win the space, others move around them
    list.sort((a, b) => a.dist - b.dist);
    for (const b of list) {
      const sc = Math.max(0.55, Math.min(1.1, 4 / b.dist));
      const w = (b.n._bw || 60) * sc, h = (b.n._bh || 40) * sc;
      const r = { x: b.x - w / 2, y: b.y - h, w, h };
      r.x = Math.max(4, Math.min(W - w - 4, r.x));
      let ok = false;
      for (let it = 0; it < 8; it++) {
        const hit = placed.find((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
        if (!hit) { ok = r.y >= 0 && r.y + r.h <= H; break; }
        const up = hit.y - r.h - 3, down = hit.y + hit.h + 3;
        r.y = (up >= 2 && (b.y - up <= down - (b.y - h) || down + r.h > H)) ? up : down;
      }
      if (!ok) { b.n.bubble.style.display = 'none'; continue; }
      placed.push(r);
      b.n.bubble.style.transform = `translate(${(r.x + w / 2).toFixed(1)}px, ${(r.y + h).toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
    }
    this._placed = placed;
  }

  updateWaypoint() {
    const g = this.game; const p = g.waypoint;
    if (!p) { this.wp.style.display = 'none'; return; }
    _v.copy(p.pos).project(g.player.camera);
    if (_v.z > 1) { this.wp.style.display = 'none'; return; }
    const x = Math.max(30, Math.min(window.innerWidth - 30, (_v.x * 0.5 + 0.5) * window.innerWidth));
    const y = Math.max(60, Math.min(window.innerHeight - 30, (-_v.y * 0.5 + 0.5) * window.innerHeight));
    let yy = y;
    for (const o of (this._placed || [])) { if (x > o.x - 50 && x < o.x + o.w + 50 && yy - 44 < o.y + o.h && yy > o.y) yy = o.y + o.h + 46; }
    this.wp.style.display = 'block'; this.wp.style.left = x + 'px'; this.wp.style.top = Math.min(window.innerHeight - 20, yy) + 'px';
    const d = p.pos.distanceTo(g.player.pos);
    this.wpLabel.textContent = `${p.label} · ${d.toFixed(0)}m`;
  }
}
