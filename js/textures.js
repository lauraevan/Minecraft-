// ---------------------------------------------------------------
// textures.js — procedurally generated original 16×16 pixel art
// (no external assets; every texture painted in code)
// ---------------------------------------------------------------
import { mulberry32, hashString, clamp } from './util.js';
import { BLOCKS, ITEMS } from './blocks.js';

export const TILE = 16;
export const ATLAS = 16; // 16×16 tiles => 256×256 px

const sh = (c, f) => [clamp(c[0] * f | 0, 0, 255), clamp(c[1] * f | 0, 0, 255), clamp(c[2] * f | 0, 0, 255)];

class P {
  constructor(rand) { this.d = new Uint8ClampedArray(TILE * TILE * 4); this.r = rand; }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  fill(c, a = 255) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, c, a); }
  noise(c, j, a = 255) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
      this.set(x, y, sh(c, 1 + (this.r() - 0.5) * j), a);
  }
  rect(x, y, w, h, c, a = 255) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a); }
  speck(c, n, a = 255) { for (let i = 0; i < n; i++) this.set(this.r() * TILE | 0, this.r() * TILE | 0, c, a); }
  blob(cx, cy, rad, c, a = 255) {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad + this.r() * 2) this.set(x | 0, y | 0, c, a);
  }
}

// ---- base palettes ----
const C = {
  stone: [130, 130, 130], dirt: [134, 96, 67], grassTop: [104, 168, 70],
  sand: [219, 207, 163], gravel: [127, 124, 122], water: [50, 92, 190], lava: [207, 91, 21],
  oak: [156, 127, 78], oakDark: [103, 82, 49], birch: [216, 205, 172], birchDark: [140, 130, 100],
  spruce: [114, 84, 48], spruceDark: [77, 55, 30], jungle: [160, 115, 80], jungleDark: [95, 68, 45],
  oakLeaf: [64, 132, 38], birchLeaf: [114, 160, 74], spruceLeaf: [45, 96, 62], jungleLeaf: [52, 148, 48],
  snow: [240, 246, 250], clay: [159, 164, 177], brick: [150, 82, 66], obsidian: [24, 18, 38],
};
const WOOL = { white: [232, 232, 232], red: [176, 46, 38], orange: [240, 118, 19], yellow: [248, 197, 39], green: [94, 124, 22], blue: [53, 57, 157], purple: [121, 42, 172], black: [35, 35, 40] };
const MAT = { wood: [138, 106, 67], stone: [138, 138, 138], iron: [216, 216, 216], gold: [245, 211, 74], diamond: [79, 214, 210], leather: [166, 106, 62] };

// ---- block texture painters ----
const PAINT = {};
function reg(name, fn) { PAINT[name] = fn; }

function planks(p, base, dark) {
  p.noise(base, 0.12);
  for (let y = 3; y < TILE; y += 4) for (let x = 0; x < TILE; x++) p.set(x, y, dark);
  p.set(2, 1, dark); p.set(11, 5, dark); p.set(5, 9, dark); p.set(13, 13, dark);
}
function logSide(p, base, dark) {
  for (let x = 0; x < TILE; x++) {
    const s = 0.85 + 0.3 * Math.abs(Math.sin(x * 1.7));
    for (let y = 0; y < TILE; y++) p.set(x, y, sh(base, s * (1 + (p.r() - 0.5) * 0.1)));
  }
  for (let i = 0; i < 4; i++) { const x = p.r() * TILE | 0; p.rect(x, p.r() * 10 | 0, 1, 3 + p.r() * 4 | 0, dark); }
}
function logTop(p, base, dark) {
  p.noise(dark, 0.1);
  for (let r = 6; r >= 1; r -= 2) p.blob(8, 8, r, sh(base, r % 4 === 0 ? 0.8 : 1.05));
  p.blob(8, 8, 1, dark);
}
function leaves(p, base) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (p.r() < 0.08) { p.set(x, y, [0, 0, 0], 0); continue; }
    p.set(x, y, sh(base, 0.75 + p.r() * 0.55));
  }
}
function ore(p, oreColor, bright = 1) {
  p.noise(C.stone, 0.12);
  for (let i = 0; i < 4; i++) {
    const x = 2 + p.r() * 12 | 0, y = 2 + p.r() * 12 | 0;
    p.blob(x, y, 1 + (p.r() * 1.5 | 0), sh(oreColor, bright));
    p.set(x, y, sh(oreColor, bright * 1.25));
  }
}
function cobble(p, base, mossy) {
  p.noise(sh(base, 0.75), 0.1);
  const stones = [[2, 2, 3], [8, 1, 3], [13, 3, 2], [3, 8, 3], [9, 8, 3], [14, 9, 2], [1, 13, 2], [6, 13, 2], [12, 13, 3]];
  for (const [x, y, r] of stones) p.blob(x, y, r, sh(base, 0.9 + p.r() * 0.35));
  if (mossy) for (let i = 0; i < 5; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1 + p.r() * 1.5 | 0, [92, 128, 62]);
}

