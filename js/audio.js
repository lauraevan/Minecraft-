// ---------------------------------------------------------------
// audio.js — Web Audio synthesized sound effects + ambient music
// (all sounds generated in code; no assets)
// ---------------------------------------------------------------

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.volume = 0.7;
    this.listener = { x: 0, y: 0, z: 0 };
    this.musicTimer = 4;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    // shared noise buffer
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setListener(pos) { this.listener = pos; }

  gainFor(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return Math.max(0, 1 - d / 24);
  }

  burst(pos, { freq = 800, q = 1, dur = 0.12, gain = 0.5, type = 'bandpass', delay = 0 }) {
    this.ensure(); if (!this.ctx) return;
    const g0 = this.gainFor(pos); if (g0 <= 0) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * g0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone(pos, { f0 = 440, f1 = null, dur = 0.15, gain = 0.25, type = 'sine', delay = 0 }) {
    this.ensure(); if (!this.ctx) return;
    const g0 = this.gainFor(pos); if (g0 <= 0) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * g0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos) {
    switch (name) {
      case 'dig_stone': case 'step_stone': this.burst(pos, { freq: 700, dur: 0.09, gain: name[0] === 'd' ? 0.5 : 0.15 }); break;
      case 'dig_wood': case 'step_wood': this.burst(pos, { freq: 380, q: 2, dur: 0.1, gain: name[0] === 'd' ? 0.5 : 0.15 }); break;
      case 'dig_grass': case 'step_grass': this.burst(pos, { freq: 1500, dur: 0.09, gain: name[0] === 'd' ? 0.35 : 0.1 }); break;
      case 'dig_sand': case 'step_sand': this.burst(pos, { freq: 2400, dur: 0.12, gain: name[0] === 'd' ? 0.3 : 0.1 }); break;
      case 'dig_gravel': case 'step_gravel': this.burst(pos, { freq: 1000, q: 0.6, dur: 0.12, gain: name[0] === 'd' ? 0.45 : 0.12 }); break;
      case 'dig_glass': this.burst(pos, { freq: 3200, q: 4, dur: 0.2, gain: 0.4 }); this.tone(pos, { f0: 2400, f1: 1200, dur: 0.15, gain: 0.1, type: 'triangle' }); break;
      case 'dig_wool': case 'step_wool': this.burst(pos, { freq: 900, q: 0.4, dur: 0.14, gain: 0.2 }); break;
      case 'dig_snow': case 'step_snow': this.burst(pos, { freq: 1800, q: 0.5, dur: 0.1, gain: 0.2 }); break;
      case 'place': this.burst(pos, { freq: 600, dur: 0.08, gain: 0.4 }); break;
      case 'hurt': this.tone(pos, { f0: 260, f1: 130, dur: 0.22, gain: 0.4, type: 'sawtooth' }); break;
      case 'hurt_mob': this.tone(pos, { f0: 340, f1: 170, dur: 0.18, gain: 0.3, type: 'square' }); break;
      case 'death': this.tone(pos, { f0: 300, f1: 60, dur: 0.8, gain: 0.4, type: 'sawtooth' }); break;
      case 'pop': this.tone(pos, { f0: 420, f1: 900, dur: 0.09, gain: 0.25, type: 'sine' }); break;
      case 'eat': for (let i = 0; i < 3; i++) this.burst(pos, { freq: 1100, q: 1.5, dur: 0.07, gain: 0.3, delay: i * 0.16 }); break;
      case 'click': this.burst(pos, { freq: 1600, dur: 0.035, gain: 0.25 }); break;
      case 'break_tool': this.tone(pos, { f0: 800, f1: 200, dur: 0.25, gain: 0.35, type: 'square' }); break;
      case 'explosion':
        this.burst(pos, { freq: 200, q: 0.3, dur: 1.0, gain: 1.2, type: 'lowpass' });
        this.tone(pos, { f0: 90, f1: 30, dur: 0.9, gain: 0.7, type: 'sine' });
        break;
      case 'bow': this.burst(pos, { freq: 1200, q: 3, dur: 0.12, gain: 0.3 }); this.tone(pos, { f0: 500, f1: 900, dur: 0.1, gain: 0.12, type: 'triangle' }); break;
      case 'splash': this.burst(pos, { freq: 1400, q: 0.5, dur: 0.3, gain: 0.4 }); break;
      case 'level': this.tone(pos, { f0: 660, f1: 1320, dur: 0.3, gain: 0.2, type: 'triangle' }); break;
      case 'sleep': this.tone(pos, { f0: 500, f1: 250, dur: 0.6, gain: 0.2, type: 'sine' }); break;
    }
  }

  stepFor(soundCat, pos) { this.play('step_' + (soundCat === 'none' ? 'grass' : soundCat), pos); }
  digFor(soundCat, pos) { this.play('dig_' + (soundCat === 'none' ? 'stone' : soundCat), pos); }

  // ---- mob voices ----
  mobCall(type, pos, angry = false) {
    switch (type) {
      case 'cow':
        this.tone(pos, { f0: 175, f1: 110, dur: 0.55, gain: 0.3, type: 'sawtooth' });
        this.tone(pos, { f0: 88, f1: 62, dur: 0.5, gain: 0.2, type: 'sine', delay: 0.04 });
        break;
      case 'pig':
        this.burst(pos, { freq: 320, q: 2.5, dur: 0.08, gain: 0.3 });
        this.tone(pos, { f0: 150, f1: 95, dur: 0.1, gain: 0.15, type: 'square' });
        this.burst(pos, { freq: 280, q: 2.5, dur: 0.09, gain: 0.25, delay: 0.16 });
        break;
      case 'sheep':
        for (let i = 0; i < 4; i++)
          this.tone(pos, { f0: 335 - i * 8, f1: 300 - i * 8, dur: 0.09, gain: 0.2, type: 'triangle', delay: i * 0.1 });
        break;
      case 'chicken':
        for (let i = 0; i < 3; i++)
          this.tone(pos, { f0: 820 + Math.random() * 150, f1: 620, dur: 0.07, gain: 0.14, type: 'square', delay: i * 0.13 });
        break;
      case 'zombie':
        this.tone(pos, { f0: angry ? 120 : 95, f1: 68, dur: 0.7, gain: 0.25, type: 'sawtooth' });
        break;
      case 'skeleton':
        for (let i = 0; i < 4; i++) this.burst(pos, { freq: 2400, q: 3, dur: 0.03, gain: 0.18, delay: i * 0.07 });
        break;
      case 'spider':
        this.burst(pos, { freq: 3200, q: 0.7, dur: 0.25, gain: 0.12, type: 'highpass' });
        break;
      case 'creeper':
        this.burst(pos, { freq: 1400, q: 1.2, dur: 0.12, gain: 0.06 });
        break;
    }
  }

  // ---- ambience ----
  ambient(name) {
    if (name === 'birds') {
      const n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const f = 1900 + Math.random() * 1400;
        this.tone(null, { f0: f, f1: f * (Math.random() < 0.5 ? 1.35 : 0.72), dur: 0.06 + Math.random() * 0.05, gain: 0.06, type: 'sine', delay: i * (0.09 + Math.random() * 0.08) });
      }
    } else if (name === 'crickets') {
      for (let i = 0; i < 6; i++) this.burst(null, { freq: 4300, q: 9, dur: 0.035, gain: 0.045, delay: i * 0.085 });
    } else if (name === 'cave') {
      this.tone(null, { f0: 64, f1: 52, dur: 2.6, gain: 0.09, type: 'sine' });
      this.burst(null, { freq: 340, q: 0.4, dur: 2.0, gain: 0.04, type: 'lowpass' });
    }
  }

  // gentle generative music pad
  updateMusic(dt, underground) {
    if (!this.ctx) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 14 + Math.random() * 14;
    const roots = underground ? [110, 123.47, 98] : [146.83, 164.81, 196, 220];
    const root = roots[Math.random() * roots.length | 0];
    const intervals = [1, 1.5, 2, Math.random() < 0.5 ? 2.5 : 3];
    const t = this.ctx.currentTime;
    for (const iv of intervals) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = root * iv * (Math.random() < 0.3 ? 2 : 1);
      const g = this.ctx.createGain();
      const dur = 6 + Math.random() * 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.03, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
}
