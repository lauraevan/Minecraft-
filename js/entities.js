// ---------------------------------------------------------------
// entities.js — mobs (AI), item drops, arrows, particles, explosions
// ---------------------------------------------------------------
import * as THREE from './vendor/three.module.min.js';
import { BLOCKS, ITEMS, AIR } from './blocks.js';
import { collideEntity } from './player.js';
import { clamp } from './util.js';
import { buildAtlas, iconFor, TILE } from './textures.js';
import { H } from './world.js';

// ---------------- mob definitions ----------------
export const MOB_TYPES = {
  cow:      { w: 0.9, h: 1.4, hp: 10, speed: 1.1, passive: true, drops: r => [{ id: 271, n: 1 + (r() * 3 | 0) }, ...(r() < 0.7 ? [{ id: 269, n: 1 + (r() * 2 | 0) }] : [])] },
  pig:      { w: 0.9, h: 0.9, hp: 10, speed: 1.1, passive: true, drops: r => [{ id: 273, n: 1 + (r() * 3 | 0) }] },
  sheep:    { w: 0.9, h: 1.3, hp: 8, speed: 1.1, passive: true, drops: r => [{ id: 51, n: 1 }, { id: 277, n: 1 + (r() * 2 | 0) }] },
  chicken:  { w: 0.4, h: 0.7, hp: 4, speed: 1.0, passive: true, drops: r => [{ id: 275, n: 1 }, ...(r() < 0.6 ? [{ id: 268, n: 1 + (r() * 2 | 0) }] : [])] },
  zombie:   { w: 0.6, h: 1.9, hp: 20, speed: 2.5, dmg: 3, reach: 1.7, burns: true, drops: r => r() < 0.8 ? [{ id: 281, n: 1 + (r() * 2 | 0) }] : [] },
  skeleton: { w: 0.6, h: 1.9, hp: 20, speed: 2.5, ranged: true, burns: true, drops: r => [{ id: 279, n: r() * 3 | 0 }, { id: 283, n: r() * 3 | 0 }].filter(d => d.n > 0) },
  spider:   { w: 1.2, h: 0.9, hp: 16, speed: 2.8, dmg: 2, reach: 1.9, climbs: true, neutralDay: true, drops: r => [{ id: 267, n: 1 + (r() * 2 | 0) }] },
  creeper:  { w: 0.6, h: 1.7, hp: 20, speed: 2.4, exploder: true, drops: r => r() < 0.8 ? [{ id: 280, n: 1 + (r() * 2 | 0) }] : [] },
  wolf:     { w: 0.6, h: 0.85, hp: 12, speed: 2.6, passive: true, tameable: true, dmg: 3, drops: () => [] },
  villager: { w: 0.6, h: 1.9, hp: 20, speed: 1.4, passive: true, trader: true, drops: () => [] },
};
const HOSTILES = ['zombie', 'skeleton', 'spider', 'creeper'];
const PASSIVES = ['cow', 'pig', 'sheep', 'chicken', 'wolf', 'villager'];
const VILLAGER_BIOMES = [2, 10]; // plains, meadow
const WOLF_BIOMES = [3, 5, 10, 11]; // forest, taiga, meadow, birch

