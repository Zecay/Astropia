// ─── Inventory: state + UI ──────────────────────────────────────────────────
// Owns "how many items do I have" (inventoryState) as well as rendering the
// HTML quick-slot bar / panel and all drag-and-drop wiring. Other modules
// (world.js, seeds.js) call addInventoryItem/consumeInventoryItem instead of
// touching inventoryState directly. Item defs and slot counts come from
// GameConfig (config.json).

import { GameConfig } from './config.js';
import { inventoryBar, inventoryPanelContents } from './dom.js';

export const inventoryState = {
  quickSlots: ['hand', null, null, null],
  selectedIndex: 0,
  items: new Map([['hand', { key: 'hand', quantity: 1 }]]),
  panelOpen: false,
  panelSlots: [],
  dragItemKey: null,
  dragSourceSlot: null,
  dragSourceType: null,
  safeRightInset: 0,
  isDraggingHand: false,
  dragUiPointerId: null,
  dragUiStartY: 0,
  dragUiStartOpenAmount: 0,
  panelOpenAmount: 0,
  movedUiDuringDrag: false
};

function panelSlotCount() { return GameConfig.inventory.panelSlots; }
function quickSlotCount() { return GameConfig.inventory.quickSlotCount; }

export function resetInventory() {
  inventoryState.quickSlots = ['hand', ...new Array(quickSlotCount() - 1).fill(null)];
  inventoryState.selectedIndex = 0;
  inventoryState.items = new Map([['hand', { key: 'hand', quantity: 1 }]]);
  inventoryState.panelSlots = new Array(panelSlotCount()).fill(null);
  inventoryState.panelOpen = false;
  inventoryState.panelOpenAmount = 0;
}

// ─── Selectors ──────────────────────────────────────────────────────────────
export function getSelectedItemKey() { return inventoryState.quickSlots[inventoryState.selectedIndex] || 'hand'; }
export function getSelectedItemDef() { return GameConfig.items[getSelectedItemKey()] || GameConfig.items.hand; }
export function getItemQuantity(itemKey) { return inventoryState.items.get(itemKey)?.quantity || 0; }

// ─── Inventory management ───────────────────────────────────────────────────
function ensureItemSlot(itemKey) {
  if (itemKey === 'hand') return;
  if (inventoryState.quickSlots.includes(itemKey)) return;
  if (inventoryState.panelSlots.includes(itemKey)) return;
  const emptyQuick = inventoryState.quickSlots.findIndex((s, i) => i !== 0 && s === null);
  if (emptyQuick !== -1) { inventoryState.quickSlots[emptyQuick] = itemKey; return; }
  const emptyPanel = inventoryState.panelSlots.findIndex(s => s === null);
  if (emptyPanel !== -1) inventoryState.panelSlots[emptyPanel] = itemKey;
}

function compactInventorySlots() {
  inventoryState.quickSlots[0] = 'hand';
  for (let i = 1; i < inventoryState.quickSlots.length; i++) {
    const k = inventoryState.quickSlots[i];
    if (k && getItemQuantity(k) <= 0) inventoryState.quickSlots[i] = null;
  }
  for (let i = 0; i < panelSlotCount(); i++) {
    const k = inventoryState.panelSlots[i];
    if (k && getItemQuantity(k) <= 0) inventoryState.panelSlots[i] = null;
  }
}

export function addInventoryItem(itemKey, quantity = 1) {
  if (!GameConfig.items[itemKey] || quantity <= 0) return;
  const cur = inventoryState.items.get(itemKey);
  if (cur) cur.quantity += quantity;
  else inventoryState.items.set(itemKey, { key: itemKey, quantity });
  ensureItemSlot(itemKey);
  renderInventory();
}