reg('stone', p => { p.noise(C.stone, 0.1); p.speck(sh(C.stone, 0.8), 20); });
reg('granite', p => { p.noise([149, 103, 92], 0.14); p.speck([120, 80, 70], 22); });
reg('diorite', p => { p.noise([189, 188, 186], 0.08); p.speck([120, 120, 120], 18); });
reg('dirt', p => { p.noise(C.dirt, 0.16); p.speck(sh(C.dirt, 0.7), 14); });
reg('grass_top', p => { p.noise(C.grassTop, 0.14); p.speck(sh(C.grassTop, 1.25), 12); });
reg('grass_side', p => {
  p.noise(C.dirt, 0.16);
  for (let x = 0; x < TILE; x++) { const h = 2 + (p.r() * 3 | 0); for (let y = 0; y < h; y++) p.set(x, y, sh(C.grassTop, 0.9 + p.r() * 0.25)); }
});
reg('snow_grass_side', p => {
  p.noise(C.dirt, 0.16);
  for (let x = 0; x < TILE; x++) { const h = 2 + (p.r() * 3 | 0); for (let y = 0; y < h; y++) p.set(x, y, sh(C.snow, 0.92 + p.r() * 0.1)); }
});
reg('cobblestone', p => cobble(p, C.stone, false));
reg('mossy_cobblestone', p => cobble(p, C.stone, true));
reg('sand', p => { p.noise(C.sand, 0.08); p.speck(sh(C.sand, 0.85), 16); });
reg('gravel', p => { p.noise(C.gravel, 0.2); for (let i = 0; i < 10; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1, sh(C.gravel, 0.6 + p.r() * 0.9)); });
reg('bedrock', p => { p.noise([70, 70, 70], 0.5); for (let i = 0; i < 8; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1 + p.r() * 2 | 0, p.r() < 0.5 ? [40, 40, 40] : [110, 110, 110]); });
reg('water', p => { p.noise(C.water, 0.1, 190); for (let i = 0; i < 4; i++) p.rect(p.r() * 12 | 0, p.r() * 16 | 0, 3 + p.r() * 3 | 0, 1, sh(C.water, 1.25), 190); });
reg('lava', p => { p.noise(C.lava, 0.25); for (let i = 0; i < 5; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1 + p.r() * 2 | 0, [250, 200, 60]); p.speck([80, 20, 10], 10); });
reg('oak_log', p => logSide(p, C.oak, C.oakDark));
reg('oak_log_top', p => logTop(p, C.oak, C.oakDark));
reg('oak_leaves', p => leaves(p, C.oakLeaf));
reg('oak_planks', p => planks(p, C.oak, C.oakDark));
reg('birch_log', p => { logSide(p, C.birch, C.birchDark); p.rect(3, 4, 2, 1, [40, 40, 40]); p.rect(10, 11, 3, 1, [40, 40, 40]); });
reg('birch_log_top', p => logTop(p, C.birch, C.birchDark));
reg('birch_leaves', p => leaves(p, C.birchLeaf));
reg('birch_planks', p => planks(p, C.birch, C.birchDark));
reg('spruce_log', p => logSide(p, C.spruce, C.spruceDark));
reg('spruce_log_top', p => logTop(p, C.spruce, C.spruceDark));
reg('spruce_leaves', p => leaves(p, C.spruceLeaf));
reg('spruce_planks', p => planks(p, C.spruce, C.spruceDark));
reg('jungle_log', p => logSide(p, C.jungle, C.jungleDark));
reg('jungle_log_top', p => logTop(p, C.jungle, C.jungleDark));
reg('jungle_leaves', p => leaves(p, C.jungleLeaf));
reg('jungle_planks', p => planks(p, C.jungle, C.jungleDark));
reg('coal_ore', p => ore(p, [38, 38, 38]));
reg('iron_ore', p => ore(p, [216, 174, 145]));
reg('gold_ore', p => ore(p, [250, 220, 70]));
reg('diamond_ore', p => ore(p, [92, 219, 213]));
reg('glowdust_ore', p => ore(p, [255, 140, 40], 1.1));
reg('beryl_ore', p => ore(p, [23, 221, 98]));
reg('azure_ore', p => ore(p, [38, 97, 214]));
reg('crafting_top', p => { planks(p, C.oak, C.oakDark); for (let i = 0; i < TILE; i++) { p.set(i, 0, C.oakDark); p.set(i, 15, C.oakDark); p.set(0, i, C.oakDark); p.set(15, i, C.oakDark); } p.rect(4, 4, 8, 8, sh(C.oak, 1.15)); p.rect(7, 4, 1, 8, C.oakDark); p.rect(4, 7, 8, 1, C.oakDark); });
reg('crafting_side', p => { planks(p, C.oak, C.oakDark); p.rect(2, 2, 4, 3, [120, 120, 130]); p.rect(9, 2, 5, 3, [160, 120, 80]); });
reg('furnace_top', p => { p.noise(sh(C.stone, 0.9), 0.08); p.rect(1, 1, 14, 14, sh(C.stone, 1.05)); p.rect(3, 3, 10, 10, sh(C.stone, 0.85)); });
reg('furnace_side', p => { p.noise(C.stone, 0.1); p.rect(0, 0, 16, 1, sh(C.stone, 0.7)); p.rect(0, 15, 16, 1, sh(C.stone, 0.7)); p.speck(sh(C.stone, 0.75), 18); });
reg('furnace_front', p => { PAINT['furnace_side'](p); p.rect(4, 6, 8, 7, [35, 35, 35]); p.rect(4, 5, 8, 1, sh(C.stone, 0.6)); });
reg('furnace_front_lit', p => { PAINT['furnace_front'](p); p.rect(5, 8, 6, 4, [252, 160, 40]); p.set(6, 7, [255, 220, 90]); p.set(9, 7, [255, 220, 90]); p.set(7, 12, [200, 60, 10]); });
reg('chest_top', p => { p.noise(C.oak, 0.1); for (let i = 0; i < TILE; i++) { p.set(i, 0, C.oakDark); p.set(i, 15, C.oakDark); p.set(0, i, C.oakDark); p.set(15, i, C.oakDark); } });
reg('chest_side', p => { PAINT['chest_top'](p); p.rect(0, 7, 16, 1, C.oakDark); });
reg('chest_front', p => { PAINT['chest_side'](p); p.rect(7, 5, 2, 4, [140, 140, 140]); p.set(7, 6, [90, 90, 90]); });
reg('torch', p => { p.fill([0, 0, 0], 0); p.rect(7, 6, 2, 10, [146, 116, 74]); p.rect(7, 4, 2, 2, [255, 220, 120]); p.rect(7, 3, 2, 1, [255, 255, 200]); });
reg('glass', p => { p.fill([0, 0, 0], 0); for (let i = 0; i < TILE; i++) { p.set(i, 0, [220, 235, 240]); p.set(i, 15, [220, 235, 240]); p.set(0, i, [220, 235, 240]); p.set(15, i, [220, 235, 240]); } p.set(3, 2, [235, 245, 250]); p.set(4, 3, [235, 245, 250]); p.set(2, 3, [235, 245, 250]); p.set(12, 11, [200, 220, 230]); });
reg('bricks', p => { p.noise([188, 152, 138], 0.06); for (let y = 0; y < TILE; y += 4) for (let x = ((y / 4) % 2) * 4 - 4; x < TILE; x += 8) p.rect(x + 1, y + 1, 6, 2, sh(C.brick, 0.9 + p.r() * 0.25)); });
reg('sandstone', p => { p.noise(C.sand, 0.05); p.rect(0, 0, 16, 2, sh(C.sand, 1.08)); p.rect(0, 12, 16, 2, sh(C.sand, 0.9)); p.speck(sh(C.sand, 0.8), 8); });
reg('sandstone_top', p => { p.noise(C.sand, 0.04); p.rect(1, 1, 14, 14, sh(C.sand, 1.04)); });
reg('snow', p => { p.noise(C.snow, 0.04); p.speck([210, 224, 235], 8); });
reg('ice', p => { p.noise([160, 200, 245], 0.06, 235); p.rect(3, 3, 1, 4, [220, 240, 255], 235); p.rect(10, 8, 1, 5, [220, 240, 255], 235); });
reg('cactus_top', p => { p.noise([96, 148, 66], 0.1); p.rect(4, 4, 8, 8, [116, 168, 82]); });
reg('cactus_side', p => { p.noise([96, 148, 66], 0.1); for (let x = 2; x < TILE; x += 4) for (let y = 0; y < TILE; y++) p.set(x, y, [70, 116, 48]); p.speck([230, 240, 200], 6); });
reg('tall_grass', p => { p.fill([0, 0, 0], 0); for (let i = 0; i < 7; i++) { const x = 1 + (p.r() * 14 | 0), h = 5 + (p.r() * 9 | 0); for (let y = 0; y < h; y++) p.set(x + (y > h / 2 ? (p.r() < 0.2 ? 1 : 0) : 0), 15 - y, sh([88, 152, 58], 0.8 + p.r() * 0.4)); } });
reg('poppy', p => { p.fill([0, 0, 0], 0); p.rect(7, 8, 1, 8, [64, 120, 40]); p.set(6, 11, [64, 120, 40]); p.blob(7, 5, 2, [200, 40, 30]); p.set(7, 5, [60, 10, 10]); });
reg('dandelion', p => { p.fill([0, 0, 0], 0); p.rect(7, 8, 1, 8, [64, 120, 40]); p.blob(7, 5, 2, [242, 205, 35]); p.set(7, 5, [255, 240, 130]); });
reg('brown_mushroom', p => { p.fill([0, 0, 0], 0); p.rect(7, 9, 2, 7, [200, 190, 170]); p.rect(4, 6, 8, 3, [140, 100, 65]); p.rect(5, 5, 6, 1, [140, 100, 65]); });
reg('red_mushroom', p => { p.fill([0, 0, 0], 0); p.rect(7, 9, 2, 7, [220, 215, 200]); p.rect(4, 6, 8, 3, [190, 40, 35]); p.rect(5, 5, 6, 1, [190, 40, 35]); p.set(6, 6, [240, 240, 240]); p.set(10, 7, [240, 240, 240]); });
reg('dead_bush', p => { p.fill([0, 0, 0], 0); p.rect(7, 8, 1, 8, [122, 86, 44]); for (const [x, y, l] of [[5, 6, 3], [9, 5, 4], [3, 9, 3], [11, 9, 3]]) for (let i = 0; i < l; i++) p.set(x + (x < 7 ? -i : i) * 0.6 | 0, y + i, [122, 86, 44]); });
reg('clay', p => { p.noise(C.clay, 0.06); p.speck(sh(C.clay, 0.85), 10); });
reg('stone_bricks', p => { p.noise(sh(C.stone, 0.95), 0.06); for (const [x, y] of [[0, 0], [8, 0], [4, 8], [12, 8], [-4, 8]]) { p.rect(x + 1, y + 1, 6, 6, sh(C.stone, 0.95 + p.r() * 0.2)); } for (let i = 0; i < TILE; i++) { p.set(i, 0, sh(C.stone, 0.6)); p.set(i, 8, sh(C.stone, 0.6)); } for (let y = 0; y < 8; y++) { p.set(0, y, sh(C.stone, 0.6)); p.set(8, y, sh(C.stone, 0.6)); p.set(4, y + 8, sh(C.stone, 0.6)); p.set(12, y + 8, sh(C.stone, 0.6)); } });
reg('glowlamp', p => { p.noise([220, 170, 90], 0.12); for (let y = 2; y < 16; y += 5) for (let x = 2; x < 16; x += 5) p.blob(x, y, 1, [255, 235, 160]); });
reg('obsidian', p => { p.noise(C.obsidian, 0.25); p.speck([90, 60, 130], 8); p.speck([10, 8, 16], 12); });
reg('bed_top', p => { p.noise([170, 40, 36], 0.08); p.rect(0, 0, 16, 4, [235, 235, 235]); p.rect(0, 4, 16, 1, [120, 20, 18]); });
reg('bed_side', p => { p.noise([170, 40, 36], 0.08); p.rect(0, 10, 16, 6, C.oakDark); p.rect(0, 0, 16, 3, [235, 235, 235]); });
reg('ladder', p => { p.fill([0, 0, 0], 0); p.rect(2, 0, 2, 16, C.oak); p.rect(12, 0, 2, 16, C.oak); p.rect(2, 2, 12, 2, sh(C.oak, 1.1)); p.rect(2, 9, 12, 2, sh(C.oak, 1.1)); });
reg('bookshelf', p => { planks(p, C.oak, C.oakDark); const cols = [[170, 60, 50], [60, 90, 160], [80, 140, 70], [200, 170, 70], [140, 80, 150]]; for (let row = 0; row < 2; row++) { let x = 1; while (x < 15) { const w = 1 + (p.r() * 2 | 0); p.rect(x, 2 + row * 7, w, 5, cols[p.r() * cols.length | 0]); x += w + (p.r() < 0.3 ? 1 : 0); } } });
for (const [name, col] of Object.entries(WOOL))
  reg('wool_' + name, p => { p.noise(col, 0.09); for (let i = 0; i < 6; i++) p.rect(p.r() * 14 | 0, p.r() * 14 | 0, 2, 1, sh(col, 0.9)); });
