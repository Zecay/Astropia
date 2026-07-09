/**
 * Astropia – UIScene
 * https://github.com/Zecay/Astropia
 *
 * HUD scene rendered above GameScene.
 * Handles:
 *  • 4-slot quick bar at the bottom
 *  • 40-slot inventory panel
 *  • Gem counter
 *  • Tooltips / selected-item indicator
 *  • Hotbar controls: 0/1/2/3, Tab, wheel, F, I, Esc
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

    this.hotbarSlots = [];
    this.inventorySlotObjs = [];
    this.inventoryOpen = false;
    this.tooltipTimer = null;

    this._buildHotbar();
    this._buildGemCounter();
    this._buildTooltip();
    this._buildHoldingIndicator();
    this._buildInventoryPanel();
    this._setupInput();

    this.registry.events.on('inventoryChanged', this._onInventoryChanged, this);

    this._refreshHotbar();
    this._refreshGemCounter();
    this._refreshHoldingIndicator();
  }

  /* ═══════════════════════════════════════════════════════════════
     HOTBAR
     ═══════════════════════════════════════════════════════════════ */

  _buildHotbar() {
    const slotSize = this.config.inventory.slotSize || 48;
    const spacing = this.uiCfg.hotbarSpacing || 56;
    const numSlots = this.config.inventory.hotbarSlots || 4;
    const totalW = (numSlots - 1) * spacing + slotSize;
    const startX = (this.screenW - totalW) / 2 + slotSize / 2;
    const y = this.uiCfg.hotbarY || 560;

    for (let i = 0; i < numSlots; i++) {
      const x = startX + i * spacing;
      const bg = this.add.graphics().setDepth(100);
      const icon = this.add.image(x, y, 'fist').setDepth(101);
      const countText = this.add.text(x + slotSize / 2 - 4, y + slotSize / 2 - 4, '', {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(1, 1).setDepth(102);

      this.hotbarSlots.push({ x, y, bg, icon, countText, slotSize });
    }
  }

  _drawHotbar() {
    const numSlots = this.config.inventory.hotbarSlots || 4;
    const selected = this.inv.getSelectedSlot();
    const isQuickSelected = selected < numSlots;

    for (let i = 0; i < numSlots; i++) {
      const slot = this.hotbarSlots[i];
      const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarBgColor || '#00000088');
      const borderColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarBorderColor || '#ffffff');
      const selectedColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.hotbarSelectedColor || '#ffd700');

      slot.bg.clear();
      slot.bg.fillStyle(bgColor.color, bgColor.alphaGL);
      slot.bg.fillRoundedRect(slot.x - slot.slotSize / 2, slot.y - slot.slotSize / 2, slot.slotSize, slot.slotSize, 6);
      if (isQuickSelected && i === selected) {
        slot.bg.lineStyle(3, selectedColor.color, 1);
      } else {
        slot.bg.lineStyle(2, borderColor.color, 0.4);
      }
      slot.bg.strokeRoundedRect(slot.x - slot.slotSize / 2, slot.y - slot.slotSize / 2, slot.slotSize, slot.slotSize, 6);
    }
  }

  _refreshHotbar() {
    const slotSize = this.config.inventory.slotSize || 48;
    const numSlots = this.config.inventory.hotbarSlots || 4;
    this._drawHotbar();

    for (let i = 0; i < numSlots; i++) {
      const { icon, countText } = this.hotbarSlots[i];

      if (i === 0) {
        icon.setTexture(this.inv.fistMode === 'wrench' ? 'wrench' : 'fist');
        icon.setDisplaySize(slotSize - 12, slotSize - 12);
        icon.setVisible(true);
        countText.setText('');
        continue;
      }

      const slot = this.inv.getSlot(i);
      if (!slot) {
        icon.setVisible(false);
        countText.setText('');
        continue;
      }

      const itemDef = this.config.items[String(slot.itemId)];
      if (itemDef && itemDef.texture && this.textures.exists(itemDef.texture)) {
        icon.setTexture(itemDef.texture);
        icon.setDisplaySize(slotSize - 8, slotSize - 8);
        icon.setVisible(true);
      } else {
        icon.setVisible(false);
      }
      countText.setText(String(slot.count));
    }

    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
    this._refreshHoldingIndicator();
  }

  /* ═══════════════════════════════════════════════════════════════
     GEM COUNTER
     ═══════════════════════════════════════════════════════════════ */

  _buildGemCounter() {
    const pad = this.uiCfg.gemCounterPadding || 12;
    const gemSize = 20;
    this.gemBg = this.add.graphics().setDepth(100);
    this.gemIcon = this.add.image(this.screenW - pad - gemSize / 2, pad + gemSize / 2, 'item_gem').setDepth(101);
    this.gemIcon.setDisplaySize(gemSize, gemSize);
    this.gemText = this.add.text(this.screenW - pad - gemSize - 6, pad + gemSize / 2, '0', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(1, 0.5).setDepth(101);
  }

  _refreshGemCounter() {
    const pad = this.uiCfg.gemCounterPadding || 12;
    const gemSize = 20;
    this.gemText.setText(String(this.inv.gems));
    const textW = this.gemText.width + 8;
    const totalW = textW + gemSize + 8;
    const totalH = 28;

    this.gemBg.clear();
    this.gemBg.fillStyle(0x000000, 0.5);
    this.gemBg.fillRoundedRect(this.screenW - pad - totalW, pad - 2, totalW, totalH, 6);

    this.gemText.setPosition(this.screenW - pad - gemSize - 6, pad + gemSize / 2);
    this.gemIcon.setPosition(this.screenW - pad - gemSize / 2, pad + gemSize / 2);
  }

  /* ═══════════════════════════════════════════════════════════════
     TOOLTIP / HOLDING
     ═══════════════════════════════════════════════════════════════ */

  _buildTooltip() {
    this.tooltipBg = this.add.graphics().setDepth(110).setVisible(false);
    this.tooltipText = this.add.text(0, 0, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: this.uiCfg.tooltipTextColor || '#ffffff'
    }).setOrigin(0.5).setDepth(111).setVisible(false);
  }

  _showTooltip(text) {
    if (!text) return;

    const selected = this.inv.getSelectedSlot();
    const numSlots = this.config.inventory.hotbarSlots || 4;
    let x = this.screenW / 2;
    let y = (this.uiCfg.hotbarY || 560) - 52;

    if (selected < numSlots) {
      x = this.hotbarSlots[selected].x;
    }

    this.tooltipText.setText(text);
    const tw = this.tooltipText.width + 16;
    const th = 26;
    const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.tooltipBgColor || '#000000cc');

    this.tooltipBg.clear();
    this.tooltipBg.fillStyle(bgColor.color, bgColor.alphaGL);
    this.tooltipBg.fillRoundedRect(x - tw / 2, y - th / 2, tw, th, 4);
    this.tooltipBg.setVisible(true);
    this.tooltipText.setPosition(x, y).setVisible(true);

    if (this.tooltipTimer) this.tooltipTimer.remove();
    this.tooltipTimer = this.time.delayedCall(this.uiCfg.tooltipFadeMs || 2000, () => {
      this.tooltipBg.setVisible(false);
      this.tooltipText.setVisible(false);
      this.tooltipTimer = null;
    });
  }

  _buildHoldingIndicator() {
    this.holdingText = this.add.text(this.screenW / 2, (this.uiCfg.hotbarY || 560) - 86, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(103).setVisible(false);
  }

  _refreshHoldingIndicator() {
    const selected = this.inv.getSelectedSlot();
    const quickSlots = this.config.inventory.hotbarSlots || 4;
    const sel = this.inv.getSelectedItem();

    if (selected >= quickSlots && sel.itemDef) {
      this.holdingText.setText(`Holding: ${sel.itemDef.name}`);
      this.holdingText.setVisible(true);
    } else {
      this.holdingText.setVisible(false);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     INVENTORY PANEL
     ═══════════════════════════════════════════════════════════════ */

  _buildInventoryPanel() {
    this.inventoryPanel = this.add.container(0, 0).setDepth(150).setVisible(false);

    const overlay = this.add.rectangle(this.screenW / 2, this.screenH / 2, this.screenW, this.screenH, 0x000000, 0.6);
    overlay.setInteractive();
    this.inventoryPanel.add(overlay);

    const slotsPerRow = this.uiCfg.inventorySlotsPerRow || 8;
    const slotSize = this.uiCfg.inventorySlotSize || 44;
    const totalSlots = this.config.inventory.totalSlots || 40;
    const rows = Math.ceil(totalSlots / slotsPerRow);
    const panelW = slotsPerRow * (slotSize + 4) + 20;
    const panelH = rows * (slotSize + 4) + 46;

    const panelBg = this.add.graphics();
    const bgColor = Phaser.Display.Color.HexStringToColor(this.uiCfg.inventoryPanelBg || '#000000dd');
    panelBg.fillStyle(bgColor.color, bgColor.alphaGL);
    panelBg.fillRoundedRect(this.screenW / 2 - panelW / 2, this.screenH / 2 - panelH / 2, panelW, panelH, 10);
    panelBg.lineStyle(2, 0xffffff, 0.5);
    panelBg.strokeRoundedRect(this.screenW / 2 - panelW / 2, this.screenH / 2 - panelH / 2, panelW, panelH, 10);
    this.inventoryPanel.add(panelBg);

    const title = this.add.text(this.screenW / 2, this.screenH / 2 - panelH / 2 + 16, 'INVENTORY', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.inventoryPanel.add(title);

    const hint = this.add.text(this.screenW / 2, this.screenH / 2 + panelH / 2 - 14, 'Click any slot • I / Esc to close', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.inventoryPanel.add(hint);

    const startX = this.screenW / 2 - panelW / 2 + 14;
    const startY = this.screenH / 2 - panelH / 2 + 38;
    this.inventorySlotObjs = [];

    for (let i = 0; i < totalSlots; i++) {
      const x = startX + (i % slotsPerRow) * (slotSize + 4) + slotSize / 2;
      const y = startY + Math.floor(i / slotsPerRow) * (slotSize + 4) + slotSize / 2;
      const bg = this.add.graphics();
      const icon = this.add.image(x, y, 'fist');
      const countText = this.add.text(x + slotSize / 2 - 4, y + slotSize / 2 - 4, '', {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(1, 1);

      this.inventoryPanel.add(bg);
      this.inventoryPanel.add(icon);
      this.inventoryPanel.add(countText);
      this.inventorySlotObjs.push({ bg, icon, countText, x, y, slotSize });
    }

    overlay.on('pointerdown', (pointer) => {
      for (let i = 0; i < totalSlots; i++) {
        const obj = this.inventorySlotObjs[i];
        const half = obj.slotSize / 2;
        if (pointer.x >= obj.x - half && pointer.x <= obj.x + half &&
            pointer.y >= obj.y - half && pointer.y <= obj.y + half) {
          this.inv.setSelectedSlot(i);
          this._onSlotSelect();
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
      obj.bg.clear();
      obj.bg.fillStyle(0x000000, 0.4);
      obj.bg.fillRoundedRect(obj.x - obj.slotSize / 2, obj.y - obj.slotSize / 2, obj.slotSize, obj.slotSize, 4);
      obj.bg.lineStyle(i === selected ? 2 : 1, i === selected ? 0xffd700 : 0xffffff, i === selected ? 1 : 0.3);
      obj.bg.strokeRoundedRect(obj.x - obj.slotSize / 2, obj.y - obj.slotSize / 2, obj.slotSize, obj.slotSize, 4);

      if (i === 0) {
        obj.icon.setTexture(this.inv.fistMode === 'wrench' ? 'wrench' : 'fist');
        obj.icon.setDisplaySize(obj.slotSize - 12, obj.slotSize - 12);
        obj.icon.setVisible(true);
        obj.countText.setText('');
        continue;
      }

      const slot = this.inv.getSlot(i);
      if (!slot) {
        obj.icon.setVisible(false);
        obj.countText.setText('');
        continue;
      }

      const itemDef = this.config.items[String(slot.itemId)];
      if (itemDef && itemDef.texture && this.textures.exists(itemDef.texture)) {
        obj.icon.setTexture(itemDef.texture);
        obj.icon.setDisplaySize(obj.slotSize - 8, obj.slotSize - 8);
        obj.icon.setVisible(true);
      } else {
        obj.icon.setVisible(false);
      }
      obj.countText.setText(String(slot.count));
    }
  }

  _toggleInventoryPanel(forceState) {
    if (typeof forceState === 'boolean') {
      this.inventoryOpen = forceState;
    } else {
      this.inventoryOpen = !this.inventoryOpen;
    }

    this.inventoryPanel.setVisible(this.inventoryOpen);
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     INPUT
     ═══════════════════════════════════════════════════════════════ */

  _setupInput() {
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

    this.input.keyboard.on('keydown-TAB', (event) => {
      event.preventDefault();
      this.inv.cycleSelected(event.shiftKey ? -1 : 1);
      this._onSlotSelect();
    });

    this.input.keyboard.on('keydown-F', () => {
      this.inv.toggleFistWrench();
      this._refreshHotbar();
      if (this.inventoryOpen) this._refreshInventoryPanel();
      if (this.sfx) this.sfx.play('select');
      this._showTooltip(this.inv.fistMode === 'wrench' ? 'Wrench' : 'Fist');
    });

    this.input.keyboard.on('keydown-I', () => {
      this._toggleInventoryPanel();
    });

    this.input.keyboard.on('keydown-ESC', () => {
      if (this.inventoryOpen) {
        this._toggleInventoryPanel(false);
      }
    });

    this.input.keyboard.on('keydown-ENTER', () => {
      console.log('[Astropia] Chat: (stub — chat coming later)');
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (deltaY > 0) this.inv.cycleSelected(1);
      else if (deltaY < 0) this.inv.cycleSelected(-1);
      this._onSlotSelect();
    });
  }

  _onSlotSelect(playSound = true) {
    this._refreshHotbar();
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
    if (playSound && this.sfx) this.sfx.play('select');

    const sel = this.inv.getSelectedItem();
    let name = '';
    if (sel.kind === 'fist') name = 'Fist';
    else if (sel.kind === 'wrench') name = 'Wrench';
    else if (sel.itemDef) name = sel.itemDef.name;
    if (name) this._showTooltip(name);
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENTS
     ═══════════════════════════════════════════════════════════════ */

  _onInventoryChanged() {
    this._refreshHotbar();
    this._refreshGemCounter();
    if (this.inventoryOpen) {
      this._refreshInventoryPanel();
    }
  }
}
