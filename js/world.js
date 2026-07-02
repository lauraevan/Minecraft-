// ---------------------------------------------------------------
// world.js — chunk store, procedural generation, light engine
// ---------------------------------------------------------------
import { Simplex, mulberry32, hashString, clamp } from './util.js';
import { BLOCKS, AIR } from './blocks.js';

export const CHUNK = 16, H = 128, SEA = 48;
const idx = (x, y, z) => x + (z << 4) + (y << 8);

export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Taiga', 'Tundra', 'Jungle', 'Mountains',
  'Cherry Grove', 'Meadow', 'Birch Forest', 'Savanna', 'Swamp'];
export const B_OCEAN = 0, B_BEACH = 1, B_PLAINS = 2, B_FOREST = 3, B_DESERT = 4, B_TAIGA = 5, B_TUNDRA = 6, B_JUNGLE = 7, B_MOUNT = 8;
export const B_CHERRY = 9, B_MEADOW = 10, B_BIRCH = 11, B_SAVANNA = 12, B_SWAMP = 13;
export const GRASSY_BIOMES = [B_PLAINS, B_FOREST, B_CHERRY, B_MEADOW, B_BIRCH, B_SWAMP, B_JUNGLE, B_SAVANNA];
export const LEAFY_BIOMES = [B_FOREST, B_TAIGA, B_JUNGLE, B_CHERRY, B_BIRCH, B_SWAMP];

// extra light attenuation (beyond the base 1/step) for translucent blocks
function atten(id) {
  if (id === 8) return 2;       // water
  if (id === 36) return 2;      // ice
  const d = BLOCKS[id];
  return (d && d.transparent && d.solid && !d.cross && id !== 31 ? 1 : 0); // leaves
}
const transmits = id => BLOCKS[id].transparent;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CHUNK * CHUNK * H);
    this.sky = new Uint8Array(CHUNK * CHUNK * H);
    this.light = new Uint8Array(CHUNK * CHUNK * H);
    this.generated = false;
    this.lit = false;
    this.modified = false;
    this.meshes = null; // set by main
  }
}

export class World {
  constructor(seedStr) {
    this.seedStr = String(seedStr);
    const seed = typeof seedStr === 'number' ? seedStr : hashString(String(seedStr));
    this.seed = seed;
    this.nCont = new Simplex(seed);
    this.nEro = new Simplex(seed + 101);
    this.nPeak = new Simplex(seed + 202);
    this.nTemp = new Simplex(seed + 303);
    this.nHum = new Simplex(seed + 404);
    this.nCave1 = new Simplex(seed + 505);
    this.nCave2 = new Simplex(seed + 606);
    this.nCheese = new Simplex(seed + 707);
    this.nWeird = new Simplex(seed + 808);
    this.chunks = new Map();
    this.savedChunks = new Map();   // key -> Uint8Array (modified, unloaded or from disk)
    this.blockEntities = new Map(); // "x,y,z" -> {type, ...}
    this.dirty = new Set();         // chunk keys needing remesh
    this.time = 6000;               // 0-24000, start at morning
    this.spawn = null;
  }

  key(cx, cz) { return cx + ',' + cz; }
  chunkAt(x, z) { return this.chunks.get(this.key(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); }

  getBlock(x, y, z) {
    if (y < 0) return 7;
    if (y >= H) return AIR;
    const c = this.chunkAt(x, z);
    if (!c) return AIR;
    return c.blocks[idx(x & 15, y, z & 15)];
  }

  getSky(x, y, z) {
    if (y >= H) return 15;
    if (y < 0) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.sky[idx(x & 15, y, z & 15)] : 0;
  }
  getLight(x, y, z) {
    if (y >= H || y < 0) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.light[idx(x & 15, y, z & 15)] : 0;
  }
  setSky(x, y, z, v) {
    if (y < 0 || y >= H) return;
    const c = this.chunkAt(x, z);
    if (!c) return;
    c.sky[idx(x & 15, y, z & 15)] = v;
    this.markDirtyAt(x, z);
  }
  setLight(x, y, z, v) {
    if (y < 0 || y >= H) return;
    const c = this.chunkAt(x, z);
    if (!c) return;
    c.light[idx(x & 15, y, z & 15)] = v;
    this.markDirtyAt(x, z);
  }

  markDirtyAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(this.key(cx, cz));
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.dirty.add(this.key(cx - 1, cz));
    if (lx === 15) this.dirty.add(this.key(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.key(cx, cz - 1));
    if (lz === 15) this.dirty.add(this.key(cx, cz + 1));
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= H) return;
    const c = this.chunkAt(x, z);
    if (!c) return;
    const i = idx(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id) return;
    c.blocks[i] = id;
    c.modified = true;
    this.markDirtyAt(x, z);
    this.updateLight(x, y, z, old, id);
    if (id === AIR) this.blockEntities.delete(x + ',' + y + ',' + z);
    // pop off a supported cross-plant above
    const above = this.getBlock(x, y + 1, z);
    if (id === AIR && above !== AIR && BLOCKS[above].cross && !BLOCKS[above].climbable) {
      this.setBlock(x, y + 1, z, AIR);
    }
  }

