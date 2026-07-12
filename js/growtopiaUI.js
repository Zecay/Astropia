// ─── Growtopia-style Draggable Floating UI ─────────────────────────────────
// Replaces the old hamburger inventory with a floating, draggable window.
// Includes: Search bar, grid, side buttons, chat draggable window.

import { GameConfig } from './config.js';
import {
  inventoryWindow, inventoryHeader, inventoryGrid,
  chatUI
} from './dom.js';
import {
  inventoryState,
  getItemQuantity,
  addInventoryItem,
  setSelectedSlot,
  getSelectedItemKey,
  renderInventory as oldRenderInventory
} from './inventory.js';
import { playerState } from './player.js';

// ─── Draggable Window Logic ───────────────────────────────────────────────
// Drags `element` by its `handle`.
//   axis:    'both' (default) or 'y' (vertical-only).
//   anchor:  'top' (default) or 'bottom' — which CSS edge the vertical drag
//            moves (bottom-anchored windows grow upward, like Growtopia).
//   clamp:   when true (default) vertical dragging is bounded so the window
//            can't be flung off-screen or dragged further than a max range.
//   onTap:   fired on pointerup when the pointer barely moved (a click, not a
//            drag) — used to toggle the inventory open/collapsed.
function makeDraggable(element, handle, { axis = 'both', anchor = 'top', onTap, clamp = true } = {}) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  let startX = 0, startY = 0, moved = 0;
  let startBottom = 0;

  const startDrag = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    isDragging = true;
    moved = 0;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    startX = e.clientX; startY = e.clientY;
    // For bottom-anchored windows we drive the `bottom` offset directly.
    if (axis === 'y' && anchor === 'bottom') {
      element.style.top = 'auto';
      startBottom = window.innerHeight - rect.bottom;
      element.style.bottom = startBottom + 'px';
    }
    element.style.transition = 'none';
    document.body.style.userSelect = 'none';
  };

  const clampBottom = (bottom) => {
    const minBottom = 8; // can't sink more than 8px below the viewport
    const maxBottom = Math.max(
      minBottom,
      window.innerHeight - element.offsetHeight - Math.round(window.innerHeight * 0.12)
    );
    return Math.max(minBottom, Math.min(bottom, maxBottom));
  };

  const doDrag = (e) => {
    if (!isDragging) return;
    moved = Math.max(moved, Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY));
    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;

    if (axis === 'y') {
      if (anchor === 'bottom') {
        // Dragging up raises `bottom`; clamp to a bounded vertical range.
        const delta = startY - e.clientY; // up = positive
        const bottom = clamp ? clampBottom(startBottom + delta) : startBottom + delta;
        element.style.bottom = bottom + 'px';
      } else {
        const top = clamp
          ? Math.max(Math.round(window.innerHeight * 0.12),
                     Math.min(newTop, window.innerHeight - element.offsetHeight - 8))
          : newTop;
        element.style.bottom = 'auto';
        element.style.top = top + 'px';
      }
    } else {
      const maxLeft = window.innerWidth - element.offsetWidth;
      const maxTop = window.innerHeight - element.offsetHeight;
      element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
      element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      element.style.transform = 'none';
    }
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    element.style.transition = '';
    document.body.style.userSelect = '';
    // Treat a near-stationary press as a click (toggle), not a drag.
    if (moved < 6 && typeof onTap === 'function') onTap();
  };

  handle.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', doDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

// Build a centered, pixelated item "sprite" element for a slot.
function makeIcon(itemKey) {
  const def = GameConfig.items[itemKey];
  const sprite = document.createElement('div');
  sprite.className = 'item-sprite';
  if (!def) return sprite;
  if (itemKey === 'hand') {
    sprite.classList.add('hand');
    sprite.textContent = '✊';
    return sprite;
  }
  if (def.type === 'block') {
    const blockDef = GameConfig.blocksByTile[def.blockId];
    if (itemKey === 'cave_bg') {
      sprite.style.background = 'linear-gradient(135deg, #443f4f, #26232d)';
      sprite.style.border = '2px solid #18151e';
    } else {
      sprite.style.background = blockDef?.color || '#9b6b3d';
      sprite.style.border = `2px solid ${blockDef?.border || '#7a522d'}`;
    }
    sprite.style.borderRadius = '4px';
    sprite.style.boxShadow = 'inset 2px 2px 0 rgba(255,255,255,0.32), inset -2px -2px 0 rgba(0,0,0,0.45), 1px 1px 2px rgba(0,0,0,0.5)';
    return sprite;
  }
  if (def.type === 'seed') {
    const seedDef = GameConfig.seeds[def.seedType];
    sprite.style.background = seedDef?.bloomColor || '#7ac943';
    sprite.style.border = '2px solid #4d8f24';
    sprite.style.borderRadius = '50%';
    sprite.style.boxShadow = 'inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.45), 1px 1px 2px rgba(0,0,0,0.5)';
    return sprite;
  }
  return sprite;
}

