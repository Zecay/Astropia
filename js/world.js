// ─── World state, tiles, mining & block interaction ────────────────────────
// Owns the tile grid, block-damage/mining state, particles and dropped-item
// entities. Exposes state (worldState, particles, droppedItems, blockDamage)
// that the renderer reads, and collision helpers (getTile/canModifyTile/etc.)
// that player.js relies on.
//
// Note: world.js and seeds.js reference each other (breaking a block can
// destroy/harvest a seed above it, and seed interactions need world tile
// checks). Both only call into the other module from inside function bodies
// (never at module-evaluation time), so the circular ES module import is
// safe.

import { GameConfig } from './config.js';
import { localToWorld } from './utils.js';
import { playerState, triggerHaptic } from './player.js';
import { getPunchHeld } from './input.js';
import { playSound } from './audio.js';
import {
  getSelectedItemKey, getSelectedItemDef, getItemQuantity,
  consumeInventoryItem, addInventoryItem
} from './inventory.js';
import {
  getSeedAt, isSeedMature, damageSeed, spawnSeed, resolveSeedInteraction,
  resolveSeedSupportBreak, updateSeeds
} from './seeds.js';

// ─── World generation ───────────────────────────────────────────────────────
// width/height default to 0 until initWorldFromConfig() runs (right after
// config load, before createWorld() is ever called).
export const worldState = { width: 0, height: 0, tiles: [], backgroundTiles: [], version: 0 };

// Resolve the tile id of the "Cave Background" block from config (falls back
// to 9 if the config shape ever changes).
function findBackgroundBlockId() {
  for (const key of Object.keys(GameConfig.blocks || {})) {
    if (GameConfig.blocks[key] && GameConfig.blocks[key].isBackground) return Number(key);
  }
  return 9;
}

export function initWorldFromConfig() {
  worldState.width = GameConfig.world.worldWidth;
  worldState.height = GameConfig.world.worldHeight;
}

export function createWorld() {
  const GROUND_ROW = GameConfig.world.groundRow;
  // Deterministic baseline map so every multiplayer client starts with the same terrain.
  let seed = 133742069;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  worldState.tiles = Array.from({ length: worldState.height }, (_, y) => {
    const row = new Array(worldState.width).fill(0);
    const depthFromBedrock = (worldState.height - 1) - y;

    // Bottom 6 rows are always Bedrock (ID 2)
    if (y >= worldState.height - 6) {
      row.fill(2);
    } else if (y === GROUND_ROW) {
      row.fill(3);
    } else if (y > GROUND_ROW && y < worldState.height - 6) {
      for (let x = 0; x < worldState.width; x++) {
        let tile = rand() < (1/12) ? 4 : 1;
        if (depthFromBedrock === 4 && rand() < 0.15) tile = 5;
        else if (depthFromBedrock === 3 && rand() < 0.25) tile = 5;
        else if (depthFromBedrock === 2 && rand() < 0.35) tile = 5;
        else if (depthFromBedrock === 1 && rand() < 0.5) tile = 5;
        row[x] = tile;
      }
    }
    return row;
  });

  // ── Background layer ────────────────────────────────────────────────────
  // Every underground tile (from the surface row down to bedrock) gets a
  // 'Cave Background' block in backgroundTiles. These are purely decorative /
  // non-colliding — solids live in `tiles` and render on top of them.
  const CAVE_BG = findBackgroundBlockId();
  worldState.backgroundTiles = Array.from({ length: worldState.height }, (_, y) => {
    const row = new Array(worldState.width).fill(0);
    if (y >= GROUND_ROW) row.fill(CAVE_BG);
    return row;
  });

  worldState.version++;
}

export function getTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return 1;
  return worldState.tiles[ty][tx];
}

export function setTile(tx, ty, value) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return;
  const previous = worldState.tiles[ty][tx];
  worldState.tiles[ty][tx] = value;
  if (value === 0) {
    blockDamage.delete(`${tx},${ty}`);
    const seedAbove = getSeedAt(tx, ty - 1);
    if (seedAbove) resolveSeedSupportBreak(seedAbove);
  } else if (previous === 0 && value !== 0) {
    const seedAbove = getSeedAt(tx, ty - 1);
    if (seedAbove) seedAbove.hits = 0;
  }
  worldState.version++;
}

export function getBlockDef(tile) {
  return GameConfig.blocksByTile[tile] || null;
}
export function getBlockDurability(tile) { const d = getBlockDef(tile); return d ? d.durability || 0 : 0; }

