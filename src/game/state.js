// Economy, progression, save data, shop catalogue, objectives & achievements.
export const TIME_SCALE = 1.5; // game minutes per real second
export const OPEN_H = 8, CLOSE_H = 24;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const PC_UPGRADE = [null, null, { price: 280, lvl: 2 }, { price: 650, lvl: 4 }, { price: 1400, lvl: 7 }];
export const CHAIR_UPGRADE = [null, null, { price: 90, lvl: 1 }, { price: 220, lvl: 3 }];

export const SHOP = [
  { cat: 'pcs', id: 'station', em: '🖥️', name: 'New PC Station', desc: 'Desk + Potato PC + plastic chair. Arrives as a box at the entrance — carry it to a glowing slot and press E.', price: (s) => 220 + s.stations.length * 45, lvl: 1 },
  { cat: 'supplies', id: 'soda', em: '🥤', name: 'Soda crate ×12', desc: 'Restocks the fridge. Customers pay $3 each.', price: () => 14, lvl: 1 },
  { cat: 'supplies', id: 'chips', em: '🍟', name: 'Chips box ×12', desc: 'Restocks the snack shelf. $3 each.', price: () => 12, lvl: 1 },
  { cat: 'supplies', id: 'beans', em: '🫘', name: 'Coffee beans ×15', desc: 'Needs the coffee machine. $4 per cup.', price: () => 16, lvl: 2, needs: 'coffee' },
  { cat: 'upgrades', id: 'coffee', em: '☕', name: 'Coffee machine', desc: 'Brew coffee on the counter. Customers start asking for it.', price: () => 350, lvl: 2 },
  { cat: 'upgrades', id: 'decor', em: '✨', name: 'Neon decor pack', desc: 'Neon signs, fairy lights, plants. +15% reputation gain.', price: () => 300, lvl: 2 },
  { cat: 'upgrades', id: 'ac', em: '❄️', name: 'Air conditioning', desc: 'Cool customers stay 25% longer and complain less.', price: () => 520, lvl: 3 },
  { cat: 'upgrades', id: 'speakers', em: '🔊', name: 'Sound system', desc: 'Replaces the tiny radio. Full-range music, +satisfaction.', price: () => 400, lvl: 3 },
  { cat: 'upgrades', id: 'fiber', em: '📶', name: 'Fiber internet', desc: 'No more lag complaints. Customers stay longer.', price: () => 700, lvl: 4 },
  { cat: 'upgrades', id: 'arcade', em: '🕹️', name: 'Arcade cabinet', desc: 'Earns $8 every game hour while open. Also: pew pew.', price: () => 900, lvl: 4 },
  { cat: 'upgrades', id: 'camera', em: '📹', name: 'Security camera', desc: '40% fewer troublemakers. They know they are on camera.', price: () => 500, lvl: 5 },
  { cat: 'upgrades', id: 'vending', em: '🥫', name: 'Vending machine', desc: 'Auto-sells $10 of drinks every game hour.', price: () => 800, lvl: 5 },
  { cat: 'upgrades', id: 'robot', em: '🤖', name: 'RoboJanitor 3000', desc: 'A robot that cleans trash. Survives punches. Mostly.', price: () => 1500, lvl: 6 },
  { cat: 'upgrades', id: 'vip', em: '👑', name: 'VIP lounge expansion', desc: 'Knock down the plywood wall: 5 premium slots that pay ×1.5.', price: () => 2500, lvl: 6 },
  { cat: 'marketing', id: 'flyers', em: '📰', name: 'Flyer campaign', desc: '+40% customers for the rest of today.', price: () => 60, lvl: 1, daily: true },
  { cat: 'marketing', id: 'influencer', em: '🤳', name: 'Book an influencer', desc: 'A big streamer visits right now. Keep them happy = huge reputation.', price: () => 250, lvl: 3 },
  { cat: 'fun', id: 'ducks', em: '🦆', name: '50 rubber ducks', desc: 'Delivered immediately. No refunds. Why? Exactly.', price: () => 25, lvl: 1 },
  { cat: 'fun', id: 'moon', em: '🌙', name: 'Moon boots', desc: 'Low-gravity mega jumps for 60 seconds.', price: () => 80, lvl: 1 },
  { cat: 'fun', id: 'party', em: '🪩', name: 'Party mode', desc: 'Instant disco. Everybody dances. +satisfaction.', price: () => 150, lvl: 2 },
];

export const LEVEL_UNLOCKS = {
  2: ['Office Pro PCs', 'Coffee machine', 'Neon decor', 'Party mode'],
  3: ['Racing chairs', 'Air conditioning', 'Sound system', 'Influencers'],
  4: ['Gamer RGB PCs', 'Arcade cabinet', 'Fiber internet'],
  5: ['Vending machine', 'Security camera'],
  6: ['VIP lounge', 'RoboJanitor 3000'],
  7: ['Titan X PCs'],
};
export const xpFor = (lvl) => Math.round(90 * Math.pow(lvl, 1.5));

