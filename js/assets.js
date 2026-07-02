// ---------------------------------------------------------------
// assets.js — user-made HUD art (assets/icons.png, drawn in ibis Paint)
// Sheet layout (9×9 cells starting at x=16, Minecraft icons.png style):
//   y=0 hearts, y=9 armor, y=18 bubbles, y=27 food, purple slot tiles,
//   y=64/69 XP bar empty/filled strips, crosshair at (0,0)
// ---------------------------------------------------------------

let sheet = null; // canvas copy of the sheet, null if missing
const guiImgs = {};  // name -> Image (gui_inv, gui_craft, gui_enchant, gui_trade, logo)

export async function loadUserArt() {
  try {
    const img = new Image();
    img.src = 'assets/icons.png';
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    sheet = cv;
    await Promise.all(['gui_inv', 'gui_craft', 'gui_enchant', 'gui_trade', 'logo'].map(async n => {
      try {
        const im = new Image(); im.src = 'assets/' + n + '.png'; await im.decode(); guiImgs[n] = im;
      } catch (e) { }
    }));
  } catch (e) {
    console.warn('user art not available, using procedural HUD icons', e);
    sheet = null;
  }
}

export function hasUserArt() { return sheet !== null; }

const spriteCache = new Map();
export function sheetSprite(x, y, w, h, outW = w * 2, outH = h * 2) {
  if (!sheet) return null;
  const key = `${x},${y},${w},${h}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = outW; cv.height = outH;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(sheet, x, y, w, h, 0, 0, outW, outH);
  const url = cv.toDataURL();
  spriteCache.set(key, url);
  return url;
}

// HUD icon crops (name -> [x, y, w, h])
const HUD_MAP = {
  heart: [52, 0, 9, 9],
  heart_half: [61, 0, 9, 9],
  heart_empty: [16, 0, 9, 9],
  armor: [34, 9, 9, 9],
  armor_half: [25, 9, 9, 9],
  armor_empty: [16, 9, 9, 9],
  bubble: [16, 18, 9, 9],
  food: [52, 27, 9, 9],
  food_half: [61, 27, 9, 9],
  food_empty: [16, 27, 9, 9],
};

export function userHudIcon(name) {
  const m = HUD_MAP[name];
  return m ? sheetSprite(...m) : null;
}

export function userCrosshair() { return sheetSprite(0, 0, 14, 14, 28, 28); }
export function userSlotTile() { return sheetSprite(61, 9, 9, 9, 36, 36); }
export function userXpBar() {
  if (!sheet) return null;
  return {
    empty: sheetSprite(0, 64, 182, 5, 364, 10),
    fill: sheetSprite(0, 69, 182, 5, 364, 10),
  };
}

// ---------------- GUI sheets (hand-drawn, standard 18px slot grid) ----------------
const ROW = y => Array.from({ length: 9 }, (_, i) => [8 + 18 * i, y]);
const INV_GRID = [...ROW(84), ...ROW(102), ...ROW(120)];
export const GUI_LAYOUT = {
  gui_inv: { armor: [[8, 8], [8, 26], [8, 44], [8, 62]], craft: [[88, 26], [106, 26], [88, 44], [106, 44]], result: [[144, 36]], inv: INV_GRID, hot: ROW(142) },
  gui_craft: { craft: [[62, 17], [80, 17], [98, 17], [62, 35], [80, 35], [98, 35], [62, 53], [80, 53], [98, 53]], result: [[130, 35]], inv: INV_GRID, hot: ROW(142) },
  gui_enchant: { input: [[25, 47]], options: [[62, 12], [62, 30], [62, 48]], inv: INV_GRID, hot: ROW(142) },
  gui_trade: { in1: [[36, 53]], in2: [[62, 53]], out: [[120, 54]], inv: INV_GRID, hot: ROW(142) },
};
export function guiSheet(name) { return guiImgs[name] ? guiImgs[name].src : null; }
export function logoUrl() { return guiImgs.logo ? guiImgs.logo.src : null; }

// effect icons: sliced from the bottom strip of the inventory sheet
let effectIcons = null;
export function effectIcon(i) {
  if (!guiImgs.gui_inv) return null;
  if (!effectIcons) {
    effectIcons = [];
    const im = guiImgs.gui_inv;
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const data = cx.getImageData(0, 196, im.width, 60).data;
    // find sprite columns: scan 16px tiles on a 17px pitch over two rows
    for (const ry of [0, 20]) {
      for (let tx = 0; tx + 16 <= im.width; tx += 17) {
        let filled = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          if (data[((ry + y) * im.width + tx + x) * 4 + 3] > 100) filled++;
        }
        if (filled > 30) {
          const oc = document.createElement('canvas'); oc.width = oc.height = 16;
          oc.getContext('2d').drawImage(im, tx, 196 + ry, 16, 16, 0, 0, 16, 16);
          effectIcons.push(oc.toDataURL());
        }
      }
    }
  }
  return effectIcons[i % Math.max(1, effectIcons.length)] || null;
}
