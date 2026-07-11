// ─── Global constants ───────────────────────────────────────────────────────

export const TILE_SIZE = 32;

export const PLAYER_SIZE_X = 24;
export const PLAYER_SIZE_Y = 24;
export const WORLD_WIDTH = 80;
export const WORLD_HEIGHT = 64;
export const GROUND_ROW = 20;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.1;
export const FIXED_DT = 1 / 60;

export const WALK_SPEED     = 200;
export const WALK_ACCEL     = 5000;
export const GROUND_FRIC    = 659;
export const AIR_FRIC       = 659;

export const JUMP_VEL       = -640;
export const GRAVITY_HOLD   = 1600;
export const GRAVITY_NORMAL = 2400;
export const MAX_FALL_SPEED = 800;
export const GRAVITY_CANCEL = 12000;

// ─── Multiplayer sync ───────────────────────────────────────────────────────
// This is the same lightweight position-sync style used by index (7).html.
// Replace this base64 value if you deploy api/sync.js to a different Vercel URL.
export const SERVER_URL = atob("aHR0cHM6Ly90ZXN0aW5nYWdhaW5sb2wtbWF1dmUudmVyY2VsLmFwcC9hcGkvc3luYw==");
export const NETWORK_INTERVAL_MS = 70;
export const CHAT_BUBBLE_MS = 8000;
export const CHAT_LOG_MS = 15000;

// ─── Sound ──────────────────────────────────────────────────────────────────
export const SOUND_URLS = {
  seedPlant:  'https://lqy3lriiybxcejon.public.blob.vercel-storage.com/ac9622f7-f356-4f99-86be-bba5a9c0d0bd/seed-plant-qLMRJFq4NC-pYv6PesC4KMz7lzR8JiMEO4LPsyMml.mp3?LQQA',
  dirtHit:    'https://lqy3lriiybxcejon.public.blob.vercel-storage.com/ac9622f7-f356-4f99-86be-bba5a9c0d0bd/dirt-hit-5690kHauZf-HP1onfBIkHrko86XLDxJTaStvGqoBk.mp3?P70Y',
  dirtBreak:  'https://lqy3lriiybxcejon.public.blob.vercel-storage.com/ac9622f7-f356-4f99-86be-bba5a9c0d0bd/dirt-break-qDrwpcnT2P-Eh3AU64RXbGIaRKkmkfGsY852chJCX.mp3?Sot2',
  rockHit:    'https://lqy3lriiybxcejon.public.blob.vercel-storage.com/ac9622f7-f356-4f99-86be-bba5a9c0d0bd/rock-hit-UspaWtp6nP-4s3TA7A8I8hTB4YnRwV7TtJUYLVbRX.mp3?Zr6R',
  rockBreak:  'https://lqy3lriiybxcejon.public.blob.vercel-storage.com/ac9622f7-f356-4f99-86be-bba5a9c0d0bd/rock-break-9UlvUJ3HCn-6SNLEjZBhgXuio54lOzkIPeygSel3F.mp3?QxCN'
};

// ─── Block / Item / Seed definitions ───────────────────────────────────────
export const BLOCK_DEFS = {
  1: { id:1, name:'Dirt',    durability:3, breakable:true,  placeable:true,  inventoryKey:'dirt_block', dropTable:[{itemKey:'seed',      chance:0.5,quantity:1},{itemKey:'dirt_block',chance:0.1,quantity:1}] },
  2: { id:2, name:'Bedrock', durability:0, breakable:false, placeable:false, inventoryKey:null,          dropTable:[] },
  3: { id:3, name:'Terrain Grass', durability:3, breakable:true, placeable:true, inventoryKey:'dirt_block', terrainLayer:true, dropTable:[{itemKey:'seed', chance:0.5,quantity:1},{itemKey:'dirt_block',chance:0.1,quantity:1}] },
  4: { id:4, name:'Rock',    durability:7, breakable:true,  placeable:true,  inventoryKey:'rock_block', dropTable:[{itemKey:'rock_seed', chance:0.35,quantity:1},{itemKey:'rock_block',chance:0.15,quantity:1}] },
  5: { id:5, name:'Lava',    durability:8, breakable:true,  placeable:true,  inventoryKey:'lava_block', dropTable:[{itemKey:'lava_seed', chance:0.25,quantity:1},{itemKey:'lava_block',chance:0.1,quantity:1}] }
};