reg('cherry_log', p => logSide(p, [92, 58, 62], [58, 34, 40]));
reg('cherry_log_top', p => logTop(p, [92, 58, 62], [58, 34, 40]));
reg('cherry_leaves', p => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (p.r() < 0.08) { p.set(x, y, [0, 0, 0], 0); continue; }
    p.set(x, y, sh([238, 168, 196], 0.8 + p.r() * 0.4));
  }
  p.speck([250, 220, 235], 14); p.speck([210, 120, 160], 10);
});
reg('cherry_planks', p => planks(p, [196, 136, 148], [130, 80, 92]));
reg('acacia_log', p => logSide(p, [116, 104, 96], [80, 70, 64]));
reg('acacia_log_top', p => logTop(p, [186, 100, 60], [116, 104, 96]));
reg('acacia_leaves', p => leaves(p, [110, 138, 52]));
reg('acacia_planks', p => planks(p, [186, 100, 60], [128, 66, 38]));
reg('lantern', p => {
  p.fill([0, 0, 0], 0);
  p.rect(4, 3, 8, 10, [66, 60, 62]);
  p.rect(5, 4, 6, 8, [255, 214, 120]);
  p.rect(6, 6, 4, 4, [255, 240, 190]);
  p.rect(6, 1, 4, 2, [66, 60, 62]);
  p.rect(7, 0, 2, 1, [90, 84, 86]);
  for (let y = 4; y < 12; y += 2) { p.set(4, y, [50, 46, 48]); p.set(11, y, [50, 46, 48]); }
});
reg('pink_tulip', p => { p.fill([0, 0, 0], 0); p.rect(7, 8, 1, 8, [64, 120, 40]); p.set(5, 10, [64, 120, 40]); p.rect(6, 4, 3, 4, [240, 150, 185]); p.rect(7, 3, 1, 1, [250, 190, 215]); });
reg('cornflower', p => { p.fill([0, 0, 0], 0); p.rect(7, 8, 1, 8, [64, 120, 40]); p.set(9, 11, [64, 120, 40]); p.blob(7, 5, 2, [70, 105, 215]); p.set(7, 5, [40, 60, 150]); });
reg('pumpkin_top', p => { p.noise([196, 116, 40], 0.1); p.blob(8, 8, 2, [110, 140, 60]); p.set(8, 8, [80, 105, 45]); });
reg('farmland', p => { p.noise([96, 66, 44], 0.14); for (let x = 1; x < TILE; x += 3) for (let y = 0; y < TILE; y++) p.set(x, y, [64, 42, 26]); p.speck([120, 86, 58], 8); });
reg('wheat_0', p => { p.fill([0, 0, 0], 0); for (let i = 0; i < 6; i++) { const x = 2 + (p.r() * 12 | 0); for (let y = 0; y < 4; y++) p.set(x, 15 - y, [96, 160, 66]); } });
reg('wheat_1', p => { p.fill([0, 0, 0], 0); for (let i = 0; i < 7; i++) { const x = 1 + (p.r() * 14 | 0); for (let y = 0; y < 8 + (p.r() * 3 | 0); y++) p.set(x, 15 - y, sh([140, 168, 70], 0.85 + p.r() * 0.3)); } });
reg('wheat_2', p => { p.fill([0, 0, 0], 0); for (let i = 0; i < 8; i++) { const x = 1 + (p.r() * 14 | 0); const h = 11 + (p.r() * 4 | 0); for (let y = 0; y < h; y++) p.set(x, 15 - y, sh([200, 172, 74], 0.85 + p.r() * 0.3)); p.set(x, 15 - h, [222, 196, 96]); p.set(x + (p.r() < 0.5 ? 1 : -1), 16 - h, [222, 196, 96]); } });
const SAP_COLORS = { oak: [64, 132, 38], birch: [114, 160, 74], spruce: [45, 96, 62], jungle: [52, 148, 48], cherry: [238, 168, 196], acacia: [110, 138, 52] };
for (const [sp, col] of Object.entries(SAP_COLORS)) reg(sp + '_sapling', p => {
  p.fill([0, 0, 0], 0);
  p.rect(7, 9, 2, 7, [104, 78, 50]);
  p.blob(8, 6, 3, col); p.blob(6, 8, 2, sh(col, 0.85)); p.blob(10, 8, 2, sh(col, 1.1));
});
reg('pumpkin_side', p => {
  p.noise([214, 126, 44], 0.08);
  for (let x = 2; x < TILE; x += 4) for (let y = 0; y < TILE; y++) p.set(x, y, [178, 100, 32]);
  p.rect(0, 0, 16, 1, [160, 92, 30]); p.rect(0, 15, 16, 1, [160, 92, 30]);
});