  // -------------------------------------------------------------
  // terrain shape
  // -------------------------------------------------------------
  heightAt(x, z) {
    const cont = this.nCont.fbm2(x * 0.0011, z * 0.0011, 4);
    const ero = (this.nEro.fbm2(x * 0.0032, z * 0.0032, 3) + 1) / 2;
    const ridge = 1 - Math.abs(this.nPeak.fbm2(x * 0.007, z * 0.007, 4));
    const detail = this.nPeak.fbm2(x * 0.02, z * 0.02, 2) * 3;
    let h = SEA + 5 + cont * 26 + ridge * ridge * (1 - ero) * 46 + detail;
    return clamp(Math.floor(h), 4, H - 10);
  }

  climateAt(x, z) {
    const t = (this.nTemp.fbm2(x * 0.0016, z * 0.0016, 3) + 1) / 2;
    const hu = (this.nHum.fbm2(x * 0.0019 + 999, z * 0.0019 - 999, 3) + 1) / 2;
    return [t, hu];
  }

  biomeAt(x, z, h = null) {
    if (h === null) h = this.heightAt(x, z);
    const [t, hu] = this.climateAt(x, z);
    const w = this.nWeird.fbm2(x * 0.0026 + 55, z * 0.0026 - 55, 3);
    if (h < SEA - 1) return B_OCEAN;
    if (h <= SEA + 1) return t < 0.22 ? B_TUNDRA : B_BEACH;
    if (h > 86) return B_MOUNT;
    if (t < 0.22) return B_TUNDRA;
    if (t < 0.4) return B_TAIGA;
    if (t > 0.6 && hu > 0.62 && h < SEA + 5) return B_SWAMP;
    if (t > 0.72 && hu < 0.38) return B_DESERT;
    if (t > 0.72 && hu < 0.62) return B_SAVANNA;
    if (t > 0.65 && hu > 0.62) return B_JUNGLE;
    if (hu > 0.45) {
      if (w > 0.42) return B_CHERRY;
      if (w < -0.38) return B_BIRCH;
      return B_FOREST;
    }
    if (w > 0.34) return B_MEADOW;
    return B_PLAINS;
  }

  carved(x, y, z, h) {
    if (y <= 2) return false;
    if (h <= SEA + 1 && y > h - 4) return false; // don't punch holes in ocean floor
    const s1 = this.nCave1.noise3(x * 0.017, y * 0.034, z * 0.017);
    const s2 = this.nCave2.noise3(x * 0.017, y * 0.034, z * 0.017);
    if (s1 * s1 + s2 * s2 < 0.012) return true;  // spaghetti tunnels
    if (y < 46) {
      const ch = this.nCheese.noise3(x * 0.02, y * 0.045, z * 0.02);
      if (ch > 0.66) return true;                // cheese caverns
    }
    return false;
  }

