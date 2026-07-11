// ─── Renderer ───────────────────────────────────────────────────────────────
// Every function here that touches `ctx` lives in this module. The renderer
// only *reads* state from world.js / player.js / seeds.js / camera.js /
// network.js / inventory.js — it never mutates game state.

import { TILE_SIZE, CHAT_BUBBLE_MS } from './constants.js';
import { canvas, ctx, stats } from './dom.js';
import { cameraState } from './camera.js';
import { clamp, easeOutCubic } from './utils.js';
import { playerState } from './player.js';
import {
  worldState, blockDamage, getBlockKey, particles, droppedItems, miningState,
  isWithinPunchRange
} from './world.js';
import { plantedSeeds, isSeedMature, isPlayerTouchingSeed } from './seeds.js';
import { SEED_DEFS, ITEM_DEFS } from './constants.js';
import { getSelectedItemKey, getSelectedItemDef, getItemQuantity } from './inventory.js';
import { allPlayers, myId, myChat, myName, parseNetworkPayload } from './network.js';

// Local (render-only) interpolation cache for remote player positions. This
// is purely a visual smoothing concern, so it lives in the renderer instead
// of network.js.
const remoteVisuals = {};

export function draw() {
  const vw = canvas.width / devicePixelRatio;
  const vh = canvas.height / devicePixelRatio;
  ctx.clearRect(0, 0, vw, vh);
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, '#87d5ff'); sky.addColorStop(1, '#e7f7ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cameraState.zoom, cameraState.zoom);
  ctx.translate(-cameraState.x, -cameraState.y);

  drawWorld();
  drawSeeds();
  drawDroppedItems();
  drawInteractionHand();
  drawRemotePlayers();
  drawPlayer();
  drawParticles();
  drawSeedTouchUI();

  ctx.restore();

  const selKey = getSelectedItemKey();
  const qtyLabel = selKey === 'hand' ? '∞' : getItemQuantity(selKey);
  stats.textContent = `Zoom: ${cameraState.zoom.toFixed(2)}x | Pos: ${Math.floor(playerState.x/TILE_SIZE)}, ${Math.floor(playerState.y/TILE_SIZE)} | Item: ${getSelectedItemDef().name} (${qtyLabel}) | Seeds: ${plantedSeeds.length} | World v${worldState.version}`;
}

