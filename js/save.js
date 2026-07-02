// ---------------------------------------------------------------
// save.js — IndexedDB persistence (modified chunks + player + meta)
// ---------------------------------------------------------------

const DB_NAME = 'craftermine', DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorld(world, player, entities) {
  try {
    const db = await openDB();
    const tx = db.transaction(['chunks', 'meta'], 'readwrite');
    const chunkStore = tx.objectStore('chunks');
    // sweep loaded modified chunks into savedChunks first
    for (const [key, c] of world.chunks) {
      if (c.modified) world.savedChunks.set(key, c.blocks.slice());
    }
    for (const [key, blocks] of world.savedChunks) {
      chunkStore.put(blocks, world.seedStr + '|' + key);
    }
    const meta = tx.objectStore('meta');
    const blockEntities = {};
    for (const [k, v] of world.blockEntities) blockEntities[k] = v;
    meta.put({
      seed: world.seedStr,
      time: world.time,
      spawn: player.spawn,
      chunkKeys: [...world.savedChunks.keys()],
      player: {
        pos: player.pos, yaw: player.yaw, pitch: player.pitch,
        health: player.health, hunger: player.hunger, saturation: player.saturation,
        inventory: player.inventory, armor: player.armor, sel: player.sel,
        stats: player.stats, xp: player.xp, level: player.level,
      },
      blockEntities,
      mobs: entities ? entities.serialize() : [],
    }, 'world');
    return new Promise((res, rej) => { tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); });
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export async function loadMeta() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction('meta').objectStore('meta').get('world');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

export async function loadChunks(world, chunkKeys) {
  try {
    const db = await openDB();
    const store = db.transaction('chunks').objectStore('chunks');
    await Promise.all((chunkKeys || []).map(key => new Promise(res => {
      const req = store.get(world.seedStr + '|' + key);
      req.onsuccess = () => {
        if (req.result) world.savedChunks.set(key, new Uint8Array(req.result));
        res();
      };
      req.onerror = () => res();
    })));
  } catch (e) { console.warn('chunk load failed', e); }
}

export async function clearSave() {
  try {
    const db = await openDB();
    const tx = db.transaction(['chunks', 'meta'], 'readwrite');
    tx.objectStore('chunks').clear();
    tx.objectStore('meta').clear();
    return new Promise(res => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
  } catch (e) { }
}
