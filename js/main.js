// ---------------------------------------------------------------
// main.js — Crafter Mine game orchestrator
// ---------------------------------------------------------------
import * as THREE from './vendor/three.module.min.js';
import { World, CHUNK, H, SEA, BIOME_NAMES, GRASSY_BIOMES, LEAFY_BIOMES, B_TUNDRA, B_TAIGA, B_MOUNT } from './world.js';
import { meshChunk } from './mesher.js';
import { BLOCKS, ITEMS, defOf, AIR, SMELTING, FUELS, SAPLINGS } from './blocks.js';
import { buildAtlas, TILE, ATLAS } from './textures.js';
import { Player, Input, raycast, collideEntity, EYE } from './player.js';
import { EntityManager } from './entities.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { saveWorld, loadMeta, loadChunks, clearSave } from './save.js';
import { clamp, lerp } from './util.js';
import { loadUserArt, userCrosshair, userSlotTile, logoUrl, particleSprite } from './assets.js';
import { PostFX, PRESETS } from './post.js';
import { Net } from './net.js';
import { TouchControls } from './mobile.js';

const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// user-made HUD art (must load before UI icons are built)
await loadUserArt();

// ---------------- settings ----------------
const SETTINGS = Object.assign(
  { rd: IS_TOUCH ? 3 : 5, fov: 75, sens: 8, vol: 70, shader: IS_TOUCH ? 0 : 1 },
  JSON.parse(localStorage.getItem('cm_settings') || '{}'));
window.SETTINGS = SETTINGS;
function saveSettings() { localStorage.setItem('cm_settings', JSON.stringify(SETTINGS)); }

// title screen: splash + dirt background + gamemode cycle
const SPLASHES = ['Now with wolves!', 'Hand-drawn HUD!', 'Cozy shaders!', 'Punch a tree!', 'Cherry blossoms!',
  'Multiplayer co-op!', 'Also plays on phones!', 'Fireflies at dusk!', 'Bake some bread!', '100% original pixels!'];
$('splash').textContent = SPLASHES[Math.random() * SPLASHES.length | 0];
{ // hand-drawn logo
  const lu = logoUrl();
  if (lu) document.querySelector('#menu .title').outerHTML =
    `<img src="${lu}" alt="logo" style="width:548px;max-width:92vw;image-rendering:pixelated;margin-bottom:4px">`;
}
const GAMEMODES = ['survival', 'creative', 'spectator'];
let gmIdx = 0;
$('btn-gamemode').addEventListener('click', () => {
  gmIdx = (gmIdx + 1) % 3;
  $('btn-gamemode').textContent = 'Game Mode: ' + GAMEMODES[gmIdx][0].toUpperCase() + GAMEMODES[gmIdx].slice(1);
});

// apply user crosshair + hotbar slot art
{
  const ch = userCrosshair();
  if (ch) $('crosshair').innerHTML = `<img src="${ch}" style="image-rendering:pixelated">`;
  const tile = userSlotTile();
  if (tile) {
    const style = document.createElement('style');
    style.textContent = `#hotbar .slot { background-image:url(${tile}); background-size:cover; image-rendering:pixelated; }`;
    document.head.appendChild(style);
  }
}

// ---------------- three.js setup ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(SETTINGS.fov, window.innerWidth / window.innerHeight, 0.05, 1000);
const postFX = new PostFX(renderer);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postFX.resize(window.innerWidth, window.innerHeight);
});