export function isTileSolid(tx, ty) {
  const tile = getTile(tx, ty);
  if (tile === 0) return false;
  const def = getBlockDef(tile);
  return !!def;
}

// ─── Background layer accessors ──────────────────────────────────────────
// Background tiles never collide (isTileSolid only consults the solid layer);
// they just render behind the solids.
export function getBackgroundTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return 0;
  return worldState.backgroundTiles[ty][tx];
}
export function setBackgroundTile(tx, ty, value) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return;
  worldState.backgroundTiles[ty][tx] = value;
  if (value === 0) blockDamage.delete(`bg_${tx},${ty}`);
  worldState.version++;
}

// ─── Range / collision checks ───────────────────────────────────────────────
export function isWithinPunchRange(tx, ty) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const playerCenterX = playerState.x + playerState.width / 2;
  const playerCenterY = playerState.y + playerState.height / 2;
  const targetCenterX = tx * TILE_SIZE + TILE_SIZE / 2;
  const targetCenterY = ty * TILE_SIZE + TILE_SIZE / 2;
  const dx = targetCenterX - playerCenterX;
  const dy = targetCenterY - playerCenterY;
  return Math.hypot(dx, dy) <= TILE_SIZE * 4;
}

export function canModifyTile(tx, ty) {
  const TILE_SIZE = GameConfig.world.tileSize;
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return false;
  const blockLeft = tx * TILE_SIZE;
  const blockTop  = ty * TILE_SIZE;
  return (
    blockLeft + TILE_SIZE <= playerState.x ||
    blockLeft >= playerState.x + playerState.width ||
    blockTop  + TILE_SIZE <= playerState.y ||
    blockTop  >= playerState.y + playerState.height
  );
}

export function hasSolidSupport(tx, ty) {
  return ty + 1 < worldState.height && getTile(tx, ty + 1) !== 0;
}

// ─── Block damage state ─────────────────────────────────────────────────────
export const blockDamage = new Map();

export function getBlockKey(tx, ty) { return `${tx},${ty}`; }

export function getOrCreateBlockDamageState(tx, ty, isBg = false) {
  const keyPrefix = isBg ? 'bg_' : '';
  const seed = getSeedAt(tx, ty);
  if (seed && !isSeedMature(seed)) {
    const def = GameConfig.seeds[seed.seedType];
    if (!def) return null;
    const key = keyPrefix + getBlockKey(tx, ty);
    let state = blockDamage.get(key);
    if (!state || state.tile !== `seed_${seed.seedType}`) {
      state = { tile:`seed_${seed.seedType}`, totalDurability:def.immatureHits, currentDamage:seed.hits, damagePercent:def.immatureHits > 0 ? seed.hits/def.immatureHits : 0, resetAt:null };
      blockDamage.set(key, state);
    }
    return state;
  }
  const tile = isBg ? getBackgroundTile(tx, ty) : getTile(tx, ty);
  const durability = getBlockDurability(tile);
  if (!durability || tile === 2) return null;
  const key = getBlockKey(tx, ty);
  let state = blockDamage.get(key);
  if (!state || state.tile !== tile || state.totalDurability !== durability) {
    state = { tile, totalDurability:durability, currentDamage:0, damagePercent:0, resetAt:null };
    blockDamage.set(key, state);
  }
  return state;
}

export function clearBlockDamageState(tx, ty, isBg = false) { blockDamage.delete((isBg ? 'bg_' : '') + getBlockKey(tx, ty)); }

// ─── Particles ───────────────────────────────────────────────────────────────
export const particles = [];

export function spawnParticles(x, y, color, count, speedMin, speedMax, lifeMin, lifeMax, sizeMin, sizeMax) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 25,
      life: lifeMin + Math.random() * (lifeMax - lifeMin),
      maxLife: lifeMin + Math.random() * (lifeMax - lifeMin),
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      color
    });
  }
  if (particles.length > 120) particles.splice(0, particles.length - 120);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 180 * dt; p.vx *= 0.98;
  }
}

// ─── Dropped items ───────────────────────────────────────────────────────────
export const droppedItems = [];

export function spawnDroppedItem(itemKey, x, y, quantity = 1) {
  if (!GameConfig.items[itemKey] || quantity <= 0) return;
  droppedItems.push({
    itemKey, quantity, x, y,
    vx: (Math.random() - 0.5) * 35,
    vy: 0,
    bob: Math.random() * Math.PI * 2,
    grounded: true, physicsPaused: false, airTime: 0
  });
  if (droppedItems.length > 80) droppedItems.splice(0, droppedItems.length - 80);
}