function drawWorld() {
  const left   = Math.floor((cameraState.x - canvas.width  / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) - 1;
  const right  = Math.ceil( (cameraState.x + canvas.width  / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) + 1;
  const top    = Math.floor((cameraState.y - canvas.height / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) - 1;
  const bottom = Math.ceil( (cameraState.y + canvas.height / devicePixelRatio / (2 * cameraState.zoom)) / TILE_SIZE) + 1;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const tile = getTileForRender(x, y);
      if (tile === 0) continue;
      const px = x * TILE_SIZE, py = y * TILE_SIZE;
      switch (tile) {
        case 2: ctx.fillStyle='#111111'; ctx.strokeStyle='#2f2f2f'; break;
        case 3: ctx.fillStyle='#46b95b'; ctx.strokeStyle='#2f8c42'; break;
        case 4: ctx.fillStyle='#8b949e'; ctx.strokeStyle='#69727c'; break;
        case 5: ctx.fillStyle='#ff6b2c'; ctx.strokeStyle='#c74312'; break;
        default: ctx.fillStyle='#9b6b3d'; ctx.strokeStyle='#7a522d';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      drawBlockCracks(x, y, px, py);
    }
  }
}

function getTileForRender(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.width || ty >= worldState.height) return 1;
  return worldState.tiles[ty][tx];
}

function drawBlockCracks(tx, ty, px, py) {
  const state = blockDamage.get(getBlockKey(tx, ty));
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

function drawSeeds() {
  for (const seed of plantedSeeds) {
    const def = SEED_DEFS[seed.seedType];
    if (!def) continue;
    const growthPct = clamp(seed.growth / def.growthTime, 0, 1);
    const baseX = seed.tx * TILE_SIZE + TILE_SIZE / 2;
    const baseY = seed.ty * TILE_SIZE + TILE_SIZE - 3;
    const stemHeight = 5 + growthPct * 18;
    const bloomSize  = 3 + growthPct * 7;

    ctx.save();
    ctx.strokeStyle = def.stemColor; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(baseX, baseY - stemHeight); ctx.stroke();
    ctx.fillStyle = def.bloomColor;
    ctx.globalAlpha = 0.5 + growthPct * 0.5;
    ctx.beginPath(); ctx.arc(baseX, baseY - stemHeight, bloomSize, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (isSeedMature(seed)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(baseX, baseY - stemHeight, bloomSize + 2, 0, Math.PI * 2); ctx.stroke();
    }
    drawBlockCracks(seed.tx, seed.ty, seed.tx * TILE_SIZE, seed.ty * TILE_SIZE);
    ctx.restore();
  }
}

function drawSeedTouchUI() {
  const seed = plantedSeeds.find(e => isPlayerTouchingSeed(e));
  if (!seed) return;
  const def = SEED_DEFS[seed.seedType];
  if (!def) return;
  const remaining = Math.max(0, Math.ceil(def.growthTime - seed.growth));
  const bw = 94, bh = 34;
  const bx = seed.tx * TILE_SIZE + TILE_SIZE / 2 - bw / 2;
  const by = seed.ty * TILE_SIZE - 42;
  ctx.save();
  ctx.fillStyle = '#7ed957'; ctx.strokeStyle = '#347a2a'; ctx.lineWidth = 2;
  ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx+0.5, by+0.5, bw-1, bh-1);
  ctx.fillStyle = '#17324d'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(def.displayName, bx + bw/2, by + 13);
  ctx.font = '10px Arial'; ctx.fillText(`${remaining}s left`, bx + bw/2, by + 26);
  ctx.restore();
}

function drawDroppedItems() {
  for (const item of droppedItems) {
    const def = ITEM_DEFS[item.itemKey];
    if (!def) continue;
    const bobOffset = Math.sin(item.bob) * 2;
    const drawX = item.x;
    const drawY = item.y + bobOffset;

    ctx.save();
    if (def.type === 'seed') {
      const seedColors  = { rock:'#9aa3ad', lava:'#ff6b2c', dirt:'#7ac943', grass:'#55c963' };
      const seedStrokes = { rock:'#6d7680', lava:'#c74312', dirt:'#4d8f24', grass:'#2f8c42' };
      const sType = def.seedType || 'dirt';
      ctx.fillStyle   = seedColors[sType]  || '#7ac943';
      ctx.strokeStyle = seedStrokes[sType] || '#4d8f24';
      ctx.beginPath();
      ctx.ellipse(drawX, drawY, 4, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (def.type === 'block') {
      const blockColors  = { 1:'#9b6b3d', 3:'#46b95b', 4:'#8b949e', 5:'#ff6b2c' };
      const blockStrokes = { 1:'#7a522d', 3:'#2f8c42', 4:'#69727c', 5:'#c74312' };
      const bid = def.blockId || 1;
      ctx.fillStyle   = blockColors[bid]  || '#9b6b3d';
      ctx.strokeStyle = blockStrokes[bid] || '#7a522d';
      ctx.lineWidth = 1;
      ctx.fillRect(  drawX - 6, drawY - 6, 12, 12);
      ctx.strokeRect(drawX - 5.5, drawY - 5.5, 11, 11);
    }
    ctx.restore();
  }
}

function drawInteractionHand() {
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

function drawPlayer() {
  ctx.fillStyle = playerState.color;
  ctx.fillRect(playerState.x, playerState.y, playerState.width, playerState.height);
  ctx.strokeStyle = '#1c4fd6';
  ctx.strokeRect(playerState.x+0.5, playerState.y+0.5, playerState.width-1, playerState.height-1);
  const activeChat = myChat.text && Date.now() - myChat.t < CHAT_BUBBLE_MS ? myChat.text : '';
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
    ctx.fillStyle = '#ff8f3f';
    ctx.fillRect(remoteVisuals[id].x, remoteVisuals[id].y, playerState.width, playerState.height);
    ctx.strokeStyle = '#bd5218';
    ctx.strokeRect(remoteVisuals[id].x + 0.5, remoteVisuals[id].y + 0.5, playerState.width - 1, playerState.height - 1);
    ctx.restore();
    const activeChat = packet.chat && now - packet.chatTime < CHAT_BUBBLE_MS ? packet.chat : '';
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