export function consumeInventoryItem(itemKey, quantity = 1) {
  if (itemKey === 'hand') return false;
  const cur = inventoryState.items.get(itemKey);
  if (!cur || cur.quantity < quantity) return false;
  cur.quantity -= quantity;
  if (cur.quantity <= 0) inventoryState.items.delete(itemKey);
  compactInventorySlots();
  if (!inventoryState.quickSlots[inventoryState.selectedIndex]) inventoryState.selectedIndex = 0;
  renderInventory();
  return true;
}

export function setSelectedSlot(index) {
  if (index < 0 || index >= inventoryState.quickSlots.length) return;
  if (inventoryState.quickSlots[index] === null) return;
  inventoryState.selectedIndex = index;
  renderInventory();
}

// ─── UI rendering ───────────────────────────────────────────────────────────
function createItemIcon(itemKey) {
  const def = itemKey ? GameConfig.items[itemKey] : null;
  const d = document.createElement('div');
  d.className = 'itemIcon';
  if (itemKey === 'hand') {
    d.textContent = '✊';
    d.classList.add('itemIcon-hand');
  } else if (def && def.type === 'block') {
    const blockDef = GameConfig.blocksByTile[def.blockId];
    d.classList.add('itemIcon-block');
    d.style.background = blockDef?.color || '#9b6b3d';
    d.style.borderColor = blockDef?.border || '#7a522d';
  } else if (def && def.type === 'seed') {
    const seedDef = GameConfig.seeds[def.seedType];
    d.classList.add('itemIcon-seed');
    d.style.background = seedDef?.bloomColor || '#7ac943';
  }
  return d;
}

function getInventoryPanelItems() {
  return Array.from(inventoryState.items.values()).filter(i => i.key !== 'hand' && i.quantity > 0);
}