// crack overlay stages 0-9
for (let s = 0; s < 10; s++) reg('crack' + s, p => {
  p.fill([0, 0, 0], 0);
  const segs = 3 + s * 2;
  for (let i = 0; i < segs; i++) {
    let x = p.r() * 16 | 0, y = p.r() * 16 | 0;
    const len = 3 + s;
    for (let j = 0; j < len; j++) {
      p.set(x, y, [20, 20, 20], 200);
      x += (p.r() * 3 | 0) - 1; y += (p.r() * 3 | 0) - 1;
    }
  }
});

// ---------------------------------------------------------------
// atlas build
// ---------------------------------------------------------------
let atlasData = null;
export function buildAtlas() {
  if (atlasData) return atlasData;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * ATLAS;
  const ctx = canvas.getContext('2d');
  const tiles = new Map();
  let idx = 0;
  for (const name of Object.keys(PAINT)) {
    const p = new P(mulberry32(hashString(name)));
    PAINT[name](p);
    const tx = idx % ATLAS, ty = (idx / ATLAS) | 0;
    ctx.putImageData(new ImageData(p.d, TILE, TILE), tx * TILE, ty * TILE);
    tiles.set(name, [tx, ty]);
    idx++;
  }
  atlasData = { canvas, tiles };
  return atlasData;
}