export const ITEM_DEFS = {
  hand:        { key:'hand',        name:'Punch',       type:'tool',  placeableTile:null, usableForBreaking:true,  blockId:null },
  seed:        { key:'seed',        name:'Seed',        type:'seed',  placeableTile:null, usableForBreaking:false, seedType:'dirt' },
  rock_seed:   { key:'rock_seed',   name:'Rock Seed',   type:'seed',  placeableTile:null, usableForBreaking:false, seedType:'rock' },
  lava_seed:   { key:'lava_seed',   name:'Lava Seed',   type:'seed',  placeableTile:null, usableForBreaking:false, seedType:'lava' },
  grass_seed:  { key:'grass_seed',  name:'Grass Seed',  type:'seed',  placeableTile:null, usableForBreaking:false, seedType:'grass' },
  dirt_block:  { key:'dirt_block',  name:'Dirt Block',  type:'block', placeableTile:1,    usableForBreaking:false, blockId:1 },
  rock_block:  { key:'rock_block',  name:'Rock Block',  type:'block', placeableTile:4,    usableForBreaking:false, blockId:4 },
  lava_block:  { key:'lava_block',  name:'Lava Block',  type:'block', placeableTile:5,    usableForBreaking:false, blockId:5 },
  grass_block: { key:'grass_block', name:'Grass Block', type:'block', placeableTile:3,    usableForBreaking:false, blockId:3 },
  blue_block:  { key:'blue_block',  name:'Blue Block',  type:'block', placeableTile:6,    usableForBreaking:false, blockId:6 }
};

export const SEED_DEFS = {
  dirt: { type:'dirt', itemKey:'seed',      displayName:'Dirt Seed',  growthTime:10, immatureHits:6,  stemColor:'#4f8f2b', bloomColor:'#7ed957', blockRewardKey:'dirt_block',
    seedReturnTable:[{quantity:1,chance:0.7},{quantity:2,chance:0.3},{quantity:3,chance:0.1}],
    blockYieldTable:[{quantity:1,chance:1.0},{quantity:2,chance:0.9},{quantity:3,chance:0.7},{quantity:4,chance:0.5},{quantity:5,chance:0.3},{quantity:6,chance:0.1}] },
  rock: { type:'rock', itemKey:'rock_seed', displayName:'Rock Seed',  growthTime:30, immatureHits:10, stemColor:'#6d7680', bloomColor:'#aeb7c2', blockRewardKey:'rock_block',
    seedReturnTable:[{quantity:1,chance:0.6},{quantity:2,chance:0.2},{quantity:3,chance:0.05}],
    blockYieldTable:[{quantity:1,chance:1.0},{quantity:2,chance:0.65},{quantity:3,chance:0.35},{quantity:4,chance:0.15}] },
  lava: { type:'lava', itemKey:'lava_seed', displayName:'Lava Seed',  growthTime:45, immatureHits:12, stemColor:'#ff6b2c', bloomColor:'#ffb347', blockRewardKey:'lava_block',
    seedReturnTable:[{quantity:1,chance:0.5},{quantity:2,chance:0.15}],
    blockYieldTable:[{quantity:1,chance:1.0},{quantity:2,chance:0.4}] },
  grass: { type:'grass', itemKey:'grass_seed', displayName:'Grass Seed', growthTime:20, immatureHits:2, stemColor:'#3f9f52', bloomColor:'#7dde6a', blockRewardKey:'blue_block',
    notes:'Seed-grown grass plant. Distinct from terrain grass block (tile 3). Non-collidable crop entity. Drops blue_block.',
    seedReturnTable:[{quantity:1,chance:0.9},{quantity:2,chance:0.3},{quantity:3,chance:0.05}],
    blockYieldTable:[{quantity:1,chance:1.0},{quantity:2,chance:0.75},{quantity:3,chance:0.5},{quantity:4,chance:0.35},{quantity:5,chance:0.15}] }
};

export const SEED_COMBINATION_RECIPES = [
  { ingredients:['dirt', 'rock'], result:'grass' }
];

// ─── Inventory sizing ───────────────────────────────────────────────────────
export const QUICK_SLOT_COUNT = 4;
export const INVENTORY_PANEL_SLOTS = 12;
export const INVENTORY_PANEL_MAX_WIDTH = 320;

// ─── Mining / damage timing ─────────────────────────────────────────────────
export const HIT_COOLDOWN = 0.2;
export const DAMAGE_RESET_DELAY = 10;

// ─── Save loop ──────────────────────────────────────────────────────────────
export const SAVE_INTERVAL = 30;

// ─── Scoring ────────────────────────────────────────────────────────────────
export const SCORE_VALUES = {
  // Blocks — rarer = more points
  dirt_block:  1,
  rock_block:  3,
  lava_block:  5,
  grass_block: 2,
  blue_block:  8,
  // Seeds — combo seeds worth more
  seed:        2,
  rock_seed:   4,
  lava_seed:   6,
  grass_seed:  10
};
