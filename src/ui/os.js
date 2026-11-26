import { SHOP, PC_UPGRADE, CHAIR_UPGRADE, ACHIEVEMENTS, dayBills, stars, xpFor } from '../game/state.js';
import { PC_TIERS, CHAIR_TIERS } from '../game/stations.js';
import { audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const TABS = [
  { id: 'shop', ic: '🛒', name: 'Shop' },
  { id: 'manage', ic: '🖥️', name: 'Stations' },
  { id: 'prices', ic: '🏷️', name: 'Prices' },
  { id: 'crypto', ic: '📈', name: 'Crypto' },
  { id: 'stats', ic: '📊', name: 'Stats' },
  { id: 'ach', ic: '🏆', name: 'Achievements' },
];
const CATS = [['pcs', 'Computers'], ['supplies', 'Supplies'], ['upgrades', 'Upgrades'], ['marketing', 'Marketing'], ['fun', 'Fun stuff']];

export class OS {
  constructor(game) {
    this.game = game; this.el = $('os'); this.side = $('os-side'); this.content = $('os-content');
    this.tab = 'shop'; this.open = false;
    this.side.innerHTML = TABS.map((t) => `<button class="os-tab" data-tab="${t.id}"><span class="ic">${t.ic}</span><span>${t.name}</span></button>`).join('');
    this.side.addEventListener('click', (e) => { const b = e.target.closest('.os-tab'); if (b) { this.tab = b.dataset.tab; audio.play('click'); this.render(); } });
    this.content.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b.dataset.arg); });
    this.content.addEventListener('input', (e) => { if (e.target.id === 'price-slider') { this.game.state.price = Number(e.target.value); $('price-val').textContent = '$' + e.target.value; this.renderPriceHint(); } });
    $('os-close').addEventListener('click', () => this.game.closeOS(true));
  }

  show(tab) { this.open = true; if (tab) this.tab = tab; this.el.classList.remove('hidden'); this.render(); }
  hide() { this.open = false; this.el.classList.add('hidden'); }

  render() {
    const g = this.game, s = g.state;
    this.side.querySelectorAll('.os-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('os-money').textContent = '$' + Math.round(s.money).toLocaleString();
    $('os-clock').textContent = `Day ${s.day} · ${g.clockText()}`;
    $('os-title').textContent = TABS.find((t) => t.id === this.tab).name;
    this.content.innerHTML = this['r_' + this.tab]();
    if (this.tab === 'crypto') this.drawChart();
  }

  r_shop() {
    const g = this.game, s = g.state;
    let h = `<h2>ShopNet Express</h2><div class="lead">Everything ships instantly. PC stations arrive as a box at the entrance. Register cash: <b>$${Math.round(s.register)}</b> — collect it at the counter!</div>`;
    for (const [cat, title] of CATS) {
      h += `<h3 style="margin:16px 0 8px;font-size:13px;letter-spacing:.15em;opacity:.6">${title.toUpperCase()}</h3><div class="os-grid">`;
      for (const it of SHOP.filter((x) => x.cat === cat)) {
        const price = it.price(s);
        const owned = cat === 'upgrades' && s.upgrades[it.id];
        const locked = s.level < it.lvl;
        const needs = it.needs && !s.upgrades[it.needs];
        const maxed = it.id === 'station' && g.freeSlots().length <= g.pendingBoxes();
        const daily = it.daily && s.marketing >= 1 && it.id === 'flyers';
        let tag = '', btn;
        if (owned) { tag = '<span class="tag own">OWNED</span>'; btn = `<button class="btn small" disabled>Owned</button>`; }
        else if (locked) { tag = `<span class="tag lock">LVL ${it.lvl}</span>`; btn = `<button class="btn small" disabled>Locked</button>`; }
        else if (needs) { btn = `<button class="btn small" disabled>Needs coffee machine</button>`; }
        else if (maxed) { btn = `<button class="btn small" disabled>${s.upgrades.vip ? 'No free slots' : 'Expand to VIP'}</button>`; }
        else if (daily) { btn = `<button class="btn small" disabled>Active today</button>`; }
        else btn = `<button class="btn small" data-act="buy" data-arg="${it.id}" ${s.money < price ? 'disabled' : ''}>Buy</button>`;
        const extra = it.id === 'soda' ? ` <span class="tag">Stock: ${s.stock.soda}</span>` : it.id === 'chips' ? ` <span class="tag">Stock: ${s.stock.chips}</span>` : it.id === 'beans' ? ` <span class="tag">Stock: ${s.stock.coffee}</span>` : '';
        h += `<div class="card ${locked ? 'locked' : ''} ${owned ? 'owned' : ''}"><div class="ct"><span class="em">${it.em}</span>${it.name} ${tag}</div><div class="cd">${it.desc}${extra}</div><div class="cf"><span class="price">$${price}</span>${btn}</div></div>`;
      }
      h += '</div>';
    }
    return h;
  }

  r_manage() {
    const g = this.game, s = g.state;
    let h = `<h2>PC Stations (${g.stations.length})</h2><div class="lead">Better PCs earn more per hour and break less. Better chairs make customers happier.</div><div class="os-grid">`;
    g.stations.forEach((st) => {
      const nt = PC_UPGRADE[st.tier + 1]; const nc = CHAIR_UPGRADE[st.chairTier + 1];
      const status = st.fire ? '🔥 ON FIRE' : st.broken ? '💥 Broken' : st.occupant ? '🎮 In use' : '✅ Free';
      h += `<div class="card"><div class="ct"><span class="em">${st.slot.vip ? '👑' : '🖥️'}</span>Station ${st.slot.id + 1} <span class="tag">${status}</span></div>
        <div class="cd">${PC_TIERS[st.tier].name} (×${PC_TIERS[st.tier].mult}) · ${CHAIR_TIERS[st.chairTier].name}</div>
        <div class="cf">${nt ? `<button class="btn small" data-act="pc" data-arg="${st.slot.id}" ${s.level < nt.lvl || s.money < nt.price ? 'disabled' : ''}>${s.level < nt.lvl ? 'PC: lvl ' + nt.lvl : `→ ${PC_TIERS[st.tier + 1].name} $${nt.price}`}</button>` : '<span class="tag own">MAX PC</span>'}
        ${nc ? `<button class="btn small" data-act="chair" data-arg="${st.slot.id}" ${s.level < nc.lvl || s.money < nc.price ? 'disabled' : ''}>${s.level < nc.lvl ? 'Chair: lvl ' + nc.lvl : `Chair $${nc.price}`}</button>` : '<span class="tag own">MAX CHAIR</span>'}</div></div>`;
    });
    h += '</div>';
    if (g.pendingBoxes()) h += `<div class="os-row" style="margin-top:12px"><span class="k">📦 Undelivered station boxes waiting at the entrance</span><span class="v">${g.pendingBoxes()}</span></div>`;
    return h;
  }

  r_prices() {
    const s = this.game.state;
    return `<h2>Pricing</h2><div class="lead">Hourly rate for a Potato PC. Better PCs multiply this automatically. Too expensive = fewer and grumpier customers.</div>
      <div class="os-row"><span class="k">Price per hour</span><span class="v" id="price-val">$${s.price}</span></div>
      <input class="os-slider" type="range" id="price-slider" min="1" max="25" step="1" value="${s.price}" />
      <div class="os-row" id="price-hint"></div>
      <div class="os-row"><span class="k">Snacks / drinks / coffee / pizza</span><span class="v">$3 / $3 / $4 / $6</span></div>`;
  }
  renderPriceHint() {
    const el = $('price-hint'); if (!el) return;
    const g = this.game; const fair = Math.round(6 * (1 + (g.avgTierMult() - 1) * 0.8));
    const p = g.state.price;
    el.innerHTML = `<span class="k">Customers think a fair price is about $${fair}</span><span class="v" style="color:${p > fair * 1.4 ? '#ff4d5e' : p < fair * 0.7 ? '#ffd34d' : '#4dff9a'}">${p > fair * 1.4 ? 'Too pricey' : p < fair * 0.7 ? 'Cheap!' : 'Fair'}</span>`;
    g.updateMenu();
  }

  r_crypto() {
    const c = this.game.state.crypto;
    return `<h2>PingCoin Exchange</h2><div class="lead">Totally legit. Price updates every game minute. Past performance guarantees nothing.</div>
      <canvas class="chart" id="crypto-chart" width="760" height="180"></canvas>
      <div class="os-row"><span class="k">PingCoin price</span><span class="v" style="color:#ffd34d">$${c.price.toFixed(2)}</span></div>
      <div class="os-row"><span class="k">You own</span><span class="v">${c.coins} PING ≈ $${Math.round(c.coins * c.price)}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="cbuy" data-arg="1">Buy 1</button><button class="btn" data-act="cbuy" data-arg="5">Buy 5</button><button class="btn danger" data-act="csell" data-arg="1">Sell 1</button><button class="btn danger" data-act="csell" data-arg="all">Sell all</button></div>`;
  }
  drawChart() {
    const cv = $('crypto-chart'); if (!cv) return; const x = cv.getContext('2d'); const h = this.game.state.crypto.hist.slice(-120);
    x.clearRect(0, 0, cv.width, cv.height); if (h.length < 2) return;
    const mn = Math.min(...h) * 0.95, mx = Math.max(...h) * 1.05;
    x.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 45); x.lineTo(cv.width, i * 45); x.stroke(); }
    const up = h[h.length - 1] >= h[0];
    x.strokeStyle = up ? '#4dff9a' : '#ff4d5e'; x.lineWidth = 2.5; x.beginPath();
    h.forEach((v, i) => { const px = i / (h.length - 1) * cv.width; const py = cv.height - (v - mn) / (mx - mn) * cv.height; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke(); x.lineTo(cv.width, cv.height); x.lineTo(0, cv.height); x.closePath(); x.fillStyle = up ? 'rgba(77,255,154,.08)' : 'rgba(255,77,94,.08)'; x.fill();
  }

  r_stats() {
    const g = this.game, s = g.state, d = s.day_; const b = dayBills(s);
    return `<h2>Café Stats</h2><div class="lead">Reputation ${stars(s.rep).toFixed(1)}★ (${Math.round(s.rep)}/100) · Level ${s.level} (${Math.floor(s.xp)}/${xpFor(s.level)} XP)</div>
      <div class="os-grid">
      <div class="card"><div class="cd">Money</div><div class="os-stat-big" style="color:#4dff9a">$${Math.round(s.money)}</div></div>
      <div class="card"><div class="cd">Today's income</div><div class="os-stat-big">$${Math.round(d.income)}</div></div>
      <div class="card"><div class="cd">Customers today</div><div class="os-stat-big">${d.served}</div></div>
      <div class="card"><div class="cd">Cleanliness</div><div class="os-stat-big">${Math.round(g.cleanliness())}%</div></div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:13px;opacity:.6">TONIGHT'S BILLS</h3>
      <div class="os-row"><span class="k">Rent</span><span class="v">$${b.rent}</span></div>
      <div class="os-row"><span class="k">Electricity (${g.stations.length} PCs + upgrades)</span><span class="v">$${b.elec}</span></div>
      <div class="os-row"><span class="k">Internet</span><span class="v">$${b.net}</span></div>
      <h3 style="margin:16px 0 8px;font-size:13px;opacity:.6">ALL TIME</h3>
      <div class="os-row"><span class="k">Customers served</span><span class="v">${s.stats.served}</span></div>
      <div class="os-row"><span class="k">Troublemakers knocked out</span><span class="v">${s.stats.kos}</span></div>
      <div class="os-row"><span class="k">Customers punched (oops)</span><span class="v">${s.stats.punchedCustomers}</span></div>
      <div class="os-row"><span class="k">Trash trick shots</span><span class="v">${s.stats.shots}</span></div>
      <div class="os-row"><span class="k">Weird events survived</span><span class="v">${s.stats.events}</span></div>
      <div class="os-row"><span class="k">Best day profit</span><span class="v">$${Math.round(s.stats.bestDay)}</span></div>`;
  }

  r_ach() {
    const s = this.game.state;
    const got = ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
    return `<h2>Achievements ${got}/${ACHIEVEMENTS.length}</h2><div class="lead">Each one pays $50 and 30 XP.</div>` + ACHIEVEMENTS.map((a) => `<div class="ach ${s.ach[a.id] ? 'got' : ''}"><div class="ai">${a.em}</div><div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div></div>`).join('');
  }

  act(a, arg) {
    const g = this.game, s = g.state;
    if (a === 'buy') g.buy(arg);
    if (a === 'pc') g.upgradePC(Number(arg));
    if (a === 'chair') g.upgradeChair(Number(arg));
    if (a === 'cbuy') { const n = Number(arg); const cost = n * s.crypto.price; if (s.money >= cost) { s.money -= cost; s.crypto.coins += n; audio.play('buy'); } else audio.play('error'); }
    if (a === 'csell') { const n = arg === 'all' ? s.crypto.coins : Math.min(1, s.crypto.coins); if (n > 0) { const v = n * s.crypto.price; s.crypto.coins -= n; s.money += v; audio.play('cash', {}); g.hud.pop(`+$${Math.round(v)}`, null, 'gold'); } }
    this.render();
  }
}