export function tileFor(blockId, face) {
  // face: 0 +x, 1 -x, 2 +y(top), 3 -y(bottom), 4 +z, 5 -z
  const t = BLOCKS[blockId].tex;
  let name;
  if (t.all) name = t.all;
  else if (face === 2) name = t.top;
  else if (face === 3) name = t.bottom;
  else if (face === 4 && t.front) name = t.front;
  else name = t.side;
  return buildAtlas().tiles.get(name) || buildAtlas().tiles.get('stone');
}

// ---------------------------------------------------------------
// item icons (pixel string art)
// ---------------------------------------------------------------
function art(rows, colors) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(16, 16);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ' ' || ch === '.') continue;
      const c = colors[ch]; if (!c) continue;
      const i = (y * 16 + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  });
  cx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

const TOOL_ART = {
  pickaxe: ['..MMMMMMM.......', '.MM.....MMM.....', 'MM........MM....', 'M.....HH...M....', '.....HH.....M...', '....HH......M...', '...HH...........', '..HH............', '.HH.............', 'HH..............'],
  axe: ['....MMMM........', '...MMMMMM.......', '...MM.HHMM......', '......HH.MM.....', '.....HH.........', '....HH..........', '...HH...........', '..HH............', '.HH.............', 'HH..............'],
  shovel: ['.........MMM....', '........MMMM....', '.......HMMMM....', '......HH.MM.....', '.....HH.........', '....HH..........', '...HH...........', '..HH............', '.HH.............', 'HH..............'],
  sword: ['..........MM....', '.........MMM....', '........MMM.....', '.......MMM......', '......MMM.......', '.....MMM........', '.HH.MMM.........', '..HHMM..........', '..HHH...........', '.HH.HH..........'],
  hoe: ['......MMMMM.....', '.....MM..MM.....', '.....HH.........', '....HH..........', '...HH...........', '..HH............', '.HH.............', 'HH..............'],
};
const ARMOR_ART = {
  helmet: ['................', '....MMMMMMMM....', '...MMMMMMMMMM...', '...MM......MM...', '...MM......MM...', '...MM......MM...'],
  chestplate: ['..MM......MM....', '..MMM....MMM....', '..MMMMMMMMMM....', '..MMMMMMMMMM....', '...MMMMMMMM.....', '...MMMMMMMM.....', '...MMMMMMMM.....', '...MMMMMMMM.....'],
  leggings: ['...MMMMMMMM.....', '...MMMMMMMM.....', '...MMM..MMM.....', '...MMM..MMM.....', '...MMM..MMM.....', '...MMM..MMM.....', '...MMM..MMM.....'],
  boots: ['................', '................', '...MM....MM.....', '...MM....MM.....', '...MMM...MMM....', '...MMMM..MMMM...'],
};
const ITEM_ART = {
  stick: () => art(['..............', '..........HH..', '.........HH...', '........HH....', '.......HH.....', '......HH......', '.....HH.......', '....HH........', '...HH.........', '..HH..........'], { H: MAT.wood }),
  coal: () => art(['....CCCC....', '...CCCCCC...', '..CCCCCCCC..', '..CCCcCCCC..', '...CCCCCC...', '....CCCC....'].map(r => '..' + r), { C: [45, 45, 45], c: [80, 80, 80] }),
  ingot: c => art(['................', '................', '.....IIIIIII....', '....IiiiiiII....', '...IiiiiiII.....', '...IIIIIII......'], { I: sh(c, 0.8), i: c }),
  gem: c => art(['....GGGG....', '...GgggGG...', '..GggggGGG..', '...GgGGGG...', '....GGGG....', '.....GG.....'].map(r => '..' + r), { G: sh(c, 0.8), g: c }),
  dust: c => art(['................', '................', '......d.d.......', '....ddddddd.....', '...ddddddddd....', '...ddddddddd....'], { d: c }),
  meat: (raw, c1, c2) => art(['....MMMMMM......', '...MMmmmmMM.....', '...MmmmmmmM.....', '...MmmmmmmMM....', '...MMmmmmmM.....', '....MMMMMM......'], { M: c1, m: c2 }),
  drumstick: () => art(['.....MMMM.......', '....MMmmMM......', '....MmmmmM......', '.....MmmM.......', '......MM........', '.......BB.......', '........BB..b...', '.........BBb....'], { M: [188, 122, 66], m: [222, 160, 100], B: [235, 228, 210], b: [235, 228, 210] }),
  apple: () => art(['.......H........', '......H.........', '....RRRRR.......', '...RRrRRRR......', '...RRrRRRR......', '...RRRRRRR......', '....RRRRR.......'], { R: [196, 40, 34], r: [240, 120, 100], H: [90, 60, 30] }),
  flint: () => art(['....FF..........', '...FFFF.........', '..FFFFFF........', '..FFFFF.........', '...FFF..........'].map(r => '..' + r), { F: [55, 55, 60] }),
  string: () => art(['..SS......SS....', '...SS....SS.....', '....SSSSSS......', '...SS....SS.....', '..SS......SS....'], { S: [230, 230, 230] }),
  feather: () => art(['........FF......', '......FFFF......', '.....FFFF.......', '....FFFF........', '...FFFF.........', '..HFF...........', '.HH.............'], { F: [240, 240, 245], H: [150, 150, 160] }),
  leather: () => art(['...LLLLLLL......', '..LLLLLLLLL.....', '..LLLlLLLLL.....', '..LLLLLLlLL.....', '...LLLLLLL......'], { L: [166, 106, 62], l: [190, 130, 80] }),
  bone: () => art(['..BB.......BB...', '.BBBB.....BBBB..', '..BBBBBBBBBBB...', '.BBBB.....BBBB..', '..BB.......BB...'], { B: [235, 232, 220] }),
  gunpowder: () => art(['................', '......g.g.......', '....ggggggg.....', '...gggggGggg....', '...ggGgggggg....'], { g: [70, 70, 70], G: [110, 110, 110] }),
  egg: () => art(['.....EEE........', '....EEEEE.......', '...EEEeEEE......', '...EEEEEEE......', '....EEEEE.......'], { E: [238, 226, 200], e: [250, 245, 230] }),
  arrow: () => art(['..........WW....', '.........WWW....', '........SWW.....', '.......SS.......', '......SS........', '.....SS.........', '..FFSS..........', '..FFF...........', '..F.............'], { W: [200, 200, 205], S: [146, 116, 74], F: [240, 240, 245] }),
  bow: () => art(['....BBB.........', '...B...B........', '..B.....B.......', '..B......B......', '..S.......B.....', '..B......B......', '..B.....B.......', '...B...B........', '....BBB.........'], { B: [122, 92, 54], S: [230, 230, 230] }),
  rotten_flesh: () => art(['...RRGGRR.......', '..RRGgGRRR......', '..RGGRRRGR......', '..RRRGGRRR......', '...RRRRGG.......'], { R: [150, 80, 60], G: [110, 130, 60], g: [140, 160, 80] }),
  wheat_seeds: () => art(['....s..s........', '..s..s...s......', '....s..s..s.....', '..s...s.........'], { s: [120, 168, 60] }),
  wheat: () => art(['..W.W.W.W.......', '..W.W.W.W.......', '..W.W.W.W.......', '..w.w.w.w.......', '..w.w.w.w.......', '..w.w.w.w.......'], { W: [222, 196, 96], w: [180, 150, 66] }),
  bread: () => art(['....BBBBBB......', '..BBBbbbbBB.....', '..BbbbbbbbB.....', '..BBbbbbbBB.....', '....BBBBBB......'], { B: [156, 104, 48], b: [214, 160, 92] }),
};

