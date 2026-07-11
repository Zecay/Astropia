// ─── Seed system ────────────────────────────────────────────────────────────
// Standalone module for planting, growing, combining and harvesting seeds.
// It talks to world.js to check for solid ground / clear damage state and to
// spawn particles, and to inventory.js to hand out harvest rewards. It never
// touches DOM or rendering directly.

import { TILE_SIZE, SEED_DEFS, SEED_COMBINATION_RECIPES, HIT_COOLDOWN } from './constants.js';
import { playerState } from './player.js';
import {
  worldState, hasSolidSupport, clearBlockDamageState, spawnParticles,
  spawnDroppedItem, getOrCreateBlockDamageState, miningState, startHandStrike
} from './world.js';
import { triggerHaptic } from './player.js';

export const plantedSeeds = [];

export function resetSeeds() {
  plantedSeeds.length = 0;
}

export function getSeedAt(tx, ty) { return plantedSeeds.find(s => s.tx === tx && s.ty === ty) || null; }
export function removeSeed(seed) { const i = plantedSeeds.indexOf(seed); if (i !== -1) plantedSeeds.splice(i, 1); }

function getSeedCombinationKey(seedTypeA, seedTypeB) {
  return [seedTypeA, seedTypeB].sort().join('+');
}

const SEED_COMBINATION_MAP = SEED_COMBINATION_RECIPES.reduce((map, recipe) => {
  if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length !== 2 || !recipe.result) return map;
  map.set(getSeedCombinationKey(recipe.ingredients[0], recipe.ingredients[1]), recipe.result);
  return map;
}, new Map());

function getSeedCombinationResult(seedTypeA, seedTypeB) {
  if (!seedTypeA || !seedTypeB) return null;
  return SEED_COMBINATION_MAP.get(getSeedCombinationKey(seedTypeA, seedTypeB)) || null;
}

export function createSeedInstance(seedType, tx, ty) {
  const def = SEED_DEFS[seedType];
  if (!def) return null;
  return { seedType, tx, ty, growth: 0, hits: 0, growthTime: def.growthTime };
}

export function spawnSeed(seedType, tx, ty) {
  if (getSeedAt(tx, ty)) return false;
  const seed = createSeedInstance(seedType, tx, ty);
  if (!seed) return false;
  plantedSeeds.push(seed);
  return true;
}

export function resolveSeedInteraction(tx, ty, incomingSeedType) {
  if (!incomingSeedType) return { handled:false, combined:false, planted:false };

  const existingSeed = getSeedAt(tx, ty);
  if (existingSeed) {
    const resultSeedType = getSeedCombinationResult(incomingSeedType, existingSeed.seedType);
    console.log('[SeedCombo] interaction at existing seed', {
      position: { x: tx, y: ty },
      incomingSeed: incomingSeedType,
      existingSeed: existingSeed.seedType,
      result: resultSeedType || null
    });

    if (!resultSeedType) return { handled:false, combined:false, planted:false };

    removeSeed(existingSeed);
    clearBlockDamageState(tx, ty);

    const combinedSeed = createSeedInstance(resultSeedType, tx, ty);
    if (!combinedSeed) return { handled:true, combined:false, planted:false };
    plantedSeeds.push(combinedSeed);

    const spawnX = tx * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = ty * TILE_SIZE + TILE_SIZE / 2;
    const resultDef = SEED_DEFS[resultSeedType];
    console.log('[SeedCombo] combined seeds', {
      position: { x: tx, y: ty },
      incomingSeed: incomingSeedType,
      existingSeed: existingSeed.seedType,
      resultSeed: resultSeedType
    });
    spawnParticles(spawnX, spawnY, resultDef?.bloomColor || '#7dde6a', 16, 30, 90, 0.18, 0.35, 2, 5);
    triggerHaptic();
    worldState.version++;
    return { handled:true, combined:true, planted:false, resultSeedType };
  }

  if (ty + 1 >= worldState.height) return { handled:false, combined:false, planted:false };
  const lowerSeed = getSeedAt(tx, ty + 1);
  if (!lowerSeed) return { handled:false, combined:false, planted:false };

  const resultSeedType = getSeedCombinationResult(incomingSeedType, lowerSeed.seedType);
  console.log('[SeedCombo] interaction above lower seed', {
    position: { x: tx, y: ty },
    incomingSeed: incomingSeedType,
    lowerSeed: lowerSeed.seedType,
    result: resultSeedType || null
  });

  if (!resultSeedType) return { handled:false, combined:false, planted:false };

  removeSeed(lowerSeed);
  clearBlockDamageState(tx, ty);
  clearBlockDamageState(tx, ty + 1);

  const combinedSeed = createSeedInstance(resultSeedType, tx, ty + 1);
  if (!combinedSeed) return { handled:true, combined:false, planted:false };
  plantedSeeds.push(combinedSeed);

  const spawnX = tx * TILE_SIZE + TILE_SIZE / 2;
  const spawnY = (ty + 0.5) * TILE_SIZE;
  const resultDef = SEED_DEFS[resultSeedType];
  console.log('[SeedCombo] combined stacked seeds', {
    targetPosition: { x: tx, y: ty },
    resultPosition: { x: tx, y: ty + 1 },
    incomingSeed: incomingSeedType,
    lowerSeed: lowerSeed.seedType,
    resultSeed: resultSeedType
  });
  spawnParticles(spawnX, spawnY, resultDef?.bloomColor || '#7dde6a', 16, 30, 90, 0.18, 0.35, 2, 5);
  triggerHaptic();
  worldState.version++;
  return { handled:true, combined:true, planted:false, resultSeedType };
}

