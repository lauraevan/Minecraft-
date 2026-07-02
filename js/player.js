// ---------------------------------------------------------------
// player.js — input, first-person physics, survival stats, inventory
// ---------------------------------------------------------------
import { BLOCKS, ITEMS, defOf, AIR } from './blocks.js';
import { clamp, lerp } from './util.js';
import { H } from './world.js';

export const GRAV = 32, JUMP_V = 9.0;
const WALK = 4.3, SPRINT = 5.7, SNEAK = 1.4;
export const P_W = 0.6, P_H = 1.8, EYE = 1.62;

// ---------------------------------------------------------------
export class Input {
  constructor(el) {
    this.keys = {};
    this.justKeys = {};
    this.mouse = [false, false, false];
    this.justMouse = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    el.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true; this.justKeys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    el.addEventListener('mousedown', e => {
      if (!this.locked) return;
      this.mouse[e.button] = true; this.justMouse[e.button] = true;
      e.preventDefault();
    });
    el.addEventListener('mouseup', e => { this.mouse[e.button] = false; });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (!this.locked) this.keys = {};
    });
  }
  endFrame() { this.justKeys = {}; this.justMouse = [false, false, false]; this.dx = 0; this.dy = 0; this.wheel = 0; }
}

// ---------------------------------------------------------------
// swept per-axis AABB vs voxel collision (shared with mobs)
// ---------------------------------------------------------------
export function collideEntity(world, e, dt) {
  // e: {pos:{x,y,z} feet-center, vel, w, h, onGround}
  const half = e.w / 2;
  const solidAt = (x, y, z) => {
    const b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return BLOCKS[b].solid;
  };
  const boxHits = (px, py, pz) => {
    const x0 = Math.floor(px - half), x1 = Math.floor(px + half - 1e-7);
    const y0 = Math.floor(py), y1 = Math.floor(py + e.h - 1e-7);
    const z0 = Math.floor(pz - half), z1 = Math.floor(pz + half - 1e-7);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (BLOCKS[world.getBlock(x, y, z)].solid) return true;
    return false;
  };
  e.hitWall = false;

  // Y axis
  let ny = e.pos.y + e.vel.y * dt;
  if (boxHits(e.pos.x, ny, e.pos.z)) {
    if (e.vel.y < 0) {
      ny = Math.floor(ny) + 1;
      while (boxHits(e.pos.x, ny, e.pos.z)) ny += 1;
      e.onGround = true;
    } else {
      ny = Math.floor(ny + e.h) - e.h - 1e-6;
      // if still colliding after ceiling clamp, push down
      while (boxHits(e.pos.x, ny, e.pos.z) && ny > 0) ny -= 1;
    }
    e.vel.y = 0;
  } else {
    e.onGround = false;
  }
  e.pos.y = ny;

  // helper: sneak edge guard — is there ground under the new position?
  const hasSupport = (px, pz) =>
    boxHits(px, e.pos.y - 0.08, pz);

  // X axis
  let nx = e.pos.x + e.vel.x * dt;
  if (boxHits(nx, e.pos.y, e.pos.z)) {
    // auto step-up (1 block) when on ground
    if (e.onGround && e.stepUp && !boxHits(nx, e.pos.y + 1.01, e.pos.z)) {
      e.pos.y += 1.01; e.pos.x = nx;
    } else {
      if (e.vel.x > 0) nx = Math.floor(nx + half) - half - 1e-6;
      else nx = Math.floor(nx - half) + 1 + half + 1e-6;
      if (boxHits(nx, e.pos.y, e.pos.z)) nx = e.pos.x;
      e.pos.x = nx; e.vel.x = 0; e.hitWall = true;
    }
  } else {
    if (e.sneaking && e.onGround && hasSupport(e.pos.x, e.pos.z) && !hasSupport(nx, e.pos.z)) { e.vel.x = 0; }
    else e.pos.x = nx;
  }

  // Z axis
  let nz = e.pos.z + e.vel.z * dt;
  if (boxHits(e.pos.x, e.pos.y, nz)) {
    if (e.onGround && e.stepUp && !boxHits(e.pos.x, e.pos.y + 1.01, nz)) {
      e.pos.y += 1.01; e.pos.z = nz;
    } else {
      if (e.vel.z > 0) nz = Math.floor(nz + half) - half - 1e-6;
      else nz = Math.floor(nz - half) + 1 + half + 1e-6;
      if (boxHits(e.pos.x, e.pos.y, nz)) nz = e.pos.z;
      e.pos.z = nz; e.vel.z = 0; e.hitWall = true;
    }
  } else {
    if (e.sneaking && e.onGround && hasSupport(e.pos.x, e.pos.z) && !hasSupport(e.pos.x, nz)) { e.vel.z = 0; }
    else e.pos.z = nz;
  }
  // ground re-check (walked off an edge)
  if (e.onGround && !boxHits(e.pos.x, e.pos.y - 0.01, e.pos.z)) e.onGround = false;
}

