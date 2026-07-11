// ─── Player state & physics ────────────────────────────────────────────────
import { GameConfig } from './config.js';
import { Input, consumeJumpJustPressed } from './input.js';
import { getTile } from './world.js';

// Dev mode helpers (sync access via global for simplicity)
function getDevMode() {
  return window.__devMode || { isNoclip: () => false, isFlyMode: () => false };
}

// playerState is created with safe zero defaults; initPlayerFromConfig()
// (called once after config loads, before the game loop starts) fills in the
// real size/spawn position/color from GameConfig.
export const playerState = {
  x: 0, y: 0,
  width: 24, height: 24,
  vx: 0, vy: 0, onGround: false, facing: 1, color: '#3f7cff'
};

export function initPlayerFromConfig() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const GROUND_ROW = GameConfig.world.groundRow;
  playerState.width = GameConfig.player.sizeX;
  playerState.height = GameConfig.player.sizeY;
  playerState.color = GameConfig.player.color;
  playerState.x = 6 * TILE_SIZE;
  playerState.y = (GROUND_ROW - 3) * TILE_SIZE;
}

export function triggerHaptic() {
  if (navigator.vibrate) navigator.vibrate(15);
}

export function resetPlayer() {
  const TILE_SIZE = GameConfig.world.tileSize;
  const GROUND_ROW = GameConfig.world.groundRow;
  playerState.x = 6 * TILE_SIZE;
  playerState.y = Math.max(2 * TILE_SIZE, (GROUND_ROW - 5) * TILE_SIZE);
  playerState.vx = 0; playerState.vy = 0;
  playerState.onGround = false; playerState.facing = 1;
}

export function updatePlayer(dt) {
  const { walkSpeed, walkAccel, friction, jumpVel, gravityHold, gravityNormal, maxFallSpeed, gravityCancel } = GameConfig.physics;

  const dev = getDevMode();
  const noclip = dev.isNoclip();
  const fly = dev.isFlyMode();

  // Noclip: skip all collision
  if (noclip) {
    // Free movement in all directions
    if (Input.left && !Input.right) {
      playerState.facing = -1;
      playerState.x -= walkSpeed * dt * 1.3;
    } else if (Input.right && !Input.left) {
      playerState.facing = 1;
      playerState.x += walkSpeed * dt * 1.3;
    }

    if (Input.jump) {
      playerState.y -= walkSpeed * dt * 1.3;
    }
    if (Input.right && Input.left) { // optional: shift down if both arrows pressed
      playerState.y += walkSpeed * dt * 1.3;
    }

    playerState.vx = 0;
    playerState.vy = 0;
    playerState.onGround = true;
    consumeJumpJustPressed();
    return;
  }

  // Normal movement
  if (Input.left && !Input.right) {
    playerState.facing = -1;
    playerState.vx -= walkAccel * dt;
    if (playerState.vx < -walkSpeed) playerState.vx = -walkSpeed;
  } else if (Input.right && !Input.left) {
    playerState.facing = 1;
    playerState.vx += walkAccel * dt;
    if (playerState.vx > walkSpeed) playerState.vx = walkSpeed;
  } else {
    // Anti-slippery: stronger friction for instant stop
    const stopFriction = friction * 3.2;
    if (playerState.vx > 0) playerState.vx = Math.max(0, playerState.vx - stopFriction * dt);
    else if (playerState.vx < 0) playerState.vx = Math.min(0, playerState.vx + stopFriction * dt);
  }

  // Fly mode overrides gravity
  if (fly) {
    if (Input.jump) {
      playerState.vy = -walkSpeed * 1.2;
    } else if (Input.right && Input.left) { // hold both arrows = descend
      playerState.vy = walkSpeed * 1.2;
    } else {
      playerState.vy *= 0.6; // slow hover
    }
    playerState.onGround = false;
  } else {
    if (playerState.onGround && Input.jumpJustPressed) {
      playerState.vy = jumpVel;
      playerState.onGround = false;
      triggerHaptic();
    }

    let gravity;
    if (playerState.vy < 0) gravity = Input.jump ? gravityHold : gravityCancel;
    else gravity = gravityNormal;

    playerState.vy += gravity * dt;
    playerState.vy = Math.min(playerState.vy, maxFallSpeed);
  }

  moveAndCollideX(playerState.vx * dt);
  moveAndCollideY(playerState.vy * dt);
  consumeJumpJustPressed();
}