// Build a single slot: relative container with an absolutely-centered sprite,
// a bottom-right stack quantity, and (for worn items) an equipped checkmark
// that overrides the quantity.
function buildSlot(key, { selected = false, equipped = false, showQty = false } = {}) {
  const slot = document.createElement('div');
  if (selected) slot.classList.add('selected');
  if (!key) return slot;
  slot.appendChild(makeIcon(key));
  if (equipped) {
    const ck = document.createElement('div');
    ck.className = 'equipped';
    ck.textContent = '✔';
    slot.appendChild(ck);
  } else if (showQty) {
    const qty = document.createElement('div');
    qty.className = 'qty';
    qty.textContent = String(getItemQuantity(key));
    slot.appendChild(qty);
  }
  return slot;
}

// Equip a backpack item into the first free hotbar slot and select it.
function equipToQuickSlot(itemKey) {
  if (!itemKey || itemKey === 'hand') return;
  let target = inventoryState.quickSlots.findIndex((s, i) => i > 0 && s === null);
  if (target === -1) target = inventoryState.selectedIndex > 0 ? inventoryState.selectedIndex : 1;
  if (target > 0 && target < inventoryState.quickSlots.length) {
    inventoryState.quickSlots[target] = itemKey;
    inventoryState.quickSlots[0] = 'hand';
    setSelectedSlot(target);
  }
}

// ─── New Inventory Renderer ────────────────────────────────────────────────
// Renders TWO things:
//   1) the always-visible hotbar (#invQuickRow) — 4 quick-access slots, and
//   2) the full 12x4 backpack grid (#inventoryGrid, all owned non-hand items).
export function renderGrowtopiaInventory() {
  const quickRow = document.getElementById('invQuickRow');
  const grid = document.getElementById('inventoryGrid');
  if (!grid) return;

  // ── 1) Hotbar (always visible) ──
  if (quickRow) {
    quickRow.innerHTML = '';
    for (let i = 0; i < inventoryState.quickSlots.length; i++) {
      const key = inventoryState.quickSlots[i] || null;
      const slot = buildSlot(key, {
        selected: i === inventoryState.selectedIndex,
        showQty: !!key && key !== 'hand'
      });
      slot.classList.add('inv-quick-slot');
      if (key) slot.addEventListener('click', () => setSelectedSlot(i));
      quickRow.appendChild(slot);
    }
  }

  // ── 2) Full 12x4 grid (48 slots) ──
  grid.innerHTML = '';
  const owned = [];
  for (const [key, data] of inventoryState.items) {
    if (key !== 'hand' && data.quantity > 0) owned.push({ key, quantity: data.quantity });
  }
  const TOTAL_SLOTS = 48;
  const equippedSet = new Set(inventoryState.quickSlots.filter(k => k && k !== 'hand'));
  const selectedKey = getSelectedItemKey();
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const item = owned[i];
    const key = item ? item.key : null;
    const slot = buildSlot(key, {
      selected: !!key && key === selectedKey,
      equipped: !!key && equippedSet.has(key),
      showQty: !!item && item.quantity > 1
    });
    slot.classList.add('inv-slot');
    slot.dataset.itemKey = key || '';
    if (key && key !== 'hand') slot.addEventListener('click', () => equipToQuickSlot(key));
    grid.appendChild(slot);
  }
}

