// ─── Renderer ───────────────────────────────────────────────────────────────
// Every function here that touches `ctx` lives in this module. The renderer
// only *reads* state from world.js / player.js / seeds.js / camera.js /
// network.js / inventory.js — it never mutates game state.
//
// Visual overhaul: tiles, the player, and seeds are now drawn from a single
// tileset spritesheet (GameConfig.visuals.tileset) via drawSprite(), with a
// colored-rect fallback while the image is still loading (or if it fails to
// load) so the game never renders blank.

import { GameConfig } from './config.js';
import { canvas, ctx } from './dom.js';
import { cameraState } from './camera.js';
import { clamp, easeOutCubic } from './utils.js';
import { playerState } from './player.js';
import {
  worldState, blockDamage, getBlockKey, particles, droppedItems, miningState,
  getBlockDef
} from './world.js';
import { plantedSeeds, isSeedMature, isPlayerTouchingSeed, getSeedGrowthStage } from './seeds.js';
import { getSelectedItemDef } from './inventory.js';
import { allPlayers, myId, myChat, myName, parseNetworkPayload } from './network.js';

// Local (render-only) interpolation cache for remote player positions. This
// is purely a visual smoothing concern, so it lives in the renderer instead
// of network.js.
const remoteVisuals = {};

// ─── Tileset loading ────────────────────────────────────────────────────────
let tilesetImage = null;
let tilesetReady = false;

export function loadTileset() {
  const cfg = GameConfig.visuals.tileset;
  if (!cfg || !cfg.src) return;
  const img = new Image();
  img.onload = () => { tilesetReady = true; };
  img.onerror = () => { tilesetReady = false; console.warn('[renderer] Failed to load tileset:', cfg.src); };
  img.src = cfg.src;
  tilesetImage = img;
}

// Draws a single cellSize x cellSize crop (col, row) from the tileset at
// world position (x, y), scaled to (w, h) [defaults to tile size]. Falls
// back to a flat colored square (fallbackColor/fallbackBorder) if the
// spritesheet isn't loaded yet — so the renderer is always ready to switch
// over to real art the moment the image finishes loading, with zero visual
// gap in the meantime.
export function drawSprite(col, row, x, y, w, h, fallbackColor, fallbackBorder) {
  const tileCfg = GameConfig.visuals.tileset;
  const cell = tileCfg.cellSize;
  w = w || cell;
  h = h || cell;

  if (tilesetReady && tilesetImage) {
    ctx.drawImage(
      tilesetImage,
      col * cell, row * cell, cell, cell,
      x, y, w, h
    );
    return;
  }

  // Fallback: flat rect using the block/seed's configured color.
  ctx.fillStyle = fallbackColor || '#9b6b3d';
  ctx.fillRect(x, y, w, h);
  if (fallbackBorder) {
    ctx.strokeStyle = fallbackBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

export function draw() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const skyCfg = GameConfig.visuals.sky;
  const vw = canvas.width / devicePixelRatio;
  const vh = canvas.height / devicePixelRatio;
  ctx.clearRect(0, 0, vw, vh);
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, skyCfg.top); sky.addColorStop(1, skyCfg.bottom);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cameraState.zoom, cameraState.zoom);
  ctx.translate(-cameraState.x, -cameraState.y);

  drawWorld();
  drawSeeds();
  drawDroppedItems();
  drawGhostBlock(); // Ghost block preview
  drawInteractionHand();
  drawRemotePlayers();
  drawPlayer();
  drawParticles();
  drawSeedTouchUI();

  ctx.restore();
}