// ---------------- mob box models ----------------
// flags: leg (walk swing), arm (swing/flap), head (yaw/pitch pivot), hp (attached to head)
const L = (s, p, c, opts = {}) => Object.assign({ s, p, c }, opts);
const MOB_MODELS = {
  cow: [
    L([0.85, 0.65, 1.15], [0, 0.88, 0], [116, 78, 52]),
    L([0.5, 0.45, 0.5], [0, 1.22, -0.75], [126, 88, 62], { head: 1 }),
    L([0.08, 0.09, 0.05], [-0.13, 1.3, -1.01], [15, 15, 15], { hp: 1 }), L([0.08, 0.09, 0.05], [0.13, 1.3, -1.01], [15, 15, 15], { hp: 1 }),
    L([0.12, 0.1, 0.1], [-0.3, 1.42, -0.75], [220, 214, 200], { hp: 1 }), L([0.12, 0.1, 0.1], [0.3, 1.42, -0.75], [220, 214, 200], { hp: 1 }),
    L([0.34, 0.2, 0.24], [0, 0.6, 0.6], [225, 210, 200]),
    L([0.22, 0.58, 0.22], [-0.25, 0.58, -0.38], [88, 58, 38], { leg: 1 }), L([0.22, 0.58, 0.22], [0.25, 0.58, -0.38], [88, 58, 38], { leg: 1 }),
    L([0.22, 0.58, 0.22], [-0.25, 0.58, 0.38], [88, 58, 38], { leg: 1 }), L([0.22, 0.58, 0.22], [0.25, 0.58, 0.38], [88, 58, 38], { leg: 1 }),
  ],
  pig: [
    L([0.7, 0.5, 1.05], [0, 0.55, 0], [235, 160, 155]),
    L([0.45, 0.42, 0.42], [0, 0.62, -0.68], [240, 170, 165], { head: 1 }),
    L([0.18, 0.12, 0.06], [0, 0.55, -0.92], [225, 130, 130], { hp: 1 }),
    L([0.06, 0.08, 0.04], [-0.11, 0.7, -0.9], [15, 15, 15], { hp: 1 }), L([0.06, 0.08, 0.04], [0.11, 0.7, -0.9], [15, 15, 15], { hp: 1 }),
    L([0.18, 0.32, 0.18], [-0.22, 0.32, -0.32], [225, 150, 145], { leg: 1 }), L([0.18, 0.32, 0.18], [0.22, 0.32, -0.32], [225, 150, 145], { leg: 1 }),
    L([0.18, 0.32, 0.18], [-0.22, 0.32, 0.32], [225, 150, 145], { leg: 1 }), L([0.18, 0.32, 0.18], [0.22, 0.32, 0.32], [225, 150, 145], { leg: 1 }),
  ],
  sheep: [
    L([0.85, 0.65, 1.1], [0, 0.9, 0], [235, 235, 230]),
    L([0.4, 0.4, 0.45], [0, 1.18, -0.7], [200, 190, 180], { head: 1 }),
    L([0.07, 0.08, 0.05], [-0.11, 1.25, -0.93], [15, 15, 15], { hp: 1 }), L([0.07, 0.08, 0.05], [0.11, 1.25, -0.93], [15, 15, 15], { hp: 1 }),
    L([0.2, 0.6, 0.2], [-0.24, 0.6, -0.36], [190, 185, 178], { leg: 1 }), L([0.2, 0.6, 0.2], [0.24, 0.6, -0.36], [190, 185, 178], { leg: 1 }),
    L([0.2, 0.6, 0.2], [-0.24, 0.6, 0.36], [190, 185, 178], { leg: 1 }), L([0.2, 0.6, 0.2], [0.24, 0.6, 0.36], [190, 185, 178], { leg: 1 }),
  ],
  chicken: [
    L([0.4, 0.42, 0.55], [0, 0.5, 0], [235, 232, 225]),
    L([0.26, 0.35, 0.26], [0, 0.85, -0.24], [240, 238, 232], { head: 1 }),
    L([0.1, 0.08, 0.1], [0, 0.82, -0.42], [230, 170, 60], { hp: 1 }),
    L([0.08, 0.1, 0.05], [0, 0.72, -0.4], [200, 60, 50], { hp: 1 }),
    L([0.05, 0.06, 0.04], [-0.08, 0.92, -0.36], [15, 15, 15], { hp: 1 }), L([0.05, 0.06, 0.04], [0.08, 0.92, -0.36], [15, 15, 15], { hp: 1 }),
    L([0.06, 0.3, 0.42], [-0.23, 0.6, 0.02], [222, 218, 210], { arm: 1 }), L([0.06, 0.3, 0.42], [0.23, 0.6, 0.02], [222, 218, 210], { arm: 1 }),
    L([0.08, 0.3, 0.08], [-0.1, 0.3, 0.03], [230, 170, 60], { leg: 1 }), L([0.08, 0.3, 0.08], [0.1, 0.3, 0.03], [230, 170, 60], { leg: 1 }),
  ],
  zombie: [
    L([0.5, 0.72, 0.28], [0, 1.16, 0], [66, 122, 74]),
    L([0.48, 0.48, 0.48], [0, 1.76, 0], [88, 146, 92], { head: 1 }),
    L([0.09, 0.07, 0.05], [-0.12, 1.82, -0.25], [20, 10, 10], { hp: 1 }), L([0.09, 0.07, 0.05], [0.12, 1.82, -0.25], [20, 10, 10], { hp: 1 }),
    L([0.22, 0.7, 0.22], [-0.36, 1.45, 0], [58, 108, 66], { arm: 1 }), L([0.22, 0.7, 0.22], [0.36, 1.45, 0], [58, 108, 66], { arm: 1 }),
    L([0.23, 0.8, 0.23], [-0.13, 0.8, 0], [46, 66, 96], { leg: 1 }), L([0.23, 0.8, 0.23], [0.13, 0.8, 0], [46, 66, 96], { leg: 1 }),
  ],
  skeleton: [
    L([0.44, 0.7, 0.22], [0, 1.16, 0], [206, 206, 198]),
    L([0.46, 0.46, 0.46], [0, 1.74, 0], [220, 220, 212], { head: 1 }),
    L([0.09, 0.09, 0.05], [-0.12, 1.8, -0.24], [30, 30, 30], { hp: 1 }), L([0.09, 0.09, 0.05], [0.12, 1.8, -0.24], [30, 30, 30], { hp: 1 }),
    L([0.14, 0.68, 0.14], [-0.32, 1.45, 0], [198, 198, 190], { arm: 1 }), L([0.14, 0.68, 0.14], [0.32, 1.45, 0], [198, 198, 190], { arm: 1 }),
    L([0.15, 0.8, 0.15], [-0.12, 0.8, 0], [190, 190, 182], { leg: 1 }), L([0.15, 0.8, 0.15], [0.12, 0.8, 0], [190, 190, 182], { leg: 1 }),
  ],
  spider: [
    L([0.9, 0.42, 1.1], [0, 0.5, 0.15], [40, 34, 32]),
    L([0.55, 0.4, 0.55], [0, 0.42, -0.6], [52, 44, 40], { head: 1 }),
    L([0.09, 0.08, 0.04], [-0.14, 0.5, -0.89], [160, 30, 30], { hp: 1 }), L([0.09, 0.08, 0.04], [0.14, 0.5, -0.89], [160, 30, 30], { hp: 1 }),
    L([0.08, 0.08, 0.04], [-0.26, 0.44, -0.89], [120, 20, 20], { hp: 1 }), L([0.08, 0.08, 0.04], [0.26, 0.44, -0.89], [120, 20, 20], { hp: 1 }),
    L([1.7, 0.09, 0.09], [0, 0.45, -0.2], [35, 30, 28], { leg: 1 }), L([1.7, 0.09, 0.09], [0, 0.4, 0.1], [35, 30, 28], { leg: 1 }),
    L([1.7, 0.09, 0.09], [0, 0.45, 0.4], [35, 30, 28], { leg: 1 }), L([1.7, 0.09, 0.09], [0, 0.4, 0.65], [35, 30, 28], { leg: 1 }),
  ],
  villager: [
    L([0.5, 0.78, 0.3], [0, 1.14, 0], [116, 82, 60]),
    L([0.46, 0.5, 0.46], [0, 1.76, 0], [200, 156, 120], { head: 1 }),
    L([0.1, 0.2, 0.08], [0, 1.68, -0.26], [186, 140, 104], { hp: 1 }),
    L([0.08, 0.06, 0.04], [-0.11, 1.82, -0.24], [40, 90, 50], { hp: 1 }), L([0.08, 0.06, 0.04], [0.11, 1.82, -0.24], [40, 90, 50], { hp: 1 }),
    L([0.44, 0.5, 0.34], [0, 0.66, 0], [96, 66, 48]),
    L([0.2, 0.62, 0.2], [-0.34, 1.42, 0], [116, 82, 60], { arm: 1 }), L([0.2, 0.62, 0.2], [0.34, 1.42, 0], [116, 82, 60], { arm: 1 }),
    L([0.2, 0.42, 0.2], [-0.12, 0.42, 0], [70, 48, 36], { leg: 1 }), L([0.2, 0.42, 0.2], [0.12, 0.42, 0], [70, 48, 36], { leg: 1 }),
  ],
  player: [
    L([0.5, 0.72, 0.28], [0, 1.16, 0], [70, 120, 180]),
    L([0.48, 0.48, 0.48], [0, 1.76, 0], [214, 170, 130], { head: 1 }),
    L([0.09, 0.07, 0.05], [-0.12, 1.82, -0.25], [40, 40, 90], { hp: 1 }), L([0.09, 0.07, 0.05], [0.12, 1.82, -0.25], [40, 40, 90], { hp: 1 }),
    L([0.34, 0.16, 0.5], [0, 1.95, 0], [90, 60, 40], { hp: 1 }),
    L([0.22, 0.7, 0.22], [-0.36, 1.45, 0], [214, 170, 130], { arm: 1 }), L([0.22, 0.7, 0.22], [0.36, 1.45, 0], [214, 170, 130], { arm: 1 }),
    L([0.23, 0.8, 0.23], [-0.13, 0.8, 0], [60, 70, 140], { leg: 1 }), L([0.23, 0.8, 0.23], [0.13, 0.8, 0], [60, 70, 140], { leg: 1 }),
  ],
  wolf: [
    L([0.4, 0.4, 0.75], [0, 0.55, 0.05], [186, 186, 190]),
    L([0.34, 0.34, 0.34], [0, 0.72, -0.5], [200, 200, 204], { head: 1 }),
    L([0.16, 0.14, 0.14], [0, 0.62, -0.72], [150, 150, 155], { hp: 1 }),
    L([0.05, 0.05, 0.03], [-0.09, 0.78, -0.66], [20, 15, 15], { hp: 1 }), L([0.05, 0.05, 0.03], [0.09, 0.78, -0.66], [20, 15, 15], { hp: 1 }),
    L([0.09, 0.12, 0.06], [-0.11, 0.94, -0.45], [170, 170, 175], { hp: 1 }), L([0.09, 0.12, 0.06], [0.11, 0.94, -0.45], [170, 170, 175], { hp: 1 }),
    L([0.1, 0.1, 0.42], [0, 0.62, 0.55], [176, 176, 182]),
    L([0.12, 0.42, 0.12], [-0.13, 0.36, -0.25], [170, 170, 176], { leg: 1 }), L([0.12, 0.42, 0.12], [0.13, 0.36, -0.25], [170, 170, 176], { leg: 1 }),
    L([0.12, 0.42, 0.12], [-0.13, 0.36, 0.28], [170, 170, 176], { leg: 1 }), L([0.12, 0.42, 0.12], [0.13, 0.36, 0.28], [170, 170, 176], { leg: 1 }),
  ],
  creeper: [
    L([0.5, 0.85, 0.3], [0, 0.9, 0], [96, 168, 84]),
    L([0.48, 0.48, 0.48], [0, 1.55, 0], [104, 178, 92], { head: 1 }),
    L([0.1, 0.12, 0.05], [-0.12, 1.62, -0.25], [15, 15, 15], { hp: 1 }), L([0.1, 0.12, 0.05], [0.12, 1.62, -0.25], [15, 15, 15], { hp: 1 }),
    L([0.09, 0.16, 0.05], [0, 1.46, -0.25], [15, 15, 15], { hp: 1 }),
    L([0.2, 0.5, 0.24], [-0.15, 0.25, -0.2], [86, 152, 76], { leg: 1 }), L([0.2, 0.5, 0.24], [0.15, 0.25, -0.2], [86, 152, 76], { leg: 1 }),
    L([0.2, 0.5, 0.24], [-0.15, 0.25, 0.2], [86, 152, 76], { leg: 1 }), L([0.2, 0.5, 0.24], [0.15, 0.25, 0.2], [86, 152, 76], { leg: 1 }),
  ],
};