const iconCache = new Map();
export function iconFor(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  let url;
  if (id < 256) {
    const t = BLOCKS[id].tex;
    const name = t.all || t.side || t.top;
    const { canvas, tiles } = buildAtlas();
    const [tx, ty] = tiles.get(name);
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    cv.getContext('2d').drawImage(canvas, tx * TILE, ty * TILE, TILE, TILE, 0, 0, 16, 16);
    url = cv.toDataURL();
  } else {
    const def = ITEMS[id];
    const n = def.name;
    if (ITEM_ART[n]) url = ITEM_ART[n]();
    else if (n.endsWith('_ingot') || n === 'raw_iron' || n === 'raw_gold') {
      const c = n.includes('gold') ? MAT.gold : (n === 'raw_iron' ? [200, 170, 150] : MAT.iron);
      url = ITEM_ART.ingot(c);
    }
    else if (n === 'diamond') url = ITEM_ART.gem(MAT.diamond);
    else if (n === 'beryl') url = ITEM_ART.gem([23, 221, 98]);
    else if (n === 'azure_gem') url = ITEM_ART.gem([38, 97, 214]);
    else if (n === 'glowdust') url = ITEM_ART.dust([255, 170, 60]);
    else if (n.startsWith('raw_') && def.food) url = ITEM_ART.meat(true, [190, 90, 80], [235, 150, 140]);
    else if (n === 'steak' || n.startsWith('cooked_')) url = n.includes('chicken') ? ITEM_ART.drumstick() : ITEM_ART.meat(false, [120, 70, 45], [165, 105, 70]);
    else if (def.tool && TOOL_ART[def.tool.type]) {
      const mat = n.split('_')[0];
      url = art(TOOL_ART[def.tool.type], { M: MAT[mat] || MAT.iron, H: MAT.wood });
    }
    else if (def.armor) {
      const [mat, part] = n.split('_');
      url = art(ARMOR_ART[part], { M: MAT[mat] || MAT.iron });
    }
    else url = ITEM_ART.coal();
  }
  iconCache.set(id, url);
  return url;
}