  // -------------------------------------------------------------
  // chunk generation
  // -------------------------------------------------------------
  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    if (!c.generated) this.generateChunk(c);
    return c;
  }

  generateChunk(c) {
    const k = this.key(c.cx, c.cz);
    if (this.savedChunks.has(k)) {
      c.blocks.set(this.savedChunks.get(k));
      c.generated = true; c.modified = true;
      return;
    }
    const rng = mulberry32((this.seed ^ hashString(k)) >>> 0);
    const bl = c.blocks;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const heights = new Int16Array(CHUNK * CHUNK);
    const biomes = new Uint8Array(CHUNK * CHUNK);

    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const h = this.heightAt(wx, wz);
      const biome = this.biomeAt(wx, wz, h);
      heights[lx + lz * 16] = h; biomes[lx + lz * 16] = biome;
      const [temp] = this.climateAt(wx, wz);

      for (let y = 0; y <= h; y++) {
        let id = 1; // stone
        if (y === 0 || (y <= 2 && rng() < 0.5)) id = 7; // bedrock
        else if (this.carved(wx, y, wz, h)) id = y <= 9 ? 9 : AIR; // lava lakes deep down
        bl[idx(lx, y, lz)] = id;
      }
      // surface layers (only where not carved into a cave)
      for (let d = 0; d < 4; d++) {
        const y = h - d;
        if (y <= 2) break;
        const i = idx(lx, y, lz);
        if (bl[i] !== 1) continue;
        let id;
        if (biome === B_DESERT || biome === B_BEACH || biome === B_OCEAN) id = d < 3 ? 5 : 33;
        else if (biome === B_MOUNT) id = h > 94 && d === 0 ? 35 : 1;
        else if (biome === B_TUNDRA) id = d === 0 ? 34 : 3;
        else id = d === 0 ? (h < SEA ? 3 : 2) : 3;
        bl[i] = id;
      }
      // water + ice
      for (let y = h + 1; y <= SEA; y++) bl[idx(lx, y, lz)] = 8;
      if (h < SEA && temp < 0.22) bl[idx(lx, SEA, lz)] = 36;
    }

    this.placeOres(c, rng);
    this.placeDecorations(c, rng, heights, biomes);
    if (rng() < 0.04) this.placeDungeon(c, rng);
    c.generated = true;
  }

  placeOres(c, rng) {
    const bl = c.blocks;
    const veins = [
      [63, 4, 8, 90, 24],  // granite
      [64, 4, 8, 90, 24],  // diorite
      [6, 4, 12, 70, 14],  // gravel pockets
      [3, 4, 12, 70, 14],  // dirt pockets
      [19, 18, 8, 100, 10], // coal
      [20, 12, 4, 60, 7],  // iron
      [21, 4, 4, 26, 5],   // gold
      [22, 3, 2, 14, 4],   // diamond
      [23, 5, 4, 20, 5],   // glowdust
      [25, 4, 8, 30, 4],   // azure
      [24, 3, 40, 80, 2],  // beryl (mountain gem)
    ];
    for (const [id, attempts, yMin, yMax, size] of veins) {
      for (let a = 0; a < attempts; a++) {
        let x = rng() * 16 | 0, z = rng() * 16 | 0;
        let y = yMin + rng() * (yMax - yMin) | 0;
        const n = 1 + rng() * size | 0;
        for (let i = 0; i < n; i++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 2 && y < H) {
            const j = idx(x, y, z);
            if (bl[j] === 1) bl[j] = id;
          }
          const r = rng();
          if (r < 0.34) x += rng() < 0.5 ? 1 : -1;
          else if (r < 0.67) y += rng() < 0.5 ? 1 : -1;
          else z += rng() < 0.5 ? 1 : -1;
        }
      }
    }
  }

  placeDecorations(c, rng, heights, biomes) {
    const bl = c.blocks;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const h = heights[lx + lz * 16], biome = biomes[lx + lz * 16];
      const ground = bl[idx(lx, h, lz)];
      const above = h + 1 < H ? bl[idx(lx, h + 1, lz)] : AIR;
      if (above !== AIR || h + 1 >= H) continue;

      if (biome === B_DESERT && ground === 5) {
        if (rng() < 0.008 && lx > 0 && lx < 15 && lz > 0 && lz < 15) {
          const ch = 1 + rng() * 3 | 0;
          for (let i = 1; i <= ch; i++) if (h + i < H) bl[idx(lx, h + i, lz)] = 37;
        } else if (rng() < 0.006) bl[idx(lx, h + 1, lz)] = 43;
        continue;
      }
      if (ground !== 2 && ground !== 34 && ground !== 3) continue;

      const inMargin = lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13;
      let treeChance = 0, species = 0;
      if (biome === B_FOREST) { treeChance = 0.05; species = rng() < 0.3 ? 1 : 0; }
      else if (biome === B_PLAINS) { treeChance = 0.003; species = 0; }
      else if (biome === B_TAIGA || biome === B_TUNDRA) { treeChance = biome === B_TAIGA ? 0.045 : 0.01; species = 2; }
      else if (biome === B_JUNGLE) { treeChance = 0.09; species = 3; }
      else if (biome === B_MOUNT) { treeChance = 0.004; species = 2; }
      else if (biome === B_CHERRY) { treeChance = 0.035; species = 4; }
      else if (biome === B_BIRCH) { treeChance = 0.05; species = 1; }
      else if (biome === B_SAVANNA) { treeChance = 0.011; species = 5; }
      else if (biome === B_SWAMP) { treeChance = 0.02; species = 0; }
      else if (biome === B_MEADOW) { treeChance = 0.0015; species = rng() < 0.5 ? 4 : 0; }

      if (inMargin && rng() < treeChance) { this.placeTree(c, rng, lx, h + 1, lz, species); continue; }
      const r = rng();
      const put = id => { bl[idx(lx, h + 1, lz)] = id; };
      if (biome === B_MEADOW) {
        if (r < 0.14) put(38);
        else if (r < 0.24) put([39, 40, 72, 73][rng() * 4 | 0]);
        else if (r < 0.243) put(74); // pumpkin patch
      } else if (biome === B_CHERRY) {
        if (r < 0.09) put(38);
        else if (r < 0.115) put(rng() < 0.7 ? 72 : 39);
      } else if (biome === B_SWAMP) {
        if (r < 0.07) put(38);
        else if (r < 0.10) put(rng() < 0.5 ? 41 : 42);
        else if (r < 0.13 && bl[idx(lx, h, lz)] === 2) bl[idx(lx, h, lz)] = 44; // clay patches
      } else if (biome === B_SAVANNA) {
        if (r < 0.12) put(38);
        else if (r < 0.128) put(43);
      } else if (biome === B_PLAINS || biome === B_FOREST || biome === B_JUNGLE || biome === B_BIRCH) {
        if (r < 0.10) put(38);
        else if (r < 0.115) put([39, 40, 73][rng() * 3 | 0]);
        else if (biome === B_FOREST && r < 0.122) put(rng() < 0.5 ? 41 : 42);
        else if (biome === B_PLAINS && r < 0.1165) put(74);
      } else if (biome === B_TAIGA && r < 0.03) put(38);
    }
  }

  growTree(wx, wy, wz, species) {
    // runtime growth (saplings): writes through setBlock so light/meshes update
    const rng = mulberry32((this.seed ^ (wx * 341 + wy * 1543 + wz * 7919)) >>> 0);
    const set = (x, y, z, id) => {
      if (y < 0 || y >= H) return;
      const cur = this.getBlock(x, y, z);
      if (cur === AIR || BLOCKS[cur].cross || (BLOCKS[cur].transparent && !BLOCKS[cur].fluid)) this.setBlock(x, y, z, id);
    };
    this.treeShape(set, rng, wx, wy, wz, species);
  }

  placeTree(c, rng, x, y, z, species) {
    const bl = c.blocks;
    const set = (lx, ly, lz, id) => {
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || ly < 0 || ly >= H) return;
      const i = idx(lx, ly, lz);
      if (bl[i] === AIR || BLOCKS[bl[i]].cross || (BLOCKS[bl[i]].transparent && id !== 0)) bl[i] = id;
    };
    this.treeShape(set, rng, x, y, z, species);
  }

  treeShape(set, rng, x, y, z, species) {
    const [logId, leafId] = [[10, 11], [13, 14], [16, 17], [59, 60], [65, 66], [68, 69]][species];
    if (species === 4) { // cherry: short trunk, wide fluffy blossom canopy
      const th = 4 + (rng() * 2 | 0);
      for (let i = 0; i < th; i++) set(x, y + i, z, logId);
      set(x + (rng() < 0.5 ? 1 : -1), y + th - 1, z, logId); // little branch
      for (let dy = 0; dy <= 2; dy++) {
        const r = dy === 1 ? 3 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          if (rng() < 0.08) continue;
          set(x + dx, y + th - 1 + dy, z + dz, leafId);
        }
      }
      return;
    }
    if (species === 5) { // acacia: bare trunk, flat disc canopy
      const th = 5 + (rng() * 2 | 0);
      let bx = x, bz = z;
      for (let i = 0; i < th; i++) {
        set(bx, y + i, bz, logId);
        if (i >= 2 && rng() < 0.4) { bx += rng() < 0.5 ? 1 : -1; if (rng() < 0.5) bz += rng() < 0.5 ? 1 : -1; }
      }
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 4) continue;
        set(bx + dx, y + th, bz + dz, leafId);
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) set(bx + dx, y + th + 1, bz + dz, leafId);
      }
      return;
    }
    if (species === 2) { // spruce: conical
      const th = 6 + rng() * 4 | 0;
      for (let i = 0; i < th; i++) set(x, y + i, z, logId);
      let rad = 2;
      for (let ly = y + th; ly >= y + 2; ly--) {
        const r = ly >= y + th - 1 ? 0 : (((y + th - ly) % 2) ? rad : rad - 1);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
          if (Math.abs(dx) + Math.abs(dz) <= r + 0.5 && !(dx === 0 && dz === 0 && ly < y + th)) set(x + dx, ly, z + dz, leafId);
        if ((y + th - ly) % 2) rad = Math.min(rad + 1, 3);
      }
      set(x, y + th, z, leafId);
    } else {
      const th = species === 3 ? 7 + (rng() * 5 | 0) : 4 + (rng() * 3 | 0);
      for (let i = 0; i < th; i++) set(x, y + i, z, logId);
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy > 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy < 0) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.5) continue;
          set(x + dx, y + th + dy, z + dz, leafId);
        }
      }
      set(x, y + th + 1, z, leafId);
    }
  }

  placeDungeon(c, rng) {
    const bl = c.blocks;
    const x = 4 + rng() * 6 | 0, z = 4 + rng() * 6 | 0, y = 6 + rng() * 28 | 0;
    if (bl[idx(x, y, z)] !== 1) return;
    for (let dy = 0; dy <= 4; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const wall = dy === 0 || dy === 4 || Math.abs(dx) === 3 || Math.abs(dz) === 3;
      bl[idx(x + dx, y + dy, z + dz)] = wall ? (rng() < 0.4 ? 46 : 4) : AIR;
    }
    bl[idx(x, y + 1, z)] = 29; // chest
    const wk = (c.cx * 16 + x) + ',' + (y + 1) + ',' + (c.cz * 16 + z);
    if (!this.blockEntities.has(wk)) {
      const loot = new Array(27).fill(null);
      const table = [[259, 1, 4], [261, 1, 3], [262, 1, 2], [257, 2, 6], [270, 1, 3], [267, 1, 4], [283, 2, 8], [280, 1, 3]];
      for (let i = 0; i < 4 + rng() * 4; i++) {
        const [id, lo, hi] = table[rng() * table.length | 0];
        loot[rng() * 27 | 0] = { id, n: lo + rng() * (hi - lo) | 0 };
      }
      this.blockEntities.set(wk, { type: 'chest', slots: loot });
    }
  }

  surfaceY(x, z) {
    for (let y = H - 1; y > 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== AIR && BLOCKS[b].solid) return y;
    }
    return SEA;
  }

  // -------------------------------------------------------------
  // light engine
  // -------------------------------------------------------------
  initLight(c) {
    const bl = c.blocks;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const skyQ = [], blkQ = [];
    // vertical skylight
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      let l = 15;
      for (let y = H - 1; y >= 0 && l > 0; y--) {
        const b = bl[idx(lx, y, lz)];
        if (!transmits(b)) break;
        l = Math.max(0, l - atten(b));
        if (l > 0) {
          c.sky[idx(lx, y, lz)] = l;
          if (l > 1) skyQ.push(x0 + lx, y, z0 + lz);
        }
        const d = BLOCKS[b];
        if (d.emit > 0) { c.light[idx(lx, y, lz)] = d.emit; blkQ.push(x0 + lx, y, z0 + lz); }
      }
      // keep scanning below the opaque hit for emissive blocks (lava in caves)
      for (let y = 0; y < H; y++) {
        const d = BLOCKS[bl[idx(lx, y, lz)]];
        if (d.emit > 0 && c.light[idx(lx, y, lz)] === 0) { c.light[idx(lx, y, lz)] = d.emit; blkQ.push(x0 + lx, y, z0 + lz); }
      }
    }
    // pull light from already-lit neighbours across the border
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.chunks.get(this.key(c.cx + dx, c.cz + dz));
      if (!n || !n.lit) continue;
      const nx0 = n.cx * CHUNK, nz0 = n.cz * CHUNK;
      const lx = dx === 1 ? 0 : dx === -1 ? 15 : -1;
      const lz = dz === 1 ? 0 : dz === -1 ? 15 : -1;
      for (let y = 0; y < H; y++) for (let t = 0; t < CHUNK; t++) {
        const ax = lx === -1 ? t : lx, az = lz === -1 ? t : lz;
        const i = idx(ax, y, az);
        if (n.sky[i] > 1) skyQ.push(nx0 + ax, y, nz0 + az);
        if (n.light[i] > 1) blkQ.push(nx0 + ax, y, nz0 + az);
      }
    }
    this.spreadLight(skyQ, true);
    this.spreadLight(blkQ, false);
    c.lit = true;
    this.dirty.add(this.key(c.cx, c.cz));
  }

  spreadLight(q, isSky) {
    const get = isSky ? this.getSky.bind(this) : this.getLight.bind(this);
    const set = isSky ? this.setSky.bind(this) : this.setLight.bind(this);
    let head = 0;
    while (head < q.length) {
      const x = q[head++], y = q[head++], z = q[head++];
      const l = get(x, y, z);
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        if (ny < 0 || ny >= H) continue;
        const nb = this.getBlock(nx, ny, nz);
        if (!transmits(nb)) continue;
        const a = atten(nb);
        let nl;
        if (isSky && d === 3 && l === 15 && a === 0) nl = 15; // sunlight straight down
        else nl = l - 1 - a;
        if (nl > get(nx, ny, nz)) {
          set(nx, ny, nz, nl);
          if (nl > 1) q.push(nx, ny, nz);
        }
      }
    }
  }

  removeLight(x, y, z, isSky) {
    const get = isSky ? this.getSky.bind(this) : this.getLight.bind(this);
    const set = isSky ? this.setSky.bind(this) : this.setLight.bind(this);
    const addQ = [];
    const l0 = get(x, y, z);
    if (l0 === 0) return addQ;
    set(x, y, z, 0);
    const q = [x, y, z, l0];
    let head = 0;
    while (head < q.length) {
      const qx = q[head++], qy = q[head++], qz = q[head++], ql = q[head++];
      for (let d = 0; d < 6; d++) {
        const nx = qx + DX[d], ny = qy + DY[d], nz = qz + DZ[d];
        if (ny < 0 || ny >= H) continue;
        const nl = get(nx, ny, nz);
        if (nl === 0) continue;
        if (nl < ql || (isSky && d === 3 && ql === 15 && nl === 15)) {
          set(nx, ny, nz, 0);
          q.push(nx, ny, nz, nl);
        } else {
          addQ.push(nx, ny, nz); // boundary light re-seeds the region
        }
      }
    }
    return addQ;
  }

  updateLight(x, y, z, oldId, newId) {
    const oldD = BLOCKS[oldId], newD = BLOCKS[newId];
    // --- blocklight ---
    let addB = this.removeLight(x, y, z, false);
    if (newD.emit > 0) {
      this.setLight(x, y, z, newD.emit);
      addB.push(x, y, z);
    }
    if (transmits(newId)) for (let d = 0; d < 6; d++) addB.push(x + DX[d], y + DY[d], z + DZ[d]);
    this.spreadLight(addB, false);
    // --- skylight ---
    let addS = this.removeLight(x, y, z, true);
    if (transmits(newId)) {
      if (y + 1 >= H || this.getSky(x, y + 1, z) === 15) {
        // reopened to the sky: sunlight pours straight down
        let yy = y;
        while (yy >= 0 && transmits(this.getBlock(x, yy, z)) && atten(this.getBlock(x, yy, z)) === 0) {
          this.setSky(x, yy, z, 15);
          addS.push(x, yy, z);
          yy--;
        }
      }
      for (let d = 0; d < 6; d++) addS.push(x + DX[d], y + DY[d], z + DZ[d]);
    }
    this.spreadLight(addS, true);
  }

  lightAt(x, y, z, dayFactor) {
    return Math.max(this.getLight(x, y, z), this.getSky(x, y, z) * dayFactor);
  }
}

export const DX = [1, -1, 0, 0, 0, 0];
export const DY = [0, 0, 1, -1, 0, 0];
export const DZ = [0, 0, 0, 0, 1, -1];
