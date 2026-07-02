// ---------------------------------------------------------------
// mesher.js — greedy chunk mesher with AO + baked light attributes
// ---------------------------------------------------------------
import { BLOCKS, AIR, LEAVES } from './blocks.js';
import { CHUNK, H } from './world.js';
import { tileFor } from './textures.js';

const WAVY_CROSS = new Set([38, 39, 40, 41, 42, 43, 72, 73]); // plants that sway (not torch/ladder)
const LEAF_SET = new Set(LEAVES);

// face dirs: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
const NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIR_BRIGHT = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
// in-plane axes (u, v) per direction, as 3D vectors
const UDIR = [[0, 0, 1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]];
const VDIR = [[0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];

const isCube = id => id !== AIR && !BLOCKS[id].cross && !BLOCKS[id].fluid;
const opaque = id => !BLOCKS[id].transparent;

class GeomData {
  constructor() { this.pos = []; this.uv = []; this.tile = []; this.light = []; this.ao = []; this.wave = []; this.index = []; this.vcount = 0; }
  quad(pts, uvs, tile, sky, blk, aos, wave = 0) {
    const b = this.vcount;
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.tile.push(tile[0], tile[1]);
      this.light.push(sky, blk);
      this.ao.push(aos[i]);
      this.wave.push(Array.isArray(wave) ? wave[i] : wave);
    }
    this.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.vcount += 4;
  }
  empty() { return this.vcount === 0; }
}