// atlas texture
const atlas = buildAtlas();
{ // dirt-tile menu background, Minecraft style
  const t = atlas.tiles.get('dirt');
  const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
  cv.getContext('2d').drawImage(atlas.canvas, t[0] * TILE, t[1] * TILE, TILE, TILE, 0, 0, TILE, TILE);
  const url = cv.toDataURL();
  for (const id of ['menu', 'mpscreen']) {
    const el = $(id);
    el.classList.add('dirtbg');
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = '64px 64px';
  }
}
const atlasTex = new THREE.CanvasTexture(atlas.canvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.flipY = false;

const chunkVert = `
attribute vec2 tile;
attribute vec2 lightsb;
attribute float ao;
attribute float wave;
uniform float uTime;
uniform float uWaveAmp;
uniform float uCutout;
varying vec2 vUv; varying vec2 vTile; varying vec2 vLight; varying float vAo; varying float vDist;
void main() {
  vUv = uv; vTile = tile; vLight = lightsb; vAo = ao;
  vec3 pos = position;
  if (uWaveAmp > 0.0) {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    if (uCutout > 0.5) {
      // leaves + plants sway sideways
      pos.x += sin(uTime * 1.7 + wp.x * 0.7 + wp.z * 0.9 + wp.y * 0.4) * 0.055 * wave * uWaveAmp;
      pos.z += cos(uTime * 1.4 + wp.x * 0.9 + wp.z * 0.6) * 0.045 * wave * uWaveAmp;
    } else {
      // water gently bobs
      pos.y += sin(uTime * 1.2 + wp.x * 0.8 + wp.z * 0.8) * 0.05 * wave * uWaveAmp;
    }
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const chunkFrag = `
uniform sampler2D uAtlas; uniform float uDay; uniform float uCutout;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying vec2 vTile; varying vec2 vLight; varying float vAo; varying float vDist;
void main() {
  vec2 uv = (vTile + vec2(fract(vUv.x), 1.0 - fract(vUv.y))) / ${ATLAS}.0;
  vec4 c = texture2D(uAtlas, uv);
  if (uCutout > 0.5 && c.a < 0.5) discard;
  float l = max(vLight.y, vLight.x * uDay) / 15.0;
  float b = pow(l, 1.4) * 0.94 + 0.06;
  vec3 col = c.rgb * b * vAo;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(col, uFogColor, fog), uCutout > 0.5 ? 1.0 : c.a);
}`;
const sharedUniforms = {
  uAtlas: { value: atlasTex },
  uDay: { value: 1 },
  uFogColor: { value: new THREE.Color(0xbcd8ff) },
  uFogNear: { value: 56 },
  uFogFar: { value: 80 },
  uTime: { value: 0 },
  uWaveAmp: { value: 0 },
};
const solidMat = new THREE.ShaderMaterial({
  uniforms: { ...sharedUniforms, uCutout: { value: 1 } },
  vertexShader: chunkVert, fragmentShader: chunkFrag,
});
const fluidMat = new THREE.ShaderMaterial({
  uniforms: { ...sharedUniforms, uCutout: { value: 0 } },
  vertexShader: chunkVert, fragmentShader: chunkFrag,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

// sun & moon
const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), new THREE.MeshBasicMaterial({ color: 0xfff3a8, fog: false, depthWrite: false }));
const moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: 0xd8deea, fog: false, depthWrite: false }));
scene.add(sunMesh); scene.add(moonMesh);

// drifting blocky clouds
const cloudTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  cx.fillStyle = 'rgba(255,255,255,0.92)';
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 64 | 0, y = rnd() * 64 | 0, w = 4 + rnd() * 12 | 0, h = 2 + rnd() * 6 | 0;
    cx.fillRect(x, y, w, h);
    cx.fillRect(x + 2, y - 2, Math.max(2, w - 4), 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
})();
const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), cloudMat);
cloudMesh.rotation.x = Math.PI / 2;
cloudMesh.position.y = 112;
scene.add(cloudMesh);

// block outline + crack overlay
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111 }));
outline.visible = false;
scene.add(outline);

const crackTextures = [];
{
  for (let s = 0; s < 10; s++) {
    const [tx, ty] = atlas.tiles.get('crack' + s);
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
    cv.getContext('2d').drawImage(atlas.canvas, tx * TILE, ty * TILE, TILE, TILE, 0, 0, TILE, TILE);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    crackTextures.push(t);
  }
}
const crackMat = new THREE.MeshBasicMaterial({ map: crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMat);
crackMesh.visible = false;
scene.add(crackMesh);

// ---------------- game state ----------------
let world = null, player = null, entities = null, ui = null;
const audio = new GameAudio();
audio.setVolume(SETTINGS.vol / 100);
const input = new Input(renderer.domElement);
const net = new Net();
const touch = new TouchControls(input, {
  pause: () => { if (state === 'playing' && !paused) showPause(true); },
  inventory: () => {
    if (state !== 'playing' || paused || !ui) return;
    if (ui.isOpen()) ui.close();
    else if (!player.dead) ui.open('inventory');
  },
});
touch.show(false);
let state = 'menu'; // menu | loading | playing
let paused = false;
let ambTimer = 5, fireflyTimer = 1, gameTime = 0, lastDusk = 0;
let deathShown = false;
const chunkMeshes = new Map(); // key -> {solid, fluid}
let genQueue = [];
let autosaveTimer = 30;
let stepTimer = 0;
let mining = null; // {x,y,z, progress, time}
let placeCooldown = 0;
let debugOn = false;
let fpsAcc = 0, fpsN = 0, fps = 60;

// ---------------- day/night ----------------
function dayFactorAt(time) {
  const t = ((time % 24000) + 24000) % 24000;
  if (t < 11500) return 1;
  if (t < 13500) return lerp(1, 0.12, (t - 11500) / 2000);
  if (t < 22000) return 0.12;
  if (t < 24000) return lerp(0.12, 1, (t - 22000) / 2000);
  return 1;
}
const dayZen = new THREE.Color(0x6fb0ff), nightZen = new THREE.Color(0x070b16);
const dayFog = new THREE.Color(0xbcd8ff), nightFog = new THREE.Color(0x0d1220);
const duskFog = new THREE.Color(0xe8965a);

function updateSky(dt) {
  const df = dayFactorAt(world.time);
  sharedUniforms.uDay.value = df;
  solidMat.uniforms.uDay.value = df;
  fluidMat.uniforms.uDay.value = df;
  const f = (df - 0.12) / 0.88;
  const sky = nightZen.clone().lerp(dayZen, f);
  let fog = nightFog.clone().lerp(dayFog, f);
  // dusk/dawn tint
  const t = ((world.time % 24000) + 24000) % 24000;
  const duskAmt = Math.max(0, 1 - Math.abs(t - 12200) / 1400) + Math.max(0, 1 - Math.abs(t - 23000) / 1400);
  lastDusk = clamp(duskAmt, 0, 1);
  fog.lerp(duskFog, clamp(duskAmt, 0, 1) * 0.55);
  if (player && player.headInWater) {
    fog.setRGB(0.08, 0.2, 0.45); sky.setRGB(0.08, 0.2, 0.45);
    solidMat.uniforms.uFogNear.value = 4; solidMat.uniforms.uFogFar.value = 18;
    fluidMat.uniforms.uFogNear.value = 4; fluidMat.uniforms.uFogFar.value = 18;
  } else {
    const far = SETTINGS.rd * CHUNK;
    solidMat.uniforms.uFogNear.value = far - 24; solidMat.uniforms.uFogFar.value = far - 4;
    fluidMat.uniforms.uFogNear.value = far - 24; fluidMat.uniforms.uFogFar.value = far - 4;
  }
  renderer.setClearColor(sky);
  solidMat.uniforms.uFogColor.value.copy(fog);
  fluidMat.uniforms.uFogColor.value.copy(fog);
  // sun/moon
  const u = t / 24000;
  const a = u * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.18).normalize();
  sunMesh.position.copy(camera.position).addScaledVector(dir, 380);
  sunMesh.lookAt(camera.position);
  moonMesh.position.copy(camera.position).addScaledVector(dir, -380);
  moonMesh.lookAt(camera.position);
  // clouds follow the player but stay world-anchored via texture offset
  if (player) {
    cloudMesh.position.x = player.pos.x;
    cloudMesh.position.z = player.pos.z;
    cloudTex.offset.set((player.pos.x + gameTime * 1.6) / 220, -player.pos.z / 220);
    const cb = 0.35 + 0.65 * f;
    cloudMat.color.setRGB(cb, cb, cb * 1.02);
  }
}

// ---------------- chunk pipeline ----------------
function chunkKey(cx, cz) { return cx + ',' + cz; }

function rebuildChunkMesh(cx, cz) {
  const key = chunkKey(cx, cz);
  const old = chunkMeshes.get(key);
  if (old) {
    if (old.solid) { scene.remove(old.solid); old.solid.geometry.dispose(); }
    if (old.fluid) { scene.remove(old.fluid); old.fluid.geometry.dispose(); }
  }
  const data = meshChunk(world, cx, cz);
  const entry = { solid: null, fluid: null };
  for (const part of ['solid', 'fluid']) {
    const d = data[part];
    if (!d) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('tile', new THREE.Float32BufferAttribute(d.tile, 2));
    g.setAttribute('lightsb', new THREE.Float32BufferAttribute(d.light, 2));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(d.ao, 1));
    g.setAttribute('wave', new THREE.Float32BufferAttribute(d.wave, 1));
    g.setIndex(d.index);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, part === 'solid' ? solidMat : fluidMat);
    mesh.position.set(cx * CHUNK, 0, cz * CHUNK);
    scene.add(mesh);
    entry[part] = mesh;
  }
  chunkMeshes.set(key, entry);
}

function neighborsGenerated(cx, cz) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = world.chunks.get(chunkKey(cx + dx, cz + dz));
    if (!c || !c.generated) return false;
  }
  return true;
}
function neighborsLit(cx, cz) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = world.chunks.get(chunkKey(cx + dx, cz + dz));
    if (!c || !c.lit) return false;
  }
  return true;
}

function chunkPipeline(budgetMs) {
  const start = performance.now();
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  const rd = SETTINGS.rd;

  // 1. queue generation (rd+2 ring so lighting at rd+1 and meshing at rd both work)
  genQueue = [];
  for (let dz = -rd - 2; dz <= rd + 2; dz++) for (let dx = -rd - 2; dx <= rd + 2; dx++) {
    const cx = pcx + dx, cz = pcz + dz;
    const c = world.chunks.get(chunkKey(cx, cz));
    if (!c || !c.generated) genQueue.push([dx * dx + dz * dz, cx, cz]);
  }
  genQueue.sort((a, b) => a[0] - b[0]);
  for (const [, cx, cz] of genQueue) {
    if (performance.now() - start > budgetMs) return;
    world.ensureChunk(cx, cz);
  }

  // 2. light init (needs 3×3 generated)
  for (let r = 0; r <= rd + 1; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const c = world.chunks.get(chunkKey(cx, cz));
      if (c && c.generated && !c.lit && neighborsGenerated(cx, cz)) {
        world.initLight(c);
        if (performance.now() - start > budgetMs) return;
      }
    }
  }

  // 3. remesh dirty chunks (needs 3×3 lit), nearest first
  if (world.dirty.size) {
    const dirtyList = [...world.dirty]
      .map(k => { const [cx, cz] = k.split(',').map(Number); return [Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)), cx, cz, k]; })
      .sort((a, b) => a[0] - b[0]);
    for (const [dist, cx, cz, k] of dirtyList) {
      const c = world.chunks.get(k);
      if (!c || dist > rd + 2) { world.dirty.delete(k); continue; }
      if (!c.lit || !neighborsLit(cx, cz)) continue;
      world.dirty.delete(k);
      rebuildChunkMesh(cx, cz);
      if (performance.now() - start > budgetMs) return;
    }
  }

  // 4. unload distant chunks
  for (const [key, c] of world.chunks) {
    const dx = c.cx - pcx, dz = c.cz - pcz;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > rd + 3) {
      if (c.modified) world.savedChunks.set(key, c.blocks.slice());
      const m = chunkMeshes.get(key);
      if (m) {
        if (m.solid) { scene.remove(m.solid); m.solid.geometry.dispose(); }
        if (m.fluid) { scene.remove(m.fluid); m.fluid.geometry.dispose(); }
        chunkMeshes.delete(key);
      }
      world.chunks.delete(key);
    }
  }
}

function loadedFraction() {
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  let done = 0, total = 0;
  for (let dz = -SETTINGS.rd; dz <= SETTINGS.rd; dz++) for (let dx = -SETTINGS.rd; dx <= SETTINGS.rd; dx++) {
    total++;
    const c = world.chunks.get(chunkKey(pcx + dx, pcz + dz));
    if (c && c.lit && !world.dirty.has(chunkKey(pcx + dx, pcz + dz))) done++;
  }
  return done / total;
}

// ---------------- block entities (furnace) ----------------
function ensureBE(x, y, z, type) {
  const k = x + ',' + y + ',' + z;
  let be = world.blockEntities.get(k);
  if (!be) {
    be = type === 'chest'
      ? { type: 'chest', slots: new Array(27).fill(null) }
      : { type: 'furnace', in: null, fuel: null, out: null, progress: 0, burn: 0, burnMax: 1 };
    world.blockEntities.set(k, be);
  }
  return be;
}

function tickFurnaces(dt) {
  for (const [k, be] of world.blockEntities) {
    if (be.type !== 'furnace') continue;
    const [x, y, z] = k.split(',').map(Number);
    const canSmelt = be.in && SMELTING[be.in.id] !== undefined &&
      (!be.out || (be.out.id === SMELTING[be.in.id] && be.out.n < 64));
    if (be.burn <= 0 && canSmelt && be.fuel && FUELS[be.fuel.id]) {
      be.burn = be.burnMax = FUELS[be.fuel.id];
      be.fuel.n--; if (be.fuel.n <= 0) be.fuel = null;
    }
    if (be.burn > 0) {
      be.burn -= dt;
      if (canSmelt) {
        be.progress += dt;
        if (be.progress >= 10) {
          be.progress = 0;
          const outId = SMELTING[be.in.id];
          if (be.out) be.out.n++; else be.out = { id: outId, n: 1 };
          be.in.n--; if (be.in.n <= 0) be.in = null;
        }
      } else be.progress = Math.max(0, be.progress - dt * 2);
    } else be.progress = Math.max(0, be.progress - dt * 2);
    // swap lit/unlit furnace block
    const cur = world.getBlock(x, y, z);
    if (be.burn > 0 && cur === 27) world.setBlock(x, y, z, 28);
    else if (be.burn <= 0 && cur === 28) world.setBlock(x, y, z, 27);
  }
}

// ---------------- interaction ----------------
function currentRay() {
  const eye = player.eyePos(), dir = player.lookDir();
  return raycast(world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 5);
}

function screenDir(px, py) {
  const v = new THREE.Vector3((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5);
  v.unproject(camera);
  v.sub(camera.position).normalize();
  return { origin: player.eyePos(), dir: { x: v.x, y: v.y, z: v.z } };
}
function rayFromScreen(px, py) {
  const { origin, dir } = screenDir(px, py);
  return raycast(world, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 5);
}

const ORE_XP = { 19: 1, 20: 1, 21: 2, 22: 7, 23: 4, 24: 6, 25: 3 };

function attackMob(mob, dir) {
  player.attackCooldown = 0.55;
  const held = player.held();
  const tool = held && ITEMS[held.id] ? ITEMS[held.id].tool : null;
  let dmg = tool ? tool.dmg : 1;
  if (held && held.ench && (held.ench.n === 'Sharpness' || held.ench.n === 'Power')) dmg += held.ench.l * 1.5;
  if (!player.onGround && player.vel.y < 0) dmg *= 1.5; // crit
  if (mob.net) { // guest: host owns the mobs
    net.broadcast({ t: 'hit', i: entities.mobs.indexOf(mob), dmg });
    mob.hurtTimer = 0.3;
    player.exhaustion += 0.1;
    return;
  }
  const kd = Math.hypot(dir.x, dir.z) + 0.001;
  entities.hurtMob(mob, dmg, { x: dir.x / kd, z: dir.z / kd }, player, true);
  if (tool) { if (player.damageTool(player.sel)) audio.play('break_tool'); }
  player.exhaustion += 0.1;
}

function breakTimeFor(id) {
  const def = BLOCKS[id];
  if (def.hard < 0) return Infinity;
  if (player.gamemode === 'creative') return 0.05;
  const held = player.held();
  const tool = held && ITEMS[held.id] ? ITEMS[held.id].tool : null;
  const rightTool = tool && def.tool && tool.type === def.tool;
  const canHarvest = !def.needsTool || (rightTool && tool.tier >= def.tier);
  let speed = rightTool ? tool.speed : 1;
  if (rightTool && held.ench && held.ench.n === 'Efficiency') speed *= 1 + 0.5 * held.ench.l;
  if (tool && tool.type === 'sword' && def.cross) speed = 10;
  return Math.max(0.05, def.hard * 1.5 / speed * (canHarvest ? 1 : 3.3));
}

function canHarvestBlock(id) {
  const def = BLOCKS[id];
  if (!def.needsTool) return true;
  const held = player.held();
  const tool = held && ITEMS[held.id] ? ITEMS[held.id].tool : null;
  return !!(tool && tool.type === def.tool && tool.tier >= def.tier);
}

function handleMining(dt) {
  const ray = touch.mining ? rayFromScreen(touch.mining.x, touch.mining.y) : currentRay();
  outline.visible = !!ray;
  if (ray) outline.position.set(ray.x + 0.5, ray.y + 0.5, ray.z + 0.5);

  const held0 = input.mouse[0] || input.justMouse[0] || !!touch.mining;
  if (!held0 || !ray || BLOCKS[ray.id].hard < 0) {
    mining = null;
    crackMesh.visible = false;
    return;
  }
  // melee first: if a mob is closer than the block, attack instead
  if (input.justMouse[0]) {
    const eye = player.eyePos(), dir = player.lookDir();
    const mob = entities.raycastMob(eye, dir, Math.min(3.5, ray.dist));
    if (mob && player.attackCooldown <= 0) {
      attackMob(mob, dir);
      mining = null;
      return;
    }
  }

  if (!mining || mining.x !== ray.x || mining.y !== ray.y || mining.z !== ray.z) {
    mining = { x: ray.x, y: ray.y, z: ray.z, progress: 0, time: breakTimeFor(ray.id), sndT: 0 };
  }
  mining.time = breakTimeFor(ray.id);
  mining.progress += dt / mining.time;
  mining.sndT -= dt;
  if (mining.sndT <= 0) { mining.sndT = 0.25; audio.digFor(BLOCKS[ray.id].sound, { x: ray.x, y: ray.y, z: ray.z }); }
  crackMesh.visible = true;
  crackMesh.position.set(ray.x + 0.5, ray.y + 0.5, ray.z + 0.5);
  crackMat.map = crackTextures[clamp(Math.floor(mining.progress * 10), 0, 9)];

  if (mining.progress >= 1) {
    const id = ray.id;
    world.setBlock(ray.x, ray.y, ray.z, AIR);
    entities.blockParticles(ray.x + 0.5, ray.y + 0.5, ray.z + 0.5, id);
    audio.digFor(BLOCKS[id].sound, { x: ray.x, y: ray.y, z: ray.z });
    if (player.gamemode === 'survival' && canHarvestBlock(id)) {
      for (const d of entities.dropsOf(id)) {
        const drop = { ...d };
        if (drop.id === 27 || drop.id === 28) drop.id = 27;
        entities.dropItem(ray.x + 0.5, ray.y + 0.3, ray.z + 0.5, drop);
      }
      if (ORE_XP[id]) player.addXP(ORE_XP[id]);
    }
    const held = player.held();
    if (player.gamemode === 'survival' && held && ITEMS[held.id] && ITEMS[held.id].tool) {
      if (player.damageTool(player.sel)) audio.play('break_tool');
    }
    player.stats.mined++;
    player.exhaustion += 0.005;
    mining = null;
    crackMesh.visible = false;
  }
}

function tryInteract(ray) {
  const id = ray.id;
  if (id === 26) { exitLock(); ui.open('table'); return true; }
  if (id === 85) { exitLock(); ui.open('enchant'); return true; }
  if (id === 27 || id === 28) { exitLock(); ui.open('furnace', ensureBE(ray.x, ray.y, ray.z, 'furnace')); return true; }
  if (id === 29) { exitLock(); ui.open('chest', ensureBE(ray.x, ray.y, ray.z, 'chest')); audio.play('dig_wood'); return true; }
  if (id === 49) { // bed
    player.spawn = { x: ray.x + 0.5, y: ray.y + 1, z: ray.z + 0.5 };
    const t = ((world.time % 24000) + 24000) % 24000;
    if (t > 12200 && t < 23200) {
      world.time = Math.ceil(world.time / 24000) * 24000;
      audio.play('sleep');
      ui.toast('You slept through the night. Spawn point set.');
    } else ui.toast('Spawn point set.');
    return true;
  }
  return false;
}

function handlePlacing(dt) {
  placeCooldown -= dt;
  if ((!input.mouse[2] && !input.justMouse[2]) || placeCooldown > 0) return;
  doUse(currentRay(), input.justMouse[2]);
}

function tryTame(mob) {
  const held = player.held();
  if (!held || !mob.def.tameable || mob.tamed) return false;
  if (held.id !== 279 && ![271, 273, 275, 277].includes(held.id)) return false;
  if (player.gamemode !== 'creative') { held.n--; if (held.n <= 0) player.inventory[player.sel] = null; }
  if (Math.random() < 0.5) { entities.tameMob(mob); ui.toast('The wolf is your friend now!'); }
  else entities.addParticles(mob.pos.x, mob.pos.y + mob.h, mob.pos.z, [0.6, 0.6, 0.6], 5, 1);
  placeCooldown = 0.35;
  return true;
}

function handleTap(tap) {
  // mobile quick tap: attack a mob, otherwise interact / place at the tapped spot
  if (placeCooldown > 0) return;
  const { origin, dir } = screenDir(tap.x, tap.y);
  const ray = rayFromScreen(tap.x, tap.y);
  const mob = entities.raycastMob(origin, dir, Math.min(3.5, ray ? ray.dist : 3.5));
  if (mob && mob.def.trader) { ui.open('trade'); placeCooldown = 0.3; return; }
  if (mob && tryTame(mob)) return;
  if (mob && player.attackCooldown <= 0) { attackMob(mob, dir); return; }
  doUse(ray, true);
}

function doUse(ray, just) {
  if (ray && just && !player.sneaking && tryInteract(ray)) { placeCooldown = 0.25; return; }

  // feed / tame / trade with a mob you're looking at
  if (just) {
    const mobT = entities.raycastMob(player.eyePos(), player.lookDir(), 3);
    if (mobT && mobT.def.trader) { exitLock(); ui.open('trade'); placeCooldown = 0.3; return; }
    if (mobT && tryTame(mobT)) return;
  }

  const held = player.held();
  if (!held) return;
  const def = defOf(held.id);
  const creative = player.gamemode === 'creative';
  const consume = () => { if (!creative) { held.n--; if (held.n <= 0) player.inventory[player.sel] = null; } };

  // hoe: till grass/dirt into farmland
  if (def.tool && def.tool.type === 'hoe' && ray && (ray.id === 2 || ray.id === 3) &&
      world.getBlock(ray.x, ray.y + 1, ray.z) === AIR) {
    world.setBlock(ray.x, ray.y, ray.z, 75);
    audio.play('dig_gravel', ray);
    if (!creative && player.damageTool(player.sel)) audio.play('break_tool');
    placeCooldown = 0.25;
    return;
  }
  // plant seeds on farmland
  if (held.id === 285 && ray && ray.id === 75 && world.getBlock(ray.x, ray.y + 1, ray.z) === AIR) {
    world.setBlock(ray.x, ray.y + 1, ray.z, 76);
    consume();
    audio.play('dig_grass', ray);
    placeCooldown = 0.25;
    return;
  }

  // eat
  if (def.food && player.hunger < 20 && player.eatCooldown <= 0) {
    if (!just) return;
    player.eat(def);
    player.eatCooldown = 0.6;
    held.n--; if (held.n <= 0) player.inventory[player.sel] = null;
    audio.play('eat');
    placeCooldown = 0.3;
    return;
  }
  // bow
  if (def.tool && def.tool.type === 'bow') {
    if (!just) return;
    if (player.countOf(283) > 0) {
      player.removeN(283, 1);
      const eye = player.eyePos(), dir = player.lookDir();
      entities.shootArrow(eye, dir, 28, true, 6);
      if (player.damageTool(player.sel)) audio.play('break_tool');
      placeCooldown = 0.7;
    }
    return;
  }
  // place block
  if (held.id < 256 && ray) {
    const px = ray.x + ray.face[0], py = ray.y + ray.face[1], pz = ray.z + ray.face[2];
    if (py < 0 || py >= H) return;
    const target = world.getBlock(px, py, pz);
    const tDef = BLOCKS[target];
    if (!(target === AIR || tDef.fluid || (tDef.cross && !tDef.climbable))) return;
    const bDef = BLOCKS[held.id];
    // don't place a solid block inside the player or a mob
    if (bDef.solid) {
      const overlaps = (e, h) =>
        px + 1 > e.pos.x - e.w / 2 && px < e.pos.x + e.w / 2 &&
        pz + 1 > e.pos.z - e.w / 2 && pz < e.pos.z + e.w / 2 &&
        py + 1 > e.pos.y && py < e.pos.y + h;
      if (overlaps(player, player.h)) return;
      for (const m of entities.mobs) if (overlaps(m, m.h)) return;
    }
    // crosses need solid ground (ladder excepted); saplings need soil
    if (bDef.cross && !bDef.climbable && !BLOCKS[world.getBlock(px, py - 1, pz)].solid) return;
    if (SAPLINGS.includes(held.id) && ![2, 3, 34].includes(world.getBlock(px, py - 1, pz))) return;
    world.setBlock(px, py, pz, held.id);
    consume();
    audio.play('place', { x: px, y: py, z: pz });
    player.stats.placed++;
    placeCooldown = 0.22;
  }
}

function dropHeld() {
  const held = player.held();
  if (!held) return;
  const dir = player.lookDir();
  const eye = player.eyePos();
  const stack = { id: held.id, n: 1, ...(held.dur !== undefined ? { dur: held.dur } : {}) };
  held.n--; if (held.n <= 0) player.inventory[player.sel] = null;
  entities.dropItem(eye.x + dir.x * 0.4, eye.y - 0.3, eye.z + dir.z * 0.4, stack,
    { x: dir.x * 6, y: dir.y * 6 + 2, z: dir.z * 6 });
}

function dropAllInventory() {
  for (let i = 0; i < 36; i++) {
    const s = player.inventory[i];
    if (s) {
      entities.dropItem(player.pos.x, player.pos.y + 1, player.pos.z, s,
        { x: (Math.random() - 0.5) * 5, y: 3 + Math.random() * 2, z: (Math.random() - 0.5) * 5 });
      player.inventory[i] = null;
    }
  }
  for (let i = 0; i < 4; i++) {
    if (player.armor[i]) {
      entities.dropItem(player.pos.x, player.pos.y + 1, player.pos.z, player.armor[i],
        { x: (Math.random() - 0.5) * 5, y: 3, z: (Math.random() - 0.5) * 5 });
      player.armor[i] = null;
    }
  }
}

// ---------------- random ticks: crops grow, saplings become trees ----------------
let rtickTimer = 0;
function randomTicks(dt) {
  rtickTimer -= dt;
  if (rtickTimer > 0) return;
  rtickTimer = 0.5;
  if (net.active && !net.isHost) return; // host authority
  const df = dayFactorAt(world.time);
  for (let i = 0; i < 30; i++) {
    const bx = Math.floor(player.pos.x) + ((Math.random() * 96 | 0) - 48);
    const bz = Math.floor(player.pos.z) + ((Math.random() * 96 | 0) - 48);
    const by = Math.random() * H | 0;
    const id = world.getBlock(bx, by, bz);
    if (id === 76 || id === 77) {
      const light = Math.max(world.getLight(bx, by, bz), world.getSky(bx, by, bz) * df);
      if (light >= 9 && Math.random() < 0.4) world.setBlock(bx, by, bz, id + 1);
    } else if (SAPLINGS.includes(id) && Math.random() < 0.15) {
      const light = Math.max(world.getLight(bx, by, bz), world.getSky(bx, by, bz) * df);
      if (light >= 9) {
        const sp = SAPLINGS.indexOf(id);
        world.setBlock(bx, by, bz, AIR);
        world.growTree(bx, by, bz, sp);
      }
    }
  }
}

// ---------------- pointer lock / screens ----------------
function requestLock() { if (!IS_TOUCH) renderer.domElement.requestPointerLock(); }
function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing' && !ui.isOpen() && !paused && !player.dead) {
    showPause(true);
  }
});

function showPause(on) {
  paused = on;
  if (on) $('pause').querySelector('h2').textContent = 'Game Paused' + (window.ROOMCODE ? ' · Room code: ' + window.ROOMCODE : '');
  $('pause').classList.toggle('hidden', !on);
  if (!on) requestLock();
}

renderer.domElement.addEventListener('click', () => {
  audio.ensure();
  if (state === 'playing' && !paused && !ui.isOpen() && !player.dead && !document.pointerLockElement) requestLock();
});

window.addEventListener('keydown', e => {
  if (state !== 'playing') return;
  if (e.code === 'KeyE') {
    if (ui.isOpen()) { ui.close(); requestLock(); }
    else if (!paused && !player.dead) { exitLock(); ui.open('inventory'); }
  } else if (e.code === 'Escape') {
    if (ui.isOpen()) { ui.close(); requestLock(); }
    else if (paused) showPause(false);
  } else if (e.code === 'KeyQ' && !ui.isOpen() && !paused) dropHeld();
  else if (e.code === 'F3') { e.preventDefault(); debugOn = !debugOn; $('debug').classList.toggle('hidden', !debugOn); }
  if (/^Digit[1-9]$/.test(e.code) && !ui.isOpen()) player.sel = +e.code[5] - 1;
});

// ---------------- menu wiring ----------------
let savedMeta = null;
loadMeta().then(m => { savedMeta = m; if (m) $('btn-continue').disabled = false; });

$('btn-new').addEventListener('click', async () => {
  audio.ensure();
  const seedStr = $('seedinput').value.trim() || String(Math.floor(Math.random() * 1e9));
  await clearSave();
  startGame(seedStr, null);
});
$('btn-mp').addEventListener('click', () => {
  $('menu').classList.add('hidden');
  $('mpscreen').classList.remove('hidden');
});
$('btn-mp-back').addEventListener('click', () => {
  $('mpscreen').classList.add('hidden');
  $('menu').classList.remove('hidden');
});
$('btn-host').addEventListener('click', async () => {
  audio.ensure();
  net.onStatus = t => { $('mpstatus').textContent = t; if (ui) ui.toast(t); };
  try {
    const code = await net.host(() => {
      const chunks = [];
      for (const [key, c] of world.chunks) if (c.modified) world.savedChunks.set(key, c.blocks.slice());
      for (const [key, blocks] of world.savedChunks) chunks.push([key, blocks]);
      return {
        seed: world.seedStr, time: world.time, chunks,
        blockEntities: [...world.blockEntities.entries()],
      };
    });
    $('hostinfo').classList.remove('hidden');
    $('roomcode').textContent = code;
    window.ROOMCODE = code;
  } catch (e) { return; }
  // start hosting on the saved world if present, else a fresh one
  $('mpscreen').classList.add('hidden');
  if (savedMeta) startGame(savedMeta.seed, savedMeta);
  else { await clearSave(); startGame(String(Math.floor(Math.random() * 1e9)), null); }
});
$('btn-join').addEventListener('click', async () => {
  audio.ensure();
  const code = $('joincode').value.trim();
  if (code.length < 4) { $('mpstatus').textContent = 'Type the room code first.'; return; }
  net.onStatus = t => { $('mpstatus').textContent = t; if (ui) ui.toast(t); };
  try {
    const init = await net.join(code);
    $('mpscreen').classList.add('hidden');
    startGame(init.seed, null, init);
  } catch (e) { }
});
$('btn-continue').addEventListener('click', async () => {
  audio.ensure();
  if (!savedMeta) return;
  startGame(savedMeta.seed, savedMeta);
});
$('btn-resume').addEventListener('click', () => showPause(false));
$('btn-save').addEventListener('click', async () => {
  await saveWorld(world, player, entities);
  ui.toast('World saved.');
  showPause(false);
});
$('btn-quit').addEventListener('click', async () => {
  await saveWorld(world, player, entities);
  location.reload();
});
$('btn-death-quit').addEventListener('click', async () => {
  await saveWorld(world, player, entities);
  location.reload();
});
$('btn-respawn').addEventListener('click', () => {
  player.respawn();
  deathShown = false;
  $('death').classList.add('hidden');
  requestLock();
});

// settings sliders
function bindSetting(id, key, valId, fmt, onChange) {
  const el = $(id);
  el.value = SETTINGS[key];
  $(valId).textContent = fmt(SETTINGS[key]);
  el.addEventListener('input', () => {
    SETTINGS[key] = +el.value;
    $(valId).textContent = fmt(SETTINGS[key]);
    saveSettings();
    if (onChange) onChange();
  });
}
bindSetting('set-shader', 'shader', 'shader-val', v => PRESETS[v].name);
bindSetting('set-rd', 'rd', 'rd-val', v => v + ' chunks');
bindSetting('set-fov', 'fov', 'fov-val', v => v + '°', () => { camera.fov = SETTINGS.fov; camera.updateProjectionMatrix(); });
bindSetting('set-sens', 'sens', 'sens-val', v => String(v));
bindSetting('set-vol', 'vol', 'vol-val', v => v + '%', () => audio.setVolume(SETTINGS.vol / 100));

// ---------------- start game ----------------
let activeMeta = null;
async function startGame(seedStr, meta, netInit = null) {
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');
  activeMeta = meta;

  world = new World(seedStr);
  player = new Player(world);
  entities = new EntityManager(scene, world, audio);
  ui = new UI(player, audio);
  ui.onClose = () => { if (!paused && !player.dead) requestLock(); };
  const pspr = particleSprite();
  if (pspr) entities.setParticleTexture(pspr);
  ui.onDrop = stack => {
    const dir = player.lookDir();
    const eye = player.eyePos();
    entities.dropItem(eye.x + dir.x * 0.4, eye.y - 0.3, eye.z + dir.z * 0.4, stack,
      { x: dir.x * 5, y: 2, z: dir.z * 5 });
  };
  player.gamemode = (meta && meta.gamemode) || GAMEMODES[gmIdx];
  player.onDamaged = (amt, opts) => { if (!opts.silentTick) audio.play('hurt', player.pos); };
  player.onLevelUp = lvl => { audio.play('level'); ui.toast('Level up! Now level ' + lvl); };

  // multiplayer hooks
  net.scene = scene;
  world.onBlockSet = (x, y, z, id) => net.sendBlock(x, y, z, id);
  net.onBlock = (x, y, z, id) => {
    net.applyingRemote = true;
    world.setBlock(x, y, z, id);
    net.applyingRemote = false;
  };
  net.onMobs = snap => entities.applyMobSnapshot(snap);
  net.onHit = (i, dmg) => { const m = entities.mobs[i]; if (m) entities.hurtMob(m, dmg, null, player, false); };
  net.onTime = v => { world.time = v; };
  if (netInit) {
    entities.puppet = true;
    world.time = netInit.time || 6000;
    for (const [k, blocks] of netInit.chunks || []) world.savedChunks.set(k, new Uint8Array(blocks));
    for (const [k, v] of netInit.blockEntities || []) world.blockEntities.set(k, v);
  }
  entities.onMobKilled = (mob, byPlayer) => { if (byPlayer) player.addXP(mob.def.passive ? 1 : 5); };
  window.GAME = { get world() { return world; }, get player() { return player; }, get entities() { return entities; }, get ui() { return ui; } };

  if (meta) {
    await loadChunks(world, meta.chunkKeys);
    world.time = meta.time || 6000;
    player.spawn = meta.spawn || null;
    for (const [k, v] of Object.entries(meta.blockEntities || {})) world.blockEntities.set(k, v);
    const p = meta.player;
    if (p) {
      player.pos = p.pos; player.yaw = p.yaw; player.pitch = p.pitch;
      player.health = p.health; player.hunger = p.hunger; player.saturation = p.saturation;
      player.inventory = p.inventory; player.armor = p.armor || new Array(4).fill(null);
      player.sel = p.sel || 0;
      player.stats = p.stats || player.stats;
      player.xp = p.xp || 0; player.level = p.level || 0;
    }
  } else {
    // find a land spawn
    let sx = 8, sz = 8;
    for (let i = 0; i < 80; i++) {
      const h = world.heightAt(sx, sz);
      if (h > SEA + 1) break;
      sx += 24;
    }
    player.pos = { x: sx + 0.5, y: world.heightAt(sx, sz) + 2, z: sz + 0.5 };
    player.spawn = { ...player.pos };
  }

  state = 'loading';
}

function findClearGround(cx, cz) {
  // prefer open terrain (not inside/on top of trees, not water)
  for (let r = 0; r <= 10; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = cx + dx * 2, z = cz + dz * 2;
      if (!world.chunkAt(x, z) || !world.chunkAt(x, z).generated) continue;
      const h = world.heightAt(x, z);
      if (h <= SEA + 1) continue;
      const ground = world.getBlock(x, h, z);
      if (!BLOCKS[ground].solid) continue;
      const a1 = world.getBlock(x, h + 1, z), a2 = world.getBlock(x, h + 2, z);
      if ((a1 === AIR || BLOCKS[a1].cross) && a2 === AIR) return { x: x + 0.5, y: h + 1.05, z: z + 0.5 };
    }
  }
  return null;
}

function finishLoading() {
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  // relocate fresh spawns that ended up buried, floating, or on a treetop
  if (!activeMeta && !player.dead) {
    const spot = findClearGround(Math.floor(player.pos.x), Math.floor(player.pos.z));
    if (spot) { player.pos = spot; player.spawn = { ...spot }; }
    else player.pos.y = world.surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z)) + 1.05;
  }
  if (activeMeta && activeMeta.mobs) entities.deserialize(activeMeta.mobs);
  state = 'playing';
  touch.show(touch.active);
  ui.toast(touch.active ? 'Hold to mine · tap to place · joystick to move' : 'Punch a tree to get wood. Good luck!');
  requestLock();
}

window.addEventListener('beforeunload', () => {
  if (state === 'playing' && (!net.active || net.isHost)) saveWorld(world, player, entities);
});

// ---------------- footsteps ----------------
function footsteps(dt) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && speed > 1.5) {
    stepTimer -= dt * speed;
    if (stepTimer <= 0) {
      stepTimer = 1.7;
      const under = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.01), Math.floor(player.pos.z));
      if (under !== AIR) audio.stepFor(BLOCKS[under].sound, player.pos);
    }
  }
}

// ---------------- debug ----------------
function updateDebug() {
  if (!debugOn) return;
  const p = player.pos;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const biome = world.biomeAt(bx, bz);
  const df = dayFactorAt(world.time);
  $('debug').textContent =
    `Crafter Mine | FPS ${fps.toFixed(0)}\n` +
    `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
    `Chunk ${Math.floor(bx / 16)},${Math.floor(bz / 16)}  Biome ${BIOME_NAMES[biome]}\n` +
    `Light sky ${world.getSky(bx, by, bz)} blk ${world.getLight(bx, by, bz)} day ${df.toFixed(2)}\n` +
    `Time ${Math.floor(((world.time % 24000) + 24000) % 24000)}  Mobs ${entities.mobs.length}  Drops ${entities.drops.length}\n` +
    `Chunks ${world.chunks.size} meshes ${chunkMeshes.size} dirty ${world.dirty.size}\n` +
    `Seed ${world.seedStr}`;
}

