// CrazyGames SDK v3 wrapper with safe fallbacks for local / offline play.
const SAVE_PREFIX = 'pingpalace_';

function waitForSDK(timeoutMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (window.CrazyGames && window.CrazyGames.SDK) return resolve(window.CrazyGames.SDK);
      if (performance.now() - t0 > timeoutMs) return resolve(null);
      setTimeout(tick, 50);
    };
    tick();
  });
}

export const SDK = {
  ready: false,
  env: 'none',
  inGameplay: false,
  adPlaying: false,
  onAdStart: null,
  onAdEnd: null,
  onMuteChange: null,
  _sdk: null,

  async init() {
    const sdk = await waitForSDK(4000);
    if (!sdk) { console.info('[SDK] CrazyGames SDK not present – running standalone'); return; }
    try {
      await sdk.init();
      this._sdk = sdk;
      this.ready = true;
      this.env = sdk.environment || 'unknown';
      console.info('[SDK] CrazyGames SDK ready, env =', this.env);
      try {
        sdk.game.addSettingsChangeListener((s) => { if (this.onMuteChange) this.onMuteChange(!!s.muteAudio); });
      } catch (e) { /* older sdk */ }
    } catch (e) {
      console.warn('[SDK] init failed', e);
    }
  },

  get muted() {
    try { return !!(this._sdk && this._sdk.game.settings && this._sdk.game.settings.muteAudio); } catch (e) { return false; }
  },

  _call(fn) { if (!this.ready) return; try { fn(this._sdk); } catch (e) { console.warn('[SDK]', e); } },

  loadingStart() { this._call((s) => s.game.loadingStart()); },
  loadingStop() { this._call((s) => s.game.loadingStop()); },
  gameplayStart() { if (this.inGameplay) return; this.inGameplay = true; this._call((s) => s.game.gameplayStart()); },
  gameplayStop() { if (!this.inGameplay) return; this.inGameplay = false; this._call((s) => s.game.gameplayStop()); },
  happytime() { this._call((s) => s.game.happytime()); },

  // Returns a promise resolving to true if the ad completed (reward should be granted).
  requestAd(type = 'midgame') {
    return new Promise((resolve) => {
      if (!this.ready || this.env === 'disabled') {
        // Standalone build: grant rewarded "ads" instantly so features stay testable, skip midgames.
        resolve(type === 'rewarded');
        return;
      }
      let done = false;
      const finish = (ok) => {
        if (done) return; done = true;
        if (this.adPlaying) { this.adPlaying = false; if (this.onAdEnd) this.onAdEnd(); }
        resolve(ok);
      };
      try {
        this._sdk.ad.requestAd(type, {
          adStarted: () => { this.adPlaying = true; if (this.onAdStart) this.onAdStart(); },
          adFinished: () => finish(true),
          adError: (err) => { console.info('[SDK] ad error', err); finish(false); },
        });
      } catch (e) { finish(false); }
      setTimeout(() => finish(false), 90000);
    });
  },

  // ---- persistence (CrazyGames data module, falls back to localStorage) ----
  saveData(key, obj) {
    const str = JSON.stringify(obj);
    try {
      if (this.ready && this._sdk.data) { this._sdk.data.setItem(SAVE_PREFIX + key, str); return; }
    } catch (e) { /* fallthrough */ }
    try { localStorage.setItem(SAVE_PREFIX + key, str); } catch (e) { /* private mode */ }
  },
  loadData(key) {
    let str = null;
    try { if (this.ready && this._sdk.data) str = this._sdk.data.getItem(SAVE_PREFIX + key); } catch (e) { str = null; }
    if (str == null) { try { str = localStorage.getItem(SAVE_PREFIX + key); } catch (e) { str = null; } }
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { return null; }
  },
  clearData(key) {
    try { if (this.ready && this._sdk.data) this._sdk.data.removeItem(SAVE_PREFIX + key); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(SAVE_PREFIX + key); } catch (e) { /* ignore */ }
  },
};
