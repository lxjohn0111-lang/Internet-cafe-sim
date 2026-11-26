// Fully procedural WebAudio sound engine: SFX, voices, ambience and a generative music system.
const rnd = (a, b) => a + Math.random() * (b - a);

const VOWELS = [
  [800, 1200], [400, 2000], [300, 2300], [500, 900], [350, 700], [650, 1700], [450, 1800],
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.musicVol = 0.45;
    this.sfxVol = 0.8;
    this.muted = false;
    this.listener = { x: 0, y: 0, z: 0 };
    this.musicStyle = 'lofi';
    this.musicQuality = 0; // 0 = cheap radio, 1 = sound system
    this._loops = {};
    this._lastPlay = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.6; this.amb.connect(this.master);
    // music colouring (radio vs sound system)
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 2400; this.musicFilter.Q.value = 0.7;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.music);
    // reverb (room)
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(1.6, 2.5);
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.22;
    this.verbSend.connect(this.verb); this.verb.connect(this.master);
    this.noiseBuf = this._noiseBuffer(2);
    this.brownBuf = this._brownBuffer(4);
    this.enabled = true;
    this._startAmbience();
    this._startMusic();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05); }
  setMusicVolume(v) { this.musicVol = v; if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setSfxVolume(v) { this.sfxVol = v; if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setMusicQuality(q) {
    this.musicQuality = q;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(q ? 16000 : 2400, this.ctx.currentTime, 0.3);
    this.musicBus.gain.setTargetAtTime(q ? 0.9 : 0.5, this.ctx.currentTime, 0.3);
  }

  setListener(pos, fwd) {
    this.listener = pos;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else if (l.setPosition) {
      l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  _noiseBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _brownBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  _impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }

  // Output node for a sound: optional 3D panner, reverb send.
  _out(opts = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = (opts.vol ?? 1);
    let last = g;
    if (opts.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = opts.ref ?? 1.5; p.rolloffFactor = opts.rolloff ?? 1.2; p.maxDistance = 60;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; } else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      g.connect(p); last = p;
    }
    last.connect(opts.bus || this.sfx);
    if (opts.verb !== false) { const s = ctx.createGain(); s.gain.value = opts.verbAmt ?? 0.5; last.connect(s); s.connect(this.verbSend); }
    return g;
  }

  _noise(dest, t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 1, attack = 0.002, freqEnd = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  _tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.005, curve = 'exp', detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // Throttle repeated sounds
  _ok(name, minGap) {
    const now = performance.now();
    if (this._lastPlay[name] && now - this._lastPlay[name] < minGap) return false;
    this._lastPlay[name] = now; return true;
  }

  play(name, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const fn = this['s_' + name];
    if (!fn) return;
    if (opts.pos) {
      const dx = opts.pos.x - this.listener.x, dy = opts.pos.y - this.listener.y, dz = opts.pos.z - this.listener.z;
      if (dx * dx + dy * dy + dz * dz > 50 * 50) return;
    }
    try { fn.call(this, this.ctx.currentTime + 0.005, opts); } catch (e) { /* ignore */ }
  }

  // ---------------- SFX ----------------
  s_step(t, o) {
    if (!this._ok('step', 120)) return;
    const out = this._out({ vol: (o.vol ?? 0.35), verbAmt: 0.25 });
    const hard = o.surface === 'tile';
    this._noise(out, t, 0.09, { type: 'lowpass', freq: hard ? 2600 : 900 + Math.random() * 300, q: 0.8, gain: 0.9 });
    this._tone(out, t, 0.06, { freq: hard ? 180 : 110 + Math.random() * 20, freqEnd: 60, gain: 0.5 });
  }
  s_npcstep(t, o) {
    const out = this._out({ vol: 0.18, pos: o.pos, verbAmt: 0.2, ref: 1 });
    this._noise(out, t, 0.07, { type: 'lowpass', freq: 900, gain: 0.8 });
  }
  s_jump(t) { const out = this._out({ vol: 0.25 }); this._noise(out, t, 0.12, { type: 'lowpass', freq: 600, gain: 0.7 }); }
  s_land(t, o) { const out = this._out({ vol: 0.45 * (o.vol ?? 1) }); this._tone(out, t, 0.15, { freq: 90, freqEnd: 40, gain: 0.9 }); this._noise(out, t, 0.12, { type: 'lowpass', freq: 700, gain: 0.8 }); }
  s_whoosh(t, o) {
    const out = this._out({ vol: 0.35 * (o.vol ?? 1), verb: false });
    this._noise(out, t, 0.22, { type: 'bandpass', freq: 400, freqEnd: 2200, q: 1.4, gain: 1, attack: 0.05 });
  }
  s_punch(t, o) {
    const out = this._out({ vol: 0.9 * (o.vol ?? 1), pos: o.pos, ref: 2 });
    this._tone(out, t, 0.18, { freq: 140, freqEnd: 45, gain: 1 });
    this._noise(out, t, 0.08, { type: 'lowpass', freq: 3000, gain: 1 });
    this._noise(out, t + 0.01, 0.15, { type: 'bandpass', freq: 600, q: 2, gain: 0.6 });
    if (o.mega) { this._tone(out, t, 0.5, { type: 'sawtooth', freq: 90, freqEnd: 25, gain: 0.6 }); this._noise(out, t, 0.6, { type: 'lowpass', freq: 1500, freqEnd: 100, gain: 0.9 }); }
  }
  s_thud(t, o) {
    if (!this._ok('thud' + (o.id || ''), 90)) return;
    const out = this._out({ vol: Math.min(1, o.vol ?? 0.6), pos: o.pos, ref: 2 });
    this._tone(out, t, 0.2, { freq: rnd(70, 110), freqEnd: 35, gain: 0.9 });
    this._noise(out, t, 0.1, { type: 'lowpass', freq: 800, gain: 0.7 });
  }
  s_clank(t, o) {
    if (!this._ok('clank', 60)) return;
    const out = this._out({ vol: Math.min(0.8, o.vol ?? 0.5), pos: o.pos });
    const f = rnd(900, 2200);
    this._tone(out, t, 0.25, { type: 'triangle', freq: f, gain: 0.4 }); this._tone(out, t, 0.18, { type: 'sine', freq: f * 2.71, gain: 0.2 });
    this._noise(out, t, 0.04, { type: 'highpass', freq: 3000, gain: 0.5 });
  }
  s_can(t, o) {
    if (!this._ok('can', 70)) return;
    const out = this._out({ vol: Math.min(0.7, o.vol ?? 0.4), pos: o.pos });
    const f = rnd(1800, 3200);
    this._tone(out, t, 0.12, { type: 'square', freq: f, gain: 0.15 }); this._tone(out, t, 0.2, { freq: f * 1.5, gain: 0.2 });
  }
  s_cash(t, o) {
    const out = this._out({ vol: 0.55, pos: o.pos, ref: 3 });
    this._noise(out, t, 0.06, { type: 'highpass', freq: 4000, gain: 0.6 });
    this._tone(out, t + 0.06, 0.5, { type: 'triangle', freq: 2093, gain: 0.35 });
    this._tone(out, t + 0.06, 0.6, { type: 'sine', freq: 3136, gain: 0.25 });
    this._tone(out, t + 0.14, 0.7, { type: 'triangle', freq: 2637, gain: 0.3 });
    for (let i = 0; i < 5; i++) this._tone(out, t + 0.18 + i * 0.03, 0.08, { type: 'square', freq: rnd(3500, 6000), gain: 0.05 });
  }
  s_coin(t, o) {
    const out = this._out({ vol: 0.4, pos: o.pos });
    this._tone(out, t, 0.08, { type: 'square', freq: 988, gain: 0.25 }); this._tone(out, t + 0.07, 0.35, { type: 'square', freq: 1319, gain: 0.25 });
  }
  s_register(t) {
    const out = this._out({ vol: 0.6 });
    for (let i = 0; i < 8; i++) this._noise(out, t + i * 0.045, 0.04, { type: 'bandpass', freq: 2500 + i * 100, q: 3, gain: 0.6 });
    this._tone(out, t + 0.4, 0.8, { type: 'triangle', freq: 2349, gain: 0.4 }); this._tone(out, t + 0.4, 0.9, { freq: 3520, gain: 0.25 });
  }
  s_bell(t, o) {
    const out = this._out({ vol: 0.45, pos: o.pos, ref: 3 });
    this._tone(out, t, 1.2, { type: 'sine', freq: 1318, gain: 0.5 }); this._tone(out, t, 0.9, { freq: 2636, gain: 0.1 });
    this._tone(out, t + 0.28, 1.4, { type: 'sine', freq: 1046, gain: 0.5 }); this._tone(out, t + 0.28, 1.0, { freq: 2092, gain: 0.1 });
  }
  s_click(t) { const out = this._out({ vol: 0.3, verb: false }); this._tone(out, t, 0.04, { type: 'square', freq: 1800, gain: 0.3 }); }
  s_ui(t) { const out = this._out({ vol: 0.25, verb: false }); this._tone(out, t, 0.08, { type: 'sine', freq: 880, freqEnd: 1320, gain: 0.4 }); }
  s_buy(t) {
    const out = this._out({ vol: 0.45, verb: false });
    [660, 880, 1320].forEach((f, i) => this._tone(out, t + i * 0.07, 0.25, { type: 'triangle', freq: f, gain: 0.35 }));
    this._noise(out, t, 0.3, { type: 'highpass', freq: 5000, gain: 0.2 });
  }
  s_error(t) { const out = this._out({ vol: 0.35, verb: false }); this._tone(out, t, 0.12, { type: 'square', freq: 220, gain: 0.3 }); this._tone(out, t + 0.13, 0.18, { type: 'square', freq: 160, gain: 0.3 }); }
  s_pickup(t) { const out = this._out({ vol: 0.3, verb: false }); this._noise(out, t, 0.08, { type: 'bandpass', freq: 1500, q: 2, gain: 0.6 }); this._tone(out, t, 0.08, { freq: 500, freqEnd: 900, gain: 0.25 }); }
  s_drop(t) { const out = this._out({ vol: 0.3 }); this._tone(out, t, 0.1, { freq: 300, freqEnd: 120, gain: 0.3 }); }
  s_throw(t) { this.s_whoosh(t, { vol: 0.8 }); }
  s_give(t) {
    const out = this._out({ vol: 0.4, verb: false });
    this._tone(out, t, 0.12, { type: 'triangle', freq: 784, gain: 0.35 }); this._tone(out, t + 0.1, 0.3, { type: 'triangle', freq: 1175, gain: 0.35 });
  }
  s_swish(t) {
    const out = this._out({ vol: 0.6, verb: false });
    this._noise(out, t, 0.25, { type: 'bandpass', freq: 3000, freqEnd: 800, q: 2, gain: 0.5 });
    [523, 659, 784, 1046].forEach((f, i) => this._tone(out, t + 0.1 + i * 0.06, 0.3, { type: 'square', freq: f, gain: 0.12 }));
  }
  s_levelup(t) {
    const out = this._out({ vol: 0.6, verb: true });
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { this._tone(out, t + i * 0.09, 0.6, { type: 'triangle', freq: f, gain: 0.3 }); this._tone(out, t + i * 0.09, 0.4, { type: 'square', freq: f * 2, gain: 0.04 }); });
    this._noise(out, t + 0.5, 1.2, { type: 'highpass', freq: 6000, gain: 0.15 });
  }
  s_achieve(t) {
    const out = this._out({ vol: 0.5 });
    [784, 988, 1175, 1568].forEach((f, i) => this._tone(out, t + i * 0.07, 0.5, { type: 'triangle', freq: f, gain: 0.3 }));
  }
  s_notify(t) { const out = this._out({ vol: 0.3, verb: false }); this._tone(out, t, 0.15, { freq: 1046, gain: 0.3 }); this._tone(out, t + 0.1, 0.2, { freq: 1568, gain: 0.25 }); }
  s_alert(t) {
    const out = this._out({ vol: 0.5, verb: false });
    for (let i = 0; i < 3; i++) { this._tone(out, t + i * 0.16, 0.12, { type: 'sawtooth', freq: 880, gain: 0.2 }); this._tone(out, t + i * 0.16 + 0.08, 0.08, { type: 'sawtooth', freq: 660, gain: 0.2 }); }
  }
  s_event(t) {
    const out = this._out({ vol: 0.55, verb: true });
    this._tone(out, t, 0.25, { type: 'sawtooth', freq: 220, freqEnd: 440, gain: 0.3 });
    this._tone(out, t + 0.22, 0.6, { type: 'square', freq: 660, gain: 0.15 }); this._tone(out, t + 0.22, 0.6, { type: 'square', freq: 990, gain: 0.1 });
    this._noise(out, t, 0.4, { type: 'bandpass', freq: 3000, q: 1, gain: 0.3 });
  }
  s_glitch(t, o) {
    const out = this._out({ vol: 0.4, pos: o.pos });
    for (let i = 0; i < 10; i++) this._tone(out, t + i * 0.03, 0.03, { type: 'square', freq: rnd(100, 2000), gain: 0.25 });
  }
  s_powerdown(t) {
    const out = this._out({ vol: 0.8 });
    this._tone(out, t, 1.4, { type: 'sawtooth', freq: 220, freqEnd: 20, gain: 0.5 }); this._noise(out, t, 0.2, { type: 'lowpass', freq: 400, gain: 1 });
    this._tone(out, t, 0.1, { type: 'square', freq: 60, gain: 0.6 });
  }
  s_powerup(t) {
    const out = this._out({ vol: 0.6 });
    this._tone(out, t, 1.0, { type: 'sawtooth', freq: 40, freqEnd: 300, gain: 0.3 });
    for (let i = 0; i < 6; i++) this._noise(out, t + 0.3 + i * 0.08, 0.05, { type: 'highpass', freq: 3000, gain: 0.4 });
  }
  s_repair(t, o) {
    if (!this._ok('repair', 140)) return;
    const out = this._out({ vol: 0.35, pos: o.pos });
    this._noise(out, t, 0.06, { type: 'bandpass', freq: rnd(1500, 4000), q: 4, gain: 0.8 });
    this._tone(out, t, 0.05, { type: 'square', freq: rnd(200, 500), gain: 0.15 });
  }
  s_fixed(t) {
    const out = this._out({ vol: 0.5 });
    [392, 523, 784].forEach((f, i) => this._tone(out, t + i * 0.08, 0.3, { type: 'square', freq: f, gain: 0.12 }));
  }
  s_door(t, o) {
    const out = this._out({ vol: 0.35, pos: o.pos });
    this._noise(out, t, 0.35, { type: 'bandpass', freq: 500, freqEnd: 300, q: 4, gain: 0.5, attack: 0.05 });
  }
  s_flush(t, o) {
    const out = this._out({ vol: 0.6, pos: o.pos });
    this._noise(out, t, 2.0, { type: 'lowpass', freq: 1800, freqEnd: 300, gain: 0.8, attack: 0.1 });
    this._noise(out, t + 0.2, 1.6, { type: 'bandpass', freq: 600, q: 3, gain: 0.4, attack: 0.2 });
  }
  s_spray(t, o) {
    if (!this._ok('spray', 90)) return;
    const out = this._out({ vol: 0.35, verb: false });
    this._noise(out, t, 0.13, { type: 'highpass', freq: 2500, gain: 0.8, attack: 0.02 });
  }
  s_mop(t, o) {
    if (!this._ok('mop', 220)) return;
    const out = this._out({ vol: 0.3, pos: o.pos });
    this._noise(out, t, 0.25, { type: 'bandpass', freq: 900, freqEnd: 1600, q: 1, gain: 0.6, attack: 0.05 });
  }
  s_splat(t, o) {
    const out = this._out({ vol: 0.45, pos: o.pos });
    this._noise(out, t, 0.18, { type: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.9 }); this._tone(out, t, 0.12, { freq: 200, freqEnd: 60, gain: 0.4 });
  }
  s_slip(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos });
    this._tone(out, t, 0.35, { type: 'sine', freq: 300, freqEnd: 1600, gain: 0.35 });
    this._tone(out, t + 0.33, 0.25, { type: 'sine', freq: 1600, freqEnd: 200, gain: 0.3 });
  }
  s_boing(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos });
    const osc = this._tone(out, t, 0.6, { type: 'sine', freq: 180, freqEnd: 600, gain: 0.5 });
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 18; const lg = this.ctx.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 0.6);
  }
  s_pop(t, o) { const out = this._out({ vol: 0.4, pos: o.pos }); this._tone(out, t, 0.12, { freq: 400, freqEnd: 1400, gain: 0.5 }); this._noise(out, t, 0.05, { type: 'highpass', freq: 2000, gain: 0.4 }); }
  s_sparkle(t, o) {
    const out = this._out({ vol: 0.35, pos: o.pos });
    for (let i = 0; i < 8; i++) this._tone(out, t + i * 0.05, 0.25, { type: 'sine', freq: rnd(2000, 5000), gain: 0.15 });
  }
  s_squeak(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos });
    this._tone(out, t, 0.18, { type: 'square', freq: rnd(900, 1300), freqEnd: rnd(1500, 2200), gain: 0.18 });
    this._tone(out, t + 0.12, 0.12, { type: 'square', freq: 1800, freqEnd: 900, gain: 0.12 });
  }
  s_meow(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos });
    const ctx = this.ctx; const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, t); osc.frequency.linearRampToValueAtTime(900, t + 0.2); osc.frequency.linearRampToValueAtTime(450, t + 0.6);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1800, t + 0.25); f.frequency.linearRampToValueAtTime(900, t + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(f); f.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.7);
  }
  s_coo(t, o) {
    const out = this._out({ vol: 0.4, pos: o.pos });
    for (let i = 0; i < 2; i++) this._tone(out, t + i * 0.25, 0.22, { type: 'sine', freq: 420 + i * 40, freqEnd: 340, gain: 0.4, attack: 0.04 });
  }
  s_flap(t, o) { if (!this._ok('flap', 150)) return; const out = this._out({ vol: 0.3, pos: o.pos }); for (let i = 0; i < 3; i++) this._noise(out, t + i * 0.06, 0.05, { type: 'lowpass', freq: 900, gain: 0.6 }); }
  s_fire(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos, ref: 2 });
    this._noise(out, t, 0.6, { type: 'lowpass', freq: 500, gain: 0.8, attack: 0.1 });
    for (let i = 0; i < 4; i++) this._noise(out, t + Math.random() * 0.5, 0.03, { type: 'highpass', freq: 3000, gain: 0.5 });
  }
  s_type(t, o) {
    const out = this._out({ vol: 0.12, pos: o.pos, ref: 0.8, verbAmt: 0.15 });
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this._noise(out, t + i * rnd(0.06, 0.12), 0.025, { type: 'bandpass', freq: rnd(2500, 4500), q: 3, gain: 0.8 });
  }
  s_mouseclick(t, o) { const out = this._out({ vol: 0.1, pos: o.pos, ref: 0.6 }); this._noise(out, t, 0.015, { type: 'highpass', freq: 4000, gain: 0.8 }); }
  s_alarm(t, o) {
    const out = this._out({ vol: 0.35, pos: o.pos, ref: 4 });
    for (let i = 0; i < 4; i++) this._tone(out, t + i * 0.25, 0.2, { type: 'square', freq: i % 2 ? 1400 : 1800, gain: 0.25, curve: 'lin' });
  }
  s_explode(t, o) {
    const out = this._out({ vol: 1, pos: o.pos, ref: 4 });
    this._noise(out, t, 1.2, { type: 'lowpass', freq: 2000, freqEnd: 60, gain: 1 }); this._tone(out, t, 0.8, { freq: 80, freqEnd: 20, gain: 1 });
  }
  s_zap(t, o) { const out = this._out({ vol: 0.4, pos: o.pos }); this._tone(out, t, 0.3, { type: 'sawtooth', freq: 2000, freqEnd: 100, gain: 0.3 }); }
  s_ufo(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos, ref: 4 });
    const osc = this._tone(out, t, 2.2, { type: 'sine', freq: 600, gain: 0.35, attack: 0.3, curve: 'lin' });
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 7; const lg = this.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 2.2);
  }
  s_drumroll(t) { const out = this._out({ vol: 0.4 }); for (let i = 0; i < 20; i++) this._noise(out, t + i * 0.04, 0.05, { type: 'bandpass', freq: 1800, q: 1, gain: 0.3 + i * 0.03 }); }
  s_crowd(t, o) {
    const out = this._out({ vol: 0.35, pos: o.pos });
    for (let i = 0; i < 6; i++) this._voiceSyl(out, t + Math.random() * 0.3, rnd(150, 320), VOWELS[0], 0.5, 0.25);
  }

  // ---------------- voices ----------------
  _voiceSyl(dest, t, f0, vowel, dur, gain, glide = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * glide, t + dur);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = vowel[0]; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = vowel[1]; f2.Q.value = 7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  s_babble(t, o) {
    const out = this._out({ vol: (o.vol ?? 0.5), pos: o.pos, ref: 1.5, verbAmt: 0.35 });
    const f0 = o.pitch || 160; const n = o.syl || (3 + Math.floor(Math.random() * 5));
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.07, 0.15);
      this._voiceSyl(out, tt, f0 * rnd(0.85, 1.25), VOWELS[Math.floor(Math.random() * VOWELS.length)], d, 0.9, rnd(0.9, 1.15));
      tt += d + rnd(0.01, 0.05);
    }
  }
  s_scream(t, o) {
    const out = this._out({ vol: 0.7, pos: o.pos, ref: 2.5, verbAmt: 0.6 });
    const f0 = (o.pitch || 180) * 2.2; const dur = rnd(0.6, 1.1);
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.8, t); osc.frequency.linearRampToValueAtTime(f0 * 1.2, t + 0.1); osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(5, 8); const lg = ctx.createGain(); lg.gain.value = f0 * 0.05; lfo.connect(lg); lg.connect(osc.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 850; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1250; f2.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.04); g.gain.setValueAtTime(1, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  s_oof(t, o) {
    const out = this._out({ vol: 0.7, pos: o.pos, ref: 2 });
    this._voiceSyl(out, t, (o.pitch || 160) * 1.1, [500, 900], 0.22, 1, 0.6);
  }
  s_yay(t, o) {
    const out = this._out({ vol: 0.55, pos: o.pos, ref: 2 });
    this._voiceSyl(out, t, (o.pitch || 170) * 1.4, [700, 1800], 0.35, 1, 1.4);
  }
  s_angry(t, o) {
    const out = this._out({ vol: 0.6, pos: o.pos, ref: 2 });
    for (let i = 0; i < 3; i++) this._voiceSyl(out, t + i * 0.13, (o.pitch || 150) * 0.9, [600, 1000], 0.12, 1, 0.8);
  }
  s_sneeze(t, o) {
    const out = this._out({ vol: 0.8, pos: o.pos, ref: 2.5, verbAmt: 0.6 });
    const p = o.pitch || 170;
    this._voiceSyl(out, t, p, [700, 1200], 0.35, 0.6, 1.3);
    this._voiceSyl(out, t + 0.5, p * 1.2, [700, 1200], 0.4, 0.8, 1.4);
    this._noise(out, t + 1.05, 0.35, { type: 'bandpass', freq: 3000, freqEnd: 1500, q: 1, gain: 1, attack: 0.005 });
    this._voiceSyl(out, t + 1.05, p * 1.6, [300, 800], 0.3, 1, 0.7);
  }
  s_snore(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos, ref: 1.5 });
    this._noise(out, t, 1.2, { type: 'lowpass', freq: 400, gain: 0.9, attack: 0.5, rate: 0.6 });
    this._tone(out, t, 1.2, { type: 'sawtooth', freq: 60, freqEnd: 45, gain: 0.25, attack: 0.5 });
    this._noise(out, t + 1.4, 0.8, { type: 'highpass', freq: 2500, gain: 0.25, attack: 0.3 });
  }
  s_laugh(t, o) {
    const out = this._out({ vol: 0.5, pos: o.pos, ref: 2 });
    for (let i = 0; i < 5; i++) this._voiceSyl(out, t + i * 0.14, (o.pitch || 170) * (1.3 - i * 0.04), [750, 1250], 0.1, 0.9, 0.9);
  }
  s_ghost(t, o) {
    const out = this._out({ vol: 0.6, pos: o.pos, ref: 3, verbAmt: 1 });
    const osc = this._tone(out, t, 2.5, { type: 'sine', freq: 300, freqEnd: 180, gain: 0.4, attack: 0.6, curve: 'lin' });
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5; const lg = this.ctx.createGain(); lg.gain.value = 25; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 2.5);
  }

  // ---------------- ambience loops ----------------
  _loop(name, buffer, { type = 'lowpass', freq = 500, q = 0.7, gain = 0.1, rate = 1, bus } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(bus || this.amb); src.start();
    this._loops[name] = { src, f, g };
    return this._loops[name];
  }
  _startAmbience() {
    this._loop('city', this.brownBuf, { freq: 380, gain: 0.12 });
    this._loop('hum', this.noiseBuf, { type: 'bandpass', freq: 180, q: 2, gain: 0.0, rate: 0.5 });
    this._loop('rain', this.noiseBuf, { type: 'bandpass', freq: 2200, q: 0.4, gain: 0.0 });
    this._loop('fire', this.brownBuf, { type: 'lowpass', freq: 600, gain: 0.0, rate: 1.3 });
  }
  setLoop(name, gain, freq) {
    const l = this._loops[name]; if (!l || !this.ctx) return;
    l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.3);
    if (freq) l.f.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.3);
  }

  // ---------------- music ----------------
  setMusicStyle(style) { this.musicStyle = style; }
  _startMusic() {
    this._step = 0;
    this._nextNote = this.ctx.currentTime + 0.3;
    this._chordIdx = 0;
    const tick = () => {
      if (!this.ctx) return;
      while (this._nextNote < this.ctx.currentTime + 0.25) { this._scheduleStep(this._nextNote, this._step); this._advance(); }
    };
    this._musicTimer = setInterval(tick, 60);
  }
  _advance() {
    const bpm = { lofi: 82, disco: 122, spooky: 70, panic: 160, chill: 76 }[this.musicStyle] || 82;
    this._nextNote += 60 / bpm / 4;
    this._step = (this._step + 1) % 64;
  }
  _scheduleStep(t, s) {
    const style = this.musicStyle;
    const bus = this.musicBus;
    const prog = {
      lofi: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]],
      chill: [[55, 59, 62, 66], [52, 55, 59, 62], [48, 52, 55, 59], [50, 54, 57, 60]],
      disco: [[57, 60, 64, 69], [55, 59, 62, 67], [53, 57, 60, 65], [52, 56, 59, 64]],
      spooky: [[57, 60, 63, 66], [56, 59, 62, 65], [55, 58, 61, 64], [56, 59, 62, 65]],
      panic: [[57, 60, 64, 67], [58, 61, 65, 68], [57, 60, 64, 67], [55, 58, 62, 65]],
    }[style] || [[57, 60, 64, 67]];
    const chord = prog[Math.floor(s / 16) % prog.length];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const beat = s % 16;
    if (style === 'lofi' || style === 'chill') {
      if (beat === 0 || beat === 10) this._kick(bus, t, 0.5);
      if (beat === 4 || beat === 12) this._snare(bus, t, 0.22, true);
      if (beat % 2 === 0) this._hat(bus, t, beat % 4 === 2 ? 0.06 : 0.035);
      if (beat === 0) chord.forEach((m, i) => this._pad(bus, t + i * 0.02, mtof(m), 2.8, 0.05));
      if (beat === 0 || beat === 7 || beat === 10) this._bass(bus, t, mtof(chord[0] - 12), 0.35, 0.22);
      if (Math.random() < 0.18 && beat % 2 === 0) this._pluck(bus, t, mtof(chord[Math.floor(Math.random() * 4)] + 12), 0.06);
    } else if (style === 'disco') {
      if (beat % 4 === 0) this._kick(bus, t, 0.7);
      if (beat === 4 || beat === 12) this._snare(bus, t, 0.3, false);
      if (beat % 4 === 2) this._hat(bus, t, 0.12, true);
      this._hat(bus, t, 0.03);
      if (beat % 2 === 1) this._bass(bus, t, mtof(chord[0] - (beat % 4 === 1 ? 12 : 0)), 0.15, 0.25);
      if (beat === 0 || beat === 6 || beat === 12) chord.forEach((m) => this._stab(bus, t, mtof(m + 12), 0.12, 0.035));
    } else if (style === 'spooky') {
      if (beat === 0) chord.forEach((m, i) => this._pad(bus, t + i * 0.05, mtof(m - 12), 4, 0.05));
      if (beat % 8 === 4 && Math.random() < 0.7) this._pluck(bus, t, mtof(chord[Math.floor(Math.random() * 4)] + 12), 0.07);
      if (beat === 0) this._kick(bus, t, 0.3);
    } else if (style === 'panic') {
      if (beat % 4 === 0) this._kick(bus, t, 0.6);
      if (beat % 4 === 2) this._snare(bus, t, 0.25, false);
      this._hat(bus, t, 0.04);
      this._bass(bus, t, mtof(chord[beat % 4] - 12), 0.1, 0.2);
    }
  }
  _kick(bus, t, v) { this._tone(bus, t, 0.35, { freq: 140, freqEnd: 42, gain: v }); }
  _snare(bus, t, v, soft) { this._noise(bus, t, soft ? 0.18 : 0.14, { type: 'bandpass', freq: soft ? 1600 : 2200, q: 0.8, gain: v }); this._tone(bus, t, 0.08, { type: 'triangle', freq: 200, gain: v * 0.6 }); }
  _hat(bus, t, v, open) { this._noise(bus, t, open ? 0.15 : 0.04, { type: 'highpass', freq: 7000, gain: v }); }
  _bass(bus, t, f, d, v) { this._tone(bus, t, d, { type: 'triangle', freq: f, gain: v, attack: 0.01 }); this._tone(bus, t, d * 0.7, { type: 'sine', freq: f / 2, gain: v * 0.6 }); }
  _pad(bus, t, f, d, v) {
    const ctx = this.ctx;
    [-7, 7].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, t); fl.frequency.linearRampToValueAtTime(1400, t + d * 0.5); fl.frequency.linearRampToValueAtTime(500, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.1);
    });
  }
  _pluck(bus, t, f, v) { this._tone(bus, t, 0.6, { type: 'triangle', freq: f, gain: v }); this._tone(bus, t, 0.3, { type: 'sine', freq: f * 2, gain: v * 0.4 }); }
  _stab(bus, t, f, d, v) { this._tone(bus, t, d, { type: 'square', freq: f, gain: v, attack: 0.005 }); }
}

export const audio = new Audio();
