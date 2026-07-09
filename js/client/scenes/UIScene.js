/**
 * Astropia – UIScene
 * https://github.com/Zecay/Astropia
 *
 * Parallel HUD scene rendered on top of GameScene.
 * Handles:
 *  • Hotbar (10 slots) at bottom-center
 *  • Slot 0 = Fist/Wrench, slots 1-9 = items
 *  • Selected slot highlight
 *  • Item name tooltip
 *  • Gem counter (top-right)
 *  • Full inventory panel (toggle with I key)
 *  • Keyboard input: 0-9, Tab, F, I, Enter, mouse wheel
 */

class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    this.config = this.registry.get('config');
    this.uiCfg = this.config.ui;
    this.inv = this.registry.get('inventory');
    this.sfx = this.registry.get('sfx');

    const { width, height } = this.sys.game.config;
    this.screenW = width;
    this.screenH = height;

    /* ─── Hotbar slot objects ─── */
    this.hotbarSlots = [];
    this.hotbarBgs = [];
    this.hotbarIcons = [];
    this.hotbarCounts = [];

    /* ─── Gem counter ─── */
    this.gemIcon = null;
    this.gemText = null;

    /* ─── Tooltip ─── */
    this.tooltipBg = null;
    this.tooltipText = null;
    this.tooltipTimer = null;

    /* ─── Inventory panel ─── */
    this.inventoryPanel = null;
    this.inventorySlotObjs = [];
    this.inventoryOpen = false;

    /* ─── Build the hotbar ─── */
    this._buildHotbar();

    /* ─── Build gem counter ─── */
    this._buildGemCounter();

    /* ─── Build tooltip ─── */
    this._buildTooltip();

    /* ─── Build inventory panel ─── */
    this._buildInventoryPanel();

    /* ─── Input ─── */
    this._setupInput();

    /* ─── Listen for inventory changes ─── */
    this.registry.events.on('inventoryChanged', this._onInventoryChanged, this);

    /* ─── Initial render ─── */
    this._refreshHotbar();
    this._refreshGemCounter();
  }

  /* ═══════════════════════════════════════════════════════════════
     HOTBAR
     ═══════════════════════════════════════════════════════════════ */

  _buildHotbar() {
    const slotSize = this.config.inventory.slotSize || 48;
    const spacing = this.uiCfg.hotbarSpacing || 52;
    const numSlots = this.config.inventory.hotbarSlots || 10;
    const totalW = numSlots * spacing;
    const startX = (this.screenW - totalW) / 2 + spacing / 2;
    const y = this.uiCfg.hotbarY || 560;

    for (let i = 0; i < numSlots; i++) {
      const x = startX + i * spacing;

      /* Slot background */
      const bg = this.add.graphics();
      bg.setDepth(100);

      /* Icon image */
      const icon = this.add.image(x, y, 'fist');
      icon.setDisplaySize(slotSize - 8, slotSize - 8);
      icon.setDepth(101);

      /* Stack count text */
      const countText = this.add.text(x + slotSize / 2 - 4, y + slotSize / 2 - 4, '', {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(1, 1).setDepth(102);

      this.hotbarSlots.push({ x, y, bg, icon, countText, slotSize });
    }

    this._drawHotbarSlots();
  }

  _drawHotbarSlots() {
    const numSlots = this.config.inventory.hotbarSlots || 10;
    const selected = this.inv.getSelectedSlot();

    for (let i = 0; i < numSlots; i++) {
      const slot = this.hotbarSlots[i];
      const { x, y, bg, slotSize } = slot;

      bg.clear();

      /* Fill */
      const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarBgColor || '#00000088');
      bg.fillStyle(bgColor.color, bgColor.alphaGL);
      bg.fillRoundedRect(x - slotSize / 2, y - slotSize / 2, slotSize, slotSize, 6);

      /* Border */
      if (i === selected) {
        const selColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarSelectedColor || '#ffd700');
        bg.lineStyle(3, selColor.color, 1);
      } else {
        const borderColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarBorderColor || '#ffffff');
        bg.lineStyle(2, borderColor.color, 0.4);
      }
      bg.strokeRoundedRect(x - slotSize / 2, y - slotSize / 2, slotSize, slotSize, 6);
    }
  }

  _refreshHotbar() {
    const numSlots = this.config.inventory.hotbarSlots || 10;

    this._drawHotbarSlots();

    for (let i = 0; i < numSlots; i++) {
      const { icon, countText, slotSize } = this.hotbarSlots[i];

      if (i === 0) {
        /* Slot 0: fist or wrench */
        icon.setTexture(this.inv.fistMode === 'wrench' ? 'wrench' : 'fist');
        icon.setDisplaySize(slotSize - 12, slotSize - 12);
        icon.setVisible(true);
        countText.setText('');
      } else {
        const slot = this.inv.getSlot(i);
        if (slot && slot.count > 0) {
          const itemDef = this.config.items[String(slot.itemId)];
          if (itemDef && itemDef.texture && this.textures.exists(itemDef.texture)) {
            icon.setTexture(itemDef.texture);
            icon.setDisplaySize(slotSize - 8, slotSize - 8);
            icon.setVisible(true);
          } else {
            icon.setVisible(false);
          }
          countText.setText(String(slot.count));
        } else {
          icon.setVisible(false);
          countText.setText('');
        }
      }
    }

    /* If inventory panel is open, refresh it too */
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     GEM COUNTER
     ═══════════════════════════════════════════════════════════════ */

  _buildGemCounter() {
    const pad = this.uiCfg.gemCounterPadding || 12;
    const gemSize = 20;

    /* Background */
    this.gemBg = this.add.graphics();
    this.gemBg.setDepth(100);

    /* Icon */
    this.gemIcon = this.add.image(this.screenW - pad - gemSize / 2, pad + gemSize / 2, 'item_gem');
    this.gemIcon.setDisplaySize(gemSize, gemSize);
    this.gemIcon.setOrigin(0.5, 0.5);
    this.gemIcon.setDepth(101);

    /* Count */
    this.gemText = this.add.text(this.screenW - pad - gemSize - 6, pad + gemSize / 2, '0', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(1, 0.5).setDepth(101);
  }

  _refreshGemCounter() {
    /* Redraw background */
    const pad = this.uiCfg.gemCounterPadding || 12;
    const gemSize = 20;
    const textW = this.gemText.width + 8;
    const totalW = textW + gemSize + 8;
    const totalH = 28;

    this.gemBg.clear();
    this.gemBg.fillStyle(0x000000, 0.5);
    this.gemBg.fillRoundedRect(
      this.screenW - pad - totalW,
      pad - 2,
      totalW,
      totalH,
      6
    );

    this.gemText.setText(String(this.inv.gems));
    this.gemText.setPosition(this.screenW - pad - gemSize - 6, pad + gemSize / 2);
    this.gemIcon.setPosition(this.screenW - pad - gemSize / 2, pad + gemSize / 2);
  }

  /* ═══════════════════════════════════════════════════════════════
     TOOLTIP
     ═══════════════════════════════════════════════════════════════ */

  _buildTooltip() {
    this.tooltipBg = this.add.graphics();
    this.tooltipBg.setDepth(110);
    this.tooltipBg.setVisible(false);

    this.tooltipText = this.add.text(0, 0, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: this.uiCfg.tooltipTextColor || '#ffffff'
    }).setOrigin(0.5).setDepth(111);
  }

  _showTooltip(text) {
    const numSlots = this.config.inventory.hotbarSlots || 10;
    const spacing = this.uiCfg.hotbarSpacing || 52;
    const totalW = numSlots * spacing;
    const startX = (this.screenW - totalW) / 2 + spacing / 2;
    const y = (this.uiCfg.hotbarY || 560) - 52;
    const x = startX + this.inv.getSelectedSlot() * spacing;

    this.tooltipText.setText(text);
    const tw = this.tooltipText.width + 16;
    const th = 26;

    this.tooltipBg.clear();
    const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.tooltipBgColor || '#000000cc');
    this.tooltipBg.fillStyle(bgColor.color, bgColor.alphaGL);
    this.tooltipBg.fillRoundedRect(x - tw / 2, y - th / 2, tw, th, 4);

    this.tooltipText.setPosition(x, y);
    this.tooltipBg.setVisible(true);
    this.tooltipText.setVisible(true);

    /* Auto-hide */
    if (this.tooltipTimer) this.tooltipTimer.remove();
    this.tooltipTimer = this.time.delayedCall(this.uiCfg.tooltipFadeMs || 2000, () => {
      this.tooltipBg.setVisible(false);
      this.tooltipText.setVisible(false);
      this.tooltipTimer = null;
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     FULL INVENTORY PANEL
     ═══════════════════════════════════════════════════════════════ */

  _buildInventoryPanel() {
    this.inventoryPanel = this.add.container(0, 0);
    this.inventoryPanel.setDepth(150);
    this.inventoryPanel.setVisible(false);

    /* Dark overlay */
    const overlay = this.add.rectangle(
      this.screenW / 2, this.screenH / 2,
      this.screenW, this.screenH,
      0x000000, 0.6
    );
    this.inventoryPanel.add(overlay);

    /* Panel background */
    const slotsPerRow = this.uiCfg.inventorySlotsPerRow || 8;
    const slotSize = this.uiCfg.inventorySlotSize || 44;
    const totalSlots = this.config.inventory.totalSlots || 40;
    const rows = Math.ceil(totalSlots / slotsPerRow);
    const panelW = slotsPerRow * (slotSize + 4) + 20;
    const panelH = rows * (slotSize + 4) + 40;

    const panelBg = this.add.graphics();
    const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.inventoryPanelBg || '#000000dd');
    panelBg.fillStyle(bgColor.color, bgColor.alphaGL);
    panelBg.fillRoundedRect(
      this.screenW / 2 - panelW / 2,
      this.screenH / 2 - panelH / 2,
      panelW, panelH, 10
    );
    panelBg.lineStyle(2, 0xffffff, 0.5);
    panelBg.strokeRoundedRect(
      this.screenW / 2 - panelW / 2,
      this.screenH / 2 - panelH / 2,
      panelW, panelH, 10
    );
    this.inventoryPanel.add(panelBg);

    /* Title */
    const title = this.add.text(this.screenW / 2, this.screenH / 2 - panelH / 2 + 16, 'INVENTORY', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.inventoryPanel.add(title);

    /* Close hint */
    const closeHint = this.add.text(this.screenW / 2, this.screenH / 2 + panelH / 2 - 14, 'I / Esc to close', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.inventoryPanel.add(closeHint);

    /* Slot visuals */
    const startX = this.screenW / 2 - panelW / 2 + 14;
    const startY = this.screenH / 2 - panelH / 2 + 38;
    this.inventorySlotObjs = [];

    for (let i = 0; i < totalSlots; i++) {
      const sx = startX + (i % slotsPerRow) * (slotSize + 4) + slotSize / 2;
      const sy = startY + Math.floor(i / slotsPerRow) * (slotSize + 4) + slotSize / 2;

      /* Background */
      const slotBg = this.add.graphics();
      this.inventoryPanel.add(slotBg);

      /* Icon */
      const icon = this.add.image(sx, sy, 'fist');
      icon.setDisplaySize(slotSize - 8, slotSize - 8);
      this.inventoryPanel.add(icon);

      /* Count */
      const countText = this.add.text(sx + slotSize / 2 - 4, sy + slotSize / 2 - 4, '', {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(1, 1);
      this.inventoryPanel.add(countText);

      this.inventorySlotObjs.push({ bg: slotBg, icon, countText, x: sx, y: sy, slotSize });
    }

    /* Click handler for inventory slots */
    overlay.setInteractive();
    overlay.on('pointerdown', (pointer) => {
      const lx = pointer.x;
      const ly = pointer.y;

      for (let i = 0; i < totalSlots; i++) {
        const obj = this.inventorySlotObjs[i];
        const half = obj.slotSize / 2;
        if (lx >= obj.x - half && lx <= obj.x + half &&
            ly >= obj.y - half && ly <= obj.y + half) {
          this.inv.setSelectedSlot(i);
          this._refreshHotbar();
          this._refreshInventoryPanel();
          if (this.sfx) this.sfx.play('select');
          return;
        }
      }
    });
  }

  _refreshInventoryPanel() {
    const totalSlots = this.config.inventory.totalSlots || 40;
    const selected = this.inv.getSelectedSlot();

    for (let i = 0; i < totalSlots; i++) {
      const obj = this.inventorySlotObjs[i];
      const { bg, icon, countText, x, y, slotSize } = obj;

      bg.clear();
      /* Fill */
      bg.fillStyle(0x000000, 0.4);
      bg.fillRoundedRect(x - slotSize / 2, y - slotSize / 2, slotSize, slotSize, 4);

      /* Border */
      if (i === selected) {
        bg.lineStyle(2, 0xffd700, 1);
      } else {
        bg.lineStyle(1, 0xffffff, 0.3);
      }
      bg.strokeRoundedRect(x - slotSize / 2, y - slotSize / 2, slotSize, slotSize, 4);

      /* Content */
      if (i === 0) {
        icon.setTexture(this.inv.fistMode === 'wrench' ? 'wrench' : 'fist');
        icon.setDisplaySize(slotSize - 12, slotSize - 12);
        icon.setVisible(true);
        countText.setText('');
      } else {
        const slot = this.inv.getSlot(i);
        if (slot && slot.count > 0) {
          const itemDef = this.config.items[String(slot.itemId)];
          if (itemDef && itemDef.texture && this.textures.exists(itemDef.texture)) {
            icon.setTexture(itemDef.texture);
            icon.setDisplaySize(slotSize - 8, slotSize - 8);
            icon.setVisible(true);
          } else {
            icon.setVisible(false);
          }
          countText.setText(String(slot.count));
        } else {
          icon.setVisible(false);
          countText.setText('');
        }
      }
    }
  }

  _toggleInventoryPanel() {
    this.inventoryOpen = !this.inventoryOpen;
    this.inventoryPanel.setVisible(this.inventoryOpen);
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     INPUT
     ═══════════════════════════════════════════════════════════════ */

  _setupInput() {
    /* ─── Number keys 0-9 ─── */
    this.input.keyboard.on('keydown-ZERO', () => {
      this.inv.setSelectedSlot(0);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-ONE', () => {
      this.inv.setSelectedSlot(1);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-TWO', () => {
      this.inv.setSelectedSlot(2);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-THREE', () => {
      this.inv.setSelectedSlot(3);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-FOUR', () => {
      this.inv.setSelectedSlot(4);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-FIVE', () => {
      this.inv.setSelectedSlot(5);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-SIX', () => {
      this.inv.setSelectedSlot(6);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-SEVEN', () => {
      this.inv.setSelectedSlot(7);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-EIGHT', () => {
      this.inv.setSelectedSlot(8);
      this._onSlotSelect();
    });
    this.input.keyboard.on('keydown-NINE', () => {
      this.inv.setSelectedSlot(9);
      this._onSlotSelect();
    });

    /* ─── Tab / Shift+Tab ─── */
    this.input.keyboard.on('keydown-TAB', (event) => {
      event.preventDefault();
      if (event.shiftKey) {
        this.inv.cycleSelected(-1);
      } else {
        this.inv.cycleSelected(1);
      }
      this._onSlotSelect();
    });

    /* ─── F key (fist/wrench) ─── */
    this.input.keyboard.on('keydown-F', () => {
      this.inv.toggleFistWrench();
      this._refreshHotbar();
      if (this.sfx) this.sfx.play('select');
      this._showTooltip(this.inv.fistMode === 'wrench' ? 'Wrench' : 'Fist');
    });

    /* ─── I key (inventory panel) ─── */
    this.input.keyboard.on('keydown-I', () => {
      this._toggleInventoryPanel();
    });

    /* ─── Esc closes inventory ─── */
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.inventoryOpen) {
        this.inventoryOpen = false;
        this.inventoryPanel.setVisible(false);
      }
    });

    /* ─── Enter (chat stub) ─── */
    this.input.keyboard.on('keydown-ENTER', () => {
      console.log('[Astropia] Chat: (stub — chat coming later)');
    });

    /* ─── Mouse wheel ─── */
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (deltaY > 0) {
        this.inv.cycleSelected(1);
      } else if (deltaY < 0) {
        this.inv.cycleSelected(-1);
      }
      this._onSlotSelect();
    });
  }

  _onSlotSelect() {
    this._refreshHotbar();
    if (this.sfx) this.sfx.play('select');

    /* Show tooltip */
    const sel = this.inv.getSelectedItem();
    let name = '';
    if (sel.kind === 'fist') name = 'Fist';
    else if (sel.kind === 'wrench') name = 'Wrench';
    else if (sel.itemDef) name = sel.itemDef.name;
    if (name) this._showTooltip(name);
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT HANDLER
     ═══════════════════════════════════════════════════════════════ */

  _onInventoryChanged() {
    this._refreshHotbar();
    this._refreshGemCounter();
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
  }
}