export function renderInventory() {
  inventoryState.quickSlots[0] = 'hand';
  inventoryBar.innerHTML = '';
  inventoryState.quickSlots.forEach((itemKey, index) => {
    const slot = document.createElement('button');
    slot.className = 'inventorySlot' + (index === inventoryState.selectedIndex ? ' selected' : '');
    slot.type = 'button';
    slot.dataset.slotIndex = String(index);
    slot.title = itemKey ? (GameConfig.items[itemKey]?.name || itemKey) : 'Empty';
    if (itemKey) slot.appendChild(createItemIcon(itemKey));
    if (itemKey && itemKey !== 'hand') {
      const qty = document.createElement('div');
      qty.className = 'inventoryQty';
      qty.textContent = String(getItemQuantity(itemKey));
      slot.appendChild(qty);
    }
    slot.addEventListener('click', () => setSelectedSlot(index));
    if (itemKey && index !== 0) {
      slot.draggable = true;
      slot.addEventListener('dragstart', (e) => { inventoryState.dragItemKey = itemKey; inventoryState.dragSourceSlot = index; inventoryState.dragSourceType = 'quick'; slot.classList.add('dragging'); e.dataTransfer.setData('text/plain', itemKey); });
      slot.addEventListener('dragend', () => { inventoryState.dragItemKey = null; inventoryState.dragSourceSlot = null; inventoryState.dragSourceType = null; slot.classList.remove('dragging'); });
    }
    slot.addEventListener('dragover', (e) => { if (index === 0) return; e.preventDefault(); slot.classList.add('dragOver'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('dragOver'));
    slot.addEventListener('drop', (e) => { if (index === 0) return; e.preventDefault(); slot.classList.remove('dragOver'); handleQuickSlotDrop(index); });
    inventoryBar.appendChild(slot);
  });

  inventoryPanelContents.innerHTML = '';
  const panelItems = getInventoryPanelItems();
  for (let i = 0; i < panelSlotCount(); i++) {
    const itemKey = panelItems[i]?.key || null;
    const entry = document.createElement('div');
    entry.className = 'inventoryPanelItem' + (itemKey && inventoryState.quickSlots[inventoryState.selectedIndex] === itemKey ? ' selected' : '');
    if (itemKey) {
      entry.draggable = true;
      entry.appendChild(createItemIcon(itemKey));
      const qty = document.createElement('div'); qty.className = 'inventoryQty'; qty.textContent = String(getItemQuantity(itemKey)); entry.appendChild(qty);
      entry.addEventListener('dragstart', (e) => { inventoryState.dragItemKey = itemKey; inventoryState.dragSourceSlot = i; inventoryState.dragSourceType = 'panel'; entry.classList.add('dragging'); e.dataTransfer.setData('text/plain', itemKey); });
      entry.addEventListener('dragend', () => { inventoryState.dragItemKey = null; inventoryState.dragSourceSlot = null; inventoryState.dragSourceType = null; entry.classList.remove('dragging'); });
      entry.addEventListener('dblclick', () => equipItemToSelectedQuickSlot(itemKey, i));

      // Inventory Shortcut: click moves item to available quick-slot and selects it immediately
      entry.addEventListener('click', (e) => {
        if (e.detail > 1) return;
        if (!itemKey || itemKey === 'hand') return;
        let targetIndex = -1;
        for (let q = 1; q < inventoryState.quickSlots.length; q++) {
          if (!inventoryState.quickSlots[q]) { targetIndex = q; break; }
        }
        if (targetIndex === -1) targetIndex = inventoryState.selectedIndex === 0 ? 1 : inventoryState.selectedIndex;
        if (targetIndex > 0 && targetIndex < inventoryState.quickSlots.length) {
          const prev = inventoryState.quickSlots[targetIndex];
          inventoryState.quickSlots[targetIndex] = itemKey;
          if (typeof i === 'number' && i >= 0 && i < panelSlotCount()) {
            inventoryState.panelSlots[i] = (prev && prev !== 'hand') ? prev : null;
          }
          inventoryState.quickSlots[0] = 'hand';
          inventoryState.selectedIndex = targetIndex;
          renderInventory();
        }
      });
    } else {
      entry.innerHTML = '<div class="itemIconEmpty">□</div>';
    }
    entry.addEventListener('dragover', (e) => { e.preventDefault(); entry.classList.add('dragOver'); });
    entry.addEventListener('dragleave', () => entry.classList.remove('dragOver'));
    entry.addEventListener('drop', (e) => { e.preventDefault(); entry.classList.remove('dragOver'); handlePanelSlotDrop(i); });
    inventoryPanelContents.appendChild(entry);
  }
}

function handleQuickSlotDrop(targetIndex) {
  const itemKey = inventoryState.dragItemKey;
  if (!itemKey || targetIndex === 0 || itemKey === 'hand') return;
  const targetItem = inventoryState.quickSlots[targetIndex];
  const sourceSlot = inventoryState.dragSourceSlot;
  const sourceType = inventoryState.dragSourceType;
  if (sourceType === 'quick' && sourceSlot !== null) {
    if (sourceSlot === 0) return;
    inventoryState.quickSlots[targetIndex] = itemKey;
    inventoryState.quickSlots[sourceSlot] = targetItem;
  } else if (sourceType === 'panel' && sourceSlot !== null) {
    inventoryState.quickSlots[targetIndex] = itemKey;
    inventoryState.panelSlots[sourceSlot] = targetItem === 'hand' ? null : targetItem;
  }
  inventoryState.quickSlots[0] = 'hand';
  if (!inventoryState.quickSlots[inventoryState.selectedIndex]) inventoryState.selectedIndex = 0;
  renderInventory();
}

function equipItemToSelectedQuickSlot(itemKey, panelIndex) {
  if (!itemKey || itemKey === 'hand') return;
  let targetIndex = inventoryState.selectedIndex === 0 ? 1 : inventoryState.selectedIndex;
  if (targetIndex <= 0 || targetIndex >= quickSlotCount()) return;
  const prev = inventoryState.quickSlots[targetIndex];
  inventoryState.quickSlots[targetIndex] = itemKey;
  if (typeof panelIndex === 'number' && panelIndex >= 0 && panelIndex < panelSlotCount())
    inventoryState.panelSlots[panelIndex] = prev && prev !== 'hand' ? prev : null;
  inventoryState.quickSlots[0] = 'hand';
  renderInventory();
}

function handlePanelSlotDrop(targetIndex) {
  const panelItems = getInventoryPanelItems();
  const itemKey = inventoryState.dragItemKey;
  if (!itemKey || itemKey === 'hand') return;
  const sourceSlot = inventoryState.dragSourceSlot;
  const sourceType = inventoryState.dragSourceType;
  if (sourceType === 'quick' && sourceSlot !== null) {
    if (sourceSlot === 0) return;
    inventoryState.quickSlots[sourceSlot] = panelItems[targetIndex]?.key || null;
  }
  inventoryState.quickSlots[0] = 'hand';
  renderInventory();
}

// ─── Inventory panel open/close (hamburger drag) ───────────────────────────
import { inventoryUIGroup, inventoryPanel, inventoryToggle } from './dom.js';
import { clamp } from './utils.js';

export function applyInventoryLayout() {
  inventoryState.quickSlots[0] = 'hand';
  const openAmount = clamp(inventoryState.panelOpenAmount, 0, 1);
  inventoryState.panelOpen = openAmount >= 0.98;
  inventoryUIGroup.classList.toggle('open', openAmount > 0);
  inventoryPanel.classList.toggle('open', openAmount > 0.02);
  inventoryToggle.style.visibility = 'visible';
  inventoryToggle.style.opacity    = '1';
  // Bottom-center positioning (UI re-layout)
  inventoryUIGroup.style.left = '50%';
  inventoryUIGroup.style.right = 'auto';
  inventoryUIGroup.style.transform = `translateX(-50%)`;
  inventoryPanel.style.transform = `translateY(${(-12 * (1 - openAmount)).toFixed(2)}px) scaleY(${openAmount.toFixed(3)})`;
  inventoryPanel.style.opacity    = openAmount.toFixed(3);
}

export function setInventoryPanelOpen(open) {
  inventoryState.panelOpen = !!open;
  inventoryState.panelOpenAmount = open ? 1 : 0;
  applyInventoryLayout();
}

export function toggleInventoryPanel() { setInventoryPanelOpen(!inventoryState.panelOpen); }

export function setupInventoryPanel() {
  inventoryToggle.addEventListener('click', (e) => {
    if (inventoryState.movedUiDuringDrag) { inventoryState.movedUiDuringDrag = false; return; }
    e.preventDefault();
    toggleInventoryPanel();
  });

  inventoryToggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    inventoryState.dragUiPointerId = e.pointerId;
    inventoryState.dragUiStartY = e.clientY;
    inventoryState.dragUiStartOpenAmount = inventoryState.panelOpenAmount;
    inventoryState.movedUiDuringDrag = false;
    inventoryToggle.setPointerCapture(e.pointerId);
  });

  inventoryToggle.addEventListener('pointermove', (e) => {
    if (inventoryState.dragUiPointerId !== e.pointerId) return;
    e.preventDefault();
    const deltaY = inventoryState.dragUiStartY - e.clientY;
    if (Math.abs(deltaY) > 4) inventoryState.movedUiDuringDrag = true;
    inventoryState.panelOpenAmount = clamp(inventoryState.dragUiStartOpenAmount + (deltaY / 140), 0, 1);
    applyInventoryLayout();
  });

  const endDrag = (e) => {
    if (inventoryState.dragUiPointerId !== e.pointerId) return;
    inventoryState.dragUiPointerId = null;
    inventoryState.panelOpenAmount = inventoryState.panelOpenAmount >= 0.5 ? 1 : 0;
    inventoryState.panelOpen = inventoryState.panelOpenAmount >= 1;
    applyInventoryLayout();
    try { inventoryToggle.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  inventoryToggle.addEventListener('pointerup',    endDrag);
  inventoryToggle.addEventListener('pointercancel', endDrag);
  setInventoryPanelOpen(false);
}