const texCache = new Map();
function noiseTexture(rgb) {
  const k = rgb.join(',');
  if (texCache.has(k)) return texCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = 8;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(8, 8);
  for (let i = 0; i < 64; i++) {
    const f = 0.88 + Math.random() * 0.24;
    img.data[i * 4] = clamp(rgb[0] * f, 0, 255); img.data[i * 4 + 1] = clamp(rgb[1] * f, 0, 255);
    img.data[i * 4 + 2] = clamp(rgb[2] * f, 0, 255); img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  texCache.set(k, tex);
  return tex;
}

function buildMobModel(type) {
  const group = new THREE.Group();
  const legs = [], arms = [], mats = [];
  const parts = MOB_MODELS[type];
  const headPart = parts.find(p => p.head);
  let head = null;
  if (headPart) {
    head = new THREE.Group();
    head.position.set(headPart.p[0], headPart.p[1], headPart.p[2]);
    group.add(head);
  }
  for (const part of parts) {
    const geo = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    if (part.leg || part.arm) geo.translate(0, -part.s[1] / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ map: noiseTexture(part.c) });
    const mesh = new THREE.Mesh(geo, mat);
    if (head && (part.head || part.hp)) {
      // position relative to the head pivot so the whole face turns together
      mesh.position.set(part.p[0] - headPart.p[0], part.p[1] - headPart.p[1], part.p[2] - headPart.p[2]);
      head.add(mesh);
    } else {
      mesh.position.set(part.p[0], part.p[1] + ((part.leg || part.arm) ? part.s[1] / 2 : 0), part.p[2]);
      group.add(mesh);
    }
    mats.push(mat);
    if (part.leg) legs.push(mesh);
    if (part.arm) arms.push(mesh);
  }
  if (type === 'zombie') for (const a of arms) a.rotation.x = -1.35;
  return { group, legs, arms, head, mats };
}

// ---------------- sprite textures for drops ----------------
const spriteTexCache = new Map();
function spriteTexture(id) {
  if (spriteTexCache.has(id)) return spriteTexCache.get(id);
  const img = new Image();
  img.src = iconFor(id);
  const tex = new THREE.Texture(img);
  img.onload = () => { tex.needsUpdate = true; };
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  spriteTexCache.set(id, tex);
  return tex;
}

