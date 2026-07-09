/**
 * Astropia – PlayerInventory
 * https://github.com/Zecay/Astropia
 *
 * Manages the player's 40-slot inventory, 10-slot hotbar,
 * fist/wrench toggle, and gem counter.
 *
 * Slot 0 is permanently the Fist/Wrench.
 * Emits `inventoryChanged` on the registry events after every mutation.
 */

class PlayerInventory {
  /**
   * @param {object} config   - The full config object from registry
   * @param {object} registry - The Phaser registry (for events)
   */
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
    this.totalSlots = config.inventory.totalSlots || 40;
    this.hotbarSlots = config.inventory.hotbarSlots || 10;

    /* ─── Slots ─── */
    this.slots = new Array(this.totalSlots).fill(null); // { itemId, count } | null
    this.selectedSlot = 0;
    this.fistMode = 'fist'; // 'fist' | 'wrench'

    /* ─── Gems ─── */
    this.gems = 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     ADD / REMOVE
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Add item(s) to inventory. Stacks with existing stacks, fills empty slots.
   * Never puts anything in slot 0.
   * @param {number} itemId
   * @param {number} count
   * @returns {number} Unadded count (0 if all items fit).
   */
  addItem(itemId, count) {
    if (count <= 0) return 0;
    const itemDef = this.config.items[String(itemId)];
    if (!itemDef) return count;

    const maxStack = itemDef.maxStack || 200;
    let remaining = count;

    /* First: try to stack with existing slots (skip slot 0) */
    for (let i = 0; i < this.totalSlots; i++) {
      if (i === 0) continue;
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId && slot.count < maxStack) {
        const space = maxStack - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        if (remaining === 0) break;
      }
    }

    /* Then: fill empty slots (skip slot 0) */
    if (remaining > 0) {
      for (let i = 0; i < this.totalSlots; i++) {
        if (i === 0) continue;
        if (!this.slots[i]) {
          const add = Math.min(maxStack, remaining);
          this.slots[i] = { itemId, count: add };
          remaining -= add;
          if (remaining === 0) break;
        }
      }
    }

    this._emitChange();
    return remaining;
  }

  /**
   * Remove count items from a specific slot.
   * @param {number} slotIdx
   * @param {number} count
   * @returns {boolean} True if removal succeeded.
   */
  removeItem(slotIdx, count) {
    if (slotIdx < 0 || slotIdx >= this.totalSlots) return false;
    if (slotIdx === 0) return false; // can't remove fist/wrench
    const slot = this.slots[slotIdx];
    if (!slot || slot.count < count) return false;

    slot.count -= count;
    if (slot.count <= 0) {
      this.slots[slotIdx] = null;
      /* If we emptied the selected slot, switch to fist */
      if (slotIdx === this.selectedSlot) {
        this.setSelectedSlot(0);
      }
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

  /**
   * Count total items of a given itemId across all slots.
   */
  countItem(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  /**
   * Get slot contents (or null).
   */
  getSlot(i) {
    if (i < 0 || i >= this.totalSlots) return null;
    return this.slots[i] ? { ...this.slots[i] } : null;
  }

  /**
   * Set the selected hotbar slot.
   */
  setSelectedSlot(i) {
    const clamped = Math.max(0, Math.min(this.hotbarSlots - 1, i));
    if (this.selectedSlot !== clamped) {
      this.selectedSlot = clamped;
      this._emitChange();
    }
  }

  /**
   * Cycle selected slot by direction (+1 or -1), wrapping.
   */
  cycleSelected(dir) {
    let next = this.selectedSlot + dir;
    if (next >= this.hotbarSlots) next = 0;
    if (next < 0) next = this.hotbarSlots - 1;
    this.setSelectedSlot(next);
  }

  getSelectedSlot() {
    return this.selectedSlot;
  }

  /**
   * Get the currently selected item definition and kind.
   * @returns {{ itemDef: object|null, kind: 'fist'|'wrench'|'block'|'seed'|'other'|null }}
   */
  getSelectedItem() {
    if (this.selectedSlot === 0) {
      return {
        itemDef: null,
        kind: this.fistMode // 'fist' or 'wrench'
      };
    }

    const slot = this.slots[this.selectedSlot];
    if (!slot) return { itemDef: null, kind: null };

    const itemDef = this.config.items[String(slot.itemId)];
    if (!itemDef) return { itemDef: null, kind: null };

    let kind;
    if (itemDef.itemType === 'block') kind = 'block';
    else if (itemDef.itemType === 'seed') kind = 'seed';
    else if (itemDef.itemType === 'currency') kind = 'other';
    else kind = 'other';

    return { itemDef, kind };
  }

  /* ═══════════════════════════════════════════════════════════════
     FIST / WRENCH
     ═══════════════════════════════════════════════════════════════ */

  toggleFistWrench() {
    /* Only works on slot 0 */
    if (this.selectedSlot !== 0) {
      this.setSelectedSlot(0);
    }
    this.fistMode = this.fistMode === 'fist' ? 'wrench' : 'fist';
    this._emitChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     STARTING ITEMS
     ═══════════════════════════════════════════════════════════════ */

  giveStartingItems(startingItemsConfig) {
    if (!startingItemsConfig) return;
    for (const entry of startingItemsConfig) {
      this.addItem(entry.itemId, entry.count);
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

  _emitChange() {
    if (this.registry && this.registry.events) {
      this.registry.events.emit('inventoryChanged', this);
    }
  }
}
