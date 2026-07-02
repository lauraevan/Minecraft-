# Crafter Mine

A browser-based voxel sandbox survival game built with Three.js — infinite procedurally
generated worlds, mining, crafting, building, and surviving the night.

**No build step, no external assets** — every texture, item icon, and sound effect is
generated procedurally in code. Open `index.html` from any static host and play.

## Play

Serve the repo root with any static file server (or open via githack), then:

| Input | Action |
|---|---|
| Mouse | Look |
| WASD | Move |
| Space | Jump / swim up |
| Ctrl / double-tap W | Sprint |
| Shift | Sneak (won't fall off edges) |
| Left click (hold) | Mine block / attack |
| Right click | Place block / use / eat / shoot bow |
| E | Inventory (with 2×2 crafting) |
| Q | Drop held item |
| 1–9 / scroll | Select hotbar slot |
| F3 | Debug overlay |
| Esc | Pause / close screen |

## Features

- **Infinite chunked world** (16×128×16 chunks) with greedy meshing, face culling,
  per-vertex ambient occlusion, and budget-limited chunk streaming
- **Procedural terrain**: continental/erosion/ridge noise stack, 9 biomes (plains, forest,
  desert, taiga, tundra, jungle, swampy oceans, beaches, mountains), spaghetti + cheese
  caves, lava lakes, seeded ore veins (coal → diamond and friends), 4 tree species,
  loot dungeons
- **Flood-fill lighting**: 0–15 skylight + blocklight channels with incremental BFS
  updates, baked into mesh vertices, day-factor applied in shader
- **Day/night cycle** (20 min) with animated sun/moon, dusk tints, and fog
- **Survival**: health, hunger/saturation/exhaustion, drowning, fall/lava/cactus damage,
  armor with durability, death screen with item scatter
- **Mining & building**: 60+ block types, tool tiers (wood→diamond) with correct-tool
  harvest rules, crack overlay animation, 10 crack stages
- **Crafting**: 2×2 inventory grid + 3×3 crafting table, shaped (with mirroring) and
  shapeless recipes — tools, weapons, armor, torches, beds, ladders, and more
- **Furnace smelting** with fuel burn times and live progress UI; chests with 27 slots
- **Mobs**: cows, pigs, sheep, chickens (wander/flee, drops) and zombies, skeletons
  (kiting archers), wall-climbing spiders, and exploding creepers; hostiles spawn in
  darkness and burn at dawn
- **Bow & arrows** with gravity-arc projectiles
- **Persistence**: modified chunks, player state, block entities, and mobs saved to
  IndexedDB (autosave every 30 s + manual save); world seeds are reproducible
- **Audio**: Web Audio–synthesized digging/steps/combat/UI sounds + generative ambient music
- **Settings**: render distance, FOV, mouse sensitivity, volume (persisted)

## Code map

```
index.html          shell + screens
css/style.css       HUD + menu styling
js/util.js          seeded RNG, simplex noise, fBm
js/blocks.js        block/item registries, recipes, smelting, fuel tables
js/textures.js      procedural 16×16 pixel-art atlas + item/HUD icons
js/world.js         chunk store, worldgen, flood-fill light engine
js/mesher.js        greedy mesher (AO + light attributes), fluids, cross-plants
js/player.js        input, AABB voxel physics, DDA raycast, survival stats
js/entities.js      mob AI, item drops, arrows, particles, explosions
js/ui.js            HUD bars, inventory/crafting/furnace/chest screens
js/audio.js         Web Audio synthesized SFX + music
js/save.js          IndexedDB persistence
js/main.js          renderer, chunk shaders, sky, game loop, interaction
js/vendor/          three.js r160 (vendored, self-contained deploy)
```

All art is original procedurally generated pixel art; no third-party game assets are used.
