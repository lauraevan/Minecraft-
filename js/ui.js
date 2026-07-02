// ---------------------------------------------------------------
// ui.js — HUD + inventory / crafting / furnace / chest screens
// ---------------------------------------------------------------
import { BLOCKS, ITEMS, defOf, matchRecipe } from './blocks.js';
import { iconFor, hudIcon } from './textures.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(player, audio) {
    this.player = player;
    this.audio = audio;
    this.screen = null;        // null | 'inventory' | 'table' | 'furnace' | 'chest'
    this.cursor = null;        // stack in hand
    this.craft = new Array(9).fill(null);
    this.craftSize = 2;
    this.furnaceBE = null;
    this.chestBE = null;
    this.onDrop = null;        // cb(stack) → drop into world
    this.slotEls = [];         // {el, zone, idx}
    this.itemNameTimer = 0;
    this.lastSel = -1;
    this.toastTimer = 0;

    this.buildHotbar();
    this.buildBars();

    document.addEventListener('mousemove', e => {
      const c = $('cursorstack');
      c.style.left = (e.clientX - 19) + 'px';
      c.style.top = (e.clientY - 19) + 'px';
    });
    $('invscreen').addEventListener('mousedown', e => {
      if (e.target === $('invscreen') && this.cursor) {
        if (this.onDrop) this.onDrop(this.cursor);
        this.cursor = null;
        this.refresh();
      }
    });
  }

  // ------------- static HUD -------------
  buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      hb.appendChild(d);
    }
  }
  buildBars() {
    for (const [id, icon, n] of [['hearts', 'heart', 10], ['hungerbar', 'food', 10], ['armorbar', 'armor', 10], ['airbar', 'bubble', 10]]) {
      const bar = $(id); bar.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const img = document.createElement('img');
        img.src = hudIcon(icon);
        bar.appendChild(img);
      }
    }
  }

  updateHUD(dt) {
    const p = this.player;
    // hotbar
    const hb = $('hotbar').children;
    for (let i = 0; i < 9; i++) {
      hb[i].classList.toggle('sel', i === p.sel);
      this.renderSlotEl(hb[i], p.inventory[i]);
    }
    if (p.sel !== this.lastSel) {
      this.lastSel = p.sel;
      const s = p.inventory[p.sel];
      const el = $('itemname');
      el.textContent = s ? defOf(s.id).disp : '';
      el.style.opacity = s ? 1 : 0;
      this.itemNameTimer = 1.6;
    }
    this.itemNameTimer -= dt;
    if (this.itemNameTimer < 0) $('itemname').style.opacity = 0;

    // hearts
    const hearts = $('hearts').children;
    for (let i = 0; i < 10; i++) {
      const v = p.health - i * 2;
      hearts[i].src = hudIcon(v >= 2 ? 'heart' : v >= 1 ? 'heart_half' : 'heart_empty');
    }
    const hunger = $('hungerbar').children;
    for (let i = 0; i < 10; i++) hunger[9 - i].src = hudIcon(p.hunger - i * 2 >= 1 ? 'food' : 'food_empty');
    const ap = p.armorPoints();
    const armor = $('armorbar').children;
    $('armorbar').style.display = ap > 0 ? 'flex' : 'none';
    for (let i = 0; i < 10; i++) armor[i].src = hudIcon(ap - i * 2 >= 1 ? 'armor' : 'armor_empty');
    const air = $('airbar').children;
    $('airbar').style.display = p.headInWater || p.air < 10 ? 'flex' : 'none';
    for (let i = 0; i < 10; i++) air[9 - i].style.opacity = p.air - i >= 0.5 ? 1 : 0;

    $('vignette').style.opacity = Math.min(0.9, p.damageFlash + (p.health <= 4 ? 0.25 : 0));

    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) $('toast').style.opacity = 0; }

    if (this.screen === 'furnace' || this.screen === 'chest' || this.screen) this.refreshDynamic();
  }

  toast(msg) {
    $('toast').textContent = msg;
    $('toast').style.opacity = 1;
    this.toastTimer = 2.5;
  }

  renderSlotEl(el, stack) {
    let img = el.querySelector('img'), cnt = el.querySelector('.cnt'), dura = el.querySelector('.dura');
    if (!stack) {
      if (img) img.remove(); if (cnt) cnt.remove(); if (dura) dura.remove();
      return;
    }
    if (!img) { img = document.createElement('img'); el.appendChild(img); }
    const url = iconFor(stack.id);
    if (img.dataset.i !== String(stack.id)) { img.src = url; img.dataset.i = String(stack.id); }
    if (stack.n > 1) {
      if (!cnt) { cnt = document.createElement('div'); cnt.className = 'cnt'; el.appendChild(cnt); }
      cnt.textContent = stack.n;
    } else if (cnt) cnt.remove();
    const def = defOf(stack.id);
    const maxDur = def.tool ? def.tool.dur : def.armor ? def.armor.dur : 0;
    if (maxDur && stack.dur !== undefined && stack.dur < maxDur) {
      if (!dura) { dura = document.createElement('div'); dura.className = 'dura'; el.appendChild(dura); }
      const f = stack.dur / maxDur;
      dura.style.width = (f * 38) + 'px';
      dura.style.background = f > 0.5 ? '#3f3' : f > 0.25 ? '#fc3' : '#f33';
    } else if (dura) dura.remove();
  }

  // ------------- screens -------------
  isOpen() { return this.screen !== null; }

  open(kind, be = null) {
    this.screen = kind;
    this.furnaceBE = kind === 'furnace' ? be : null;
    this.chestBE = kind === 'chest' ? be : null;
    this.craftSize = kind === 'table' ? 3 : 2;
    this.buildScreen();
    $('invscreen').classList.remove('hidden');
    this.refresh();
  }

  close() {
    if (!this.screen) return;
    // return craft grid + cursor to inventory
    for (let i = 0; i < 9; i++) {
      if (this.craft[i]) {
        const left = this.player.addItem(this.craft[i]);
        if (left > 0 && this.onDrop) this.onDrop({ ...this.craft[i], n: left });
        this.craft[i] = null;
      }
    }
    if (this.cursor) {
      const left = this.player.addItem(this.cursor);
      if (left > 0 && this.onDrop) this.onDrop({ ...this.cursor, n: left });
      this.cursor = null;
    }
    this.screen = null;
    $('invscreen').classList.add('hidden');
    $('cursorstack').classList.add('hidden');
  }

  buildScreen() {
    this.slotEls = [];
    const upper = $('upperzone');
    upper.innerHTML = '';
    const mkSlot = (zone, idx, parent) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); this.clickSlot(zone, idx, e.button, e.shiftKey); });
      parent.appendChild(d);
      this.slotEls.push({ el: d, zone, idx });
      return d;
    };

    if (this.screen === 'inventory' || this.screen === 'table') {
      if (this.screen === 'inventory') {
        const armorCol = document.createElement('div');
        armorCol.style.display = 'flex'; armorCol.style.flexDirection = 'column'; armorCol.style.gap = '2px';
        for (let i = 0; i < 4; i++) mkSlot('armor', i, armorCol);
        upper.appendChild(armorCol);
        const gap = document.createElement('div'); gap.style.width = '30px'; upper.appendChild(gap);
      }
      const label = document.createElement('div');
      label.textContent = this.screen === 'table' ? 'Crafting' : 'Craft';
      label.style.marginRight = '8px';
      upper.appendChild(label);
      const grid = document.createElement('div');
      grid.className = this.craftSize === 3 ? 'craftgrid3' : 'craftgrid2';
      const n = this.craftSize * this.craftSize;
      for (let i = 0; i < n; i++) mkSlot('craft', i, grid);
      upper.appendChild(grid);
      const arrow = document.createElement('div'); arrow.className = 'arrow'; arrow.textContent = '→'; upper.appendChild(arrow);
      mkSlot('craftOut', 0, upper);
    } else if (this.screen === 'furnace') {
      const col = document.createElement('div'); col.className = 'furnstack';
      mkSlot('furnIn', 0, col);
      const flame = document.createElement('img'); flame.id = 'furnflame'; flame.src = iconFor(9); col.appendChild(flame);
      mkSlot('furnFuel', 0, col);
      upper.appendChild(col);
      const prog = document.createElement('div'); prog.id = 'furnprog'; prog.innerHTML = '<div></div>'; upper.appendChild(prog);
      mkSlot('furnOut', 0, upper);
      const lbl = document.createElement('div'); lbl.textContent = 'Furnace'; lbl.style.marginLeft = '14px'; upper.appendChild(lbl);
    } else if (this.screen === 'chest') {
      const wrap = document.createElement('div');
      const lbl = document.createElement('div'); lbl.className = 'invlabel'; lbl.textContent = 'Chest'; wrap.appendChild(lbl);
      const grid = document.createElement('div'); grid.className = 'grid';
      for (let i = 0; i < 27; i++) mkSlot('chest', i, grid);
      wrap.appendChild(grid);
      upper.appendChild(wrap);
    }

    // main inventory + hotbar
    const mg = $('maingrid'); mg.innerHTML = '';
    for (let i = 9; i < 36; i++) mkSlot('inv', i, mg);
    const hg = $('hotgrid'); hg.innerHTML = '';
    for (let i = 0; i < 9; i++) mkSlot('inv', i, hg);
  }

  getZone(zone, idx) {
    const p = this.player;
    switch (zone) {
      case 'inv': return p.inventory[idx];
      case 'armor': return p.armor[idx];
      case 'craft': return this.craft[idx];
      case 'craftOut': return this.craftResult();
      case 'furnIn': return this.furnaceBE ? this.furnaceBE.in : null;
      case 'furnFuel': return this.furnaceBE ? this.furnaceBE.fuel : null;
      case 'furnOut': return this.furnaceBE ? this.furnaceBE.out : null;
      case 'chest': return this.chestBE ? this.chestBE.slots[idx] : null;
    }
  }
  setZone(zone, idx, stack) {
    const p = this.player;
    switch (zone) {
      case 'inv': p.inventory[idx] = stack; break;
      case 'armor': p.armor[idx] = stack; break;
      case 'craft': this.craft[idx] = stack; break;
      case 'furnIn': if (this.furnaceBE) this.furnaceBE.in = stack; break;
      case 'furnFuel': if (this.furnaceBE) this.furnaceBE.fuel = stack; break;
      case 'furnOut': if (this.furnaceBE) this.furnaceBE.out = stack; break;
      case 'chest': if (this.chestBE) this.chestBE.slots[idx] = stack; break;
    }
  }

  craftResult() {
    const size = this.craftSize;
    const ids = [];
    for (let i = 0; i < size * size; i++) ids.push(this.craft[i] ? this.craft[i].id : 0);
    const out = matchRecipe(ids, size, size);
    return out ? { id: out[0], n: out[1] } : null;
  }

  consumeCraft() {
    for (let i = 0; i < this.craftSize * this.craftSize; i++) {
      const s = this.craft[i];
      if (s) { s.n--; if (s.n <= 0) this.craft[i] = null; }
    }
  }

  clickSlot(zone, idx, button, shift) {
    const p = this.player;
    this.audio.play('click');

    // ---- output slots ----
    if (zone === 'craftOut') {
      const res = this.craftResult();
      if (!res) return;
      const def = defOf(res.id);
      const withDur = def.tool ? { ...res, dur: def.tool.dur } : def.armor ? { ...res, dur: def.armor.dur } : res;
      if (shift) {
        for (let guard = 0; guard < 64; guard++) {
          const r = this.craftResult();
          if (!r || r.id !== res.id) break;
          const st = def.tool ? { ...r, dur: def.tool.dur } : def.armor ? { ...r, dur: def.armor.dur } : { ...r };
          if (p.addItem(st) > 0) break;
          this.consumeCraft();
        }
      } else {
        if (!this.cursor) { this.cursor = { ...withDur }; this.consumeCraft(); }
        else if (this.cursor.id === res.id && !def.tool && !def.armor && this.cursor.n + res.n <= (def.stack ?? 64)) {
          this.cursor.n += res.n; this.consumeCraft();
        }
      }
      this.refresh();
      return;
    }
    if (zone === 'furnOut') {
      const s = this.getZone(zone, idx);
      if (!s) return;
      if (shift) { const left = p.addItem(s); this.setZone(zone, idx, left > 0 ? { ...s, n: left } : null); }
      else if (!this.cursor) { this.cursor = s; this.setZone(zone, idx, null); }
      else if (this.cursor.id === s.id) {
        const max = defOf(s.id).stack ?? 64;
        const take = Math.min(s.n, max - this.cursor.n);
        this.cursor.n += take; s.n -= take;
        this.setZone(zone, idx, s.n > 0 ? s : null);
      }
      this.refresh();
      return;
    }

    // ---- armor slot restriction ----
    if (zone === 'armor' && this.cursor) {
      const def = defOf(this.cursor.id);
      if (!def.armor || def.armor.slot !== idx) return;
    }

    const cur = this.getZone(zone, idx);

    if (shift && cur) {
      // quick-move
      if (zone === 'inv') {
        if (this.screen === 'chest' && this.chestBE) {
          const left = this.addToList(this.chestBE.slots, cur);
          this.setZone(zone, idx, left > 0 ? { ...cur, n: left } : null);
        } else if (idx < 9) {
          // hotbar → main
          this.setZone(zone, idx, null);
          let n = cur.n;
          const max = defOf(cur.id).stack ?? 64;
          for (let i = 9; i < 36 && n > 0; i++) {
            const s = p.inventory[i];
            if (s && s.id === cur.id && !s.dur && s.n < max) { const t = Math.min(max - s.n, n); s.n += t; n -= t; }
          }
          for (let i = 9; i < 36 && n > 0; i++) if (!p.inventory[i]) { p.inventory[i] = { ...cur, n }; n = 0; }
          if (n > 0) this.setZone(zone, idx, { ...cur, n });
        }
        else {
          // to hotbar
          this.setZone(zone, idx, null);
          let n = cur.n;
          for (let i = 0; i < 9 && n > 0; i++) {
            if (!p.inventory[i]) { p.inventory[i] = { ...cur, n }; n = 0; }
          }
          if (n > 0) this.setZone(zone, idx, { ...cur, n });
        }
      } else {
        const left = p.addItem(cur);
        this.setZone(zone, idx, left > 0 ? { ...cur, n: left } : null);
      }
      this.refresh();
      return;
    }

    if (button === 0) {
      if (!this.cursor && cur) { this.cursor = cur; this.setZone(zone, idx, null); }
      else if (this.cursor && !cur) { this.setZone(zone, idx, this.cursor); this.cursor = null; }
      else if (this.cursor && cur) {
        if (this.cursor.id === cur.id && !this.cursor.dur && !cur.dur) {
          const max = defOf(cur.id).stack ?? 64;
          const take = Math.min(this.cursor.n, max - cur.n);
          cur.n += take; this.cursor.n -= take;
          if (this.cursor.n <= 0) this.cursor = null;
        } else { const t = this.cursor; this.cursor = cur; this.setZone(zone, idx, t); }
      }
    } else if (button === 2) {
      if (!this.cursor && cur) {
        const half = Math.ceil(cur.n / 2);
        this.cursor = { ...cur, n: half };
        cur.n -= half;
        this.setZone(zone, idx, cur.n > 0 ? cur : null);
      } else if (this.cursor) {
        if (!cur) {
          const one = { ...this.cursor, n: 1 };
          this.setZone(zone, idx, one);
          this.cursor.n--; if (this.cursor.n <= 0) this.cursor = null;
        } else if (cur.id === this.cursor.id && cur.n < (defOf(cur.id).stack ?? 64) && !cur.dur) {
          cur.n++; this.cursor.n--; if (this.cursor.n <= 0) this.cursor = null;
        }
      }
    }
    this.refresh();
  }

  addToList(list, stack) {
    let n = stack.n;
    const max = defOf(stack.id).stack ?? 64;
    for (let i = 0; i < list.length && n > 0; i++) {
      const s = list[i];
      if (s && s.id === stack.id && !s.dur && s.n < max) { const t = Math.min(max - s.n, n); s.n += t; n -= t; }
    }
    for (let i = 0; i < list.length && n > 0; i++) {
      if (!list[i]) { const t = Math.min(max, n); list[i] = { id: stack.id, n: t, ...(stack.dur !== undefined ? { dur: stack.dur } : {}) }; n -= t; }
    }
    return n;
  }

  refresh() {
    for (const { el, zone, idx } of this.slotEls) this.renderSlotEl(el, this.getZone(zone, idx));
    const c = $('cursorstack');
    if (this.cursor) {
      c.classList.remove('hidden');
      c.innerHTML = `<img src="${iconFor(this.cursor.id)}">` + (this.cursor.n > 1 ? `<div class="cnt">${this.cursor.n}</div>` : '');
    } else c.classList.add('hidden');
  }

  refreshDynamic() {
    if (this.screen === 'furnace' && this.furnaceBE) {
      const be = this.furnaceBE;
      const bar = $('furnprog');
      if (bar) bar.firstChild.style.width = (be.progress / 10 * 100) + '%';
      const flame = $('furnflame');
      if (flame) flame.style.opacity = be.burn > 0 ? 1 : 0.25;
      // refresh dynamic slots (furnace transforms items on its own)
      for (const { el, zone, idx } of this.slotEls)
        if (zone.startsWith('furn')) this.renderSlotEl(el, this.getZone(zone, idx));
    }
  }
}