export function applyBlockDrops(tile, tx, ty) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const def = getBlockDef(tile);
  if (!def || !def.dropTable) return;
  const spawnX = tx * TILE_SIZE + TILE_SIZE / 2;
  const spawnY = ty * TILE_SIZE + TILE_SIZE / 2;
  for (const drop of def.dropTable) {
    if (Math.random() <= drop.chance) spawnDroppedItem(drop.itemKey, spawnX, spawnY, drop.quantity || 1);
  }
}

function updateDroppedItems(dt) {
  const pcx = playerState.x + playerState.width / 2;
  const pcy = playerState.y + playerState.height / 2;

  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const item = droppedItems[i];
    item.bob += dt * 3.6;

    // Hover physics: no gravity (vy = 0), smooth horizontal toss damping
    item.x += item.vx * dt;
    item.vx *= 0.88;

    const dx = item.x - pcx, dy = (item.y + Math.sin(item.bob) * 5) - pcy;
    if (dx * dx + dy * dy <= 450) {
      addInventoryItem(item.itemKey, item.quantity);
      droppedItems.splice(i, 1);
    }
  }
}

// ─── Mining / interaction state ─────────────────────────────────────────────
export const miningState = {
  activeMinePointer: null,
  interactionTarget: null,
  mineCooldownRemaining: 0,
  handAnimation: null
};

export function beginInteraction(localX, localY) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const worldPos = localToWorld(localX, localY);
  const tx = Math.floor(worldPos.x / TILE_SIZE);
  const ty = Math.floor(worldPos.y / TILE_SIZE);
  if (isWithinPunchRange(tx, ty)) {
    miningState.activeMinePointer = { x: localX, y: localY };
  } else {
    miningState.activeMinePointer = null;
  }
}

export function updateMinePointer(localX, localY) {
  if (miningState.activeMinePointer) {
    miningState.activeMinePointer.x = localX;
    miningState.activeMinePointer.y = localY;
  }
}

export function isMining() { return !!miningState.activeMinePointer; }

export function endInteraction() {
  miningState.activeMinePointer = null;
  miningState.interactionTarget = null;
  miningState.handAnimation = null;
}

export function updateInteractionTarget(localX, localY) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const worldPos = localToWorld(localX, localY);
  const tx = Math.floor(worldPos.x / TILE_SIZE);
  const ty = Math.floor(worldPos.y / TILE_SIZE);

  if (!isWithinPunchRange(tx, ty)) {
    miningState.interactionTarget = null;
    return null;
  }

  const seed = getSeedAt(tx, ty);
  if (seed) {
    miningState.interactionTarget = { tx, ty, kind: 'seed' };
    return miningState.interactionTarget;
  }

  const tile = getTile(tx, ty);
  const bg = getBackgroundTile(tx, ty);
  const sel = getSelectedItemDef();

  if (tile !== 0 && tile !== 2 && canModifyTile(tx, ty) && getBlockDurability(tile) > 0) {
    miningState.interactionTarget = { tx, ty, kind: 'block' };
    return miningState.interactionTarget;
  }

  // Background layer is only targetable when no solid block is in front.
  if (tile === 0 && bg !== 0 && sel.usableForBreaking && canModifyTile(tx, ty)) {
    miningState.interactionTarget = { tx, ty, kind: 'bg' };
    return miningState.interactionTarget;
  }

  miningState.interactionTarget = { tx, ty, kind: 'air' };
  return miningState.interactionTarget;
}

// ─── Core break / place ──────────────────────────────────────────────────
// All receive canvas-LOCAL coords.
export function tryBreakBlock(localX, localY) {
  const HIT_COOLDOWN = GameConfig.timings.hitCooldown;
  const target = updateInteractionTarget(localX, localY);
  if (!target) return false;

  if (target.kind === 'seed') {
    const seed = getSeedAt(target.tx, target.ty);
    if (seed) damageSeed(seed);
    return true;
  }

  if (target.kind === 'block' || target.kind === 'bg') {
    damageBlock(target.tx, target.ty);
    return true;
  }

  if (miningState.mineCooldownRemaining <= 0) {
    startHandStrike(target.tx, target.ty, false);
    miningState.mineCooldownRemaining = HIT_COOLDOWN;
  }
  return true;
}