export function isSeedMature(seed) {
  const def = SEED_DEFS[seed.seedType];
  return !!def && seed.growth >= def.growthTime;
}

function rollIndependentDrops(table, itemKey, x, y) {
  for (const entry of table) {
    if (Math.random() <= entry.chance) spawnDroppedItem(itemKey, x, y, entry.quantity);
  }
}

export function harvestSeed(seed) {
  const def = SEED_DEFS[seed.seedType];
  if (!def) return false;
  const spawnX = seed.tx * TILE_SIZE + TILE_SIZE / 2;
  const spawnY = seed.ty * TILE_SIZE + TILE_SIZE / 2;
  const isMature = isSeedMature(seed);
  if (!isMature) return false;
  console.log('[SeedHarvest]', {
    seedType: seed.seedType,
    position: { x: seed.tx, y: seed.ty },
    seedReturnTable: def.seedReturnTable || [],
    blockYieldTable: def.blockYieldTable || []
  });
  rollIndependentDrops(def.seedReturnTable, def.itemKey, spawnX, spawnY);
  rollIndependentDrops(def.blockYieldTable, def.blockRewardKey, spawnX, spawnY);
  removeSeed(seed);
  clearBlockDamageState(seed.tx, seed.ty);
  spawnParticles(spawnX, spawnY, def.bloomColor, 18, 35, 110, 0.2, 0.45, 3, 6);
  triggerHaptic();
  return true;
}

export function destroySeed(seed, shouldDropSeed) {
  const def = SEED_DEFS[seed.seedType];
  if (!def) return false;
  const spawnX = seed.tx * TILE_SIZE + TILE_SIZE / 2;
  const spawnY = seed.ty * TILE_SIZE + TILE_SIZE / 2;
  if (shouldDropSeed && Math.random() <= 0.5) spawnDroppedItem(def.itemKey, spawnX, spawnY, 1);
  removeSeed(seed);
  clearBlockDamageState(seed.tx, seed.ty);
  spawnParticles(spawnX, spawnY, def.bloomColor, 10, 30, 90, 0.16, 0.32, 2, 5);
  return true;
}

export function resolveSeedSupportBreak(seed) {
  if (!seed) return false;
  return isSeedMature(seed) ? harvestSeed(seed) : destroySeed(seed, true);
}

export function damageSeed(seed) {
  const def = SEED_DEFS[seed.seedType];
  if (!def) return false;
  if (miningState.mineCooldownRemaining > 0) return false;

  const spawnX = seed.tx * TILE_SIZE + TILE_SIZE / 2;
  const spawnY = seed.ty * TILE_SIZE + TILE_SIZE / 2;
  startHandStrike(seed.tx, seed.ty);
  miningState.mineCooldownRemaining = HIT_COOLDOWN;

  if (isSeedMature(seed)) { harvestSeed(seed); return true; }

  const damageState = getOrCreateBlockDamageState(seed.tx, seed.ty);
  seed.hits += 1;
  if (damageState) {
    damageState.tile = `seed_${seed.seedType}`;
    damageState.totalDurability = def.immatureHits;
    damageState.currentDamage = Math.min(def.immatureHits, seed.hits);
    damageState.damagePercent = damageState.currentDamage / damageState.totalDurability;
    damageState.resetAt = null;
  }
  spawnParticles(spawnX, spawnY, def.stemColor, 5, 20, 65, 0.12, 0.22, 2, 4);
  if (seed.hits >= def.immatureHits) destroySeed(seed, true);
  else worldState.version++;
  triggerHaptic();
  return true;
}

export function isPlayerTouchingSeed(seed) {
  const sl = seed.tx * TILE_SIZE, st = seed.ty * TILE_SIZE;
  return !(sl + TILE_SIZE <= playerState.x || sl >= playerState.x + playerState.width ||
           st + TILE_SIZE <= playerState.y || st >= playerState.y + playerState.height);
}

export function updateSeeds(dt) {
  for (const seed of plantedSeeds) {
    const def = SEED_DEFS[seed.seedType];
    if (!def) continue;
    seed.growth = Math.min(def.growthTime, seed.growth + dt);
  }
}
