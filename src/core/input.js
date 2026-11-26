// Keyboard / mouse / pointer-lock / touch input.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // pressed this frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false] };
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.touchMode = false;
    this.touch = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, sprint: false };
    this.wantLock = false;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // guard against browser pointer-lock spikes
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.down[e.button] = true; this.mouse.pressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { if (this.mouse.down[e.button]) this.mouse.released[e.button] = true; this.mouse.down[e.button] = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (this.fallback) return;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.down = [false, false, false]; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (!this.touchMode) { this.fallback = true; this._virtualLock(true); } });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.fallback && this.locked) this._virtualLock(false); });

    if ('ontouchstart' in window || navigator.maxTouchPoints > 1) {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this._setupTouch();
    }
  }

  lock() {
    if (this.touchMode) return;
    if (this.fallback) { this._virtualLock(true); return; }
    const fail = () => { if (!document.pointerLockElement) { this.fallback = true; this._virtualLock(true); } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(fail); } catch (e) { fail(); } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { fail(); } }
  }
  // Some embeds refuse pointer lock: fall back to free-mouse look with Esc to pause.
  _virtualLock(on) {
    this.locked = on;
    document.body.classList.toggle('free-mouse', on);
    if (this.onLockChange) this.onLockChange(on);
  }
  unlock() { if (this.fallback) { if (this.locked) this._virtualLock(false); return; } if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0;
    this.mouse.pressed = [false, false, false]; this.mouse.released = [false, false, false];
    this.touch.look.dx = 0; this.touch.look.dy = 0;
  }

  _setupTouch() {
    this.touchMode = true;
    document.body.classList.add('touch');
    const ui = document.getElementById('touch');
    ui.classList.remove('hidden');
    const stick = document.getElementById('t-stick');
    const knob = document.getElementById('t-knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 55;
    const blocked = (t) => t.target.closest && (t.target.closest('.t-btn') || t.target.closest('#os') || t.target.closest('#pause') || t.target.closest('#summary') || t.target.closest('#clicktoplay') || t.target.closest('#t-pause'));
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (blocked(t)) continue;
        if (t.clientX < window.innerWidth * 0.42 && stickId === null) {
          // the joystick appears wherever the left thumb lands
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = (sx - 70) + 'px'; stick.style.top = (sy - 70) + 'px'; stick.style.bottom = 'auto';
          stick.classList.add('active'); knob.style.transform = '';
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy; const m = Math.hypot(dx, dy);
          if (m > R) { dx *= R / m; dy *= R / m; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touch.move.x = dx / R; this.touch.move.y = dy / R;
          this.touch.sprint = m > R * 1.6 || this.touch.sprintToggle;
        } else if (t.identifier === lookId) {
          this.touch.look.dx += (t.clientX - lx) * 2.4; this.touch.look.dy += (t.clientY - ly) * 2.4; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.touch.move.x = 0; this.touch.move.y = 0; knob.style.transform = ''; stick.classList.remove('active'); stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; this.touch.sprint = !!this.touch.sprintToggle; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    const map = { interact: 'KeyE', jump: 'Space', phone: 'Tab', drop: 'KeyQ' };
    ui.querySelectorAll('.t-btn').forEach((b) => {
      const k = b.dataset.t;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('down');
        if (k === 'sprint') { this.touch.sprintToggle = !this.touch.sprintToggle; this.touch.sprint = this.touch.sprintToggle; b.classList.toggle('on', this.touch.sprintToggle); return; }
        if (k === 'punch') { this.mouse.down[0] = true; this.mouse.pressed[0] = true; return; }
        if (k === 'throw') { this.mouse.pressed[2] = true; return; }
        const code = map[k]; this.pressed.add(code); this.keys.add(code);
        if (k === 'phone') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
      }, { passive: false });
      const up = (e) => {
        e.preventDefault(); b.classList.remove('down');
        if (k === 'punch') { this.mouse.down[0] = false; this.mouse.released[0] = true; return; }
        const code = map[k]; if (code) { this.keys.delete(code); this.released.add(code); }
      };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
    this.locked = true;
  }
}
