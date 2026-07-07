import { BLOCK_IDS, HOTBAR, STARTER_INVENTORY } from "../config.js";

// InventorySystem stores item IDs and quantities. The UI reads from it, while
// world interactions add/remove items through its public methods.
export class InventorySystem {
  constructor() {
    this.selectedIndex = 0;
    this.version = 0;
    this.slots = Array.from({ length: HOTBAR.size }, () => ({
      blockId: BLOCK_IDS.AIR,
      quantity: 0
    }));

    this.seedStarterInventory();
  }

  seedStarterInventory() {
    STARTER_INVENTORY.forEach((item, index) => {
      if (index < this.slots.length) {
        this.slots[index] = {
          blockId: item.blockId,
          quantity: item.quantity
        };
      }
    });

    this.version++;
  }

  selectSlot(index) {
    if (index < 0 || index >= this.slots.length) return false;
    this.selectedIndex = index;
    this.version++;
    return true;
  }

  getSelectedSlot() {
    return this.slots[this.selectedIndex];
  }

  getSelectedBlockId() {
    return this.getSelectedSlot()?.blockId ?? BLOCK_IDS.AIR;
  }

  canPlaceSelectedBlock() {
    const slot = this.getSelectedSlot();
    return Boolean(slot && slot.blockId !== BLOCK_IDS.AIR && slot.quantity > 0);
  }

  removeSelectedBlock(quantity = 1) {
    const slot = this.getSelectedSlot();
    if (!slot || slot.blockId === BLOCK_IDS.AIR || slot.quantity < quantity) {
      return false;
    }

    slot.quantity -= quantity;
    this.version++;
    return true;
  }

  addItem(blockId, quantity = 1) {
    if (blockId === BLOCK_IDS.AIR || quantity <= 0) return 0;

    // Prefer existing stacks of the same block type.
    let slot = this.slots.find((candidate) => candidate.blockId === blockId);

    // Otherwise use the first empty slot.
    if (!slot) {
      slot = this.slots.find((candidate) => candidate.blockId === BLOCK_IDS.AIR || candidate.quantity === 0);
      if (slot) slot.blockId = blockId;
    }

    if (!slot) return 0;

    slot.quantity += quantity;
    this.version++;
    return quantity;
  }
}
