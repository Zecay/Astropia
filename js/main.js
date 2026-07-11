// ─── Main: glue / bootstrap ─────────────────────────────────────────────────
// Imports every module, initialises the game (config, world, player,
// renderer), and runs the requestAnimationFrame loop, calling updatePlayer(),
// updateWorld() (which drives updateSeeds() internally) and renderer.draw()
// in order.
//
// Boot is now async: main() awaits loadConfig() before touching world/
// player/renderer, so GameConfig is fully populated before any other module
// reads a single value out of it.

import { installRoundRectPolyfill } from './utils.js';
import { GameConfig, loadConfig } from './config.js';
import {
  canvas, inventoryUIGroup, inventoryPanel, inventoryToggle, leftBtn, rightBtn, jumpBtn,
  punchBtn, loginScreen, usernameInput, startButton, networkStatus
} from './dom.js';

import { cameraState, updateCamera } from './camera.js';
import { playerState, updatePlayer, resetPlayer, initPlayerFromConfig } from './player.js';
import { setupInput, configureInput } from './input.js';

import {
  worldState, createWorld, updateWorld, resetWorldRuntimeState, initWorldFromConfig,
  beginInteraction, endInteraction, tryBreakBlock, tryPlaceBlock,
  updateInteractionTarget, updateMinePointer, isMining, tryPunchAction,
  blockDamage, droppedItems
} from './world.js';

import { plantedSeeds, resetSeeds, isSeedMature } from './seeds.js';

import {
  inventoryState, resetInventory, renderInventory, setSelectedSlot,
  getSelectedItemDef, applyInventoryLayout, setInventoryPanelOpen,
  setupInventoryPanel
} from './inventory.js';

import {
  gameJoined, setGameJoined, setMyName, initNetwork, sendNetworkPing,
  isTypingChat, setupChat
} from './network.js';

import { draw, resizeCanvas, loadTileset } from './renderer.js';

// ─── Game info (safe-area insets; no SDK, so always zero) ──────────────────
const gameInfo = {
  contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 }
};

let gameEnded = false;
let scoreReported = false;
let saveTimer = 0;

function applySafeArea() {
  const inset = gameInfo.contentSafeAreaInset || { top:0, right:0, bottom:0, left:0 };
  inventoryState.safeRightInset = inset.right;
  inventoryUIGroup.style.top = (18 + inset.top) + 'px';
  inventoryPanel.style.maxWidth = `min(${GameConfig.inventory.panelMaxWidth}px, calc(100vw - ${24 + inset.left + inset.right}px))`;
  applyInventoryLayout();
  leftBtn.style.left   = (16 + inset.left)   + 'px';
  rightBtn.style.left  = (100 + inset.left)  + 'px';
  jumpBtn.style.right  = (104 + inset.right) + 'px';
  punchBtn.style.right = (16 + inset.right)  + 'px';
  leftBtn.style.bottom  = (24 + inset.bottom) + 'px';
  rightBtn.style.bottom = (24 + inset.bottom) + 'px';
  jumpBtn.style.bottom  = (24 + inset.bottom) + 'px';
  punchBtn.style.bottom = (24 + inset.bottom) + 'px';
}

function doResizeCanvas() {
  resizeCanvas(applySafeArea);
}

function resetGame() {
  createWorld();
  resetWorldRuntimeState();
  resetInventory();
  inventoryToggle.classList.remove('dragging');
  applyInventoryLayout(true);
  resetPlayer();
  cameraState.x = playerState.x; cameraState.y = playerState.y;
  cameraState.zoom = 1; cameraState.targetZoom = 1;
  resetSeeds();
  gameEnded = false; scoreReported = false;
}

// ─── Score / save / load ─────────────────────────────────────────────────────
function calculateScore() {
  const SCORE_VALUES = GameConfig.scoreValues;
  let score = 0;
  // Weighted inventory value
  for (const [key, item] of inventoryState.items) {
    if (key === 'hand') continue;
    const value = SCORE_VALUES[key] || 1;
    score += item.quantity * value;
  }
  // Planted seeds: base points + maturity bonus
  for (const seed of plantedSeeds) {
    const seedDef = GameConfig.seeds[seed.seedType];
    if (!seedDef) continue;
    const baseValue = SCORE_VALUES[seedDef.itemKey] || 2;
    score += baseValue;
    if (isSeedMature(seed)) score += baseValue * 2;
  }
  return Math.max(1, score);
}

function getCurrentGameState() {
  return {
    version: 1,
    tiles: worldState.tiles,
    player: {
      x: playerState.x, y: playerState.y,
      vx: playerState.vx, vy: playerState.vy,
      facing: playerState.facing
    },
    inventory: {
      quickSlots: inventoryState.quickSlots.slice(),
      selectedIndex: inventoryState.selectedIndex,
      items: Array.from(inventoryState.items.entries()),
      panelSlots: inventoryState.panelSlots.slice()
    },
    seeds: plantedSeeds.map(s => ({
      seedType: s.seedType, tx: s.tx, ty: s.ty,
      growth: s.growth, hits: s.hits, growthTime: s.growthTime
    })),
    camera: { zoom: cameraState.zoom, targetZoom: cameraState.targetZoom }
  };
}

