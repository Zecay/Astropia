# Astropia Developer Expansion Guide

This guide explains how to safely extend the game with new textures, blocks, and recipes while preserving the modular architecture.

## 1. Adding New Textures to the Tileset

The tileset (`assets/tileset.png`) is an 8-column × 2-row sprite sheet (each cell 32×32 px).

- **Current layout** (from config.json `visuals.tileset`):
  - Row 0: Block sprites (col 0–7)
    - 0: Dirt
    - 1: Bedrock
    - 2: Terrain Grass
    - 3: Rock
    - 4: Lava
    - 5: Grass Block
    - 6: Stone Block
    - 7: Obsidian Block
  - Row 1: Player + Seed sprites
    - 0: Player
    - 1-3: Default seed stages (sprout/stem/mature)

**Steps to add a new sprite:**
1. Extend the tileset image: Add a new column (or row) — update `visuals.tileset.columns` and/or `.rows` in `config.json`.
2. Paint your new 32×32 tile in the next available (col, row).
3. Reference the sprite coordinates exactly in the block definition (see below).

**Important:** Always keep the tileset dimensions updated in `config.json` or the renderer will clip new sprites.

## 2. Defining New Blocks in config.json

Add entries under the `"blocks"` object using the next available numeric ID.

Example (Cave Background + new blocks):

```json
"9": {
  "id": 9,
  "name": "Cave Background",
  "durability": 2,
  "breakable": true,
  "placeable": true,
  "inventoryKey": "cave_bg",
  "color": "#4a3f2e",
  "border": "#32291f",
  "soundGroup": "dirt",
  "sprite": { "col": 0, "row": 2 },   // <-- new row/col in tileset
  "isBackground": true,              // special flag for renderer layering
  "dropTable": [
    { "itemKey": "cave_bg", "chance": 1.0, "quantity": 1 }
  ]
},
"10": {
  "id": 10, "name": "Door", ...
  ...
}
```

**Key fields:**
- `breakable` + `durability > 0`
- `placeable: true`
- `inventoryKey`: matches an entry in `"items"`
- `sprite`: exact col/row from tileset
- `isBackground: true` → renders in background layer (before solids)

## 3. Adding Corresponding Items

Under `"items"`:

```json
"cave_bg": {
  "key": "cave_bg",
  "name": "Cave Background",
  "type": "block",
  "placeableTile": 9,
  "usableForBreaking": false,
  "blockId": 9
},
"door": { ... }
```

## 4. Block Combination Recipes (Crafting)

Add a new top-level array `"blockCombinationRecipes"` (modeled after `seedCombinationRecipes`):

```json
"blockCombinationRecipes": [
  { "ingredients": ["dirt_block", "cave_bg"], "result": "door" },
  { "ingredients": ["dirt_block", "rock_block"], "result": "grass_block" },
  ...
]
```

**How to use in code (future extension):**
- Create a lookup map in `config.js` similar to `seedCombinationMap`.
- In `inventory.js` or a new `crafting.js`, check adjacent inventory items and allow crafting.

## 5. Updating World Generation & Rendering for New Blocks

- In `world.js` → `createWorld()`: Add logic to place new blocks (e.g. Cave Background in certain depths).
- In `renderer.js` → `drawWorld()`: Split rendering into background layer + solid layer (check `isBackground` flag).

## 6. Updating the Config Loader (`js/config.js`)

After loading JSON, the loader already builds `blocksByTile` and `seedCombinationMap`. Add similar support:

```js
// In loadConfig()
GameConfig.blockCombinationMap = new Map();
for (const recipe of GameConfig.blockCombinationRecipes || []) {
  const key = [...recipe.ingredients].sort().join('+');
  GameConfig.blockCombinationMap.set(key, recipe.result);
}
```

## 7. Best Practices & Gotchas

- **Never hardcode numbers** — always read from `GameConfig`.
- Keep multiplayer sync intact: `setTile()` + `worldState.version++` triggers network updates.
- New blocks must have both a `blocks` entry **and** an `items` entry.
- When changing world size (`world.worldWidth` / `worldHeight`), also update bedrock logic in `createWorld()`.
- Test new recipes by temporarily adding items via console or inventory helpers.
- Always increment `tileset.columns`/`rows` when adding sprites.

This structure keeps the game fully data-driven. Happy expanding!