export function moveAndCollideX(amount) {
  const TILE_SIZE = GameConfig.world.tileSize;
  playerState.x += amount;
  if (amount > 0) {
    const right = playerState.x + playerState.width;
    const topTile    = Math.floor(playerState.y / TILE_SIZE);
    const bottomTile = Math.floor((playerState.y + playerState.height - 1) / TILE_SIZE);
    const tileX = Math.floor((right - 1) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      const tile = getTile(tileX, ty);
      if (tile === 5) { playerState.vx = -250 + (Math.random() - 0.5) * 60; playerState.x = tileX * TILE_SIZE - playerState.width - 1; return; }
      if (tile !== 0) { playerState.x = tileX * TILE_SIZE - playerState.width; playerState.vx = 0; break; }
    }
  } else if (amount < 0) {
    const left = playerState.x;
    const topTile    = Math.floor(playerState.y / TILE_SIZE);
    const bottomTile = Math.floor((playerState.y + playerState.height - 1) / TILE_SIZE);
    const tileX = Math.floor(left / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      const tile = getTile(tileX, ty);
      if (tile === 5) { playerState.vx = 250 + (Math.random() - 0.5) * 60; playerState.x = (tileX + 1) * TILE_SIZE + 1; return; }
      if (tile !== 0) { playerState.x = (tileX + 1) * TILE_SIZE; playerState.vx = 0; break; }
    }
  }
}

export function moveAndCollideY(amount) {
  const TILE_SIZE = GameConfig.world.tileSize;
  playerState.onGround = false;
  const previousY = playerState.y;
  playerState.y += amount;

  if (amount > 0) {
    const leftTile  = Math.floor(playerState.x / TILE_SIZE);
    const rightTile = Math.floor((playerState.x + playerState.width - 1) / TILE_SIZE);
    const startTileY = Math.floor((previousY + playerState.height) / TILE_SIZE);
    const endTileY   = Math.floor((playerState.y + playerState.height) / TILE_SIZE);
    for (let tileY = startTileY; tileY <= endTileY; tileY++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        const tile = getTile(tx, tileY);
        if (tile === 5) { playerState.vy = -500 + (Math.random()-0.5)*80; playerState.y = tileY * TILE_SIZE - playerState.height - 1; playerState.onGround = false; return; }
        if (tile !== 0) { playerState.y = tileY * TILE_SIZE - playerState.height; playerState.vy = 0; playerState.onGround = true; return; }
      }
    }
  } else if (amount < 0) {
    const leftTile  = Math.floor(playerState.x / TILE_SIZE);
    const rightTile = Math.floor((playerState.x + playerState.width - 1) / TILE_SIZE);
    const startTileY = Math.floor(previousY / TILE_SIZE);
    const endTileY   = Math.floor(playerState.y / TILE_SIZE);
    for (let tileY = startTileY; tileY >= endTileY; tileY--) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        const tile = getTile(tx, tileY);
        if (tile === 5) { playerState.vy = 250 + (Math.random()-0.5)*60; playerState.y = (tileY + 1) * TILE_SIZE; return; }
        if (tile !== 0) { playerState.y = (tileY + 1) * TILE_SIZE; playerState.vy = 0; return; }
      }
    }
  } else {
    const leftTile  = Math.floor(playerState.x / TILE_SIZE);
    const rightTile = Math.floor((playerState.x + playerState.width - 1) / TILE_SIZE);
    const footTileY = Math.floor((playerState.y + playerState.height) / TILE_SIZE);
    if ((playerState.y + playerState.height) === footTileY * TILE_SIZE) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        const tile = getTile(tx, footTileY);
        if (tile === 5) { playerState.vy = -500 + (Math.random()-0.5)*80; playerState.y = footTileY * TILE_SIZE - playerState.height - 1; playerState.onGround = false; return; }
        if (tile !== 0) { playerState.onGround = true; playerState.vy = 0; return; }
      }
    }
  }
}
