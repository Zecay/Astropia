// ─── Generic helpers ────────────────────────────────────────────────────────
import { canvas } from './dom.js';
import { cameraState } from './camera.js';

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Converts raw client (page/iframe) coords → canvas-local CSS pixel coords.
// Always use this on raw e.clientX/Y before anything else.
export function clientToLocal(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

// Converts canvas-local coords → world coords.
// activeMinePointer and all internal callers use local coords after clientToLocal.
export function localToWorld(localX, localY) {
  const vw = canvas.width / devicePixelRatio;
  const vh = canvas.height / devicePixelRatio;
  return {
    x: (localX - vw / 2) / cameraState.zoom + cameraState.x,
    y: (localY - vh / 2) / cameraState.zoom + cameraState.y
  };
}

// Convenience: client → world in one step (used only in direct event handlers
// that haven't pre-converted yet — kept for screenToWorld call sites below).
export function screenToWorld(clientX, clientY) {
  const local = clientToLocal(clientX, clientY);
  return localToWorld(local.x, local.y);
}

export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// Polyfill kept here since it patches a global browser prototype, not game state.
export function installRoundRectPolyfill() {
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      return this;
    };
  }
}
