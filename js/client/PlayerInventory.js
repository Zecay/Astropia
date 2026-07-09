/**
 * Astropia – PlayerInventory
 * https://github.com/Zecay/Astropia
 *
 * Manages the player's 40-slot inventory, 4-slot quick bar,
 * fist/wrench toggle, and gem counter.
 *
 * Slot 0 is permanently the Fist/Wrench.
 * Slots 1-3 are the quick-access slots shown in the hotbar.
 * Emits `inventoryChanged` on the registry events after every mutation.
 */

class PlayerInventory {
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
    this.totalSlots = config.inventory.totalSlots || 40;
    this.hotbarSlots = config.inventory.hotbarSlots || 4;

    /* ─── Slots ─── */
    this.slots = new Array(this.totalSlots).fill(null);
    this.selectedSlot = 0;
    this.fistMode = 'fist';

    /* ─── Gems ─── */
    this.gems = 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     ADD / REMOVE
     ═══════════════════════════════════════════════════════════════ */

  addItem(itemId, count) {
    if (count <= 0) return 0;

    const itemDef = this.config.items[String(itemId)];
    if (!itemDef) return count;

    const maxStack = itemDef.maxStack || 200;
    let remaining = count;
    let existingSlots = this._findSlotsWithItem(itemId);
    const quickSlotHasItem = existingSlots.some((slotIdx) => slotIdx < this.hotbarSlots);

    /* ─── Auto-populate quick slots 1-3 if this item is not in the quick bar yet ─── */
    if (!quickSlotHasItem && remaining > 0) {
      for (let i = 1; i < this.hotbarSlots; i++) {
        if (!this.slots[i]) {
          const add = Math.min(maxStack, remaining);
          this.slots[i] = { itemId, count: add };
          remaining -= add;
          existingSlots = this._findSlotsWithItem(itemId);
          break;
        }
      }
    }

    /* ─── Then stack into any existing stacks ─── */
    for (const slotIdx of existingSlots) {
      const slot = this.slots[slotIdx];
      if (!slot || slot.count >= maxStack) continue;
      const space = maxStack - slot.count;
      const add = Math.min(space, remaining);
      slot.count += add;
      remaining -= add;
      if (remaining <= 0) {
        this._emitChange();
        return 0;
      }
    }

    /* ─── Fill any other empty inventory slots (skip slot 0) ─── */
    for (let i = 1; i < this.totalSlots && remaining > 0; i++) {
      if (this.slots[i]) continue;
      const add = Math.min(maxStack, remaining);
      this.slots[i] = { itemId, count: add };
      remaining -= add;
    }

    this._emitChange();
    return remaining;
  }

  removeItem(slotIdx, count) {
    if (slotIdx < 0 || slotIdx >= this.totalSlots) return false;
    if (slotIdx === 0) return false;

    const slot = this.slots[slotIdx];
    if (!slot || slot.count < count) return false;

    slot.count -= count;
    if (slot.count <= 0) {
      this.slots[slotIdx] = null;
    }

    this._emitChange();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     GEMS
     ═══════════════════════════════════════════════════════════════ */

  addGems(n) {
    if (n <= 0) return;
    this.gems += n;
    this._emitChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     QUERY
     ═══════════════════════════════════════════════════════════════ */

  countItem(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  getSlot(i) {
    if (i < 0 || i >= this.totalSlots) return null;
    return this.slots[i] ? { ...this.slots[i] } : null;
  }

  setSelectedSlot(i) {
    const clamped = Math.max(0, Math.min(this.totalSlots - 1, i));
    if (this.selectedSlot !== clamped) {
      this.selectedSlot = clamped;
      this._emitChange();
    }
  }

  cycleSelected(dir) {
    let base = this.selectedSlot;
    if (base >= this.hotbarSlots) base = 0;

    let next = base + dir;
    if (next >= this.hotbarSlots) next = 0;
    if (next < 0) next = this.hotbarSlots - 1;
    this.setSelectedSlot(next);
  }

  getSelectedSlot() {
    return this.selectedSlot;
  }

  getSelectedItem() {
    if (this.selectedSlot === 0) {
      return {
        itemDef: null,
        slot: null,
        kind: this.fistMode
      };
    }

    const slot = this.slots[this.selectedSlot];
    if (!slot) return { itemDef: null, slot: null, kind: null };

    const itemDef = this.config.items[String(slot.itemId)];
    if (!itemDef) return { itemDef: null, slot: { ...slot }, kind: null };

    let kind = 'other';
    if (itemDef.itemType === 'block') kind = 'block';
    else if (itemDef.itemType === 'seed') kind = 'seed';

    return {
      itemDef,
      slot: { ...slot },
      kind
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     FIST / WRENCH
     ═══════════════════════════════════════════════════════════════ */

  toggleFistWrench() {
    if (this.selectedSlot !== 0) {
      this.selectedSlot = 0;
    }
    this.fistMode = this.fistMode === 'fist' ? 'wrench' : 'fist';
    this._emitChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     STARTING ITEMS
     ═══════════════════════════════════════════════════════════════ */

  giveStartingItems(startingItemsConfig) {
    if (Array.isArray(startingItemsConfig)) {
      for (const entry of startingItemsConfig) {
        this.addItem(entry.itemId, entry.count);
      }
    }

    const startingGems = this.config.inventory.startingGems || 0;
    if (startingGems > 0) {
      this.gems = startingGems;
    }

    this._emitChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     INTERNAL
     ═══════════════════════════════════════════════════════════════ */

  _findSlotsWithItem(itemId) {
    const slots = [];
    for (let i = 1; i < this.totalSlots; i++) {
      if (this.slots[i] && this.slots[i].itemId === itemId) {
        slots.push(i);
      }
    }
    return slots;
  }

  _emitChange() {
    if (this.registry && this.registry.events) {
      this.registry.events.emit('inventoryChanged', this);
    }
  }
}
