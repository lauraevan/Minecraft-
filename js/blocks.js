// ---------------------------------------------------------------
// blocks.js — block registry, item registry, recipes, smelting
// ---------------------------------------------------------------
// Block ids are < 256 (stored in chunk Uint8Arrays). Item ids >= 256.

export const AIR = 0;

// tool tiers: 0 hand, 1 wood, 2 stone, 3 iron, 4 diamond (gold = tier 1, fast)
const B = [];
function blk(id, name, disp, opts = {}) {
  B[id] = Object.assign({
    id, name, disp,
    hard: 1,            // base seconds to mine by hand
    tool: null,         // preferred tool type
    tier: 0,            // min tool tier for drops
    needsTool: false,   // if true, no drops without proper tool tier
    transparent: false, // light passes / faces drawn against it
    solid: true,        // collision
    cross: false,       // drawn as X-plant
    fluid: false,
    climbable: false,
    emit: 0,            // light emission 0-15
    tex: { all: name }, // texture painter names
    drops: undefined,   // undefined => drops itself; [] => nothing; fn(rand)=>[{id,n}]
    sound: 'stone',
  }, opts);
}

blk(0, 'air', 'Air', { solid: false, transparent: true, hard: 0 });
blk(1, 'stone', 'Stone', { hard: 1.5, tool: 'pickaxe', tier: 1, needsTool: true, drops: [{ id: 4, n: 1 }] });
blk(2, 'grass', 'Grass Block', { hard: 0.6, tool: 'shovel', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, drops: [{ id: 3, n: 1 }], sound: 'grass' });
blk(3, 'dirt', 'Dirt', { hard: 0.5, tool: 'shovel', sound: 'gravel' });
blk(4, 'cobblestone', 'Cobblestone', { hard: 2, tool: 'pickaxe', tier: 1, needsTool: true });
blk(5, 'sand', 'Sand', { hard: 0.5, tool: 'shovel', sound: 'sand' });
blk(6, 'gravel', 'Gravel', { hard: 0.6, tool: 'shovel', sound: 'gravel', drops: r => [r() < 0.15 ? { id: 266, n: 1 } : { id: 6, n: 1 }] });
blk(7, 'bedrock', 'Bedrock', { hard: -1 });
blk(8, 'water', 'Water', { hard: -1, solid: false, transparent: true, fluid: true, sound: 'none' });
blk(9, 'lava', 'Lava', { hard: -1, solid: false, transparent: true, fluid: true, emit: 15, sound: 'none' });
blk(10, 'oak_log', 'Oak Log', { hard: 2, tool: 'axe', tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, sound: 'wood' });
blk(11, 'oak_leaves', 'Oak Leaves', { hard: 0.25, transparent: true, sound: 'grass', drops: r => { const d = []; if (r() < 0.05) d.push({ id: 270, n: 1 }); if (r() < 0.06) d.push({ id: 79, n: 1 }); return d; } });
blk(12, 'oak_planks', 'Oak Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(13, 'birch_log', 'Birch Log', { hard: 2, tool: 'axe', tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' }, sound: 'wood' });
blk(14, 'birch_leaves', 'Birch Leaves', { hard: 0.25, transparent: true, sound: 'grass', drops: r => r() < 0.06 ? [{ id: 80, n: 1 }] : [] });
blk(15, 'birch_planks', 'Birch Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(16, 'spruce_log', 'Spruce Log', { hard: 2, tool: 'axe', tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, sound: 'wood' });
blk(17, 'spruce_leaves', 'Spruce Leaves', { hard: 0.25, transparent: true, sound: 'grass', drops: r => r() < 0.06 ? [{ id: 81, n: 1 }] : [] });
blk(18, 'spruce_planks', 'Spruce Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(19, 'coal_ore', 'Coal Ore', { hard: 3, tool: 'pickaxe', tier: 1, needsTool: true, drops: [{ id: 257, n: 1 }] });
blk(20, 'iron_ore', 'Iron Ore', { hard: 3, tool: 'pickaxe', tier: 2, needsTool: true, drops: [{ id: 258, n: 1 }] });
blk(21, 'gold_ore', 'Gold Ore', { hard: 3, tool: 'pickaxe', tier: 3, needsTool: true, drops: [{ id: 260, n: 1 }] });
blk(22, 'diamond_ore', 'Diamond Ore', { hard: 3, tool: 'pickaxe', tier: 3, needsTool: true, drops: [{ id: 262, n: 1 }] });
blk(23, 'glowdust_ore', 'Glowdust Ore', { hard: 3, tool: 'pickaxe', tier: 3, needsTool: true, emit: 4, drops: r => [{ id: 263, n: 2 + (r() * 3 | 0) }] });
blk(24, 'beryl_ore', 'Beryl Ore', { hard: 3, tool: 'pickaxe', tier: 3, needsTool: true, drops: [{ id: 265, n: 1 }] });
blk(25, 'azure_ore', 'Azure Ore', { hard: 3, tool: 'pickaxe', tier: 2, needsTool: true, drops: r => [{ id: 264, n: 2 + (r() * 4 | 0) }] });
blk(26, 'crafting_table', 'Crafting Table', { hard: 2.5, tool: 'axe', tex: { top: 'crafting_top', bottom: 'oak_planks', side: 'crafting_side' }, sound: 'wood' });
blk(27, 'furnace', 'Furnace', { hard: 3.5, tool: 'pickaxe', tier: 1, needsTool: true, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' } });
blk(28, 'furnace_lit', 'Furnace', { hard: 3.5, tool: 'pickaxe', tier: 1, needsTool: true, emit: 13, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, drops: [{ id: 27, n: 1 }] });
blk(29, 'chest', 'Chest', { hard: 2.5, tool: 'axe', tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, sound: 'wood' });
blk(30, 'torch', 'Torch', { hard: 0.05, solid: false, transparent: true, cross: true, emit: 14, sound: 'wood' });
blk(31, 'glass', 'Glass', { hard: 0.4, transparent: true, drops: [], sound: 'glass' });
blk(32, 'bricks', 'Bricks', { hard: 2, tool: 'pickaxe', tier: 1, needsTool: true });
blk(33, 'sandstone', 'Sandstone', { hard: 1, tool: 'pickaxe', tier: 1, needsTool: true, tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' } });
blk(34, 'snow_grass', 'Snowy Grass', { hard: 0.6, tool: 'shovel', tex: { top: 'snow', bottom: 'dirt', side: 'snow_grass_side' }, drops: [{ id: 3, n: 1 }], sound: 'snow' });
blk(35, 'snow_block', 'Snow Block', { hard: 0.3, tool: 'shovel', tex: { all: 'snow' }, sound: 'snow' });
blk(36, 'ice', 'Ice', { hard: 0.6, tool: 'pickaxe', transparent: true, drops: [], sound: 'glass' });
blk(37, 'cactus', 'Cactus', { hard: 0.5, tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, sound: 'wool' });
blk(38, 'tall_grass', 'Tall Grass', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass', drops: r => r() < 0.35 ? [{ id: 285, n: 1 }] : [] });
blk(39, 'poppy', 'Poppy', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(40, 'dandelion', 'Dandelion', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(41, 'brown_mushroom', 'Brown Mushroom', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(42, 'red_mushroom', 'Red Mushroom', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(43, 'dead_bush', 'Dead Bush', { hard: 0.05, solid: false, transparent: true, cross: true, drops: [{ id: 256, n: 2 }], sound: 'grass' });
blk(44, 'clay', 'Clay', { hard: 0.6, tool: 'shovel', sound: 'gravel' });
blk(45, 'stone_bricks', 'Stone Bricks', { hard: 2, tool: 'pickaxe', tier: 1, needsTool: true });
blk(46, 'mossy_cobblestone', 'Mossy Cobblestone', { hard: 2, tool: 'pickaxe', tier: 1, needsTool: true });
blk(47, 'glowlamp', 'Glowlamp', { hard: 0.4, emit: 15, sound: 'glass' });
blk(48, 'obsidian', 'Obsidian', { hard: 25, tool: 'pickaxe', tier: 4, needsTool: true });
blk(49, 'bed', 'Bed', { hard: 0.4, tex: { top: 'bed_top', bottom: 'oak_planks', side: 'bed_side' }, sound: 'wool' });
blk(50, 'ladder', 'Ladder', { hard: 0.5, tool: 'axe', solid: false, transparent: true, cross: true, climbable: true, sound: 'wood' });
const WOOL_COLORS = ['white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black'];
WOOL_COLORS.forEach((c, i) => blk(51 + i, c + '_wool', c[0].toUpperCase() + c.slice(1) + ' Wool', { hard: 0.9, tex: { all: 'wool_' + c }, sound: 'wool' }));
blk(59, 'jungle_log', 'Jungle Log', { hard: 2, tool: 'axe', tex: { top: 'jungle_log_top', bottom: 'jungle_log_top', side: 'jungle_log' }, sound: 'wood' });
blk(60, 'jungle_leaves', 'Jungle Leaves', { hard: 0.25, transparent: true, sound: 'grass', drops: r => r() < 0.05 ? [{ id: 82, n: 1 }] : [] });
blk(61, 'jungle_planks', 'Jungle Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(62, 'bookshelf', 'Bookshelf', { hard: 1.5, tool: 'axe', tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, sound: 'wood' });
blk(63, 'granite', 'Granite', { hard: 1.5, tool: 'pickaxe', tier: 1, needsTool: true });
blk(64, 'diorite', 'Diorite', { hard: 1.5, tool: 'pickaxe', tier: 1, needsTool: true });
blk(65, 'cherry_log', 'Cherry Log', { hard: 2, tool: 'axe', tex: { top: 'cherry_log_top', bottom: 'cherry_log_top', side: 'cherry_log' }, sound: 'wood' });
blk(66, 'cherry_leaves', 'Cherry Blossoms', { hard: 0.25, transparent: true, sound: 'grass', drops: r => r() < 0.06 ? [{ id: 83, n: 1 }] : [] });
blk(67, 'cherry_planks', 'Cherry Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(68, 'acacia_log', 'Acacia Log', { hard: 2, tool: 'axe', tex: { top: 'acacia_log_top', bottom: 'acacia_log_top', side: 'acacia_log' }, sound: 'wood' });
blk(69, 'acacia_leaves', 'Acacia Leaves', { hard: 0.25, transparent: true, sound: 'grass', drops: r => r() < 0.06 ? [{ id: 84, n: 1 }] : [] });
blk(70, 'acacia_planks', 'Acacia Planks', { hard: 2, tool: 'axe', sound: 'wood' });
blk(71, 'lantern', 'Lantern', { hard: 0.8, tool: 'pickaxe', emit: 15, transparent: true, sound: 'stone' });
blk(72, 'pink_tulip', 'Pink Tulip', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(73, 'cornflower', 'Cornflower', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass' });
blk(74, 'pumpkin', 'Pumpkin', { hard: 1, tool: 'axe', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, sound: 'wood' });
blk(75, 'farmland', 'Farmland', { hard: 0.6, tool: 'shovel', tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, drops: [{ id: 3, n: 1 }], sound: 'gravel' });
blk(76, 'wheat_0', 'Wheat', { hard: 0.05, solid: false, transparent: true, cross: true, drops: [{ id: 285, n: 1 }], sound: 'grass' });
blk(77, 'wheat_1', 'Wheat', { hard: 0.05, solid: false, transparent: true, cross: true, drops: [{ id: 285, n: 1 }], sound: 'grass' });
blk(78, 'wheat_2', 'Wheat', { hard: 0.05, solid: false, transparent: true, cross: true, sound: 'grass', drops: r => [{ id: 286, n: 1 }, { id: 285, n: 1 + (r() * 2 | 0) }] });
const SAPS = ['oak', 'birch', 'spruce', 'jungle', 'cherry', 'acacia'];
SAPS.forEach((s, i) => blk(79 + i, s + '_sapling', s[0].toUpperCase() + s.slice(1) + ' Sapling',
  { hard: 0.05, solid: false, transparent: true, cross: true, tex: { all: s + '_sapling' }, sound: 'grass' }));
export const SAPLINGS = [79, 80, 81, 82, 83, 84]; // index = tree species
blk(85, 'enchanting_table', 'Enchanting Table', { hard: 4, tool: 'pickaxe', tier: 1, needsTool: true, emit: 6, tex: { top: 'enchant_top', bottom: 'obsidian', side: 'enchant_side' } });

export const BLOCKS = B;
export const LOGS = [10, 13, 16, 59, 65, 68];
export const PLANKS = [12, 15, 18, 61, 67, 70];
export const LEAVES = [11, 14, 17, 60, 66, 69];

// ---------------------------------------------------------------
// Items (id >= 256)
// ---------------------------------------------------------------
export const ITEMS = {};
function itm(id, name, disp, opts = {}) {
  ITEMS[id] = Object.assign({ id, name, disp, stack: 64 }, opts);
}

itm(256, 'stick', 'Stick');
itm(257, 'coal', 'Coal');
itm(258, 'raw_iron', 'Raw Iron');
itm(259, 'iron_ingot', 'Iron Ingot');
itm(260, 'raw_gold', 'Raw Gold');
itm(261, 'gold_ingot', 'Gold Ingot');
itm(262, 'diamond', 'Diamond');
itm(263, 'glowdust', 'Glowdust');
itm(264, 'azure_gem', 'Azure Gem');
itm(265, 'beryl', 'Beryl');
itm(266, 'flint', 'Flint');
itm(267, 'string', 'String');
itm(268, 'feather', 'Feather');
itm(269, 'leather', 'Leather');
itm(270, 'apple', 'Apple', { food: [4, 2.4] });
itm(271, 'raw_beef', 'Raw Beef', { food: [3, 1.8] });
itm(272, 'steak', 'Steak', { food: [8, 12.8] });
itm(273, 'raw_porkchop', 'Raw Porkchop', { food: [3, 1.8] });
itm(274, 'cooked_porkchop', 'Cooked Porkchop', { food: [8, 12.8] });
itm(275, 'raw_chicken', 'Raw Chicken', { food: [2, 1.2] });
itm(276, 'cooked_chicken', 'Cooked Chicken', { food: [6, 7.2] });
itm(277, 'raw_mutton', 'Raw Mutton', { food: [2, 1.2] });
itm(278, 'cooked_mutton', 'Cooked Mutton', { food: [6, 9.6] });
itm(279, 'bone', 'Bone');
itm(280, 'gunpowder', 'Gunpowder');
itm(281, 'rotten_flesh', 'Rotten Flesh', { food: [4, 0.8] });
itm(282, 'egg', 'Egg');
itm(283, 'arrow', 'Arrow');
itm(285, 'wheat_seeds', 'Wheat Seeds');
itm(286, 'wheat', 'Wheat');
itm(287, 'bread', 'Bread', { food: [5, 6] });
itm(288, 'golden_apple', 'Golden Apple', { food: [4, 9.6] });
itm(284, 'bow', 'Bow', { stack: 1, tool: { type: 'bow', tier: 0, speed: 1, dmg: 1, dur: 384 } });

// tools: [type, base dmg, dur, speed] per tier
const TOOL_SETS = [
  ['wood', 1, 60, 2, 4],
  ['stone', 2, 132, 4, 5],
  ['iron', 3, 251, 6, 6],
  ['gold', 1, 33, 12, 4],
  ['diamond', 4, 1562, 8, 7],
];
TOOL_SETS.forEach(([mat, tier, dur, speed, swordDmg], i) => {
  const base = 300 + i * 10;
  const cap = mat[0].toUpperCase() + mat.slice(1);
  itm(base + 0, mat + '_pickaxe', cap + ' Pickaxe', { stack: 1, tool: { type: 'pickaxe', tier, speed, dmg: swordDmg - 2, dur } });
  itm(base + 1, mat + '_axe', cap + ' Axe', { stack: 1, tool: { type: 'axe', tier, speed, dmg: swordDmg - 1, dur } });
  itm(base + 2, mat + '_shovel', cap + ' Shovel', { stack: 1, tool: { type: 'shovel', tier, speed, dmg: swordDmg - 2.5, dur } });
  itm(base + 3, mat + '_sword', cap + ' Sword', { stack: 1, tool: { type: 'sword', tier, speed: 1.5, dmg: swordDmg, dur } });
  itm(base + 4, mat + '_hoe', cap + ' Hoe', { stack: 1, tool: { type: 'hoe', tier, speed, dmg: 1, dur } });
});

// armor: slot 0 head, 1 chest, 2 legs, 3 feet
const ARMOR_SETS = [
  ['leather', [1, 3, 2, 1], 56],
  ['iron', [2, 6, 5, 2], 166],
  ['diamond', [3, 8, 6, 3], 364],
];
const ARMOR_PARTS = ['helmet', 'chestplate', 'leggings', 'boots'];
ARMOR_SETS.forEach(([mat, pts, dur], si) => {
  const cap = mat[0].toUpperCase() + mat.slice(1);
  ARMOR_PARTS.forEach((part, pi) => {
    itm(358 + si * 4 + pi, mat + '_' + part, cap + ' ' + part[0].toUpperCase() + part.slice(1),
      { stack: 1, armor: { slot: pi, points: pts[pi], dur } });
  });
});

export function defOf(id) { return id < 256 ? BLOCKS[id] : ITEMS[id]; }

// ---------------------------------------------------------------
// Crafting recipes
// ---------------------------------------------------------------
// shaped: { out:[id,n], pattern:['XX','XX'], key:{X:id|array} }
// shapeless: { out:[id,n], ingredients:[id|array, ...] }
export const RECIPES = [];
function shaped(out, n, pattern, key) { RECIPES.push({ out: [out, n], pattern, key }); }
function shapeless(out, n, ingredients) { RECIPES.push({ out: [out, n], ingredients }); }

// planks from each log
shapeless(12, 4, [10]); shapeless(15, 4, [13]); shapeless(18, 4, [16]); shapeless(61, 4, [59]);
shapeless(67, 4, [65]); shapeless(70, 4, [68]);
shaped(71, 1, ['I', 'T'], { I: [259], T: [30] }); // lantern: iron ingot over torch
shaped(256, 4, ['P', 'P'], { P: PLANKS });                      // sticks
shaped(26, 1, ['PP', 'PP'], { P: PLANKS });                     // crafting table
shaped(27, 1, ['CCC', 'C C', 'CCC'], { C: [4, 46] });           // furnace
shaped(29, 1, ['PPP', 'P P', 'PPP'], { P: PLANKS });            // chest
shaped(30, 4, ['C', 'S'], { C: [257], S: [256] });              // torches
shaped(47, 1, ['GG', 'GG'], { G: [263] });                      // glowlamp
shaped(33, 4, ['SS', 'SS'], { S: [5] });                        // sandstone
shaped(45, 4, ['SS', 'SS'], { S: [1] });                        // stone bricks
shaped(32, 4, ['CC', 'CC'], { C: [44] });                       // bricks from clay
shaped(49, 1, ['WWW', 'PPP'], { W: [51,52,53,54,55,56,57,58], P: PLANKS }); // bed
shaped(50, 3, ['S S', 'SSS', 'S S'], { S: [256] });             // ladders
shaped(62, 1, ['PPP', 'SSS', 'PPP'], { P: PLANKS, S: [256] }); // bookshelf
shaped(284, 1, [' PS', 'P S', ' PS'], { P: [256], S: [267] }); // bow
shaped(283, 4, ['F', 'S', 'E'], { F: [266], S: [256], E: [268] }); // arrows

// tool materials per tier
const TOOL_MATS = [PLANKS, [4], [259], [261], [262]];
TOOL_MATS.forEach((M, i) => {
  const base = 300 + i * 10;
  shaped(base + 0, 1, ['MMM', ' S ', ' S '], { M, S: [256] }); // pickaxe
  shaped(base + 1, 1, ['MM', 'MS', ' S'], { M, S: [256] });    // axe
  shaped(base + 2, 1, ['M', 'S', 'S'], { M, S: [256] });       // shovel
  shaped(base + 3, 1, ['M', 'M', 'S'], { M, S: [256] });       // sword
  shaped(base + 4, 1, ['MM', ' S', ' S'], { M, S: [256] });    // hoe
});

// armor
const ARMOR_MATS = [[269], [259], [262]];
ARMOR_MATS.forEach((M, si) => {
  const base = 358 + si * 4;
  shaped(base + 0, 1, ['MMM', 'M M'], { M });                  // helmet
  shaped(base + 1, 1, ['M M', 'MMM', 'MMM'], { M });           // chestplate
  shaped(base + 2, 1, ['MMM', 'M M', 'M M'], { M });           // leggings
  shaped(base + 3, 1, ['M M', 'M M'], { M });                  // boots
});

shaped(287, 1, ['WWW'], { W: [286] }); // bread
shaped(288, 1, ['GGG', 'GAG', 'GGG'], { G: [261], A: [270] }); // golden apple
shaped(85, 1, [' G ', 'DOD', 'OOO'], { G: [263], D: [262], O: [48] }); // enchanting table

// wool dyeing-lite: skip. white wool from string:
shaped(51, 1, ['SS', 'SS'], { S: [267] });

// ---------------------------------------------------------------
// Smelting  { input id : output id }  (10 s per item)
// ---------------------------------------------------------------
export const SMELTING = {
  258: 259, // raw iron -> ingot
  260: 261, // raw gold -> ingot
  5: 31,    // sand -> glass
  4: 1,     // cobblestone -> stone
  271: 272, 273: 274, 275: 276, 277: 278, // meats
  10: 257, 13: 257, 16: 257, 59: 257,     // logs -> charcoal(coal)
  44: 32,   // clay -> bricks? (block) — kiln-fired clay
};

// fuel burn seconds
export const FUELS = { 257: 80, 12: 15, 15: 15, 18: 15, 61: 15, 10: 15, 13: 15, 16: 15, 59: 15, 256: 5, 26: 15, 50: 15, 62: 15 };

// ---------------------------------------------------------------
// recipe matching against a grid (array of item ids, 0 = empty, row-major, w×h)
// returns null or {out:[id,n]}
// ---------------------------------------------------------------
function matchShaped(recipe, grid, w, h) {
  const pat = recipe.pattern;
  const pw = Math.max(...pat.map(r => r.length)), ph = pat.length;
  if (pw > w || ph > h) return null;
  for (let ox = 0; ox <= w - pw; ox++) for (let oy = 0; oy <= h - ph; oy++) {
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const inPat = x >= ox && x < ox + pw && y >= oy && y < oy + ph;
        let want = ' ';
        if (inPat) {
          const row = pat[y - oy];
          const px = mirror ? pw - 1 - (x - ox) : x - ox;
          want = px < row.length ? row[px] : ' ';
        }
        const have = grid[y * w + x];
        if (want === ' ') { if (have !== 0) ok = false; }
        else {
          const allowed = recipe.key[want];
          if (!allowed || !allowed.includes(have)) ok = false;
        }
      }
      if (ok) return recipe.out;
    }
  }
  return null;
}

function matchShapeless(recipe, grid) {
  const present = grid.filter(v => v !== 0);
  if (present.length !== recipe.ingredients.length) return null;
  const pool = [...present];
  for (const ing of recipe.ingredients) {
    const arr = Array.isArray(ing) ? ing : [ing];
    const idx = pool.findIndex(v => arr.includes(v));
    if (idx < 0) return null;
    pool.splice(idx, 1);
  }
  return recipe.out;
}

export function matchRecipe(grid, w, h) {
  if (grid.every(v => v === 0)) return null;
  for (const r of RECIPES) {
    const res = r.pattern ? matchShaped(r, grid, w, h) : matchShapeless(r, grid);
    if (res) return res;
  }
  return null;
}
