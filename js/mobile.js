// ---------------------------------------------------------------
// mobile.js — touch controls: virtual joystick, drag-look, buttons
//   left joystick: move | right-side drag: look
//   hold on world: mine | quick tap: place / interact
// ---------------------------------------------------------------

export class TouchControls {
  constructor(input, cb) {
    this.input = input;
    this.cb = cb; // { pause, inventory }
    this.active = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.move = { fwd: 0, str: 0 };
    this.jump = false;
    this.sneak = false;
    this.mining = null;   // {x,y} screen px while long-press held
    this.tap = null;      // {x,y} one-shot short tap
    this.flyToggle = false;
    this.lastJumpTap = -1;
    if (!this.active) return;
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touchui';
    root.innerHTML = `
      <div id="joy"><div id="joynub"></div></div>
      <div id="tbtn-jump" class="tbtn">▲</div>
      <div id="tbtn-sneak" class="tbtn">▼</div>
      <div id="tbtn-inv" class="tbtn small">🎒</div>
      <div id="tbtn-pause" class="tbtn small">⏸</div>`;
    document.body.appendChild(root);
    this.root = root;

    const joy = root.querySelector('#joy');
    const nub = root.querySelector('#joynub');
    let joyId = null, joyCX = 0, joyCY = 0;
    const JR = 55;

    joy.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2;
    }, { passive: false });
    const joyMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        e.preventDefault();
        let dx = t.clientX - joyCX, dy = t.clientY - joyCY;
        const len = Math.hypot(dx, dy);
        if (len > JR) { dx = dx / len * JR; dy = dy / len * JR; }
        nub.style.transform = `translate(${dx}px, ${dy}px)`;
        this.move.str = dx / JR;
        this.move.fwd = -dy / JR;
      }
    };
    const joyEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        nub.style.transform = 'translate(0px, 0px)';
        this.move.fwd = 0; this.move.str = 0;
      }
    };
    joy.addEventListener('touchmove', joyMove, { passive: false });
    joy.addEventListener('touchend', joyEnd);
    joy.addEventListener('touchcancel', joyEnd);

    // buttons
    const hold = (id, on, off) => {
      const el = root.querySelector(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); on(); el.classList.add('on'); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); if (off) off(); if (off) el.classList.remove('on'); });
    };
    hold('#tbtn-jump', () => {
      this.jump = true;
      const now = performance.now();
      if (now - this.lastJumpTap < 300) this.flyToggle = true; // double-tap = creative fly
      this.lastJumpTap = now;
    }, () => { this.jump = false; });
    hold('#tbtn-sneak', () => {
      this.sneak = !this.sneak;
      root.querySelector('#tbtn-sneak').classList.toggle('on', this.sneak);
    });
    root.querySelector('#tbtn-inv').addEventListener('touchstart', e => { e.preventDefault(); this.cb.inventory(); }, { passive: false });
    root.querySelector('#tbtn-pause').addEventListener('touchstart', e => { e.preventDefault(); this.cb.pause(); }, { passive: false });

    // world touches on the canvas: look-drag, hold-mine, tap-place
    const canvas = document.querySelector('#game canvas');
    const touches = new Map(); // id -> {x0,y0,x,y,t0,moved,holdTimer}
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const rec = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), moved: false, mine: false };
        rec.holdTimer = setTimeout(() => {
          if (!rec.moved) { rec.mine = true; this.mining = { x: rec.x, y: rec.y }; }
        }, 320);
        touches.set(t.identifier, rec);
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const rec = touches.get(t.identifier);
        if (!rec) continue;
        const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
        rec.x = t.clientX; rec.y = t.clientY;
        if (!rec.mine && Math.hypot(t.clientX - rec.x0, t.clientY - rec.y0) > 14) rec.moved = true;
        if (rec.mine) { this.mining = { x: rec.x, y: rec.y }; continue; }
        // look
        this.input.dx += dx * 2.2;
        this.input.dy += dy * 2.2;
      }
    }, { passive: false });
    const end = e => {
      for (const t of e.changedTouches) {
        const rec = touches.get(t.identifier);
        if (!rec) continue;
        clearTimeout(rec.holdTimer);
        touches.delete(t.identifier);
        const dur = performance.now() - rec.t0;
        if (rec.mine) this.mining = null;
        else if (!rec.moved && dur < 320) this.tap = { x: rec.x, y: rec.y };
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  show(on) { if (this.root) this.root.style.display = on ? 'block' : 'none'; }
  consumeTap() { const t = this.tap; this.tap = null; return t; }
  consumeFlyToggle() { const f = this.flyToggle; this.flyToggle = false; return f; }
}