export function tryPlaceBlock(localX, localY) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const selectedItemKey = getSelectedItemKey();
  const selectedItem = getSelectedItemDef();
  const worldPos = localToWorld(localX, localY);
  const tx = Math.floor(worldPos.x / TILE_SIZE);
  const ty = Math.floor(worldPos.y / TILE_SIZE);

  if (!isWithinPunchRange(tx, ty)) return false;

  if (selectedItem.type === 'seed') {
    if (getItemQuantity(selectedItemKey) <= 0) return false;
    if (ty >= worldState.height - 1) return false;

    const existingSeed = getSeedAt(tx, ty);
    const canUseOnExistingSeed = !!existingSeed;
    const canPlantIntoAir = getTile(tx, ty) === 0 && !existingSeed && hasSolidSupport(tx, ty);
    if (!canUseOnExistingSeed && !canPlantIntoAir) return false;

    if (!consumeInventoryItem(selectedItemKey, 1)) return false;

    const interactionResult = resolveSeedInteraction(tx, ty, selectedItem.seedType);
    if (interactionResult.combined) {
      playSound('seedPlant');
      triggerHaptic();
      return true;
    }

    if (!canPlantIntoAir || !spawnSeed(selectedItem.seedType, tx, ty)) {
      addInventoryItem(selectedItemKey, 1);
      return false;
    }

    const postPlantResult = resolveSeedInteraction(tx, ty, selectedItem.seedType);
    playSound('seedPlant');
    triggerHaptic();
    if (!postPlantResult.combined) worldState.version++;
    return true;
  }

  if (!selectedItem.placeableTile || getItemQuantity(selectedItemKey) <= 0) return false;
  if (getTile(tx, ty) === 0 && !getSeedAt(tx, ty) && canModifyTile(tx, ty) && ty < worldState.height - 1) {
    if (!consumeInventoryItem(selectedItemKey, 1)) return false;
    setTile(tx, ty, selectedItem.placeableTile);
    triggerHaptic();
    return true;
  }
  return false;
}

export function damageBlock(tx, ty) {
  const selectedItem = getSelectedItemDef();
  if (!selectedItem.usableForBreaking) return false;

  // Layered punching: hit the solid block first; only when the solid tile is
  // air do we damage the background block behind it.
  const solid = getTile(tx, ty);
  if (solid !== 0) return damageTileLayer(tx, ty, solid, false);
  const bg = getBackgroundTile(tx, ty);
  if (bg !== 0) return damageTileLayer(tx, ty, bg, true);
  return false;
}

// Damage a single tile layer (solid or background).
function damageTileLayer(tx, ty, tile, isBg) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const HIT_COOLDOWN = GameConfig.timings.hitCooldown;
  const blockDef = getBlockDef(tile);
  const durability = getBlockDurability(tile);
  if (!blockDef || !blockDef.breakable || !durability || (!isBg && tile === 2) || !canModifyTile(tx, ty)) return false;
  if (miningState.mineCooldownRemaining > 0) return false;

  const state = getOrCreateBlockDamageState(tx, ty, isBg);
  if (!state) return false;

  startHandStrike(tx, ty);
  state.currentDamage = Math.min(state.totalDurability, state.currentDamage + 1);
  state.damagePercent = state.currentDamage / state.totalDurability;
  state.resetAt = null;
  miningState.mineCooldownRemaining = HIT_COOLDOWN;

  const impactPoint = { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
  const particleColor = blockDef.color || '#b37a45';
  spawnParticles(impactPoint.x, impactPoint.y, particleColor, 5, 25, 70, 0.12, 0.22, 2, 4);

  if (state.currentDamage >= state.totalDurability) {
    if (blockDef.soundGroup === 'rock') playSound('rockBreak');
    else if (blockDef.soundGroup === 'dirt') playSound('dirtBreak');

    clearBlockDamageState(tx, ty, isBg);
    if (isBg) setBackgroundTile(tx, ty, 0); else setTile(tx, ty, 0);
    applyBlockDrops(tile, tx, ty);
    spawnParticles(impactPoint.x, impactPoint.y, blockDef.color || '#9b6b3d', 14, 45, 120, 0.2, 0.4, 3, 6);
  } else {
    if (blockDef.soundGroup === 'rock') playSound('rockHit');
    else if (blockDef.soundGroup === 'dirt') playSound('dirtHit');
    worldState.version++;
  }

  triggerHaptic();
  return true;
}

// ─── Hand animation ──────────────────────────────────────────────────────
export function startHandStrike(tx, ty, didHit = true) {
  const HIT_COOLDOWN = GameConfig.timings.hitCooldown;
  miningState.handAnimation = {
    tx, ty, didHit,
    facing: playerState.facing,
    elapsed: 0,
    duration: HIT_COOLDOWN
  };
}

