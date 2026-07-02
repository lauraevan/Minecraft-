// ---------------------------------------------------------------
// assets.js — user-made HUD art (assets/icons.png, drawn in ibis Paint)
// Sheet layout (9×9 cells starting at x=16, Minecraft icons.png style):
//   y=0 hearts, y=9 armor, y=18 bubbles, y=27 food, purple slot tiles,
//   y=64/69 XP bar empty/filled strips, crosshair at (0,0)
// ---------------------------------------------------------------

let sheet = null; // canvas copy of the sheet, null if missing

export async function loadUserArt() {
  try {
    const img = new Image();
    img.src = 'assets/icons.png';
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    sheet = cv;
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