export function meshChunk(world, cx, cz) {
  // fast 3×3 chunk-neighbourhood accessors
  const nbr = [];
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++)
    nbr[dz * 3 + dx] = world.chunks.get(world.key(cx - 1 + dx, cz - 1 + dz)) || null;
  const bx0 = (cx - 1) * CHUNK, bz0 = (cz - 1) * CHUNK;
  const cellOf = (wx, wz) => nbr[((wz - bz0) >> 4) * 3 + ((wx - bx0) >> 4)];
  const getB = (wx, y, wz) => {
    if (y < 0) return 7; if (y >= H) return AIR;
    const c = cellOf(wx, wz);
    return c ? c.blocks[(wx & 15) + ((wz & 15) << 4) + (y << 8)] : AIR;
  };
  const getS = (wx, y, wz) => {
    if (y >= H) return 15; if (y < 0) return 0;
    const c = cellOf(wx, wz);
    return c ? c.sky[(wx & 15) + ((wz & 15) << 4) + (y << 8)] : 15;
  };
  const getL = (wx, y, wz) => {
    if (y >= H || y < 0) return 0;
    const c = cellOf(wx, wz);
    return c ? c.light[(wx & 15) + ((wz & 15) << 4) + (y << 8)] : 0;
  };

  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const solid = new GeomData(), fluid = new GeomData();

  // ---------------- greedy cube faces ----------------
  for (let d = 0; d < 6; d++) {
    const [nx, ny, nz] = NORMAL[d];
    const [ux, uy, uz] = UDIR[d], [vx, vy, vz] = VDIR[d];
    // slice axis + mask dims
    const isX = d < 2, isY = d === 2 || d === 3;
    const S = isY ? H : CHUNK;               // slices
    const US = 16, VS = isY ? 16 : H;        // mask size
    const maskKey = new Int32Array(US * VS);
    const maskAO = new Int32Array(US * VS);
    const maskBright = new Float32Array(US * VS);

    for (let s = 0; s < S; s++) {
      maskKey.fill(0);
      // build mask
      for (let v = 0; v < VS; v++) for (let u = 0; u < US; u++) {
        // cell block coords (local)
        let lx, ly, lz;
        if (isX) { lx = s; ly = v; lz = u; }
        else if (isY) { ly = s; lx = u; lz = v; }
        else { lz = s; lx = u; ly = v; }
        const wx = x0 + lx, wz = z0 + lz;
        const id = getB(wx, ly, wz);
        if (!isCube(id)) continue;
        const ax = wx + nx, ay = ly + ny, az = wz + nz;
        const n = getB(ax, ay, az);
        if (!(n === AIR || (BLOCKS[n].transparent && n !== id))) continue;
        const sky = getS(ax, ay, az), blk = getL(ax, ay, az);
        // AO corners at the neighbour cell
        let aoBits = 0;
        if (opaque(id)) {
          for (let ci = 0; ci < 4; ci++) {
            const su = ci === 0 || ci === 3 ? -1 : 1; // corners: 00,10,11,01
            const sv = ci < 2 ? -1 : 1;
            const s1 = opaque(getB(ax + ux * su, ay + uy * su, az + uz * su)) ? 1 : 0;
            const s2 = opaque(getB(ax + vx * sv, ay + vy * sv, az + vz * sv)) ? 1 : 0;
            const cc = opaque(getB(ax + ux * su + vx * sv, ay + uy * su + vy * sv, az + uz * su + vz * sv)) ? 1 : 0;
            const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
            aoBits |= ao << (ci * 2);
          }
        } else aoBits = 0xFF; // 3,3,3,3
        const m = v * US + u;
        maskKey[m] = 1 | (id << 1) | (sky << 10) | (blk << 14);
        maskAO[m] = aoBits;
        maskBright[m] = DIR_BRIGHT[d];
      }
      // greedy merge
      for (let v = 0; v < VS; v++) for (let u = 0; u < US;) {
        const m = v * US + u;
        const k = maskKey[m];
        if (!k) { u++; continue; }
        const a = maskAO[m];
        let w = 1;
        while (u + w < US && maskKey[m + w] === k && maskAO[m + w] === a) w++;
        let h = 1;
        outer: while (v + h < VS) {
          for (let i = 0; i < w; i++) {
            const mm = (v + h) * US + u + i;
            if (maskKey[mm] !== k || maskAO[mm] !== a) break outer;
          }
          h++;
        }
        // emit quad
        const id = (k >> 1) & 0x1FF, sky = (k >> 10) & 15, blk = (k >> 14) & 15;
        const tile = tileFor(id, d);
        const plane = s + (nx > 0 || ny > 0 || nz > 0 ? 1 : 0);
        const P = (uu, vv) => {
          if (isX) return [plane, vv, uu];
          if (isY) return [uu, plane, vv];
          return [uu, vv, plane];
        };
        const c00 = P(u, v), c10 = P(u + w, v), c11 = P(u + w, v + h), c01 = P(u, v + h);
        const u00 = [0, 0], u10 = [w, 0], u11 = [w, h], u01 = [0, h];
        const aoc = [];
        for (let ci = 0; ci < 4; ci++) aoc.push((0.4 + 0.2 * ((a >> (ci * 2)) & 3)) * DIR_BRIGHT[d]);
        // corner order in aoBits: 00,10,11,01
        const wv = LEAF_SET.has(id) ? 0.6 : 0;
        if (d === 0 || d === 2 || d === 5)
          solid.quad([c00, c01, c11, c10], [u00, u01, u11, u10], tile, sky, blk, [aoc[0], aoc[3], aoc[2], aoc[1]], wv);
        else
          solid.quad([c00, c10, c11, c01], [u00, u10, u11, u01], tile, sky, blk, [aoc[0], aoc[1], aoc[2], aoc[3]], wv);
        // clear mask
        for (let hh = 0; hh < h; hh++) for (let ww = 0; ww < w; ww++) maskKey[(v + hh) * US + u + ww] = 0;
        u += w;
      }
    }
  }

  // ---------------- crosses + fluids ----------------
  const c = world.chunks.get(world.key(cx, cz));
  const bl = c.blocks;
  for (let y = 0; y < H; y++) for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
    const id = bl[lx + (lz << 4) + (y << 8)];
    if (id === AIR) continue;
    const def = BLOCKS[id];
    const wx = x0 + lx, wz = z0 + lz;
    if (def.cross) {
      const sky = getS(wx, y, wz), blk = getL(wx, y, wz);
      const tile = tileFor(id, 0);
      const a = [1, 1, 1, 1];
      const wv = WAVY_CROSS.has(id) ? 1 : 0;
      const q = (p1, p2, p3, p4) => {
        // bottom verts anchored, top verts sway
        solid.quad([p1, p2, p3, p4], [[0, 0], [1, 0], [1, 1], [0, 1]], tile, sky, blk, a, [0, 0, wv, wv]);
        solid.quad([p4, p3, p2, p1], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sky, blk, a, [wv, wv, 0, 0]);
      };
      const e = 0.146;
      q([lx + e, y, lz + e], [lx + 1 - e, y, lz + 1 - e], [lx + 1 - e, y + 1, lz + 1 - e], [lx + e, y + 1, lz + e]);
      q([lx + e, y, lz + 1 - e], [lx + 1 - e, y, lz + e], [lx + 1 - e, y + 1, lz + e], [lx + e, y + 1, lz + 1 - e]);
    } else if (def.fluid) {
      const tile = tileFor(id, 0);
      const topOpen = getB(wx, y + 1, wz) !== id;
      const yTop = topOpen ? y + 0.875 : y + 1;
      for (let d = 0; d < 6; d++) {
        const [nx2, ny2, nz2] = NORMAL[d];
        const n = getB(wx + nx2, y + ny2, wz + nz2);
        if (n === id) continue;
        if (!(n === AIR || BLOCKS[n].transparent)) continue;
        const sky = d === 2 ? getS(wx, y, wz) : getS(wx + nx2, y + ny2, wz + nz2);
        const blk = Math.max(getL(wx, y, wz), d === 2 ? 0 : getL(wx + nx2, y + ny2, wz + nz2));
        const br = DIR_BRIGHT[d], a = [br, br, br, br];
        let pts;
        if (d === 2) pts = [[lx, yTop, lz], [lx, yTop, lz + 1], [lx + 1, yTop, lz + 1], [lx + 1, yTop, lz]];
        else if (d === 3) pts = [[lx, y, lz], [lx + 1, y, lz], [lx + 1, y, lz + 1], [lx, y, lz + 1]];
        else if (d === 0) pts = [[lx + 1, y, lz + 1], [lx + 1, y, lz], [lx + 1, yTop, lz], [lx + 1, yTop, lz + 1]];
        else if (d === 1) pts = [[lx, y, lz], [lx, y, lz + 1], [lx, yTop, lz + 1], [lx, yTop, lz]];
        else if (d === 4) pts = [[lx, y, lz + 1], [lx + 1, y, lz + 1], [lx + 1, yTop, lz + 1], [lx, yTop, lz + 1]];
        else pts = [[lx + 1, y, lz], [lx, y, lz], [lx, yTop, lz], [lx + 1, yTop, lz]];
        const uvs = d === 2 || d === 3 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [1, 0], [1, 0.875], [0, 0.875]];
        fluid.quad(pts, uvs, tile, sky, blk, a, d === 2 && id === 8 && topOpen ? 1 : 0);
      }
    }
  }

  return {
    solid: solid.empty() ? null : solid,
    fluid: fluid.empty() ? null : fluid,
  };
}
