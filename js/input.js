// ─── Input handling ─────────────────────────────────────────────────────────
// Owns keyboard / mouse / touch listeners and exposes a plain `Input` object
// that other modules (mainly player.js) read from every frame.
//
// Input never mutates game/world state directly — for interaction (mining,
// placing blocks, camera zoom, chat) it calls back into world/camera modules
// via the callbacks wired up in main.js through `configureInput`.

import { clamp, clientToLocal, localToWorld } from './utils.js';
import { GameConfig } from './config.js';
import {
  canvas, leftBtn, rightBtn, jumpBtn, punchBtn, saveQuitBtn,
  chatInput, usernameInput
} from './dom.js';
import { cameraState } from './camera.js';

export const Input = {
  left: false,
  right: false,
  jump: false,
  shift: false,
  jumpJustPressed: false,
  pointerTileX: 0,
  pointerTileY: 0
};

// Hooks supplied by main.js once the other modules are initialised, so this
// module doesn't need to import world/inventory/etc. directly (avoids
// circular imports while keeping Input as the single source of truth for
// raw device state).
let hooks = {
  isTypingChat: () => document.activeElement === chatInput || document.activeElement === usernameInput,
  isGameJoined: () => false,
  getSelectedItemDef: () => ({ usableForBreaking: true, type: 'tool' }),
  beginInteraction: () => {},
  tryBreakBlock: () => {},
  tryPlaceBlock: () => {},
  endInteraction: () => {},
  updateInteractionTarget: () => {},
  updateMinePointer: () => {},
  isMining: () => false,
  setSelectedSlot: () => {},
  tryPunchAction: () => {},
  onSaveAndQuit: () => {}
};

export function configureInput(customHooks) {
  hooks = { ...hooks, ...customHooks };
}

function setMoveButton(button, key, pressed) {
  const on  = (e) => { e.preventDefault(); Input[key] = pressed; if (key === 'jump' && pressed) Input.jumpJustPressed = true; };
  const off = (e) => { if (e) e.preventDefault(); Input[key] = false; };
  button.addEventListener('pointerdown',  on);
  button.addEventListener('pointerup',    off);
  button.addEventListener('pointercancel', off);
  button.addEventListener('pointerleave', (e) => { if (e.buttons === 0) off(e); });
}

function setupPunchButton() {
  const pressPunch   = (e) => { e.preventDefault(); punchHeldSet(true); hooks.tryPunchAction(); };
  const releasePunch = (e) => { if (e) e.preventDefault(); punchHeldSet(false); };
  punchBtn.addEventListener('pointerdown',  pressPunch);
  punchBtn.addEventListener('pointerup',    releasePunch);
  punchBtn.addEventListener('pointercancel', releasePunch);
  punchBtn.addEventListener('pointerleave', (e) => { if (e.buttons === 0) releasePunch(e); });
}

// punchHeld is read by world.js each tick (via getPunchHeld) to drive the
// "hold to punch" behaviour.
let punchHeld = false;
function punchHeldSet(v) { punchHeld = v; }
export function getPunchHeld() { return punchHeld; }

