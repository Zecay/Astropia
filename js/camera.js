// ─── Camera ─────────────────────────────────────────────────────────────────
import { canvas } from './dom.js';
import { TILE_SIZE } from './constants.js';
import { clamp } from './utils.js';

export const cameraState = { x: 0, y: 0, zoom: 1, targetZoom: 1 };

export function updateCamera(dt, playerState, worldState) {
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
  cameraState.x = clamp(cameraState.x, Math.min(vw/2, worldPixelWidth  - vw/2), Math.max(vw/2, worldPixelWidth  - vw/2));
  cameraState.y = clamp(cameraState.y, Math.min(vh/2, worldPixelHeight - vh/2), Math.max(vh/2, worldPixelHeight - vh/2));
}