// ---------------------------------------------------------------
// HUD icons
// ---------------------------------------------------------------
const HUD_ART = {
  heart: () => art(['..RR...RR.......', '.RRRR.RRRR......', '.RrRRRRRRR......', '.RRRRRRRRR......', '..RRRRRRR.......', '...RRRRR........', '....RRR.........', '.....R..........'], { R: [220, 40, 40], r: [255, 140, 140] }),
  heart_half: () => art(['..RR...ee.......', '.RRRR.e..e......', '.RrRRRe...e.....', '.RRRRRe...e.....', '..RRRRe..e......', '...RRRe.e.......', '....RRe.........', '.....R..........'], { R: [220, 40, 40], r: [255, 140, 140], e: [60, 60, 60] }),
  heart_empty: () => art(['..ee...ee.......', '.e..e.e..e......', '.e...e....e.....', '.e........e.....', '..e......e......', '...e....e.......', '....e..e........', '.....ee.........'], { e: [60, 60, 60] }),
  food: () => art(['.....MMMM.......', '....MMmmMM......', '....MmmmmM......', '.....MmmM.......', '......MM........', '.......BB.......', '........BB......', '.........B......'], { M: [188, 122, 66], m: [222, 160, 100], B: [235, 228, 210] }),
  food_empty: () => art(['.....eeee.......', '....e....e......', '....e....e......', '.....e..e.......', '......ee........', '.......ee.......', '........ee......', '.........e......'], { e: [70, 60, 50] }),
  armor: () => art(['..AA......AA....', '..AAAAAAAAAA....', '..AAAAAAAAAA....', '...AAAAAAAA.....', '...AAAAAAAA.....', '....AAAAAA......'], { A: [200, 200, 210] }),
  armor_empty: () => art(['..ee......ee....', '..e.e....e.e....', '..e..eeee..e....', '...e......e.....', '...e......e.....', '....eeeeee......'], { e: [70, 70, 75] }),
  bubble: () => art(['....BBBB........', '...B....B.......', '..B.....bB......', '..B......B......', '...B....B.......', '....BBBB........'], { B: [120, 180, 240], b: [200, 230, 255] }),
};
const hudCache = new Map();
export function hudIcon(name) {
  if (!hudCache.has(name)) hudCache.set(name, HUD_ART[name]());
  return hudCache.get(name);
}
