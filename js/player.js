// ─── Player state & physics ────────────────────────────────────────────────
import {
  TILE_SIZE, PLAYER_SIZE_X, PLAYER_SIZE_Y, GROUND_ROW,
  WALK_SPEED, WALK_ACCEL, GROUND_FRIC, AIR_FRIC,
  JUMP_VEL, GRAVITY_HOLD, GRAVITY_NORMAL, MAX_FALL_SPEED, GRAVITY_CANCEL
} from './constants.js';
import { Input, consumeJumpJustPressed } from './input.js';
import { getTile } from './world.js';

export const playerState = {
  x: 6 * TILE_SIZE, y: (GROUND_ROW - 3) * TILE_SIZE,
  width: PLAYER_SIZE_X, height: PLAYER_SIZE_Y,
  vx: 0, vy: 0, onGround: false, facing: 1, color: '#3f7cff'
};

export function triggerHaptic() {
  if (navigator.vibrate) navigator.vibrate(15);
}

export function resetPlayer() {
  playerState.x = 6 * TILE_SIZE;
  playerState.y = Math.max(2 * TILE_SIZE, (GROUND_ROW - 5) * TILE_SIZE);
  playerState.vx = 0; playerState.vy = 0;
  playerState.onGround = false; playerState.facing = 1;
}

export function updatePlayer(dt) {
  if (Input.left && !Input.right) {
    playerState.facing = -1;
    playerState.vx -= WALK_ACCEL * dt;
    if (playerState.vx < -WALK_SPEED) playerState.vx = -WALK_SPEED;
  } else if (Input.right && !Input.left) {
    playerState.facing = 1;
    playerState.vx += WALK_ACCEL * dt;
    if (playerState.vx > WALK_SPEED) playerState.vx = WALK_SPEED;
  } else {
    const friction = playerState.onGround ? GROUND_FRIC : AIR_FRIC;
    if (playerState.vx > 0) playerState.vx = Math.max(0, playerState.vx - friction * dt);
    else if (playerState.vx < 0) playerState.vx = Math.min(0, playerState.vx + friction * dt);
  }

  if (playerState.onGround && Input.jumpJustPressed) {
    playerState.vy = JUMP_VEL;
    playerState.onGround = false;
    triggerHaptic();
  }

  let gravity;
  if (playerState.vy < 0) gravity = Input.jump ? GRAVITY_HOLD : GRAVITY_CANCEL;
  else gravity = GRAVITY_NORMAL;

  playerState.vy += gravity * dt;
  playerState.vy = Math.min(playerState.vy, MAX_FALL_SPEED);

  moveAndCollideX(playerState.vx * dt);
  moveAndCollideY(playerState.vy * dt);
  consumeJumpJustPressed();
}

export function moveAndCollideX(amount) {
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
