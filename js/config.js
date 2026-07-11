// ─── Config loader ──────────────────────────────────────────────────────────
// Loads config.json once at boot and exposes it as `GameConfig` — the single
// source of truth for every tunable number, color, and data table in the
// game. Every other module imports `GameConfig` (and the small derived
// helpers below) instead of hardcoding constants.
//
// main.js awaits loadConfig() before touching world/player/renderer, so by
// the time any other module's top-level code runs, GameConfig is already
// fully populated.

export const GameConfig = {
  // Populated by loadConfig(). Kept as a mutable object (not reassigned) so
  // that modules which imported `{ GameConfig }` early still see the final
  // values once loadConfig() finishes filling it in.
};

let loaded = false;

export async function loadConfig(path = 'config.json') {
  if (loaded) return GameConfig;

  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  const data = await res.json();

  Object.assign(GameConfig, data);

  // ── Derived / convenience values ────────────────────────────────────────
  GameConfig.network.serverUrl = atob(GameConfig.network.serverUrlBase64);

  // BLOCK_DEFS / ITEM_DEFS / SEED_DEFS are keyed by string in JSON; blocks
  // are looked up by numeric tile id everywhere else in the game, so build a
  // numeric-keyed copy alongside the original.
  GameConfig.blocksByTile = {};
  for (const key of Object.keys(GameConfig.blocks)) {
    GameConfig.blocksByTile[Number(key)] = GameConfig.blocks[key];
  }

  // Seed combination recipes → fast lookup map, e.g. "dirt+rock" -> "grass"
  const comboMap = new Map();
  for (const recipe of GameConfig.seedCombinationRecipes || []) {
    if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length !== 2 || !recipe.result) continue;
    const key = [...recipe.ingredients].sort().join('+');
    comboMap.set(key, recipe.result);
  }
  GameConfig.seedCombinationMap = comboMap;

  loaded = true;
  return GameConfig;
}

export function isConfigLoaded() {
  return loaded;
}
