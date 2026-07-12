// ─── Growtopia-style Draggable Floating UI ─────────────────────────────────
// Replaces the old hamburger inventory with a floating, draggable window.
// Includes: Search bar, grid, side buttons, chat draggable window.

import { GameConfig } from './config.js';
import {
  inventoryWindow, inventoryHeader, inventoryGrid, inventorySearch,
  chatUI
} from './dom.js';
import {
  inventoryState,
  getItemQuantity,
  addInventoryItem,
  setSelectedSlot,
  renderInventory as oldRenderInventory
} from './inventory.js';
import { playerState } from './player.js';

// ─── Draggable Window Logic ───────────────────────────────────────────────
// Drags `element` by its `handle`.
//   axis:  'both' (default) or 'y' (vertical-only).
//   onTap: fired on pointerup when the pointer barely moved (a click, not a
//          drag) — used to toggle the inventory open/collapsed.
function makeDraggable(element, handle, { axis = 'both', onTap } = {}) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  let startX = 0, startY = 0, moved = 0;

  const startDrag = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    isDragging = true;
    moved = 0;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    startX = e.clientX; startY = e.clientY;
    if (axis === 'y') element.style.bottom = 'auto'; // switch to top-anchored
    element.style.transition = 'none';
    document.body.style.userSelect = 'none';
  };

  const doDrag = (e) => {
    if (!isDragging) return;
    moved = Math.max(moved, Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY));
    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;

    if (axis === 'y') {
      // Vertical only — keep the window horizontally centered.
      const top = Math.max(0, newTop);
      element.style.left = '50%';
      element.style.transform = 'translateX(-50%)';
      element.style.top = top + 'px';
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

// Build a small item icon element (mirrors the look used across the UI).
function makeIcon(itemKey) {
  const def = GameConfig.items[itemKey];
  const icon = document.createElement('div');
  if (!def) return icon;
  if (def.type === 'block') {
    const blockDef = GameConfig.blocksByTile[def.blockId];
    icon.style.width = '30px';
    icon.style.height = '30px';
    icon.style.background = blockDef?.color || '#9b6b3d';
    icon.style.border = `2px solid ${blockDef?.border || '#7a522d'}`;
    icon.style.borderRadius = '4px';
  } else if (def.type === 'seed') {
    const seedDef = GameConfig.seeds[def.seedType];
    icon.style.width = '26px';
    icon.style.height = '26px';
    icon.style.background = seedDef?.bloomColor || '#7ac943';
    icon.style.borderRadius = '50%';
    icon.style.border = '2px solid #4d8f24';
  } else {
    icon.textContent = '✊';
    icon.style.fontSize = '22px';
  }
  return icon;
}

// ─── New Inventory Renderer ────────────────────────────────────────────────
// Renders TWO things:
//   1) the always-visible 4-slot quick-access row (#invQuickRow), and
//   2) the full backpack grid (#inventoryGrid, all owned items incl. hand).
export function renderGrowtopiaInventory() {
  const quickRow = document.getElementById('invQuickRow');
  const grid = document.getElementById('inventoryGrid');
  if (!grid) return;

  // ── 1) Quick-access row (always visible) ──
  if (quickRow) {
    quickRow.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const key = inventoryState.quickSlots[i] || null;
      const slot = document.createElement('div');
      slot.className = 'inv-quick-slot' + (i === inventoryState.selectedIndex ? ' selected' : '');
      slot.dataset.slotIndex = String(i);
      if (key) {
        slot.appendChild(makeIcon(key));
        if (key !== 'hand') {
          const qty = document.createElement('div');
          qty.className = 'qty';
          qty.textContent = String(getItemQuantity(key));
          slot.appendChild(qty);
        }
      } else {
        slot.innerHTML = '<div class="itemIconEmpty">□</div>';
      }
      slot.addEventListener('click', () => setSelectedSlot(i));
      quickRow.appendChild(slot);
    }
  }

  // ── 2) Full grid (all owned items, incl. hand) ──
  grid.innerHTML = '';

  const allItems = new Map();
  inventoryState.quickSlots.forEach(key => {
    if (key && key !== 'hand' && getItemQuantity(key) > 0) allItems.set(key, getItemQuantity(key));
  });
  inventoryState.panelSlots.forEach(key => {
    if (key && getItemQuantity(key) > 0 && !allItems.has(key)) allItems.set(key, getItemQuantity(key));
  });
  for (const [key, data] of inventoryState.items) {
    if (key !== 'hand' && data.quantity > 0 && !allItems.has(key)) allItems.set(key, data.quantity);
  }
  // Always show the Punch (hand/fist) in the grid.
  if (getItemQuantity('hand') > 0) allItems.set('hand', getItemQuantity('hand'));

  const keys = Array.from(allItems.keys());
  keys.forEach(itemKey => {
    const def = GameConfig.items[itemKey];
    if (!def) return;

    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.itemKey = itemKey;
    slot.appendChild(makeIcon(itemKey));

    const qty = document.createElement('div');
    qty.className = 'qty';
    qty.textContent = allItems.get(itemKey);
    slot.appendChild(qty);

    slot.addEventListener('click', () => {
      // The hand (fist) is the default slot — selecting it just points at slot 0.
      if (itemKey === 'hand') {
        inventoryState.selectedIndex = 0;
        renderGrowtopiaInventory();
        oldRenderInventory();
        return;
      }
      // Equip to first available quick slot.
      let target = inventoryState.quickSlots.findIndex((s, i) => i > 0 && s === null);
      if (target === -1) target = 1;
      inventoryState.quickSlots[target] = itemKey;
      inventoryState.selectedIndex = target;
      renderGrowtopiaInventory();
      oldRenderInventory();
    });

    inventoryGrid.appendChild(slot);
  });
}

// Search filter
function setupSearch() {
  if (!inventorySearch) return;

  inventorySearch.addEventListener('input', () => {
    const term = inventorySearch.value.toLowerCase().trim();
    const slots = inventoryGrid.querySelectorAll('.inv-slot');

    slots.forEach(slot => {
      const key = slot.dataset.itemKey;
      const def = GameConfig.items[key];
      const name = (def?.name || key).toLowerCase();
      slot.style.display = name.includes(term) ? '' : 'none';
    });
  });
}

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

// ─── Chat Draggable Window ───────────────────────────────────────────────
export function makeChatDraggable() {
  if (!chatUI) return;
  chatUI.style.position = 'absolute';
  chatUI.style.top = '60px';
  chatUI.style.left = '50%';
  chatUI.style.transform = 'translateX(-50%)';
  chatUI.style.zIndex = '250';

  // Add a dedicated drag handle at the top of the chat window.
  const header = document.createElement('div');
  header.style.cssText = `
    background:#1a2b3c; padding:4px 12px; font-size:12px; color:#7ed957;
    cursor:move; text-align:center; border-bottom:2px solid #4aa3ff;
    pointer-events:auto;
  `;
  header.textContent = 'Chat (drag to move)';
  chatUI.insertBefore(header, chatUI.firstChild);

  makeDraggable(chatUI, header);
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

    // The top dragger is always visible. Dragging it moves the whole window;
    // a plain click on it toggles the inventory open/collapsed (the dragger
    // and the 4 quick slots always remain visible).
    if (inventoryHeader) {
      makeDraggable(inventoryWindow, inventoryHeader, {
        axis: 'both',
        onTap: () => inventoryWindow.classList.toggle('collapsed')
      });
    }
  }

  // Render initial inventory grid
  renderGrowtopiaInventory();

  // Setup search + side buttons
  setupSearch();
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