export function setupInput() {
  // ── Keyboard ──
  window.addEventListener('keydown', (e) => {
    if (hooks.isTypingChat()) return;
    if (e.code === 'Enter') { chatInput.focus(); return; }
    if (!hooks.isGameJoined()) return;
    if (e.repeat && e.code === 'Space') return;
    if (e.code === 'KeyA'  || e.code === 'ArrowLeft')  Input.left  = true;
    if (e.code === 'KeyD'  || e.code === 'ArrowRight') Input.right = true;
    if (e.code === 'Space') { if (!Input.jump) Input.jumpJustPressed = true; Input.jump = true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Input.shift = true;
    const { minZoom, maxZoom, zoomStep } = GameConfig.world;
    for (let i = 1; i <= GameConfig.inventory.quickSlotCount; i++)
      if (e.code === `Digit${i}` || e.code === `Numpad${i}`) { hooks.setSelectedSlot(i - 1); break; }
    if (e.code === 'Equal'  || e.code === 'NumpadAdd')      cameraState.targetZoom = clamp(cameraState.targetZoom + zoomStep, minZoom, maxZoom);
    if (e.code === 'Minus'  || e.code === 'NumpadSubtract') cameraState.targetZoom = clamp(cameraState.targetZoom - zoomStep, minZoom, maxZoom);
  });
  window.addEventListener('keyup', (e) => {
    if (hooks.isTypingChat()) return;
    if (e.code === 'KeyA'  || e.code === 'ArrowLeft')  Input.left  = false;
    if (e.code === 'KeyD'  || e.code === 'ArrowRight') Input.right = false;
    if (e.code === 'Space') Input.jump = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Input.shift = false;
  });

  // Focus fix: reset movement when tabbing out / returning to window
  window.addEventListener('blur', () => {
    Input.left = false;
    Input.right = false;
    Input.jump = false;
    Input.shift = false;
    Input.jumpJustPressed = false;
    punchHeldSet(false);
    hooks.endInteraction();
  });

  // ── Mouse ──
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dragstart',   (e) => e.preventDefault());
  canvas.addEventListener('selectstart', (e) => e.preventDefault());
  canvas.addEventListener('dblclick',    (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { minZoom, maxZoom, zoomStep } = GameConfig.world;
    cameraState.targetZoom = clamp(cameraState.targetZoom + (e.deltaY > 0 ? -1 : 1) * zoomStep, minZoom, maxZoom);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    e.preventDefault();

    const clickedUi = e.target && e.target !== canvas;
    if (clickedUi) return;

    // Convert client → local once, use local coords everywhere
    const local = clientToLocal(e.clientX, e.clientY);
    const selectedItem = hooks.getSelectedItemDef();

    if (selectedItem.usableForBreaking) {
      hooks.beginInteraction(local.x, local.y);
      hooks.tryBreakBlock(local.x, local.y);
    } else if (selectedItem.type === 'block' || selectedItem.type === 'seed') {
      hooks.tryPlaceBlock(local.x, local.y);
      // Continuous placement: keep active pointer for holding mouse
      hooks.beginInteraction(local.x, local.y);
    } else {
      hooks.endInteraction();
    }
  });

  window.addEventListener('mousemove', (e) => {
    // Update ghost hover for every mouse move using localToWorld for 100% precision
    const local = clientToLocal(e.clientX, e.clientY);
    const TILE_SIZE = GameConfig.world.tileSize;
    const worldPos = localToWorld(local.x, local.y);
    const tx = Math.floor(worldPos.x / TILE_SIZE);
    const ty = Math.floor(worldPos.y / TILE_SIZE);

    window.__ghostHover = { active: true, tx, ty, localX: local.x, localY: local.y };

    if (hooks.isMining() && (e.buttons & 1)) {
      hooks.updateMinePointer(local.x, local.y);
      hooks.updateInteractionTarget(local.x, local.y);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) hooks.endInteraction();
  });

  // ── Touch / pointer ──
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    if (e.pointerType !== 'touch') return;
    e.preventDefault();

    // Convert client → local once, use local coords everywhere
    const local = clientToLocal(e.clientX, e.clientY);
    const selectedItem = hooks.getSelectedItemDef();

    if (selectedItem.usableForBreaking) {
      hooks.beginInteraction(local.x, local.y);
      hooks.tryBreakBlock(local.x, local.y);
    } else if (selectedItem.type === 'block' || selectedItem.type === 'seed') {
      hooks.tryPlaceBlock(local.x, local.y);
      hooks.endInteraction();
    } else {
      hooks.endInteraction();
    }

    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && hooks.isMining()) {
      const local = clientToLocal(e.clientX, e.clientY);
      hooks.updateMinePointer(local.x, local.y);
      hooks.updateInteractionTarget(local.x, local.y);
    }
  });

  const stopMining = (e) => {
    if (!hooks.isMining()) return;
    if (!e || e.pointerType === 'touch') hooks.endInteraction();
  };
  canvas.addEventListener('pointerup',     stopMining);
  canvas.addEventListener('pointercancel', stopMining);

  setMoveButton(leftBtn,  'left',  true);
  setMoveButton(rightBtn, 'right', true);
  setMoveButton(jumpBtn,  'jump',  true);
  setupPunchButton();

  // saveQuitBtn is an optional element (absent on the current build) — guard it.
  if (saveQuitBtn) {
    saveQuitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hooks.onSaveAndQuit();
    });
  }
}

export function consumeJumpJustPressed() {
  Input.jumpJustPressed = false;
}