export const ACHIEVEMENTS = [
  { id: 'first_cust', em: '🎉', name: 'Grand Opening', desc: 'Serve your first customer' },
  { id: 'first_ko', em: '🥊', name: 'House Rules', desc: 'Knock out a troublemaker' },
  { id: 'oops', em: '😬', name: 'Customer Service', desc: 'Punch a paying customer' },
  { id: 'mega', em: '💥', name: 'MEGA PUNCH', desc: 'Launch someone with a fully charged punch' },
  { id: 'swish', em: '🏀', name: 'Nothing But Bin', desc: 'Throw trash into a bin from 4m+' },
  { id: 'swish10', em: '🏆', name: 'Trash Legend', desc: 'Make 10 trash trick shots' },
  { id: 'fixer', em: '🔧', name: 'Have You Tried Turning It Off', desc: 'Repair 5 PCs' },
  { id: 'firefighter', em: '🧯', name: 'Firefighter', desc: 'Put out a PC fire' },
  { id: 'rich1k', em: '💵', name: 'Thousandaire', desc: 'Have $1,000 at once' },
  { id: 'rich10k', em: '💎', name: 'Net Café Tycoon', desc: 'Have $10,000 at once' },
  { id: 'stations8', em: '🏢', name: 'Expansion Pack', desc: 'Own 8 PC stations' },
  { id: 'titan', em: '🚀', name: 'Overkill', desc: 'Buy a Titan X PC' },
  { id: 'vip', em: '👑', name: 'Very Important Pixels', desc: 'Open the VIP lounge' },
  { id: 'events10', em: '🌀', name: 'Nothing Surprises Me', desc: 'Survive 10 weird events' },
  { id: 'five_star', em: '⭐', name: 'Five Stars', desc: 'Reach a 5-star reputation' },
  { id: 'week', em: '📅', name: 'A Whole Week', desc: 'Survive 7 days' },
  { id: 'banana', em: '🍌', name: 'Peel Out', desc: 'Catch the banana streaker' },
  { id: 'inspector', em: '📋', name: 'Passed Inspection', desc: 'Pass a health inspection' },
  { id: 'duck', em: '🦆', name: 'Quack Attack', desc: 'Bin 20 rubber ducks' },
  { id: 'sleepy', em: '😴', name: 'Passed Out', desc: 'Forget to go to bed' },
];

const OBJ_POOL = [
  { id: 'serve', text: (n) => `Serve ${n} customers`, n: (d) => 4 + d * 2, reward: (n) => 12 * n, stat: 'served' },
  { id: 'earn', text: (n) => `Earn $${n} today`, n: (d) => 120 + d * 90, reward: (n) => Math.round(n * 0.25), stat: 'earned' },
  { id: 'sell', text: (n) => `Sell ${n} drinks or snacks`, n: (d) => 3 + d, reward: (n) => 10 * n, stat: 'sold' },
  { id: 'ko', text: (n) => `Knock out ${n} troublemaker${n > 1 ? 's' : ''}`, n: (d) => 1 + Math.floor(d / 3), reward: (n) => 60 * n, stat: 'kos' },
  { id: 'trash', text: (n) => `Bin ${n} pieces of trash`, n: (d) => 4 + d, reward: (n) => 6 * n, stat: 'binned' },
  { id: 'fix', text: (n) => `Repair ${n} broken PC${n > 1 ? 's' : ''}`, n: (d) => 1 + Math.floor(d / 2), reward: (n) => 40 * n, stat: 'fixed' },
  { id: 'happy', text: (n) => `Get ${n} happy reviews (😍)`, n: (d) => 2 + d, reward: (n) => 15 * n, stat: 'happy' },
  { id: 'events', text: (n) => `Survive ${n} weird events`, n: (d) => 2 + Math.floor(d / 2), reward: (n) => 30 * n, stat: 'events' },
  { id: 'shot', text: () => 'Make a 4m+ trash trick shot', n: () => 1, reward: () => 50, stat: 'shots' },
];

export function makeObjectives(day) {
  const pool = OBJ_POOL.slice();
  const out = [];
  const first = pool.splice(0, 1)[0]; out.push(first);
  while (out.length < 3) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out.map((o) => { const n = o.n(day); return { id: o.id, text: o.text(n), target: n, reward: o.reward(n), stat: o.stat, progress: 0, done: false }; });
}

export function defaultState() {
  return {
    v: 3,
    money: 300, register: 0, day: 1, minutes: OPEN_H * 60, level: 1, xp: 0, rep: 55, price: 6,
    stations: [{ slot: 0, tier: 1, chair: 1 }, { slot: 1, tier: 1, chair: 1 }, { slot: 2, tier: 1, chair: 1 }],
    upgrades: {}, stock: { soda: 10, chips: 8, coffee: 0 },
    stats: { served: 0, kos: 0, punchedCustomers: 0, shots: 0, fixed: 0, events: 0, ducks: 0, totalEarned: 0, bestDay: 0, sold: 0, binned: 0 },
    ach: {}, objectives: makeObjectives(1),
    day_: freshDay(), marketing: 0, pendingBoxes: 0, settings: { sens: 1, fov: 74, music: 0.45, sfx: 0.8, invert: false, quality: 'auto' },
    crypto: { coins: 0, price: 120, hist: [] }, history: [],
  };
}
export function freshDay() { return { income: 0, tips: 0, sales: 0, customers: 0, lost: 0, served: 0, earned: 0, sold: 0, kos: 0, binned: 0, fixed: 0, happy: 0, events: 0, shots: 0, punched: 0, stolen: 0, expenses: 0, bonus: 0 }; }

export function dayBills(s) {
  const pcs = s.stations.length;
  const elec = pcs * 6 + (s.upgrades.ac ? 18 : 0) + (s.upgrades.arcade ? 6 : 0) + (s.upgrades.vending ? 5 : 0);
  const net = s.upgrades.fiber ? 30 : 18;
  const rent = 40 + Math.min(10, s.day) * 6 + (s.upgrades.vip ? 60 : 0);
  return { rent, elec, net, total: rent + elec + net };
}

export function stars(rep) { return Math.max(1, Math.min(5, 1 + rep / 22)); }