// average color of a block texture (for particles)
const avgColorCache = new Map();
function avgColor(blockId) {
  if (avgColorCache.has(blockId)) return avgColorCache.get(blockId);
  const { canvas, tiles } = buildAtlas();
  const t = BLOCKS[blockId].tex;
  const [tx, ty] = tiles.get(t.all || t.side || t.top) || [0, 0];
  const d = canvas.getContext('2d').getImageData(tx * TILE, ty * TILE, TILE, TILE).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const c = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  avgColorCache.set(blockId, c);
  return c;
}

// ---------------------------------------------------------------
const MAX_PARTICLES = 600;

export class EntityManager {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.mobs = [];
    this.drops = [];
    this.arrows = [];
    this.spawnTimer = 0;
    this.rand = Math.random;
    this.mobGriefing = true;
    this.onExplosion = null;

    // particle pool (THREE.Points)
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = [];
    const pMat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true });
    this.pMesh = new THREE.Points(this.pGeo, pMat);
    this.pMesh.frustumCulled = false;
    scene.add(this.pMesh);

    const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
    this.arrowGeo = arrowGeo;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0x9a8866 });
  }

  // ---------------- spawning ----------------
  spawnMob(type, x, y, z, opts = {}) {
    const def = MOB_TYPES[type];
    const model = buildMobModel(type);
    this.scene.add(model.group);
    const yaw = Math.random() * Math.PI * 2;
    const mob = {
      type, def, model,
      pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 },
      w: def.w, h: def.h, yaw, targetYaw: yaw,
      hp: def.hp, onGround: false, stepUp: true,
      state: 'idle', stateTimer: Math.random() * 3, attackTimer: 0,
      hurtTimer: 0, burnAcc: 0, fuse: 0, walkPhase: 0, shootTimer: 1 + Math.random(),
      aggro: false, baby: !!opts.baby,
      callTimer: 4 + Math.random() * 14,
      grazeTimer: 0, headYaw: 0, headPitch: 0, age: 0,
    };
    if (mob.baby) {
      mob.w *= 0.55; mob.h *= 0.55; mob.hp = Math.ceil(def.hp / 2);
      model.group.scale.setScalar(0.55);
    }
    this.mobs.push(mob);
    return mob;
  }

  dropItem(x, y, z, stack, vel) {
    const mat = new THREE.SpriteMaterial({ map: spriteTexture(stack.id) });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.35, 0.35, 0.35);
    this.scene.add(spr);
    this.drops.push({
      stack, mesh: spr,
      pos: { x, y, z },
      vel: vel || { x: (Math.random() - 0.5) * 2.4, y: 3 + Math.random() * 1.5, z: (Math.random() - 0.5) * 2.4 },
      w: 0.25, h: 0.25, onGround: false, age: 0,
    });
  }

  shootArrow(from, dir, speed, fromPlayer, dmg) {
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    this.scene.add(mesh);
    this.arrows.push({ pos: { ...from }, vel: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, mesh, fromPlayer, dmg, age: 0, stuck: false });
    this.audio.play('bow', from);
  }

  addParticles(x, y, z, color, count, spread = 2.5) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * spread, vy: Math.random() * spread, vz: (Math.random() - 0.5) * spread,
        life: 0.5 + Math.random() * 0.5,
        r: color[0] * (0.8 + Math.random() * 0.3), g: color[1] * (0.8 + Math.random() * 0.3), b: color[2] * (0.8 + Math.random() * 0.3),
      });
    }
  }
  blockParticles(x, y, z, blockId, count = 12) { this.addParticles(x, y, z, avgColor(blockId), count); }

  addFirefly(x, y, z) {
    if (this.particles.length >= MAX_PARTICLES - 20) return;
    this.particles.push({
      x, y, z, vx: 0, vy: 0, vz: 0,
      life: 6 + Math.random() * 8, fly: true, t: Math.random() * 20, seed: Math.random() * 10,
      r: 0.95, g: 0.9, b: 0.35,
    });
  }

  explode(x, y, z, radius, player) {
    this.audio.play('explosion', { x, y, z });
    this.addParticles(x, y, z, [0.35, 0.32, 0.3], 60, 7);
    this.addParticles(x, y, z, [1.0, 0.6, 0.15], 30, 5);
    if (this.mobGriefing) {
      for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) for (let dz = -radius; dz <= radius; dz++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > radius) continue;
        const bx = Math.round(x + dx), by = Math.round(y + dy), bz = Math.round(z + dz);
        const id = this.world.getBlock(bx, by, bz);
        if (id === AIR || id === 7 || id === 48 || BLOCKS[id].fluid) continue;
        if (Math.random() < 1 - (dist / radius) * 0.4) {
          this.world.setBlock(bx, by, bz, AIR);
          if (Math.random() < 0.25) {
            const drops = this.dropsOf(id);
            for (const d of drops) this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, d);
          }
        }
      }
    }
    // damage player + mobs
    const pd = Math.hypot(player.pos.x - x, player.pos.y + 0.9 - y, player.pos.z - z);
    if (pd < radius * 2) {
      player.damage(Math.max(0, 22 * (1 - pd / (radius * 2))), { type: 'explosion' });
      const k = 8 * (1 - pd / (radius * 2));
      player.vel.x += (player.pos.x - x) / (pd + 0.1) * k;
      player.vel.y += 5 * (1 - pd / (radius * 2));
      player.vel.z += (player.pos.z - z) / (pd + 0.1) * k;
    }
    for (const m of this.mobs) {
      const md = Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z);
      if (md < radius * 2) this.hurtMob(m, 22 * (1 - md / (radius * 2)), null, player);
    }
    if (this.onExplosion) this.onExplosion();
  }

  dropsOf(blockId) {
    const def = BLOCKS[blockId];
    if (def.drops === undefined) return [{ id: blockId, n: 1 }];
    if (typeof def.drops === 'function') return def.drops(Math.random).map(d => ({ ...d }));
    return def.drops.map(d => ({ ...d }));
  }

  tameMob(mob) {
    mob.tamed = true;
    mob.state = 'idle';
    this.addParticles(mob.pos.x, mob.pos.y + mob.h, mob.pos.z, [1, 0.4, 0.6], 10, 1.5);
    this.audio.play('pop', mob.pos);
    // red collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), new THREE.MeshBasicMaterial({ color: 0xc03030 }));
    collar.position.set(0, -0.14, 0.02);
    if (mob.model.head) mob.model.head.add(collar);
  }

  hurtMob(mob, dmg, knockDir, player, isPlayerHit = false) {
    if (mob.hp <= 0) return;
    mob.hp -= dmg;
    mob.hurtTimer = 0.35;
    this.audio.play('hurt_mob', mob.pos);
    if (knockDir) {
      mob.vel.x += knockDir.x * 6; mob.vel.z += knockDir.z * 6; mob.vel.y = Math.max(mob.vel.y, 4.5);
    }
    if (mob.def.passive) { mob.state = 'flee'; mob.stateTimer = 4; mob.fleeFrom = { ...player.pos }; }
    else mob.aggro = true;
    if (mob.hp <= 0) {
      mob.dead = true;
      if (isPlayerHit) player.stats.kills++;
      this.addParticles(mob.pos.x, mob.pos.y + mob.h / 2, mob.pos.z, [0.8, 0.2, 0.2], 14);
      if (!mob.baby) for (const d of mob.def.drops(Math.random)) if (d.n > 0) this.dropItem(mob.pos.x, mob.pos.y + 0.4, mob.pos.z, d);
      if (this.onMobKilled) this.onMobKilled(mob, isPlayerHit);
    }
  }

  countMobs(hostile) {
    return this.mobs.reduce((a, m) => a + ((HOSTILES.includes(m.type)) === hostile ? 1 : 0), 0);
  }

  trySpawns(player, dayFactor) {
    if (this.puppet) return;
    const w = this.world;
    // hostiles
    if (this.countMobs(true) < 14) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 22 + Math.random() * 26;
        const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
        const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
        if (!w.chunkAt(x, z) || !w.chunkAt(x, z).lit) continue;
        let y;
        if (Math.random() < 0.5) y = w.surfaceY(x, z) + 1;
        else { // cave spawn attempt
          y = 5 + Math.random() * 50 | 0;
          if (w.getBlock(x, y, z) !== AIR || !BLOCKS[w.getBlock(x, y - 1, z)].solid) continue;
        }
        if (y + 2 >= H) continue;
        if (w.getBlock(x, y, z) !== AIR || w.getBlock(x, y + 1, z) !== AIR) continue;
        if (!BLOCKS[w.getBlock(x, y - 1, z)].solid) continue;
        const light = Math.max(w.getLight(x, y, z), w.getSky(x, y, z) * dayFactor);
        if (light > 7) continue;
        const r = Math.random();
        const type = r < 0.4 ? 'zombie' : r < 0.65 ? 'skeleton' : r < 0.85 ? 'spider' : 'creeper';
        this.spawnMob(type, x + 0.5, y, z + 0.5);
      }
    }
    // passives (daytime, on grass)
    if (dayFactor > 0.6 && this.countMobs(false) < 10) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 24;
      const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
      const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
      if (w.chunkAt(x, z) && w.chunkAt(x, z).lit) {
        const y = w.surfaceY(x, z);
        if (w.getBlock(x, y, z) === 2 && y + 3 < H) {
          let type = PASSIVES[Math.random() * PASSIVES.length | 0];
          if (type === 'wolf' && !WOLF_BIOMES.includes(w.biomeAt(x, z))) type = 'sheep';
          if (type === 'villager' && (!VILLAGER_BIOMES.includes(w.biomeAt(x, z)) || Math.random() < 0.5)) type = 'chicken';
          const n = 2 + (Math.random() * 2 | 0);
          for (let i = 0; i < n; i++)
            this.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 3, y + 1, z + 0.5 + (Math.random() - 0.5) * 3,
              { baby: i > 0 && Math.random() < 0.3 });
        }
      }
    }
  }

  // ---------------- update ----------------
  update(dt, player, dayFactor) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 3; this.trySpawns(player, dayFactor); }

    const w = this.world;

    // ---- mobs ----
    for (const m of this.mobs) {
      if (m.dead) continue;
      const distP = Math.hypot(player.pos.x - m.pos.x, player.pos.y - m.pos.y, player.pos.z - m.pos.z);
      if (distP > 60) { m.dead = true; continue; }
      m.hurtTimer = Math.max(0, m.hurtTimer - dt);
      m.stateTimer -= dt;
      m.attackTimer = Math.max(0, m.attackTimer - dt);

      const hostile = HOSTILES.includes(m.type);
      const angry = hostile && !player.dead && player.gamemode !== 'spectator' && player.gamemode !== 'creative' &&
        distP < 18 && (!m.def.neutralDay || m.aggro || dayFactor < 0.4);
      const yawToPlayer = Math.atan2(-(player.pos.x - m.pos.x), -(player.pos.z - m.pos.z));
      m.age += dt;

      // ambient calls
      m.callTimer -= dt;
      if (m.callTimer <= 0) {
        m.callTimer = 7 + Math.random() * 16;
        if (distP < 26) this.audio.mobCall(m.type, m.pos, angry);
      }

      let moveSpeed = 0;
      if (m.def.ranged && angry) {
        // skeleton: kite + shoot
        m.targetYaw = yawToPlayer;
        if (distP > 10) moveSpeed = m.def.speed;
        else if (distP < 5) moveSpeed = -m.def.speed * 0.8;
        m.shootTimer -= dt;
        if (m.shootTimer <= 0 && distP < 15) {
          m.shootTimer = 2.2;
          const from = { x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z };
          const to = { x: player.pos.x, y: player.pos.y + 1.2, z: player.pos.z };
          let d = { x: to.x - from.x, y: to.y - from.y + distP * 0.09, z: to.z - from.z };
          const dl = Math.hypot(d.x, d.y, d.z);
          this.shootArrow(from, { x: d.x / dl, y: d.y / dl, z: d.z / dl }, 18, false, 3);
        }
      } else if (angry) {
        m.state = 'chase';
        m.targetYaw = yawToPlayer;
        moveSpeed = m.def.speed;
        if (m.def.exploder) {
          if (distP < 3) {
            m.fuse += dt; moveSpeed = 0;
            if (m.fuse > 1.5) { m.dead = true; this.explode(m.pos.x, m.pos.y + 0.8, m.pos.z, 3, player); continue; }
          } else if (distP > 6) m.fuse = Math.max(0, m.fuse - dt * 2);
          else m.fuse = Math.max(0, m.fuse - dt * 0.5);
        } else if (distP < (m.def.reach || 1.6) && m.attackTimer <= 0 && !player.dead) {
          m.attackTimer = 1.1;
          player.damage(m.def.dmg, { type: 'mob' });
          if (m.type === 'spider' && Math.random() < 0.5) player.addEffect('poison', 5);
          this.audio.play('hurt', player.pos);
          const kd = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) + 0.01;
          player.vel.x += (player.pos.x - m.pos.x) / kd * 7;
          player.vel.z += (player.pos.z - m.pos.z) / kd * 7;
          player.vel.y = Math.max(player.vel.y, 4);
        }
      } else if (m.tamed) {
        // loyal wolf: follow owner, pounce hostiles near them
        let target = null, td = 6;
        for (const o of this.mobs) {
          if (o.dead || !HOSTILES.includes(o.type)) continue;
          const od = Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z);
          if (od < td) { td = od; target = o; }
        }
        if (target) {
          m.targetYaw = Math.atan2(-(target.pos.x - m.pos.x), -(target.pos.z - m.pos.z));
          moveSpeed = m.def.speed * 1.2;
          const tdm = Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
          if (tdm < 1.4 && m.attackTimer <= 0) {
            m.attackTimer = 0.9;
            this.hurtMob(target, m.def.dmg, { x: (target.pos.x - m.pos.x) / (tdm + 0.01), z: (target.pos.z - m.pos.z) / (tdm + 0.01) }, player, true);
          }
        } else if (distP > 18) {
          m.pos = { x: player.pos.x + 1.5, y: player.pos.y + 0.5, z: player.pos.z + 1.5 };
        } else if (distP > 3.2) {
          m.targetYaw = yawToPlayer;
          moveSpeed = m.def.speed * (distP > 8 ? 1.3 : 0.7);
        }
      } else if (m.state === 'flee' && m.stateTimer > 0) {
        m.targetYaw = Math.atan2(-(m.pos.x - (m.fleeFrom?.x ?? player.pos.x)), -(m.pos.z - (m.fleeFrom?.z ?? player.pos.z))) + Math.PI;
        moveSpeed = m.def.speed * 1.6;
      } else if (m.state === 'graze' && m.stateTimer > 0) {
        moveSpeed = 0;
        if (m.stateTimer < dt * 2 && m.type === 'sheep') {
          // sheep actually eat the grass
          const gx = Math.floor(m.pos.x), gy = Math.floor(m.pos.y) - 1, gz = Math.floor(m.pos.z);
          if (w.getBlock(gx, gy, gz) === 2 && Math.random() < 0.35) {
            w.setBlock(gx, gy, gz, 3);
            this.addParticles(m.pos.x, m.pos.y + 0.3, m.pos.z, [0.4, 0.65, 0.27], 6, 1.2);
          }
        }
      } else {
        if (m.stateTimer <= 0) {
          const r = Math.random();
          if (m.def.passive && r < 0.25) {
            m.state = 'graze'; m.stateTimer = 1.5 + Math.random() * 2.5;
          } else if (m.state === 'wander' || r < 0.55) {
            m.state = 'idle'; m.stateTimer = 2 + Math.random() * 4;
          } else {
            m.state = 'wander'; m.stateTimer = 2 + Math.random() * 3;
            let wyaw = Math.random() * Math.PI * 2;
            // gentle herding: passives drift toward a nearby friend
            if (m.def.passive) {
              for (const o of this.mobs) {
                if (o !== m && !o.dead && o.type === m.type) {
                  const od = Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z);
                  if (od > 4 && od < 14 && Math.random() < 0.5) {
                    wyaw = Math.atan2(-(o.pos.x - m.pos.x), -(o.pos.z - m.pos.z));
                    break;
                  }
                }
              }
            }
            m.targetYaw = wyaw;
          }
        }
        if (m.state === 'wander') moveSpeed = m.def.speed * 0.45;
      }
      if (m.baby) moveSpeed *= 1.2;

      // smooth turning toward targetYaw
      let dy2 = m.targetYaw - m.yaw;
      while (dy2 > Math.PI) dy2 -= Math.PI * 2;
      while (dy2 < -Math.PI) dy2 += Math.PI * 2;
      m.yaw += dy2 * Math.min(1, (angry ? 10 : 5) * dt);

      // steering → velocity
      const vx = -Math.sin(m.yaw) * moveSpeed, vz = -Math.cos(m.yaw) * moveSpeed;
      m.vel.x += (vx - m.vel.x) * Math.min(1, 8 * dt);
      m.vel.z += (vz - m.vel.z) * Math.min(1, 8 * dt);

      // water / gravity (chickens flutter down slowly)
      const inWater = w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)) === 8;
      const fluttering = m.type === 'chicken' && !m.onGround && m.vel.y < -0.5 && !inWater;
      if (inWater) { m.vel.y += 22 * dt; m.vel.y = clamp(m.vel.y, -2, 2.5); }
      else m.vel.y -= 32 * dt;
      if (fluttering) m.vel.y = Math.max(m.vel.y, -1.6);

      collideEntity(w, m, dt);
      // spiders climb, others hop
      if (m.hitWall && moveSpeed > 0) {
        if (m.def.climbs) m.vel.y = 3;
        else if (m.onGround) m.vel.y = JUMPISH;
      }

      // daylight burning
      if (m.def.burns && dayFactor > 0.85 && w.getSky(Math.floor(m.pos.x), Math.floor(m.pos.y + m.h), Math.floor(m.pos.z)) >= 14) {
        m.burnAcc += dt;
        if (m.burnAcc > 1) { m.burnAcc = 0; m.hp -= 2; m.hurtTimer = 0.3; this.addParticles(m.pos.x, m.pos.y + m.h, m.pos.z, [1, 0.5, 0.1], 5); if (m.hp <= 0) m.dead = true; }
      }
      // lava
      if (w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.2), Math.floor(m.pos.z)) === 9) {
        m.hp -= 8 * dt; m.hurtTimer = 0.2; if (m.hp <= 0) m.dead = true;
      }

      // visuals
      const g = m.model.group;
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      g.rotation.y = m.yaw;
      const speed2 = Math.hypot(m.vel.x, m.vel.z);
      m.walkPhase += speed2 * dt * (m.baby ? 5 : 3.2);
      m.model.legs.forEach((leg, i) => {
        if (m.type === 'spider') leg.rotation.z = Math.sin(m.walkPhase + i * 1.7) * 0.25;
        else leg.rotation.x = Math.sin(m.walkPhase + (i % 2) * Math.PI) * clamp(speed2, 0, 1.4) * 0.7;
      });
      // arms: chicken wings flap, zombie arms bob, skeleton arms sway
      m.model.arms.forEach((arm, i) => {
        const side = i === 0 ? 1 : -1;
        if (m.type === 'chicken') {
          arm.rotation.z = fluttering ? side * (0.5 + Math.sin(m.age * 30) * 0.6) : side * 0.06;
        } else if (m.type === 'zombie') {
          arm.rotation.x = -1.35 + Math.sin(m.age * 3 + i * 2) * 0.12 + Math.sin(m.walkPhase + i * Math.PI) * 0.15;
        } else {
          arm.rotation.x = Math.sin(m.walkPhase + (i % 2) * Math.PI) * clamp(speed2, 0, 1.4) * 0.5;
        }
      });
      // head: track the player when close, dip while grazing, idle wobble
      const head = m.model.head;
      if (head) {
        let wantYaw = 0, wantPitch = 0;
        if (m.state === 'graze') {
          wantPitch = 0.85 + (m.type === 'chicken' ? Math.sin(m.age * 14) * 0.25 : Math.sin(m.age * 3) * 0.06);
        } else if (distP < 7 && (m.def.passive || angry || m.def.exploder)) {
          let hd = yawToPlayer - m.yaw;
          while (hd > Math.PI) hd -= Math.PI * 2;
          while (hd < -Math.PI) hd += Math.PI * 2;
          wantYaw = clamp(hd, -1.1, 1.1);
          wantPitch = clamp(-(player.pos.y + 1.4 - (m.pos.y + m.h * 0.85)) * 0.35, -0.55, 0.55);
        } else if (m.state === 'idle') {
          wantYaw = Math.sin(m.age * 0.7 + m.walkPhase) * 0.35;
        }
        m.headYaw += (wantYaw - m.headYaw) * Math.min(1, 7 * dt);
        m.headPitch += (wantPitch - m.headPitch) * Math.min(1, 7 * dt);
        head.rotation.y = m.headYaw;
        head.rotation.x = m.headPitch;
      }
      // light + hurt tint
      const ll = Math.max(w.getLight(Math.floor(m.pos.x), Math.floor(m.pos.y + 1), Math.floor(m.pos.z)),
        w.getSky(Math.floor(m.pos.x), Math.floor(m.pos.y + 1), Math.floor(m.pos.z)) * dayFactor);
      const br = 0.25 + 0.75 * (ll / 15);
      let rT = br, gT = br, bT = br;
      if (m.hurtTimer > 0) { rT = Math.min(1, br + 0.6); gT *= 0.4; bT *= 0.4; }
      if (m.def.exploder && m.fuse > 0 && Math.sin(m.fuse * 25) > 0) { rT = gT = bT = 1.5; }
      for (const mat of m.model.mats) mat.color.setRGB(rT, gT, bT);
    }
    // remove dead mobs
    this.mobs = this.mobs.filter(m => {
      if (m.dead) { this.scene.remove(m.model.group); return false; }
      return true;
    });

    // ---- item drops ----
    for (const d of this.drops) {
      d.age += dt;
      if (d.age > 300) { d.dead = true; }
      const inWater = w.getBlock(Math.floor(d.pos.x), Math.floor(d.pos.y), Math.floor(d.pos.z)) === 8;
      d.vel.y -= (inWater ? 4 : 24) * dt;
      if (inWater) d.vel.y = Math.max(d.vel.y, -0.6);
      d.vel.x *= 0.92; d.vel.z *= 0.92;
      collideEntity(w, d, dt);
      // magnet + pickup
      if (!player.dead && d.age > 0.5) {
        const dx = player.pos.x - d.pos.x, dy = player.pos.y + 0.8 - d.pos.y, dz = player.pos.z - d.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 2.0) {
          d.pos.x += dx / dist * 6 * dt; d.pos.y += dy / dist * 6 * dt; d.pos.z += dz / dist * 6 * dt;
        }
        if (dist < 0.9) {
          const left = player.addItem(d.stack);
          if (left === 0) { d.dead = true; this.audio.play('pop', d.pos); }
          else d.stack.n = left;
        }
      }
      d.mesh.position.set(d.pos.x, d.pos.y + 0.2 + Math.sin(d.age * 3) * 0.05, d.pos.z);
    }
    this.drops = this.drops.filter(d => {
      if (d.dead) { this.scene.remove(d.mesh); return false; }
      return true;
    });

    // ---- arrows ----
    for (const a of this.arrows) {
      a.age += dt;
      if (a.age > 20) a.dead = true;
      if (a.stuck) continue;
      a.vel.y -= 18 * dt;
      a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
      const bid = w.getBlock(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z));
      if (bid !== AIR && BLOCKS[bid].solid) { a.stuck = true; this.audio.play('step_stone', a.pos); continue; }
      if (a.fromPlayer) {
        for (const m of this.mobs) {
          if (m.dead) continue;
          if (Math.abs(a.pos.x - m.pos.x) < m.w / 2 + 0.15 && Math.abs(a.pos.z - m.pos.z) < m.w / 2 + 0.15 &&
            a.pos.y > m.pos.y && a.pos.y < m.pos.y + m.h + 0.2) {
            this.hurtMob(m, a.dmg, { x: a.vel.x * 0.05, z: a.vel.z * 0.05 }, player, true);
            a.dead = true; break;
          }
        }
      } else if (!player.dead) {
        if (Math.abs(a.pos.x - player.pos.x) < 0.5 && Math.abs(a.pos.z - player.pos.z) < 0.5 &&
          a.pos.y > player.pos.y && a.pos.y < player.pos.y + 1.9) {
          player.damage(a.dmg, { type: 'arrow' });
          this.audio.play('hurt', player.pos);
          player.vel.x += a.vel.x * 0.15; player.vel.z += a.vel.z * 0.15;
          a.dead = true;
        }
      }
      a.mesh.position.set(a.pos.x, a.pos.y, a.pos.z);
      const vl = Math.hypot(a.vel.x, a.vel.y, a.vel.z);
      if (vl > 0.01) a.mesh.lookAt(a.pos.x + a.vel.x / vl, a.pos.y + a.vel.y / vl, a.pos.z + a.vel.z / vl);
    }
    this.arrows = this.arrows.filter(a => {
      if (a.dead) { this.scene.remove(a.mesh); return false; }
      return true;
    });

    // ---- particles ----
    let alive = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      let blink = 1;
      if (p.fly) {
        // firefly: gravity-free wandering glow with a slow blink
        p.t += dt;
        p.vx = Math.sin(p.t * 0.9 + p.seed) * 0.5;
        p.vz = Math.cos(p.t * 0.7 + p.seed * 2) * 0.5;
        p.vy = Math.sin(p.t * 1.3 + p.seed) * 0.3;
        blink = 0.15 + 0.85 * Math.max(0, Math.sin(p.t * 2.2 + p.seed * 3));
      } else {
        p.vy -= 14 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (!p.fly && BLOCKS[w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))].solid) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; p.y = Math.ceil(p.y * 100) / 100; }
      this.pPos[alive * 3] = p.x; this.pPos[alive * 3 + 1] = p.y; this.pPos[alive * 3 + 2] = p.z;
      this.pCol[alive * 3] = p.r * blink; this.pCol[alive * 3 + 1] = p.g * blink; this.pCol[alive * 3 + 2] = p.b * blink;
      alive++;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.pGeo.setDrawRange(0, alive);
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
  }

  // find mob hit by a melee ray from the player
  raycastMob(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      if (m.dead) continue;
      // coarse: sample along ray
      for (let t = 0.3; t < maxDist; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        if (Math.abs(x - m.pos.x) < m.w / 2 + 0.12 && Math.abs(z - m.pos.z) < m.w / 2 + 0.12 &&
          y > m.pos.y - 0.1 && y < m.pos.y + m.h + 0.1) {
          if (t < bestT) { bestT = t; best = m; }
          break;
        }
      }
    }
    return best;
  }

  serialize() {
    return this.mobs.map(m => ({ type: m.type, x: m.pos.x, y: m.pos.y, z: m.pos.z, hp: m.hp, tamed: !!m.tamed, baby: !!m.baby }));
  }
  deserialize(list) {
    for (const s of list || []) {
      const m = this.spawnMob(s.type, s.x, s.y, s.z, { baby: s.baby });
      m.hp = s.hp;
      if (s.tamed) this.tameMob(m);
    }
  }
  // ---------------- multiplayer helpers ----------------
  createAvatar() {
    const model = buildMobModel('player');
    this.scene.add(model.group);
    return model;
  }

  applyMobSnapshot(list) {
    // guest: puppet the host's mobs
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      let m = this.mobs[i];
      if (!m || m.type !== s.k) {
        if (m) { this.scene.remove(m.model.group); }
        m = {
          type: s.k, def: MOB_TYPES[s.k], model: buildMobModel(s.k),
          pos: { x: s.x, y: s.y, z: s.z }, vel: { x: 0, y: 0, z: 0 },
          w: MOB_TYPES[s.k].w, h: MOB_TYPES[s.k].h, yaw: s.w, targetYaw: s.w,
          hp: s.h, walkPhase: 0, hurtTimer: 0, net: true,
        };
        this.scene.add(m.model.group);
        this.mobs[i] = m;
      }
      m.netTarget = { x: s.x, y: s.y, z: s.z, yaw: s.w };
      m.hp = s.h;
      if (s.f) m.hurtTimer = 0.3;
    }
    while (this.mobs.length > list.length) {
      const m = this.mobs.pop();
      this.scene.remove(m.model.group);
    }
  }

  updatePuppets(dt, world, dayFactor) {
    for (const m of this.mobs) {
      if (!m.netTarget) continue;
      const t = Math.min(1, 8 * dt);
      const prevX = m.pos.x, prevZ = m.pos.z;
      m.pos.x += (m.netTarget.x - m.pos.x) * t;
      m.pos.y += (m.netTarget.y - m.pos.y) * t;
      m.pos.z += (m.netTarget.z - m.pos.z) * t;
      let dy = m.netTarget.yaw - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * t;
      m.hurtTimer = Math.max(0, m.hurtTimer - dt);
      const g = m.model.group;
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      g.rotation.y = m.yaw;
      const sp = Math.hypot(m.pos.x - prevX, m.pos.z - prevZ) / Math.max(dt, 1e-4);
      m.walkPhase += sp * dt * 3.2;
      m.model.legs.forEach((leg, i) => {
        if (m.type === 'spider') leg.rotation.z = Math.sin(m.walkPhase + i * 1.7) * 0.25;
        else leg.rotation.x = Math.sin(m.walkPhase + (i % 2) * Math.PI) * clamp(sp, 0, 1.4) * 0.7;
      });
      const ll = Math.max(world.getLight(Math.floor(m.pos.x), Math.floor(m.pos.y + 1), Math.floor(m.pos.z)),
        world.getSky(Math.floor(m.pos.x), Math.floor(m.pos.y + 1), Math.floor(m.pos.z)) * dayFactor);
      const br = 0.25 + 0.75 * (ll / 15);
      for (const mat of m.model.mats) mat.color.setRGB(
        m.hurtTimer > 0 ? Math.min(1, br + 0.6) : br,
        m.hurtTimer > 0 ? br * 0.4 : br,
        m.hurtTimer > 0 ? br * 0.4 : br);
    }
  }

  clear() {
    for (const m of this.mobs) this.scene.remove(m.model.group);
    for (const d of this.drops) this.scene.remove(d.mesh);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    this.mobs = []; this.drops = []; this.arrows = [];
  }
}

const JUMPISH = 8.2;