export function startAirPunch() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const HIT_COOLDOWN = GameConfig.timings.hitCooldown;
  const playerCenterX = playerState.x + playerState.width / 2;
  const playerCenterY = playerState.y + playerState.height * 0.45;
  const reach = TILE_SIZE * 1.5;
  const targetX = playerCenterX + playerState.facing * reach;
  const targetY = playerCenterY;
  startHandStrike(Math.floor(targetX / TILE_SIZE), Math.floor(targetY / TILE_SIZE), false);
  miningState.mineCooldownRemaining = HIT_COOLDOWN;
  return true;
}

function updateHandAnimation(dt) {
  if (!miningState.handAnimation) return;
  miningState.handAnimation.elapsed += dt;
  if (miningState.handAnimation.elapsed >= miningState.handAnimation.duration) miningState.handAnimation = null;
}

// ─── Punch action (used by touch punch button / hold-to-punch) ─────────────
export function tryPunchAction() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const dir = playerState.facing;
  const originX = playerState.x + playerState.width / 2;
  const playerCenterY = playerState.y + playerState.height * 0.5;

  for (let step = 1; step <= 4; step++) {
    const targetX = originX + dir * step * TILE_SIZE;
    const tx = Math.floor(targetX / TILE_SIZE);
    const ty = Math.floor(playerCenterY / TILE_SIZE);
    if (!isWithinPunchRange(tx, ty)) continue;

    const seed = getSeedAt(tx, ty);
    if (seed) {
      miningState.interactionTarget = { tx, ty, kind: 'seed' };
      if (damageSeed(seed)) return true;
    }

    const tile = getTile(tx, ty);
    const bg = getBackgroundTile(tx, ty);
    const sel = getSelectedItemDef();
    const canBreakSolid = getBlockDurability(tile) && tile !== 2 && canModifyTile(tx, ty);
    const canBreakBg = tile === 0 && bg !== 0 && sel.usableForBreaking && canModifyTile(tx, ty);
    if (canBreakSolid || canBreakBg) {
      miningState.interactionTarget = { tx, ty, kind: canBreakSolid ? 'block' : 'bg' };
      if (damageBlock(tx, ty)) return true;
    }
  }

  if (miningState.mineCooldownRemaining <= 0) return startAirPunch();
  return false;
}

// ─── Main world tick ────────────────────────────────────────────────────────
export function updateWorld(dt) {
  const DAMAGE_RESET_DELAY = GameConfig.timings.damageResetDelay;
  miningState.mineCooldownRemaining = Math.max(0, miningState.mineCooldownRemaining - dt);

  if (getPunchHeld() && miningState.mineCooldownRemaining <= 0) tryPunchAction();

  updateHandAnimation(dt);
  updateParticles(dt);
  updateDroppedItems(dt);
  updateSeeds(dt);

  for (const [key, state] of blockDamage.entries()) {
    if (state.resetAt !== null) {
      state.resetAt -= dt;
      if (state.resetAt <= 0) { blockDamage.delete(key); worldState.version++; }
    }
  }

  // activeMinePointer now stores canvas-local coords — safe to pass directly
  if (miningState.activeMinePointer) {
    const selected = getSelectedItemDef();
    if (selected && (selected.type === 'block' || selected.type === 'seed')) {
      // Continuous placement: stop immediately once the selected item runs
      // out, even if the mouse / pointer is still held down.
      if (getItemQuantity(getSelectedItemKey()) <= 0) {
        endInteraction();
      } else {
        tryPlaceBlock(miningState.activeMinePointer.x, miningState.activeMinePointer.y);
      }
    } else {
      tryBreakBlock(miningState.activeMinePointer.x, miningState.activeMinePointer.y);
    }
  } else if (miningState.interactionTarget) {
    miningState.interactionTarget = null;
  }

  for (const [key, state] of blockDamage.entries()) {
    if (state.resetAt === null) {
      const [tx, ty] = key.replace('bg_', '').replace('seed_', '').split(',').map(Number);
      const isActive = miningState.interactionTarget && miningState.interactionTarget.tx === tx && miningState.interactionTarget.ty === ty;
      if (!isActive && state.currentDamage > 0) state.resetAt = DAMAGE_RESET_DELAY;
    }
  }
}

// ─── Reset (used when starting a fresh game / respawn) ─────────────────────
export function resetWorldRuntimeState() {
  blockDamage.clear();
  miningState.activeMinePointer = null;
  miningState.interactionTarget = null;
  miningState.mineCooldownRemaining = 0;
  miningState.handAnimation = null;
  particles.length = 0;
  droppedItems.length = 0;
}