// ---------------- main loop ----------------
let lastT = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  if (state === 'loading') {
    chunkPipeline(IS_TOUCH ? 24 : 40);
    const f = loadedFraction();
    $('loadfill').style.width = (f * 100).toFixed(0) + '%';
    $('loadpct').textContent = (f * 100).toFixed(0) + '%';
    if (f >= 1) finishLoading();
    input.endFrame();
    return;
  }
  if (state !== 'playing') { input.endFrame(); return; }

  const uiOpen = ui.isOpen() || paused || player.dead;
  const controlsActive = input.locked || (touch.active && !uiOpen);
  input.touchState = touch.active && !uiOpen && !paused
    ? { fwd: touch.move.fwd, str: touch.move.str, jump: touch.jump, sneak: touch.sneak, flyToggle: touch.consumeFlyToggle() }
    : null;

  if (!paused) {
    world.time += dt * 20;
    gameTime += dt;
    const df = dayFactorAt(world.time);

    player.update(input, dt, uiOpen || !controlsActive);
    if (controlsActive && !uiOpen && player.gamemode !== 'spectator') {
      handleMining(dt);
      handlePlacing(dt);
      const tap = touch.consumeTap();
      if (tap) handleTap(tap);
      if (input.wheel) player.sel = ((player.sel + input.wheel) % 9 + 9) % 9;
    } else {
      touch.consumeTap();
      mining = null; crackMesh.visible = false; outline.visible = false;
    }

    if (entities.puppet) {
      entities.updatePuppets(dt, world, df);
      // guests still simulate their own drops/arrows/particles via a light pass
      const mobsBackup = entities.mobs; entities.mobs = [];
      entities.update(dt, player, df);
      entities.mobs = mobsBackup;
    } else {
      entities.update(dt, player, df);
    }
    randomTicks(dt);
    net.tick(dt, player, entities, world);
    // remote player avatars
    for (const [pid, rp] of net.remotePlayers) {
      if (rp.x === undefined) continue;
      if (!rp.avatar) rp.avatar = entities.createAvatar();
      const g = rp.avatar.group;
      g.position.lerp(new THREE.Vector3(rp.x, rp.y, rp.z), Math.min(1, 10 * dt));
      g.rotation.y = rp.yaw || 0;
      if (rp.avatar.head) rp.avatar.head.rotation.x = -(rp.pitch || 0);
      const lx = Math.floor(g.position.x), ly = Math.floor(g.position.y + 1), lz = Math.floor(g.position.z);
      const ll = Math.max(world.getLight(lx, ly, lz), world.getSky(lx, ly, lz) * df);
      const br = 0.25 + 0.75 * (ll / 15);
      for (const mat of rp.avatar.mats) mat.color.setRGB(br, br, br);
    }
    tickFurnaces(dt);
    chunkPipeline(8);
    footsteps(dt);

    audio.setListener(player.eyePos());
    audio.updateMusic(dt, player.pos.y < SEA - 10);

    // nature ambience + fireflies (cozy!)
    const bx = Math.floor(player.pos.x), bz = Math.floor(player.pos.z);
    ambTimer -= dt;
    if (ambTimer <= 0) {
      ambTimer = 7 + Math.random() * 14;
      const biome = world.biomeAt(bx, bz);
      const underground = player.pos.y < 42 && world.getSky(bx, Math.floor(player.pos.y + 1), bz) === 0;
      if (underground) { if (Math.random() < 0.35) audio.ambient('cave'); }
      else if (df > 0.6 && LEAFY_BIOMES.includes(biome)) audio.ambient('birds');
      else if (df < 0.3 && GRASSY_BIOMES.includes(biome)) audio.ambient('crickets');
    }
    // village folk queued by worldgen
    while (world.pendingMobs.length) {
      const s2 = world.pendingMobs.pop();
      if (entities.mobs.filter(m => m.type === 'villager').length < 10 && !entities.puppet)
        entities.spawnMob(s2.type, s2.x + 0.5, s2.y, s2.z + 0.5);
    }
    // snowfall in cold biomes (drawn snow texture, drawn particles)
    const pBiome = world.biomeAt(bx, bz);
    if ([B_TUNDRA, B_TAIGA, B_MOUNT].includes(pBiome) && world.getSky(bx, Math.floor(player.pos.y + 1), bz) > 4) {
      for (let i = 0; i < 3; i++) {
        const ang2 = Math.random() * Math.PI * 2, d2 = Math.random() * 14;
        entities.addSnowflake(player.pos.x + Math.cos(ang2) * d2, player.pos.y + 7 + Math.random() * 6, player.pos.z + Math.sin(ang2) * d2);
      }
    }
    fireflyTimer -= dt;
    if (fireflyTimer <= 0) {
      fireflyTimer = 0.6;
      if (df < 0.4 && GRASSY_BIOMES.includes(world.biomeAt(bx, bz))) {
        const ang = Math.random() * Math.PI * 2, d = 5 + Math.random() * 16;
        const fx = player.pos.x + Math.cos(ang) * d, fz = player.pos.z + Math.sin(ang) * d;
        const fy = world.surfaceY(Math.floor(fx), Math.floor(fz)) + 1.2 + Math.random() * 2;
        entities.addFirefly(fx, fy, fz);
      }
    }

    if (player.dead && !deathShown) {
      deathShown = true;
      audio.play('death');
      dropAllInventory();
      ui.close();
      exitLock();
      $('deathinfo').textContent =
        `Blocks mined: ${player.stats.mined} · placed: ${player.stats.placed} · mobs slain: ${player.stats.kills}`;
      $('death').classList.remove('hidden');
    }

    autosaveTimer -= dt;
    if (autosaveTimer <= 0) {
      autosaveTimer = 30;
      if (!net.active || net.isHost) saveWorld(world, player, entities);
    }
  }

  // camera
  const eye = player.eyePos();
  camera.position.set(eye.x, eye.y, eye.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  const targetFov = SETTINGS.fov + (player.sprinting ? 9 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov = lerp(camera.fov, targetFov, 0.25);
    camera.updateProjectionMatrix();
  }

  updateSky(dt);
  ui.updateHUD(dt);
  updateDebug();
  sharedUniforms.uTime.value = gameTime;
  sharedUniforms.uWaveAmp.value = PRESETS[SETTINGS.shader] ? PRESETS[SETTINGS.shader].waves : 0;
  postFX.mode = SETTINGS.shader;
  postFX.render(scene, camera, { underwater: player.headInWater, time: gameTime, dusk: lastDusk });
  input.endFrame();
}
requestAnimationFrame(frame);