// ---------------------------------------------------------------
// voxel raycast (DDA)
// ---------------------------------------------------------------
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tDX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMX = dx === 0 ? Infinity : (stepX > 0 ? (x + 1 - ox) : (ox - x)) * tDX;
  let tMY = dy === 0 ? Infinity : (stepY > 0 ? (y + 1 - oy) : (oy - y)) * tDY;
  let tMZ = dz === 0 ? Infinity : (stepZ > 0 ? (z + 1 - oz) : (oz - z)) * tDZ;
  let face = [0, 0, 0], t = 0;
  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== AIR && !BLOCKS[id].fluid) return { x, y, z, id, face, dist: t };
    if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; face = [-stepX, 0, 0]; }
    else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; face = [0, -stepY, 0]; }
    else { z += stepZ; t = tMZ; tMZ += tDZ; face = [0, 0, -stepZ]; }
  }
  return null;
}

// ---------------------------------------------------------------
export class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: 8, y: 80, z: 8 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.w = P_W; this.h = P_H;
    this.onGround = false; this.stepUp = false;
    this.sneaking = false; this.sprinting = false;
    this.health = 20; this.hunger = 20; this.saturation = 5; this.air = 10;
    this.exhaustion = 0; this.regenTimer = 0; this.starveTimer = 0;
    this.invuln = 0; this.dead = false;
    this.fallStart = null;
    this.inWater = false; this.headInWater = false; this.onLadder = false;
    this.inventory = new Array(36).fill(null); // 0-8 hotbar
    this.armor = new Array(4).fill(null);
    this.sel = 0;
    this.spawn = null;
    this.eatCooldown = 0;
    this.attackCooldown = 0;
    this.envTimer = 0;
    this.lastSprintTap = -1;
    this.damageFlash = 0;
    this.stats = { mined: 0, placed: 0, kills: 0, deaths: 0 };
    this.xp = 0; this.level = 0;
    this.gamemode = 'survival';
    this.effects = {}; // id -> seconds remaining
    this.effTimer = 0;
    this.flying = false;
    this.lastSpaceTap = -1;
    this.onDamaged = null; // callback(amount)
    this.onLevelUp = null;
  }

  eyePos() { return { x: this.pos.x, y: this.pos.y + EYE, z: this.pos.z }; }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
  held() { return this.inventory[this.sel]; }

  addEffect(id, dur) { this.effects[id] = Math.max(this.effects[id] || 0, dur); }
  hasEffect(id) { return (this.effects[id] || 0) > 0; }

  xpNeed() { return 7 + this.level * 3; }
  addXP(n) {
    this.xp += n;
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      if (this.onLevelUp) this.onLevelUp(this.level);
    }
  }

  armorPoints() {
    let p = 0;
    for (const a of this.armor) if (a) p += ITEMS[a.id].armor.points + (a.ench ? a.ench.l : 0);
    return p;
  }

  damage(amount, opts = {}) {
    if (this.gamemode !== 'survival') return;
    if (this.dead || this.invuln > 0 || amount <= 0) return;
    if (!opts.bypassArmor) {
      const red = Math.min(0.8, this.armorPoints() * 0.04);
      amount = amount * (1 - red);
      for (let i = 0; i < 4; i++) {
        const a = this.armor[i];
        if (a) { a.dur = (a.dur ?? ITEMS[a.id].armor.dur) - 1; if (a.dur <= 0) this.armor[i] = null; }
      }
    }
    this.health -= amount;
    this.invuln = 0.5;
    this.damageFlash = 1;
    this.exhaustion += 0.1;
    if (this.onDamaged) this.onDamaged(amount, opts);
    if (this.health <= 0) { this.health = 0; this.dead = true; this.stats.deaths++; }
  }

  eat(def) {
    this.hunger = clamp(this.hunger + def.food[0], 0, 20);
    this.saturation = Math.min(this.hunger, this.saturation + def.food[1]);
    if (def.name === 'golden_apple') { this.addEffect('regen', 12); this.addEffect('speed', 20); }
    if (def.name === 'rotten_flesh' && Math.random() < 0.6) this.addEffect('hunger', 20);
  }

  respawn() {
    const s = this.spawn || { x: 8, y: this.world.surfaceY(8, 8) + 1, z: 8 };
    this.pos = { x: s.x, y: s.y, z: s.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.health = 20; this.hunger = 20; this.saturation = 5; this.air = 10;
    this.dead = false; this.fallStart = null; this.invuln = 2;
  }

  update(input, dt, uiOpen) {
    const w = this.world;
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2);

    // --- look ---
    if (!uiOpen) {
      const sens = (window.SETTINGS ? window.SETTINGS.sens : 8) * 0.00035;
      this.yaw -= input.dx * sens;
      this.pitch = clamp(this.pitch - input.dy * sens, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }

    // --- environment flags ---
    const feetBlock = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    const midBlock = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z));
    const eyeBlock = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    this.inWater = feetBlock === 8 || midBlock === 8;
    this.headInWater = eyeBlock === 8;
    this.onLadder = BLOCKS[feetBlock].climbable || BLOCKS[midBlock].climbable;
    const inLava = feetBlock === 9 || midBlock === 9;

    // --- movement input ---
    let fwd = 0, str = 0;
    const ts = input.touchState;
    if (!uiOpen) {
      if (input.keys['KeyW']) fwd += 1;
      if (input.keys['KeyS']) fwd -= 1;
      if (input.keys['KeyA']) str -= 1;
      if (input.keys['KeyD']) str += 1;
      if (ts) { fwd += ts.fwd; str += ts.str; }
      this.sneaking = !!input.keys['ShiftLeft'] || !!input.keys['ShiftRight'] || !!(ts && ts.sneak);
      if ((input.keys['ControlLeft'] || input.keys['ControlRight']) && fwd > 0 && this.hunger > 6) this.sprinting = true;
      if (input.justKeys['KeyW']) {
        const now = performance.now();
        if (now - this.lastSprintTap < 280 && this.hunger > 6) this.sprinting = true;
        this.lastSprintTap = now;
      }
      if (fwd <= 0 || this.sneaking || this.hunger <= 6) this.sprinting = false;
    } else { fwd = str = 0; this.sneaking = false; this.sprinting = false; }

    let speed = this.sneaking ? SNEAK : this.sprinting ? SPRINT : WALK;
    if (this.hasEffect('speed')) speed *= 1.3;
    if (this.inWater) speed *= 0.55;
    const len = Math.max(1, Math.hypot(fwd, str)); // analog input keeps partial speed
    const jumpHeld = !uiOpen && (input.keys['Space'] || (ts && ts.jump));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = ((-sin * fwd) / len + (cos * str) / len) * speed;
    const tz = ((-cos * fwd) / len + (-sin * str) / len) * speed;
    const accel = this.onGround ? 14 : (this.inWater ? 6 : 3);
    this.vel.x = lerp(this.vel.x, tx, Math.min(1, accel * dt));
    this.vel.z = lerp(this.vel.z, tz, Math.min(1, accel * dt));

    // --- flight (creative double-tap space; spectator always flies) ---
    if (this.gamemode === 'creative' && !uiOpen && input.justKeys['Space']) {
      const now = performance.now();
      if (now - this.lastSpaceTap < 300) { this.flying = !this.flying; this.vel.y = 0; }
      this.lastSpaceTap = now;
    }
    if (this.gamemode === 'creative' && ts && ts.flyToggle) { this.flying = !this.flying; this.vel.y = 0; }
    if (this.gamemode === 'spectator') this.flying = true;
    if (this.flying && this.gamemode === 'survival') this.flying = false;

    if (this.flying) {
      const flySpeed = this.gamemode === 'spectator' ? 14 : 9;
      this.vel.x = lerp(this.vel.x, tx / speed * flySpeed || 0, Math.min(1, 10 * dt));
      this.vel.z = lerp(this.vel.z, tz / speed * flySpeed || 0, Math.min(1, 10 * dt));
      let vy = 0;
      if (jumpHeld) vy = flySpeed * 0.8;
      else if (this.sneaking) vy = -flySpeed * 0.8;
      this.vel.y = lerp(this.vel.y, vy, Math.min(1, 10 * dt));
      this.fallStart = null;
      if (this.gamemode === 'spectator') {
        // noclip: move freely through blocks
        this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
        this.pos.y = clamp(this.pos.y, -4, H + 40);
      } else {
        collideEntity(this.world, this, dt);
        if (this.onGround) this.flying = false;
      }
      // no survival ticks while flying in creative/spectator
      this.invuln = Math.max(this.invuln, 0.1);
      return;
    }

    // --- vertical ---
    if (this.inWater) {
      this.vel.y -= 10 * dt;
      this.vel.y = Math.max(this.vel.y, -3.2);
      if (jumpHeld) this.vel.y = Math.min(this.vel.y + 24 * dt, 3.5);
      this.fallStart = null;
    } else if (this.onLadder) {
      this.vel.y = jumpHeld ? 2.5 : (this.sneaking ? 0 : -2);
      this.fallStart = null;
    } else {
      this.vel.y -= GRAV * dt;
      this.vel.y = Math.max(this.vel.y, -60);
      if (jumpHeld && this.onGround) {
        this.vel.y = JUMP_V;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
      }
    }

    // --- fall damage bookkeeping ---
    if (!this.onGround && !this.inWater && this.fallStart === null && this.vel.y < 0) this.fallStart = this.pos.y;
    if (this.fallStart !== null && this.vel.y >= 0 && !this.onGround) this.fallStart = Math.max(this.fallStart, this.pos.y);

    const wasAir = !this.onGround;
    const prevFall = this.fallStart;
    collideEntity(w, this, dt);
    if (this.onGround && wasAir && prevFall !== null) {
      const dist = prevFall - this.pos.y;
      if (dist > 3.2) this.damage(Math.floor(dist - 3), { type: 'fall' });
      this.fallStart = null;
    }
    if (this.onGround) this.fallStart = null;

    // sprint exhaustion
    if (this.sprinting) this.exhaustion += dt * Math.hypot(this.vel.x, this.vel.z) * 0.02;

    // --- survival ticks ---
    if (this.gamemode !== 'survival') { this.air = 10; return; }
    // status effects
    for (const k of Object.keys(this.effects)) {
      this.effects[k] -= dt;
      if (this.effects[k] <= 0) delete this.effects[k];
    }
    this.effTimer += dt;
    if (this.effTimer >= 1.25) {
      this.effTimer = 0;
      if (this.hasEffect('regen')) this.health = Math.min(20, this.health + 1);
      if (this.hasEffect('poison') && this.health > 1) { this.health -= 1; this.damageFlash = 0.6; }
      if (this.hasEffect('hunger')) this.exhaustion += 1;
    }
    this.envTimer += dt;
    if (this.envTimer >= 0.5) {
      this.envTimer = 0;
      if (inLava) this.damage(5, { type: 'lava' });
      // cactus contact
      const half = this.w / 2 + 0.05;
      outer: for (const [ox, oz] of [[half, 0], [-half, 0], [0, half], [0, -half], [0, 0]]) {
        for (const oy of [0, 1]) {
          if (w.getBlock(Math.floor(this.pos.x + ox), Math.floor(this.pos.y + oy), Math.floor(this.pos.z + oz)) === 37) {
            this.damage(1, { type: 'cactus' }); break outer;
          }
        }
      }
    }
    // drowning
    if (this.headInWater) {
      this.air -= dt;
      if (this.air <= 0) { this.air = 0; this.damage(2 * dt + 0.001, { type: 'drown', bypassArmor: true, silentTick: true }); }
    } else this.air = Math.min(10, this.air + dt * 4);

    // hunger / regen
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
    this.exhaustion += dt * 0.005; // passive
    if (this.hunger >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= 3) { this.regenTimer = 0; this.health = Math.min(20, this.health + 1); this.exhaustion += 1.5; }
    }
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) { this.starveTimer = 0; if (this.health > 1) this.damage(1, { type: 'starve', bypassArmor: true }); }
    }
    if (this.pos.y < -8) this.damage(5, { type: 'void', bypassArmor: true });
  }

  // ------------- inventory helpers -------------
  addItem(stack) {
    // returns leftover count
    let { id, n } = stack;
    const max = defOf(id).stack ?? 64;
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && !s.dur && s.n < max) {
        const take = Math.min(max - s.n, n); s.n += take; n -= take;
      }
    }
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!this.inventory[i]) {
        const take = Math.min(max, n);
        this.inventory[i] = { id, n: take };
        if (stack.dur !== undefined) this.inventory[i].dur = stack.dur;
        n -= take;
      }
    }
    return n;
  }
  countOf(id) { return this.inventory.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }
  removeN(id, n) {
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id) {
        const take = Math.min(s.n, n); s.n -= take; n -= take;
        if (s.n <= 0) this.inventory[i] = null;
      }
    }
  }
  damageTool(slot, amt = 1) {
    const s = this.inventory[slot];
    if (!s || !ITEMS[s.id] || !ITEMS[s.id].tool) return false;
    s.dur = (s.dur ?? ITEMS[s.id].tool.dur) - amt;
    if (s.dur <= 0) { this.inventory[slot] = null; return true; } // broke
    return false;
  }
}
