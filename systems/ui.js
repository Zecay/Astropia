import { BLOCK_IDS, BLOCKS, DEPTH, GAME, HOTBAR } from "../config.js";

// UISystem renders the hotbar and feedback messages. The drawing code is kept
// behind methods so future menus, crafting, chat, and account screens can be
// added without mixing UI details into gameplay systems.
export class UISystem {
  constructor(scene, inventory) {
    this.scene = scene;
    this.inventory = inventory;
    this.lastInventoryVersion = -1;
    this.noticeTimer = 0;

    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui);
    this.slotIcons = [];
    this.slotTexts = [];

    for (let i = 0; i < HOTBAR.size; i++) {
      this.slotIcons.push(
        scene.add.image(0, 0, BLOCKS[BLOCK_IDS.DIRT].texture)
          .setScrollFactor(0)
          .setDepth(DEPTH.ui + 1)
          .setDisplaySize(30, 30)
      );

      this.slotTexts.push(
        scene.add.text(0, 0, "", {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "14px",
          color: "#f8fafc",
          stroke: "#020617",
          strokeThickness: 3
        })
          .setOrigin(1, 1)
          .setScrollFactor(0)
          .setDepth(DEPTH.ui + 2)
      );
    }

    this.selectedText = scene.add.text(16, 16, "", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "16px",
      color: "#dbeafe",
      stroke: "#020617",
      strokeThickness: 4
    })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 2);

    this.helpText = scene.add.text(16, 42, "WASD/Arrows: move  •  Space/W/Up: jump  •  Click: break/place  •  1-9: select", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "13px",
      color: "#93c5fd",
      stroke: "#020617",
      strokeThickness: 3
    })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 2);

    this.noticeText = scene.add.text(GAME.width / 2, GAME.height - 92, "", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "15px",
      color: "#fef3c7",
      stroke: "#020617",
      strokeThickness: 4
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 2);

    this.redrawHotbar();
  }

  handlePointerAction(action, inventory) {
    const slotIndex = this.getSlotIndexAt(action.screenX, action.screenY);

    if (slotIndex === null) return false;

    inventory.selectSlot(slotIndex);
    return true;
  }

  update(delta) {
    if (this.inventory.version !== this.lastInventoryVersion) {
      this.redrawHotbar();
      this.lastInventoryVersion = this.inventory.version;
    }

    if (this.noticeTimer > 0) {
      this.noticeTimer -= delta;
      if (this.noticeTimer <= 0) {
        this.noticeText.setText("");
      }
    }
  }

  showNotice(message) {
    if (!message) return;
    this.noticeText.setText(message);
    this.noticeTimer = 1600;
  }

  redrawHotbar() {
    const { startX, y } = this.getHotbarLayout();
    this.graphics.clear();

    for (let i = 0; i < HOTBAR.size; i++) {
      const x = startX + i * (HOTBAR.slotSize + HOTBAR.gap);
      const selected = i === this.inventory.selectedIndex;
      const slot = this.inventory.slots[i];
      const block = BLOCKS[slot.blockId];

      this.graphics.fillStyle(selected ? 0x1d4ed8 : 0x0f172a, selected ? 0.92 : 0.78);
      this.graphics.fillRoundedRect(x, y, HOTBAR.slotSize, HOTBAR.slotSize, 10);
      this.graphics.lineStyle(selected ? 3 : 1, selected ? 0x93c5fd : 0x475569, 1);
      this.graphics.strokeRoundedRect(x + 0.5, y + 0.5, HOTBAR.slotSize - 1, HOTBAR.slotSize - 1, 10);

      const icon = this.slotIcons[i];
      const quantityText = this.slotTexts[i];

      if (block?.texture && slot.quantity > 0) {
        icon.setTexture(block.texture);
        icon.setPosition(x + HOTBAR.slotSize / 2, y + HOTBAR.slotSize / 2 - 3);
        icon.setAlpha(1);
        icon.setVisible(true);
      } else if (block?.texture) {
        icon.setTexture(block.texture);
        icon.setPosition(x + HOTBAR.slotSize / 2, y + HOTBAR.slotSize / 2 - 3);
        icon.setAlpha(0.28);
        icon.setVisible(true);
      } else {
        icon.setVisible(false);
      }

      quantityText.setText(slot.quantity > 0 ? String(slot.quantity) : "");
      quantityText.setPosition(x + HOTBAR.slotSize - 6, y + HOTBAR.slotSize - 4);
    }

    const selectedSlot = this.inventory.getSelectedSlot();
    const selectedBlock = BLOCKS[selectedSlot.blockId];
    const selectedName = selectedBlock?.name ?? "Empty";
    this.selectedText.setText(`Selected: ${selectedName} x${selectedSlot.quantity}`);
  }

  getHotbarLayout() {
    const totalWidth = HOTBAR.size * HOTBAR.slotSize + (HOTBAR.size - 1) * HOTBAR.gap;
    const startX = (GAME.width - totalWidth) / 2;
    const y = GAME.height - HOTBAR.slotSize - HOTBAR.bottomMargin;

    return { startX, y, totalWidth };
  }

  getSlotIndexAt(screenX, screenY) {
    const { startX, y } = this.getHotbarLayout();

    if (screenY < y || screenY > y + HOTBAR.slotSize) return null;

    for (let i = 0; i < HOTBAR.size; i++) {
      const x = startX + i * (HOTBAR.slotSize + HOTBAR.gap);
      if (screenX >= x && screenX <= x + HOTBAR.slotSize) {
        return i;
      }
    }

    return null;
  }
}
