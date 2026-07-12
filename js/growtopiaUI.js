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
//   axis:  'both' (default) or 'y' (vertical-only — the inventory window
//          stays horizontally centered at left:50% / translateX(-50%)).
//   onClose: optional callback fired after the window slides off-screen.
function makeDraggable(element, handle, { axis = 'both', onClose } = {}) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  const startDrag = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    if (axis === 'y') element.style.bottom = 'auto'; // switch to top-anchored
    element.style.transition = 'none';
    document.body.style.userSelect = 'none';
  };

  const doDrag = (e) => {
    if (!isDragging || element._closing) return;
    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;

    if (axis === 'y') {
      // Vertical only — keep the window horizontally centered. No upper clamp
      // so it can be dragged down past the viewport and closed.
      const top = Math.max(0, newTop);
      element.style.left = '50%';
      element.style.transform = 'translateX(-50%)';
      element.style.top = top + 'px';
      // Dragged below the bottom edge → slide off-screen and close.
      if (top + element.offsetHeight > window.innerHeight) closeInventoryWindow(element, onClose);
    } else {
      const maxLeft = window.innerWidth - element.offsetWidth;
      const maxTop = window.innerHeight - element.offsetHeight;
      element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
      element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      element.style.transform = 'none';
    }
  };

  const endDrag = () => {
    isDragging = false;
    element.style.transition = '';
    document.body.style.userSelect = '';
  };

  handle.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', doDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

// Slide the floating inventory window down off-screen and hide it (close).
function closeInventoryWindow(element, onClose) {
  if (element._closing) return;
  element._closing = true;
  element.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
  element.style.transform = 'translate(-50%, 110%)';
  element.style.opacity = '0';
  setTimeout(() => {
    element.style.display = 'none';
    element._closing = false;
    element.style.transition = '';
    element.style.opacity = '';
    if (typeof onClose === 'function') onClose();
  }, 260);
}

// ─── New Inventory Grid Renderer ─────────────────────────────────────────
export function renderGrowtopiaInventory() {
  if (!inventoryGrid) return;

  inventoryGrid.innerHTML = '';

  // Combine quickSlots + panel items
  const allItems = new Map();

  // Add items from quick slots
  inventoryState.quickSlots.forEach(key => {
    if (key && key !== 'hand' && getItemQuantity(key) > 0) {
      allItems.set(key, getItemQuantity(key));
    }
  });

  // Add items from panel
  inventoryState.panelSlots.forEach(key => {
    if (key && getItemQuantity(key) > 0 && !allItems.has(key)) {
      allItems.set(key, getItemQuantity(key));
    }
  });

  // Also show all owned items
  for (const [key, data] of inventoryState.items) {
    if (key !== 'hand' && data.quantity > 0 && !allItems.has(key)) {
      allItems.set(key, data.quantity);
    }
  }

  // Always show the Punch (hand/fist) in the grid, even though it's the
  // default quick-slot item.
  if (getItemQuantity('hand') > 0) allItems.set('hand', getItemQuantity('hand'));

  const keys = Array.from(allItems.keys());

  keys.forEach(itemKey => {
    const def = GameConfig.items[itemKey];
    if (!def) return;

    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.itemKey = itemKey;

    // Icon
    const icon = document.createElement('div');
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
    slot.appendChild(icon);

    // Quantity
    const qty = document.createElement('div');
    qty.className = 'qty';
    qty.textContent = allItems.get(itemKey);
    slot.appendChild(qty);

    // Click to select / move to quickslot
    slot.addEventListener('click', () => {
      // The hand (fist) is the default slot — selecting it just points at
      // slot 0 rather than trying to equip it into another quick slot.
      if (itemKey === 'hand') {
        inventoryState.selectedIndex = 0;
        renderGrowtopiaInventory();
        oldRenderInventory(); // keep old bar in sync if needed
        return;
      }
      // Try to equip to first available quick slot
      let target = inventoryState.quickSlots.findIndex((s, i) => i > 0 && s === null);
      if (target === -1) target = 1;

      inventoryState.quickSlots[target] = itemKey;
      inventoryState.selectedIndex = target;
      renderGrowtopiaInventory();
      oldRenderInventory(); // keep old bar in sync if needed
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

    // Make inventory draggable via header (vertical-only, stays centered).
    if (inventoryHeader) {
      makeDraggable(inventoryWindow, inventoryHeader, { axis: 'y' });
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