function loadGameState(gs) {
  if (!gs || gs.version !== 1) return false;
  try {
    if (gs.tiles) {
      worldState.tiles = gs.tiles;
      worldState.version++;
    }
    if (gs.player) {
      playerState.x = gs.player.x;
      playerState.y = gs.player.y;
      playerState.vx = gs.player.vx || 0;
      playerState.vy = gs.player.vy || 0;
      playerState.facing = gs.player.facing || 1;
      playerState.onGround = false;
    }
    if (gs.inventory) {
      inventoryState.quickSlots = gs.inventory.quickSlots || ['hand', null, null, null];
      inventoryState.selectedIndex = gs.inventory.selectedIndex || 0;
      inventoryState.items = new Map(gs.inventory.items || [['hand', { key:'hand', quantity:1 }]]);
      inventoryState.panelSlots = gs.inventory.panelSlots || new Array(GameConfig.inventory.panelSlots).fill(null);
      if (!inventoryState.items.has('hand')) inventoryState.items.set('hand', { key:'hand', quantity:1 });
      inventoryState.quickSlots[0] = 'hand';
    }
    if (gs.seeds) {
      plantedSeeds.length = 0;
      for (const s of gs.seeds) plantedSeeds.push({ ...s });
    }
    if (gs.camera) {
      cameraState.zoom = gs.camera.zoom || 1;
      cameraState.targetZoom = gs.camera.targetZoom || 1;
    }
    cameraState.x = playerState.x + playerState.width / 2;
    cameraState.y = playerState.y + playerState.height / 2;
    blockDamage.clear();
    droppedItems.length = 0;
    gameEnded = false;
    scoreReported = false;
    renderInventory();
    return true;
  } catch (e) {
    return false;
  }
}

function saveGame() {
  const gameState = getCurrentGameState();
  try { localStorage.setItem('remixtopia_save', JSON.stringify(gameState)); } catch (_) {}
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem('remixtopia_save');
    if (raw) return loadGameState(JSON.parse(raw));
  } catch (_) {}
  return false;
}

function saveAndQuit() {
  if (gameEnded) return;
  saveGame();
  gameEnded = true;
  scoreReported = true;
  const score = calculateScore();
  console.log('Game saved. Score:', score);
}

function checkGameOver() {
  const TILE_SIZE = GameConfig.world.tileSize;
  if (playerState.y > worldState.height * TILE_SIZE + 200 && !scoreReported) {
    saveGame();
    gameEnded = true; scoreReported = true;
    const score = calculateScore();
    console.log('Game over. Score:', score);
  }
}

// ─── Local game init (loads any previous save from localStorage) ──────────
function initGame() {
  applySafeArea();
  loadFromLocalStorage();
}

// ─── Login bootstrapping ────────────────────────────────────────────────────
function joinMultiplayerGame() {
  const cleanName = (usernameInput.value || '').trim().slice(0, 15) || ('Player_' + Math.floor(Math.random() * 1000));
  setMyName(cleanName);
  setGameJoined(true);
  loginScreen.style.display = 'none';
  networkStatus.textContent = 'Connecting...';
  initNetwork();
  sendNetworkPing(true);
  canvas.focus({ preventScroll: true });
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let accumulator = 0, lastTime = 0;

function frame(time) {
  const FIXED_DT = GameConfig.world.fixedDt;
  if (!lastTime) lastTime = time;
  let dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    if (!gameEnded && gameJoined) {
      updateWorld(FIXED_DT);
      updatePlayer(FIXED_DT);
      updateCamera(FIXED_DT, playerState, worldState);
      sendNetworkPing(false);
      checkGameOver();
      saveTimer += FIXED_DT;
      if (saveTimer >= GameConfig.timings.saveIntervalSec) {
        saveTimer = 0;
        saveGame();
      }
    }
    accumulator -= FIXED_DT;
  }
  draw();
  requestAnimationFrame(frame);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load config.json FIRST. Nothing else touches GameConfig until this
  //    resolves, so every module's use of GameConfig.* below is guaranteed
  //    to see fully-populated data.
  await loadConfig('config.json');

  // 2. Now that config is loaded, initialise world/player defaults that
  //    depend on it (tile size, world dimensions, spawn point, etc).
  installRoundRectPolyfill();
  initWorldFromConfig();
  initPlayerFromConfig();
  loadTileset();

  // 3. Wire Input hooks (keeps input.js decoupled from world/inventory).
  configureInput({
    isTypingChat,
    isGameJoined: () => gameJoined,
    getSelectedItemDef,
    beginInteraction,
    tryBreakBlock,
    tryPlaceBlock,
    endInteraction,
    updateInteractionTarget,
    updateMinePointer,
    isMining,
    setSelectedSlot,
    tryPunchAction,
    onSaveAndQuit: saveAndQuit
  });

  startButton.addEventListener('click', joinMultiplayerGame);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinMultiplayerGame();
  });

  window.addEventListener('resize', doResizeCanvas);
  window.addEventListener('beforeunload', () => { if (!gameEnded) saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !gameEnded) saveGame(); });

  // 4. Initialise world, player, and renderer, then start the loop.
  resetGame();
  doResizeCanvas();
  renderInventory();
  setupInput();
  setupInventoryPanel();
  setupChat();
  initGame();
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error('Failed to boot game:', err);
});