function drawWorld() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const left   = Math.floor((cameraState.x - canvas.width  / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) - 1;
  const right  = Math.ceil( (cameraState.x + canvas.width  / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) + 1;
  const top    = Math.floor((cameraState.y - canvas.height / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) - 1;
  const bottom = Math.ceil( (cameraState.y + canvas.height / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) + 1;

  // ── Background layer (backgroundTiles: Cave Background etc.) ──
  // Drawn FIRST so solids always render on top of backgrounds. Rendered as
  // shaded cave rock (deterministic rock grain + ambient-occlusion at the
  // cavern rim + a depth gradient) rather than the tileset sprite, so it
  // reads as a cavern wall instead of a flat "window".
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const tile = getBgTileForRender(x, y);
      if (tile === 0) continue;
      const def = getBlockDef(tile);
      if (!def || !def.isBackground) continue;
      const px = x * TILE_SIZE, py = y * TILE_SIZE;
      const base = def.color || '#34303c';

      // Base rock fill.
      ctx.fillStyle = base;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Deterministic per-tile rock grain so the wall isn't a uniform slab.
      drawRockGrain(px, py, TILE_SIZE, base, x, y);

      // Ambient occlusion along the cavern rim: darken edges that border
      // empty (un-excavated) background space, giving a recessed look.
      drawCaveAO(x, y, px, py, TILE_SIZE);

      // Depth gradient: subtle light at the top, dark at the bottom.
      const g = ctx.createLinearGradient(0, py, 0, py + TILE_SIZE);
      g.addColorStop(0, 'rgba(255,255,255,0.07)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.0)');
      g.addColorStop(1, 'rgba(0,0,0,0.40)');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Faint rock border so tiles blend into a continuous cavern wall.
      ctx.strokeStyle = def.border || '#211d28';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

      drawBlockCracks(x, y, px, py, true);
    }
  }

  // ── Solid blocks layer (tiles: collision) ──
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const tile = getTileForRender(x, y);
      if (tile === 0) continue;
      const def = getBlockDef(tile);
      if (!def || def.isBackground) continue;
      const px = x * TILE_SIZE, py = y * TILE_SIZE;
      const sprite = def.sprite;
      if (sprite) {
        drawSprite(sprite.col, sprite.row, px, py, TILE_SIZE, TILE_SIZE, def.color, def.border);
      } else {
        ctx.fillStyle = def.color || '#9b6b3d';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
      ctx.strokeStyle = def.border || '#7a522d';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

      // Special visibility for Bedrock (ID 2)
      if (tile === 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      drawBlockCracks(x, y, px, py, false);
    }
  }
}

function getTileForRender(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return 1;
  return worldState.tiles[ty][tx];
}

function getBgTileForRender(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return 0;
  return worldState.backgroundTiles[ty][tx];
}

function drawBlockCracks(tx, ty, px, py, isBg = false) {
  const state = blockDamage.get((isBg ? 'bg_' : '') + getBlockKey(tx, ty));
  if (!state || state.damagePercent <= 0) return;
  const pct = state.damagePercent;
  const stage = pct <= 0.25 ? 1 : pct <= 0.5 ? 2 : pct <= 0.75 ? 3 : 4;
  ctx.save();
  ctx.strokeStyle = 'rgba(30,30,30,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px+16, py+4); ctx.lineTo(px+14, py+12); ctx.lineTo(px+18, py+19);
  if (stage >= 2) {
    ctx.moveTo(px+9,  py+10); ctx.lineTo(px+16, py+16); ctx.lineTo(px+8,  py+23);
    ctx.moveTo(px+22, py+9);  ctx.lineTo(px+18, py+16); ctx.lineTo(px+24, py+24);
  }
  if (stage >= 3) {
    ctx.moveTo(px+5,  py+6);  ctx.lineTo(px+11, py+13); ctx.lineTo(px+6,  py+19);
    ctx.moveTo(px+27, py+5);  ctx.lineTo(px+21, py+13); ctx.lineTo(px+28, py+18);
    ctx.moveTo(px+13, py+20); ctx.lineTo(px+18, py+27);
  }
  if (stage >= 4) {
    ctx.moveTo(px+4,  py+15); ctx.lineTo(px+10, py+17); ctx.lineTo(px+15, py+28);
    ctx.moveTo(px+28, py+14); ctx.lineTo(px+21, py+18); ctx.lineTo(px+18, py+29);
    ctx.moveTo(px+12, py+5);  ctx.lineTo(px+20, py+9);  ctx.lineTo(px+26, py+12);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Cave background helpers ────────────────────────────────────────────────
// Small, deterministic hash → [0,1) so rock texture is stable across frames
// (no per-frame flicker). Used for both whole-tile shading and speckles.
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Lighten (amt > 0) or darken (amt < 0) a hex color, returning rgb(...).
function shadeColor(hex, amt) {
  const c = hexToRgb(hex);
  const f = 1 + amt;
  const r = clamp(Math.round(c.r * f), 0, 255);
  const g = clamp(Math.round(c.g * f), 0, 255);
  const b = clamp(Math.round(c.b * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Deterministic rock grain for a single background tile: a whole-tile
// brightness jitter plus a few darker speckles, so the cavern wall looks
// like uneven rock instead of a flat slab.
function drawRockGrain(px, py, size, base, x, y) {
  const n = hash2(x, y);
  const shade = (n - 0.5) * 0.20;            // +/- ~10% per tile
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = shadeColor(base, shade);
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 1;

  const spec = 2 + Math.floor(hash2(x * 7 + 3, y * 13 + 5) * 3); // 2..4
  ctx.fillStyle = shadeColor(base, -0.35);
  for (let i = 0; i < spec; i++) {
    const hx = hash2(x * 31 + i * 17, y * 53 + i * 11);
    const hy = hash2(x * 19 + i * 23, y * 41 + i * 7);
    const sx = px + Math.floor(hx * (size - 3));
    const sy = py + Math.floor(hy * (size - 3));
    const r = 1 + Math.floor(hash2(x + i + 1, y + i + 1) * 2);
    ctx.globalAlpha = 0.22;
    ctx.fillRect(sx, sy, r, r);
  }
  ctx.globalAlpha = 1;
}

// Ambient occlusion: where a background tile borders empty (un-excavated)
// background space, darken that edge with a soft gradient so the carved
// cavern reads as recessed into rock rather than painted flat.
function drawCaveAO(x, y, px, py, size) {
  const open = (nx, ny) => {
    const t = getBgTileForRender(nx, ny);
    if (t === 0) return true;                 // empty / out-of-bounds
    const d = getBlockDef(t);
    return !d || !d.isBackground;
  };
  const edge = size * 0.45;
  const dark = 'rgba(0,0,0,0.55)';
  const trans = 'rgba(0,0,0,0)';
  if (open(x, y - 1)) {
    const g = ctx.createLinearGradient(0, py, 0, py + edge);
    g.addColorStop(0, dark); g.addColorStop(1, trans);
    ctx.fillStyle = g; ctx.fillRect(px, py, size, edge);
  }
  if (open(x, y + 1)) {
    const g = ctx.createLinearGradient(0, py + size, 0, py + size - edge);
    g.addColorStop(0, dark); g.addColorStop(1, trans);
    ctx.fillStyle = g; ctx.fillRect(px, py + size - edge, size, edge);
  }
  if (open(x - 1, y)) {
    const g = ctx.createLinearGradient(px, 0, px + edge, 0);
    g.addColorStop(0, dark); g.addColorStop(1, trans);
    ctx.fillStyle = g; ctx.fillRect(px, py, edge, size);
  }
  if (open(x + 1, y)) {
    const g = ctx.createLinearGradient(px + size, 0, px + size - edge, 0);
    g.addColorStop(0, dark); g.addColorStop(1, trans);
    ctx.fillStyle = g; ctx.fillRect(px + size - edge, py, edge, size);
  }
}

// Seeds now render in three visual stages driven by growthPct: Sprout ->
// Stem -> Mature, using different sprite crops from the tileset per stage
// (falling back to the old procedural stem+bloom drawing if the tileset
// isn't loaded yet).
function drawSeeds() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const stageSprites = GameConfig.visuals.defaultSeedSprites;
  for (const seed of plantedSeeds) {
    const def = GameConfig.seeds[seed.seedType];
    if (!def) continue;
    const growthPct = clamp(seed.growth / def.growthTime, 0, 1);
    const baseX = seed.tx * TILE_SIZE + TILE_SIZE / 2;
    const baseY = seed.ty * TILE_SIZE + TILE_SIZE - 3;
    const stage = getSeedGrowthStage(seed); // 'sprout' | 'stem' | 'mature'

    ctx.save();

    const spriteCrop = stageSprites && stageSprites[stage];
    if (spriteCrop) {
      const spriteSize = TILE_SIZE;
      drawSprite(spriteCrop.col, spriteCrop.row, baseX - spriteSize / 2, baseY - spriteSize + 3, spriteSize, spriteSize, def.stemColor, null);
    } else {
      // Procedural fallback: stem + bloom.
      const stemHeight = 5 + growthPct * 18;
      const bloomSize  = 3 + growthPct * 7;
      ctx.strokeStyle = def.stemColor; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(baseX, baseY - stemHeight); ctx.stroke();
      ctx.fillStyle = def.bloomColor;
      ctx.globalAlpha = 0.5 + growthPct * 0.5;
      ctx.beginPath(); ctx.arc(baseX, baseY - stemHeight, bloomSize, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (isSeedMature(seed)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(baseX, baseY - TILE_SIZE * 0.55, TILE_SIZE * 0.34, 0, Math.PI * 2); ctx.stroke();
    }
    drawBlockCracks(seed.tx, seed.ty, seed.tx * TILE_SIZE, seed.ty * TILE_SIZE);
    ctx.restore();
  }
}

function drawSeedTouchUI() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const ui = GameConfig.visuals.ui;
  const seed = plantedSeeds.find(e => isPlayerTouchingSeed(e));
  if (!seed) return;
  const def = GameConfig.seeds[seed.seedType];
  if (!def) return;
  const remaining = Math.max(0, Math.ceil(def.growthTime - seed.growth));
  const bw = 94, bh = 34;
  const bx = seed.tx * TILE_SIZE + TILE_SIZE / 2 - bw / 2;
  const by = seed.ty * TILE_SIZE - 42;
  ctx.save();
  ctx.fillStyle = ui.accent; ctx.strokeStyle = ui.accentDark; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#17324d'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(def.displayName, bx + bw/2, by + 13);
  ctx.font = '10px Arial'; ctx.fillText(`${remaining}s left`, bx + bw/2, by + 26);
  ctx.restore();
}

// Ghost block preview when hovering with a placeable block selected
function drawGhostBlock() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const selectedItem = getSelectedItemDef();
  if (!selectedItem || !selectedItem.placeableTile) return;

  // We need the current mouse position in world coords.
  // The pointerTile data is not directly available here, so we use a global
  // that we will populate from input.js (simple cross-module bridge).
  if (!window.__ghostHover || !window.__ghostHover.active) return;

  const { tx, ty } = window.__ghostHover;
  const def = GameConfig.blocksByTile[selectedItem.placeableTile];
  if (!def) return;

  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;

  ctx.save();
  ctx.globalAlpha = 0.45;
  if (def.sprite) {
    drawSprite(def.sprite.col, def.sprite.row, px, py, TILE_SIZE, TILE_SIZE, def.color, def.border);
  } else {
    ctx.fillStyle = def.color || '#9b6b3d';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.restore();
}

function drawDroppedItems() {
  for (const item of droppedItems) {
    const def = GameConfig.items[item.itemKey];
    if (!def) continue;
    const bobOffset = Math.sin(item.bob) * 2;
    const drawX = item.x;
    const drawY = item.y + bobOffset;

    ctx.save();
    if (def.type === 'seed') {
      const seedDef = GameConfig.seeds[def.seedType];
      ctx.fillStyle   = seedDef?.bloomColor  || '#7ac943';
      ctx.strokeStyle = seedDef?.stemColor || '#4d8f24';
      ctx.beginPath();
      ctx.ellipse(drawX, drawY, 4, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (def.type === 'block') {
      const blockDef = GameConfig.blocksByTile[def.blockId];
      ctx.fillStyle   = blockDef?.color  || '#9b6b3d';
      ctx.strokeStyle = blockDef?.border || '#7a522d';
      ctx.lineWidth = 1;
      ctx.fillRect(  drawX - 6, drawY - 6, 12, 12);
      ctx.strokeRect(drawX - 5.5, drawY - 5.5, 11, 11);
    }
    ctx.restore();
  }
}

function drawInteractionHand() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const handAnimation = miningState.handAnimation;
  if (!handAnimation) return;
  const pcx = playerState.x + playerState.width / 2;
  const pcy = playerState.y + playerState.height * 0.45;

  let targetX, targetY;
  if (handAnimation.didHit && handAnimation.tx !== undefined && handAnimation.ty !== undefined) {
    targetX = handAnimation.tx * TILE_SIZE + TILE_SIZE / 2;
    targetY = handAnimation.ty * TILE_SIZE + TILE_SIZE / 2;
  } else {
    const reach = TILE_SIZE * 1.5;
    targetX = pcx + handAnimation.facing * reach;
    targetY = pcy;
  }

  const progress     = clamp(handAnimation.elapsed / handAnimation.duration, 0, 1);
  const extendPhase  = 0.42;
  const strikeProgress = progress < extendPhase
    ? progress / extendPhase
    : 1 - easeOutCubic((progress - extendPhase) / (1 - extendPhase));
  const handX = pcx + (targetX - pcx) * strikeProgress;
  const handY = pcy + (targetY - pcy) * strikeProgress;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.82)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.lineTo(handX, handY); ctx.stroke();
  ctx.strokeStyle = 'rgba(74,43,24,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.lineTo(handX, handY); ctx.stroke();
  ctx.fillStyle = '#ffe0bd';
  ctx.beginPath(); ctx.arc(handX, handY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Player is now drawn as a sprite (with a colored-rect fallback while the
// tileset image loads), instead of a plain fillRect square.
function drawPlayer() {
  const spriteCfg = GameConfig.visuals.playerSprite;
  if (spriteCfg) {
    drawSprite(spriteCfg.col, spriteCfg.row, playerState.x, playerState.y, playerState.width, playerState.height, playerState.color, '#1c4fd6');
  } else {
    ctx.fillStyle = playerState.color;
    ctx.fillRect(playerState.x, playerState.y, playerState.width, playerState.height);
    ctx.strokeStyle = '#1c4fd6';
    ctx.strokeRect(playerState.x+0.5, playerState.y+0.5, playerState.width-1, playerState.height-1);
  }
  const activeChat = myChat.text && Date.now() - myChat.t < GameConfig.timings.chatBubbleMs ? myChat.text : '';
  drawTextBubble(playerState.x + playerState.width / 2, playerState.y - 7, (myName || 'You') + ' (You)', activeChat, true);
}

function drawTextBubble(worldX, worldY, title, chat, isLocal) {
  const invZoom = 1 / Math.max(0.001, cameraState.zoom);
  ctx.save();
  ctx.font = `${12 * invZoom}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleW = ctx.measureText(title).width + 12 * invZoom;
  const titleH = 17 * invZoom;
  ctx.fillStyle = isLocal ? 'rgba(18, 67, 60, 0.82)' : 'rgba(18, 24, 34, 0.78)';
  ctx.strokeStyle = isLocal ? 'rgba(126,217,87,0.9)' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1 * invZoom;
  ctx.beginPath();
  ctx.roundRect(worldX - titleW / 2, worldY - titleH, titleW, titleH, 5 * invZoom);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(title, worldX, worldY - titleH / 2);

  if (chat) {
    ctx.font = `${13 * invZoom}px Arial`;
    const maxW = 190 * invZoom;
    let text = chat;
    while (ctx.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -2);
    if (text !== chat) text = text.slice(0, -1) + '…';
    const bubbleW = Math.min(maxW, ctx.measureText(text).width + 18 * invZoom);
    const bubbleH = 24 * invZoom;
    const by = worldY - titleH - 7 * invZoom;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.roundRect(worldX - bubbleW / 2, by - bubbleH, bubbleW, bubbleH, 8 * invZoom);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#102030';
    ctx.fillText(text, worldX, by - bubbleH / 2);
  }
  ctx.restore();
}

function drawRemotePlayers() {
  const spriteCfg = GameConfig.visuals.playerSprite;
  const now = Date.now();
  for (const id in allPlayers) {
    if (id === myId) continue;
    const p = allPlayers[id];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    if (!remoteVisuals[id]) remoteVisuals[id] = { x: p.x, y: p.y };
    remoteVisuals[id].x += (p.x - remoteVisuals[id].x) * 0.35;
    remoteVisuals[id].y += (p.y - remoteVisuals[id].y) * 0.35;
    const packet = parseNetworkPayload(p, id);
    ctx.save();
    if (spriteCfg) {
      drawSprite(spriteCfg.col, spriteCfg.row, remoteVisuals[id].x, remoteVisuals[id].y, playerState.width, playerState.height, '#ff8f3f', '#bd5218');
    } else {
      ctx.fillStyle = '#ff8f3f';
      ctx.fillRect(remoteVisuals[id].x, remoteVisuals[id].y, playerState.width, playerState.height);
      ctx.strokeStyle = '#bd5218';
      ctx.strokeRect(remoteVisuals[id].x + 0.5, remoteVisuals[id].y + 0.5, playerState.width - 1, playerState.height - 1);
    }
    ctx.restore();
    const activeChat = packet.chat && now - packet.chatTime < GameConfig.timings.chatBubbleMs ? packet.chat : '';
    drawTextBubble(remoteVisuals[id].x + playerState.width / 2, remoteVisuals[id].y - 7, packet.name, activeChat, false);
  }

  for (const id in remoteVisuals) {
    if (!allPlayers[id]) delete remoteVisuals[id];
  }
}

// ─── Canvas sizing (touches ctx transform, so it lives here) ──────────────
export function resizeCanvas(applySafeArea) {
  const displayWidth  = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  canvas.width  = displayWidth  * devicePixelRatio;
  canvas.height = displayHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (applySafeArea) applySafeArea();
}
