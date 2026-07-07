// Central game settings. Keep numeric values here so future systems and AI edits
// can change gameplay without hunting through implementation files.

export const GAME = Object.freeze({
  title: "Astropia",
  width: 960,
  height: 540,
  backgroundColor: "#122034"
});

export const TILE_SIZE = 32;

export const WORLD = Object.freeze({
  widthInTiles: 128,
  heightInTiles: 48,
  baseSurfaceTileY: 18,
  dirtDepth: 5,
  interactionRange: 170
});

export const PHYSICS = Object.freeze({
  gravityY: 1200,
  maxFallSpeed: 900
});

export const PLAYER = Object.freeze({
  spawnTileX: 8,
  moveSpeed: 230,
  jumpVelocity: -545,
  bodyWidth: 22,
  bodyHeight: 30
});

export const HOTBAR = Object.freeze({
  size: 9,
  slotSize: 52,
  gap: 6,
  bottomMargin: 16
});

export const DEPTH = Object.freeze({
  background: -20,
  blocks: 0,
  items: 5,
  player: 10,
  ui: 1000
});

export const BLOCK_IDS = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3
});

export const BLOCKS = Object.freeze({
  [BLOCK_IDS.AIR]: {
    id: BLOCK_IDS.AIR,
    key: "air",
    name: "Air",
    texture: null,
    itemTexture: null,
    solid: false,
    color: null
  },
  [BLOCK_IDS.GRASS]: {
    id: BLOCK_IDS.GRASS,
    key: "grass",
    name: "Grass",
    texture: "block-grass",
    itemTexture: "item-grass",
    solid: true,
    color: 0x4ade80
  },
  [BLOCK_IDS.DIRT]: {
    id: BLOCK_IDS.DIRT,
    key: "dirt",
    name: "Dirt",
    texture: "block-dirt",
    itemTexture: "item-dirt",
    solid: true,
    color: 0x9a6a3a
  },
  [BLOCK_IDS.STONE]: {
    id: BLOCK_IDS.STONE,
    key: "stone",
    name: "Stone",
    texture: "block-stone",
    itemTexture: "item-stone",
    solid: true,
    color: 0x8b95a1
  }
});

// First-version starter items make block placement testable immediately while
// still preserving the break -> drop -> pickup loop.
export const STARTER_INVENTORY = Object.freeze([
  { blockId: BLOCK_IDS.GRASS, quantity: 12 },
  { blockId: BLOCK_IDS.DIRT, quantity: 24 },
  { blockId: BLOCK_IDS.STONE, quantity: 12 }
]);
