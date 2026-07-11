// ─── Camera ─────────────────────────────────────────────────────────────────
import { canvas } from './dom.js';
import { GameConfig } from './config.js';
import { clamp } from './utils.js';

export const cameraState = { x: 0, y: 0, zoom: 1, targetZoom: 1 };

export function updateCamera(dt, playerState, worldState) {
  const TILE_SIZE = GameConfig.world.tileSize;
  const targetX = playerState.x + playerState.width / 2;
  const targetY = playerState.y + playerState.height / 2;
  const follow = 1 - Math.pow(0.001, dt * 4.2);
  cameraState.x += (targetX - cameraState.x) * follow;
  cameraState.y += (targetY - cameraState.y) * follow;
  cameraState.zoom += (cameraState.targetZoom - cameraState.zoom) * (1 - Math.pow(0.001, dt * 6));

  const worldPixelWidth  = worldState.width  * TILE_SIZE;
  const worldPixelHeight = worldState.height * TILE_SIZE;
  const vw = canvas.width  / devicePixelRatio / cameraState.zoom;
  const vh = canvas.height / devicePixelRatio / cameraState.zoom;

  // Strict camera clamp: viewport must never show outside the world at any zoom
  const halfW = vw / 2;
  const halfH = vh / 2;

  const minX = halfW;
  const maxX = worldPixelWidth - halfW;
  const minY = halfH;
  const maxY = worldPixelHeight - halfH;

  if (worldPixelWidth <= vw) {
    cameraState.x = worldPixelWidth / 2;
  } else {
    cameraState.x = clamp(cameraState.x, minX, maxX);
  }

  if (worldPixelHeight <= vh) {
    cameraState.y = worldPixelHeight / 2;
  } else {
    cameraState.y = clamp(cameraState.y, minY, maxY);
  }
}