// Search filter
// Side panel buttons
function setupSideButtons() {
  const btns = {
    btnRecycle: () => alert('Recycle feature coming soon!'),
    btnStore: () => alert('Store feature coming soon!'),
    btnDrop: () => {
      const selected = inventoryState.quickSlots[inventoryState.selectedIndex];
      if (selected && selected !== 'hand') {
        // Simple drop: remove 1 from inventory
        const qty = getItemQuantity(selected);
        if (qty > 0) {
          // We can simulate a drop by removing from inventory
          const item = inventoryState.items.get(selected);
          if (item) {
            item.quantity--;
            if (item.quantity <= 0) inventoryState.items.delete(selected);
          }
          renderGrowtopiaInventory();
          oldRenderInventory();
        }
      }
    },
    btnInfo: () => alert('Item info coming soon!'),
    btnFav: () => alert('Favorites coming soon!')
  };

  Object.keys(btns).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = btns[id];
  });
}

// ─── Chat Window (Roblox Style - Top-Left Fixed) ──────────────────────────
export function makeChatDraggable() {
  if (!chatUI) return;
  // Dock top-left like Roblox chat, fixed in place, beautiful semi-transparent box
  chatUI.style.position = 'fixed';
  chatUI.style.left = '16px';
  chatUI.style.top = '16px';
  chatUI.style.bottom = 'auto';
  chatUI.style.right = 'auto';
  chatUI.style.transform = 'none';
  chatUI.style.zIndex = '150';
  chatUI.style.width = 'min(350px, calc(100vw - 32px))';

  // Dedicated clean title bar / header (Roblox style)
  const header = document.createElement('div');
  header.id = 'chatDragHandle';
  header.style.cssText = `
    background: linear-gradient(180deg, #2c4c64, #1b3244);
    padding: 8px 14px; font-size: 13px; font-weight: 800; color: #7ed957;
    text-align: left; border: 2px solid rgba(126, 212, 232, 0.45); border-bottom: none;
    border-radius: 10px 10px 0 0; pointer-events: auto; user-select: none;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35); text-shadow: 1px 1px 0 rgba(0,0,0,0.6);
  `;
  header.innerHTML = `<span>💬 CHAT</span><span style="font-size:11px; opacity:0.75; font-weight:600; color:#c2e4f2;">Top-Left Fixed</span>`;
  chatUI.insertBefore(header, chatUI.firstChild);

  // Clicking header toggles chat collapsed/open state neatly
  header.addEventListener('click', () => {
    chatUI.classList.toggle('collapsed');
  });
}

// ─── Main Initialization ─────────────────────────────────────────────────
export function initGrowtopiaUI() {
  // Wire the floating inventory window. It intentionally stays hidden
  // (display:none in index.html) until the player joins — revealing it over
  // the login screen would sit on top of the Join button and block input.
  // main.js shows it inside joinMultiplayerGame() once the player is in-game.
  if (inventoryWindow) {
    inventoryWindow.style.bottom = '30px';
    inventoryWindow.style.left = '50%';
    inventoryWindow.style.transform = 'translateX(-50%)';
    // Start collapsed: only the always-visible dragger + 4 quick slots show,
    // exactly like Growtopia's bottom item bar. Click the dragger to expand.
    inventoryWindow.classList.add('collapsed');

    // The top dragger is always visible. Dragging it moves the whole window
    // vertically (bounded); a plain click on it toggles the inventory
    // open/collapsed (the dragger and the 4 quick slots always remain visible).
    if (inventoryHeader) {
      makeDraggable(inventoryWindow, inventoryHeader, {
        axis: 'y',
        anchor: 'bottom',
        onTap: () => inventoryWindow.classList.toggle('collapsed')
      });
    }
  }

  // Render initial inventory grid
  renderGrowtopiaInventory();

  // Setup side buttons
  setupSideButtons();

  // Make chat draggable
  makeChatDraggable();

  // Hide the old inventory toggle and bar (we replaced them)
  const oldGroup = document.getElementById('inventoryUIGroup');
  if (oldGroup) oldGroup.style.display = 'none';

  // Also hide the old touch controls if you want cleaner screen (optional)
  // document.getElementById('touchControls').style.display = 'none';
}

// Expose the floating-window renderer on window so inventory.js can delegate
// to it from renderInventory(). Set at module-eval time (not just inside
// initGrowtopiaUI) so the delegate is available regardless of boot order.
if (typeof window !== 'undefined') {
  window.renderGrowtopiaInventory = renderGrowtopiaInventory;
}

// Export helper so main can refresh the grid when inventory changes
// (already exported above as named export)