// ---------------------------------------------------------------
// ui.js — HUD + inventory / crafting / furnace / chest screens
// ---------------------------------------------------------------
import { BLOCKS, ITEMS, defOf, matchRecipe, AIR } from './blocks.js';

// creative palette: every placeable block + obtainable item
const PALETTE = [];
for (let id = 1; id < 256; id++) {
  if (!BLOCKS[id]) continue;
  if ([28, 76, 77, 78].includes(id)) continue; // technical states
  PALETTE.push(id);
}
for (const id of Object.keys(ITEMS)) PALETTE.push(+id);
import { iconFor, hudIcon } from './textures.js';
import { userHudIcon, userXpBar, guiSheet, GUI_LAYOUT, effectIcon } from './assets.js';

const $ = id => document.getElementById(id);
// prefer the player's hand-drawn HUD art, fall back to procedural icons
const icon = name => userHudIcon(name) || hudIcon(name);

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
    this.enchIn = null;
    this.tradeSel = -1;
    this.onClose = null;
    this.trades = [
      { in: [{ id: 286, n: 3 }], out: { id: 265, n: 1 } },
      { in: [{ id: 257, n: 6 }], out: { id: 265, n: 1 } },
      { in: [{ id: 265, n: 1 }], out: { id: 287, n: 3 } },
      { in: [{ id: 265, n: 1 }], out: { id: 283, n: 6 } },
      { in: [{ id: 265, n: 2 }], out: { id: 259, n: 1 } },
      { in: [{ id: 265, n: 5 }], out: { id: 262, n: 1 } },
    ];
    this.onDrop = null;        // cb(stack) → drop into world
    this.slotEls = [];         // {el, zone, idx}
    this.itemNameTimer = 0;
    this.lastSel = -1;
    this.toastTimer = 0;

    this.buildHotbar();
    this.buildBars();

    const moveCursor = (x, y) => {
      const c = $('cursorstack');
      c.style.left = (x - 19) + 'px';
      c.style.top = (y - 19) + 'px';
    };
    document.addEventListener('mousemove', e => moveCursor(e.clientX, e.clientY));
    document.addEventListener('touchmove', e => {
      if (this.screen) moveCursor(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
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
      d.addEventListener('pointerdown', () => { this.player.sel = i; });
      hb.appendChild(d);
    }
  }
  buildBars() {
    for (const [id, name, n] of [['hearts', 'heart', 10], ['hungerbar', 'food', 10], ['armorbar', 'armor', 10], ['airbar', 'bubble', 10]]) {
      const bar = $(id); bar.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const img = document.createElement('img');
        img.src = icon(name);
        bar.appendChild(img);
      }
    }
    // XP bar drawn from the player's own icons sheet (fallback: plain CSS bar)
    const xp = $('xpbar');
    const art = userXpBar();
    xp.innerHTML = art
      ? `<img class="xpempty" src="${art.empty}"><div class="xpclip"><img class="xpfill" src="${art.fill}"></div><span id="xplevel"></span>`
      : `<div class="xpempty css"></div><div class="xpclip css"><div class="xpfill css"></div></div><span id="xplevel"></span>`;
  }

  updateHUD(dt) {
    const p = this.player;
    // hotbar
    const hb = $('hotbar').children;
    for (let i = 0; i < 9; i++) {
      hb[i].classList.toggle('sel', i === p.sel);
      this.renderSlotEl(hb[i], p.inventory[i]);
    }
    // gamemode HUD visibility
    $('statusbars').style.display = p.gamemode === 'survival' ? '' : 'none';
    $('xpbar').style.display = p.gamemode === 'survival' ? '' : 'none';
    $('hotbar').style.display = p.gamemode === 'spectator' ? 'none' : '';
    if (p.gamemode !== 'survival') { /* bars hidden; skip their updates */ }
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
      hearts[i].src = icon(v >= 2 ? "heart" : v >= 1 ? "heart_half" : "heart_empty");
    }
    const hunger = $('hungerbar').children;
    for (let i = 0; i < 10; i++) hunger[9 - i].src = icon(p.hunger - i * 2 >= 1 ? "food" : "food_empty");
    const ap = p.armorPoints();
    const armor = $('armorbar').children;
    $('armorbar').style.display = ap > 0 ? 'flex' : 'none';
    for (let i = 0; i < 10; i++) armor[i].src = icon(ap - i * 2 >= 1 ? "armor" : "armor_empty");
    const air = $('airbar').children;
    $('airbar').style.display = p.headInWater || p.air < 10 ? 'flex' : 'none';
    for (let i = 0; i < 10; i++) air[9 - i].style.opacity = p.air - i >= 0.5 ? 1 : 0;

    // xp
    const clip = $('xpbar').querySelector('.xpclip');
    if (clip) clip.style.width = (p.xp / p.xpNeed() * 100).toFixed(1) + '%';
    const lvl = $('xplevel');
    if (lvl) { lvl.textContent = p.level > 0 ? p.level : ''; }

    $('vignette').style.opacity = Math.min(0.9, p.damageFlash + (p.health <= 4 ? 0.25 : 0));

    // status effects (icons drawn on the inventory sheet)
    let eff = $('effects');
    if (!eff) {
      eff = document.createElement('div'); eff.id = 'effects';
      $('hud').appendChild(eff);
    }
    const ORDER = ['regen', 'speed', 'hunger', 'poison'];
    const html = ORDER.filter(k => p.hasEffect(k)).map(k => {
      const src = effectIcon(ORDER.indexOf(k));
      return `<span class="fx">${src ? `<img src="${src}">` : ''}<i>${Math.ceil(p.effects[k])}s</i></span>`;
    }).join('');
    if (eff.innerHTML !== html) eff.innerHTML = html;

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
    img.classList.toggle('ench', !!stack.ench);
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
    if (this.enchIn) {
      const left = this.player.addItem(this.enchIn);
      if (left > 0 && this.onDrop) this.onDrop({ ...this.enchIn, n: left });
      this.enchIn = null;
    }
    this.screen = null;
    $('invscreen').classList.add('hidden');
    $('cursorstack').classList.add('hidden');
    if (this.onClose) this.onClose();
  }

  buildScreen() {
    this.slotEls = [];
    const upper = $('upperzone');
    upper.innerHTML = '';
    const panel = $('invpanel');
    panel.classList.remove('guiskin');
    panel.style.backgroundImage = '';
    $('maingrid').style.display = '';
    $('hotgrid').style.display = '';
    const mkSlot = (zone, idx, parent) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); this.clickSlot(zone, idx, e.button, e.shiftKey); });
      parent.appendChild(d);
      this.slotEls.push({ el: d, zone, idx });
      return d;
    };
    // ✕ close button (mobile-friendly escape)
    const xb = document.createElement('div');
    xb.className = 'xbtn';
    xb.textContent = '✕';
    xb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.close(); });
    upper.appendChild(xb);

    // hand-drawn GUI skins (standard 18px slot grid, drawn 2×)
    const SKIN = { inventory: 'gui_inv', table: 'gui_craft', enchant: 'gui_enchant', trade: 'gui_trade' };
    const skinName = SKIN[this.screen];
    const sheetUrl = skinName && guiSheet(skinName);
    if (sheetUrl && !(this.screen === 'inventory' && this.player.gamemode === 'creative')) {
      const L = GUI_LAYOUT[skinName];
      panel.classList.add('guiskin');
      panel.style.backgroundImage = `url(${sheetUrl})`;
      $('maingrid').style.display = 'none';
      $('hotgrid').style.display = 'none';
      const abs = (zone, idx, x, y, big) => {
        const d = mkSlot(zone, idx, upper);
        d.classList.add('gslot');
        if (big) d.classList.add('gbig');
        d.style.left = x * 2 + 'px';
        d.style.top = y * 2 + 'px';
      };
      L.inv.forEach(([x, y], i) => abs('inv', 9 + i, x, y));
      L.hot.forEach(([x, y], i) => abs('inv', i, x, y));
      if (this.screen === 'inventory') {
        L.armor.forEach(([x, y], i) => abs('armor', i, x, y));
        L.craft.forEach(([x, y], i) => abs('craft', i, x, y));
        abs('craftOut', 0, ...L.result[0]);
        this.craftSize = 2;
      } else if (this.screen === 'table') {
        L.craft.forEach(([x, y], i) => abs('craft', i, x, y));
        abs('craftOut', 0, ...L.result[0]);
        this.craftSize = 3;
      } else if (this.screen === 'enchant') {
        abs('enchIn', 0, ...L.input[0]);
        L.options.forEach(([x, y], i) => {
          const b = document.createElement('div');
          b.className = 'enchbtn';
          b.style.left = x * 2 + 'px';
          b.style.top = y * 2 + 'px';
          b.textContent = (i + 1) + ' ✦';
          b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.tryEnchant(i + 1); });
          upper.appendChild(b);
        });
      } else if (this.screen === 'trade') {
        abs('tradeIn', 0, ...L.in1[0]);
        abs('tradeIn2', 0, ...L.in2[0]);
        abs('tradeOut', 0, ...L.out[0], true);
        const list = document.createElement('div');
        list.className = 'tradelist';
        this.trades.forEach((t, i) => {
          const b = document.createElement('div');
          b.className = 'tradebtn';
          b.innerHTML = t.in.map(s2 => `<img src="${iconFor(s2.id)}"><b>${s2.n}</b>`).join('+') +
            ' → ' + `<img src="${iconFor(t.out.id)}"><b>${t.out.n}</b>`;
          b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.doTrade(i); });
          list.appendChild(b);
        });
        upper.appendChild(list);
      }
      return;
    }

    if (this.screen === 'inventory' && this.player.gamemode === 'creative') {
      const wrap = document.createElement('div');
      const lbl = document.createElement('div'); lbl.className = 'invlabel'; lbl.textContent = 'Creative — pick anything (click with item to trash)'; wrap.appendChild(lbl);
      const grid = document.createElement('div'); grid.className = 'grid palgrid';
      PALETTE.forEach((id, i) => {
        const el = mkSlot('pal', i, grid);
        el.dataset.pid = id;
      });
      wrap.appendChild(grid);
      upper.appendChild(wrap);
    } else if (this.screen === 'inventory' || this.screen === 'table') {
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
      case 'enchIn': return this.enchIn;
      case 'tradeIn': return this.tradeSel >= 0 ? this.trades[this.tradeSel].in[0] : null;
      case 'tradeIn2': return this.tradeSel >= 0 ? (this.trades[this.tradeSel].in[1] || null) : null;
      case 'tradeOut': return this.tradeSel >= 0 ? this.trades[this.tradeSel].out : null;
      case 'pal': { const id = PALETTE[idx]; return id ? { id, n: 1 } : null; }
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
      case 'enchIn': this.enchIn = stack; break;
      case 'tradeIn': case 'tradeIn2': case 'tradeOut': break;
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

    if (zone === 'pal') {
      const id = PALETTE[idx];
      if (this.cursor && this.cursor.id !== id) this.cursor = null;          // trash
      else if (this.cursor && this.cursor.id === id) this.cursor.n = Math.min(this.cursor.n + (button === 2 ? 1 : 16), defOf(id).stack ?? 64);
      else {
        const def = defOf(id);
        this.cursor = { id, n: button === 2 ? 1 : (def.stack ?? 64) };
        if (def.tool) this.cursor = { id, n: 1, dur: def.tool.dur };
        if (def.armor) this.cursor = { id, n: 1, dur: def.armor.dur };
      }
      if (shift && !this.cursor) {}
      if (shift) { const st = this.cursor; this.cursor = null; if (st) p.addItem(st); }
      this.refresh();
      return;
    }

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
      p.addXP(Math.min(s.n, 3)); // smelting experience
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

    if ((zone === 'tradeIn' || zone === 'tradeIn2' || zone === 'tradeOut')) return; // display only
    if (zone === 'enchIn' && this.cursor) {
      const d = defOf(this.cursor.id);
      if (!d.tool && !d.armor) return;
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

  tryEnchant(cost) {
    const p = this.player, s = this.enchIn;
    this.audio.play('click');
    if (!s || s.ench) { this.toast(s ? 'Already enchanted!' : 'Put a tool, weapon or armor in the slot.'); return; }
    const def = defOf(s.id);
    let name = null;
    if (def.tool) name = def.tool.type === 'sword' ? 'Sharpness' : def.tool.type === 'bow' ? 'Power' : 'Efficiency';
    else if (def.armor) name = 'Protection';
    if (!name) { this.toast('That cannot be enchanted.'); return; }
    if (p.level < cost) { this.toast('Not enough levels (need ' + cost + ').'); return; }
    p.level -= cost;
    s.ench = { n: name, l: cost };
    this.audio.play('level');
    this.toast(name + ' ' + ['I', 'II', 'III'][cost - 1] + '!');
    this.refresh();
  }

  doTrade(i) {
    const p = this.player, t = this.trades[i];
    this.tradeSel = i;
    this.audio.play('click');
    for (const s of t.in) if (p.countOf(s.id) < s.n) { this.toast('You need ' + s.n + '× ' + defOf(s.id).disp + '.'); this.refresh(); return; }
    for (const s of t.in) p.removeN(s.id, s.n);
    const left = p.addItem({ ...t.out });
    if (left > 0 && this.onDrop) this.onDrop({ ...t.out, n: left });
    this.audio.play('pop');
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
