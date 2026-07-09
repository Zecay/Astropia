/**
 * Astropia – LoadScene
 * https://github.com/Zecay/Astropia
 *
 * Generates all built-in textures procedurally with Phaser Graphics.
 * If a block/item texture key was preloaded from a custom image URL/path,
 * procedural generation is skipped for that key.
 */

class LoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadScene' });
  }

  preload() {
    const { width, height } = this.sys.game.config;
    const barW = 320;
    const barH = 24;
    const barX = (width - barW) / 2;
    const barY = height / 2;

    const bgBar = this.add.graphics();
    bgBar.fillStyle(0x222244, 1);
    bgBar.fillRect(barX, barY, barW, barH);

    const fillBar = this.add.graphics();
    const loadingText = this.add.text(width / 2, barY - 30, 'Generating assets…', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      fillBar.clear();
      fillBar.fillStyle(0x66ccff, 1);
      fillBar.fillRect(barX + 2, barY + 2, (barW - 4) * value, barH - 4);
    });

    this.load.on('complete', () => {
      fillBar.destroy();
      bgBar.destroy();
      loadingText.destroy();
    });
  }

  create() {
    const config = this.registry.get('config');
    const TS = config.world.tileSize;
    const pw = Math.round(config.physics.playerWidthTiles * TS);
    const ph = Math.round(config.physics.playerHeightTiles * TS);

    /* ─── Player spritesheets ─── */
    this._generatePlayerIdle(config, pw, ph);
    this._generatePlayerRun(config, pw, ph);
    this._generatePlayerJump(config, pw, ph);
    this._generatePlayerPunch(config, pw, ph);

    /* ─── Tools / overlays ─── */
    this._generateFistTexture(12);
    this._generateWrenchTexture(16);
    this._generateCrackTextures(TS);

    /* ─── Blocks / items ─── */
    this._generateBlockTextures(config, TS);
    this._generateItemTextures(config, 24);
    this._generateGemTexture(20);
    this._generateSeedTextures(20);

    console.log('[Astropia] All built-in textures ready.');
    this.scene.start('GameScene');
  }

  /* ═══════════════════════════════════════════════════════════════
     SPRITESHEET GENERATOR
     ═══════════════════════════════════════════════════════════════ */

  _generateSpritesheet(key, fw, fh, fc, drawFn) {
    const totalW = fw * fc;
    const g = this.make.graphics({ add: false });
    for (let frame = 0; frame < fc; frame++) {
      drawFn(g, frame, fw, fh);
    }
    g.generateTexture(`${key}_raw`, totalW, fh);
    g.destroy();

    const source = this.textures.get(`${key}_raw`).getSourceImage();
    this.textures.addSpriteSheet(key, source, { frameWidth: fw, frameHeight: fh });
    this.textures.remove(`${key}_raw`);
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerIdle(config, w, h) {
    const colors = this._getPlayerColors(config);
    const fc = config.animation.idleFrameCount;

    this._generateSpritesheet('player_idle', w, h, fc, (g, frame) => {
      const ox = frame * w;
      const bobY = frame === 0 ? 0 : -1;

      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 5, 21 + bobY, 5, 7);
      g.fillRect(ox + 14, 21 + bobY, 5, 7);

      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26 + bobY, 7, 6);
      g.fillRect(ox + 13, 26 + bobY, 7, 6);

      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10 + bobY, w - 6, 12);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1 + bobY, w - 8, 10);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4 + bobY, 3, 3);
      g.fillRect(ox + 14, 4 + bobY, 3, 3);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 12 + bobY, 4, 5);
      g.fillRect(ox + w - 4, 12 + bobY, 4, 5);
    });
  }

  _generatePlayerRun(config, w, h) {
    const colors = this._getPlayerColors(config);
    const fc = config.animation.runFrameCount;

    this._generateSpritesheet('player_run', w, h, fc, (g, frame) => {
      const ox = frame * w;

      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10, w - 6, 12);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1, w - 8, 10);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4, 3, 3);
      g.fillRect(ox + 14, 4, 3, 3);

      g.fillStyle(colors.pants, 1);
      if (frame === 0) {
        g.fillRect(ox + 4, 21, 6, 7);
        g.fillRect(ox + 15, 21, 5, 5);
      } else if (frame === 1 || frame === 3) {
        g.fillRect(ox + 5, 21, 5, 7);
        g.fillRect(ox + 14, 21, 5, 7);
      } else {
        g.fillRect(ox + 4, 21, 5, 5);
        g.fillRect(ox + 15, 21, 6, 7);
      }

      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26, 7, 6);
      g.fillRect(ox + 13, 26, 7, 6);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 12, 4, 5);
      g.fillRect(ox + w - 4, 12, 4, 5);
    });
  }

  _generatePlayerJump(config, w, h) {
    const colors = this._getPlayerColors(config);

    this._generateSpritesheet('player_jump', w, h, 1, (g, frame) => {
      const ox = frame * w;

      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 8, w - 6, 11);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 0, w - 8, 9);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 3, 3, 3);
      g.fillRect(ox + 14, 3, 3, 3);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 4, 4, 6);
      g.fillRect(ox + w - 4, 4, 4, 6);

      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 4, 20, 7, 6);
      g.fillRect(ox + 13, 20, 7, 6);
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 3, 24, 8, 6);
      g.fillRect(ox + 13, 24, 8, 6);
    });
  }

  _generatePlayerPunch(config, w, h) {
    const colors = this._getPlayerColors(config);
    const fc = config.animation.punchFrameCount;

    this._generateSpritesheet('player_punch', w, h, fc, (g, frame) => {
      const ox = frame * w;

      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10, w - 6, 12);

      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1, w - 8, 10);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4, 3, 3);
      g.fillRect(ox + 14, 4, 3, 3);

      g.fillStyle(colors.skin, 1);
      if (frame === 0) {
        g.fillRect(ox + 18, 12, 5, 5);
      } else {
        g.fillRect(ox + 20, 13, 5, 4);
      }

      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 5, 21, 5, 7);
      g.fillRect(ox + 14, 21, 5, 7);
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26, 7, 6);
      g.fillRect(ox + 13, 26, 7, 6);
    });
  }

  _getPlayerColors(config) {
    return {
      skin: Phaser.Display.Color.HexStringToColor(config.player.skinColor).color,
      body: Phaser.Display.Color.HexStringToColor(config.player.bodyColor).color,
      pants: Phaser.Display.Color.HexStringToColor(config.player.pantsColor).color,
      shoes: Phaser.Display.Color.HexStringToColor(config.player.shoeColor).color
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     TOOLS / OVERLAYS
     ═══════════════════════════════════════════════════════════════ */

  _generateFistTexture(size) {
    if (this.textures.exists('fist')) return;
    const config = this.registry.get('config');
    const skinColor = Phaser.Display.Color.HexStringToColor(config.player.skinColor).color;
    const g = this.make.graphics({ add: false });
    g.fillStyle(skinColor, 1);
    g.fillRoundedRect(0, 0, size, size, 3);
    g.lineStyle(1, 0x000000, 0.2);
    g.strokeRoundedRect(0, 0, size, size, 3);
    g.generateTexture('fist', size, size);
    g.destroy();
  }

  _generateWrenchTexture(size) {
    if (this.textures.exists('wrench')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0x888888, 1);
    g.fillRect(5, 2, 4, 10);
    g.fillStyle(0xAAAAAA, 1);
    g.fillRect(6, 2, 1, 10);
    g.fillStyle(0x888888, 1);
    g.fillRect(2, 9, 10, 5);
    g.fillStyle(0xAAAAAA, 1);
    g.fillRect(2, 9, 10, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRect(5, 9, 3, 5);
    g.lineStyle(1, 0x333333, 0.6);
    g.strokeRect(2, 9, 10, 5);
    g.generateTexture('wrench', size, size);
    g.destroy();
  }

  _generateCrackTextures(TS) {
    let g = this.make.graphics({ add: false });
    g.lineStyle(1, 0x000000, 0.5);
    g.lineBetween(TS * 0.3, TS * 0.2, TS * 0.6, TS * 0.5);
    g.lineBetween(TS * 0.6, TS * 0.5, TS * 0.5, TS * 0.7);
    g.generateTexture('crack_1', TS, TS);
    g.destroy();

    g = this.make.graphics({ add: false });
    g.lineStyle(2, 0x000000, 0.6);
    g.lineBetween(TS * 0.2, TS * 0.1, TS * 0.5, TS * 0.4);
    g.lineBetween(TS * 0.5, TS * 0.4, TS * 0.7, TS * 0.3);
    g.lineBetween(TS * 0.7, TS * 0.3, TS * 0.8, TS * 0.6);
    g.lineBetween(TS * 0.8, TS * 0.6, TS * 0.3, TS * 0.8);
    g.lineBetween(TS * 0.3, TS * 0.8, TS * 0.5, TS * 0.9);
    g.generateTexture('crack_2', TS, TS);
    g.destroy();

    g = this.make.graphics({ add: false });
    g.lineStyle(2, 0x000000, 0.8);
    g.lineBetween(2, 4, TS * 0.4, TS * 0.3);
    g.lineBetween(TS * 0.4, TS * 0.3, TS * 0.6, TS * 0.15);
    g.lineBetween(TS * 0.6, TS * 0.15, TS * 0.75, TS * 0.5);
    g.lineBetween(TS * 0.75, TS * 0.5, TS * 0.9, TS * 0.4);
    g.lineBetween(TS * 0.4, TS * 0.3, TS * 0.3, TS * 0.65);
    g.lineBetween(TS * 0.3, TS * 0.65, TS * 0.5, TS * 0.85);
    g.lineBetween(TS * 0.5, TS * 0.85, TS * 0.2, TS * 0.95);
    g.lineStyle(1, 0x000000, 0.4);
    g.lineBetween(TS * 0.6, TS * 0.15, TS * 0.85, TS * 0.2);
    g.generateTexture('crack_3', TS, TS);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════════
     BLOCKS
     ═══════════════════════════════════════════════════════════════ */

  _generateBlockTextures(config, TS) {
    for (const [id, block] of Object.entries(config.blocks || {})) {
      if (!block || !block.texture) continue;
      if (this.textures.exists(block.texture)) continue;

      const numId = Number(id);
      if (numId === 1) {
        this._generateDirtTextures(block, TS);
      } else if (numId === 6) {
        this._generateBedrockTexture(block, TS);
      } else if (numId === 8) {
        this._generateCaveBackgroundTexture(block, TS);
      } else if (numId === 9) {
        this._generateLavaSpritesheet(block, TS);
      } else {
        this._generateGenericBlockTexture(block.texture, block.color || '#888888', TS);
      }
    }
  }

  _generateDirtTextures(block, TS) {
    if (!this.textures.exists('block_dirt')) {
      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(block.color || '#8B5E3C').color;
      const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(20).color;
      const darker = Phaser.Display.Color.IntegerToColor(color).darken(20).color;

      g.fillStyle(color, 1);
      g.fillRect(1, 1, TS - 2, TS - 2);
      g.lineStyle(1, 0x000000, 0.3);
      g.strokeRect(1, 1, TS - 2, TS - 2);
      g.lineStyle(1, lighter, 0.3);
      g.lineBetween(1, 1, TS - 2, 1);
      g.lineBetween(1, 1, 1, TS - 2);
      g.lineStyle(1, darker, 0.3);
      g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
      g.lineBetween(1, TS - 2, TS - 2, TS - 2);
      g.generateTexture('block_dirt', TS, TS);
      g.destroy();
    }

    if (!this.textures.exists('block_grass')) {
      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(block.color || '#8B5E3C').color;
      const grassColor = Phaser.Display.Color.HexStringToColor(block.grassColor || '#5B8C2A').color;
      const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(20).color;
      const darker = Phaser.Display.Color.IntegerToColor(color).darken(20).color;

      g.fillStyle(color, 1);
      g.fillRect(1, 1, TS - 2, TS - 2);
      g.fillStyle(grassColor, 1);
      g.fillRect(1, 1, TS - 2, 6);
      g.lineStyle(1, 0x000000, 0.3);
      g.strokeRect(1, 1, TS - 2, TS - 2);
      g.lineStyle(1, lighter, 0.3);
      g.lineBetween(1, 1, TS - 2, 1);
      g.lineBetween(1, 1, 1, TS - 2);
      g.lineStyle(1, darker, 0.3);
      g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
      g.lineBetween(1, TS - 2, TS - 2, TS - 2);
      g.generateTexture('block_grass', TS, TS);
      g.destroy();
    }
  }

  _generateBedrockTexture(block, TS) {
    const g = this.make.graphics({ add: false });
    const color = Phaser.Display.Color.HexStringToColor(block.color || '#3A3A3A').color;
    g.fillStyle(color, 1);
    g.fillRect(0, 0, TS, TS);
    g.fillStyle(0x2A2A2A, 0.6);
    for (let i = 0; i < 12; i++) {
      const sx = 2 + Math.floor(Math.random() * (TS - 5));
      const sy = 2 + Math.floor(Math.random() * (TS - 5));
      g.fillRect(sx, sy, 3, 3);
    }
    g.fillStyle(0x4A4A4A, 0.4);
    for (let i = 0; i < 8; i++) {
      const sx = 2 + Math.floor(Math.random() * (TS - 4));
      const sy = 2 + Math.floor(Math.random() * (TS - 4));
      g.fillRect(sx, sy, 2, 2);
    }
    g.lineStyle(1, 0x000000, 0.4);
    g.strokeRect(0, 0, TS, TS);
    g.lineStyle(1, 0x555555, 0.3);
    g.lineBetween(0, 0, TS - 1, 0);
    g.lineBetween(0, 0, 0, TS - 1);
    g.generateTexture(block.texture, TS, TS);
    g.destroy();
  }

  _generateCaveBackgroundTexture(block, TS) {
    const g = this.make.graphics({ add: false });
    const color = Phaser.Display.Color.HexStringToColor(block.color || '#3A2C1C').color;
    const bgColor = Phaser.Display.Color.HexStringToColor(block.bgColor || '#2A1C0C').color;
    g.fillStyle(bgColor, 1);
    g.fillRect(0, 0, TS, TS);
    g.fillStyle(color, 0.9);
    g.fillRect(1, 1, TS - 2, TS - 2);
    g.fillStyle(0x20150A, 0.45);
    for (let i = 0; i < 10; i++) {
      const sx = 2 + Math.floor(Math.random() * (TS - 6));
      const sy = 2 + Math.floor(Math.random() * (TS - 6));
      const size = 1 + Math.floor(Math.random() * 3);
      g.fillRect(sx, sy, size, size);
    }
    g.lineStyle(1, 0x000000, 0.25);
    g.strokeRect(1, 1, TS - 2, TS - 2);
    g.generateTexture(block.texture, TS, TS);
    g.destroy();
  }

  _generateLavaSpritesheet(block, TS) {
    const color = Phaser.Display.Color.HexStringToColor(block.color || '#FF2811').color;
    const glowColor = Phaser.Display.Color.HexStringToColor(block.glowColor || '#FFBB2A').color;

    this._generateSpritesheet('block_lava', TS, TS, 2, (g, frame, w, h) => {
      const ox = frame * w;
      g.fillStyle(color, 1);
      g.fillRect(ox, 0, w, h);

      const glowAlpha = frame === 0 ? 0.35 : 0.5;
      g.fillStyle(glowColor, glowAlpha);
      g.fillRect(ox + 2, 2, w - 4, h - 4);

      const innerAlpha = frame === 0 ? 0.65 : 0.82;
      g.fillStyle(glowColor, innerAlpha);
      g.fillRect(ox + 6, 6, w - 12, h - 12);

      const centerAlpha = frame === 0 ? 0.85 : 0.6;
      g.fillStyle(0xFFFF66, centerAlpha);
      g.fillRect(ox + 10, 10, w - 20, h - 20);

      g.lineStyle(1, 0x000000, 0.4);
      g.strokeRect(ox, 0, w, h);

      g.lineStyle(1, 0xFF4400, 0.35);
      const offset = frame === 0 ? 0 : 2;
      g.lineBetween(ox + 4 + offset, 8, ox + 14, 10);
      g.lineBetween(ox + 20, 6 + offset, ox + 28, 14);
      g.lineBetween(ox + 8, 22 - offset, ox + 16, 24);
      g.lineBetween(ox + 18 + offset, 20, ox + 26, 26);
    });
  }

  _generateGenericBlockTexture(textureKey, colorStr, TS) {
    const g = this.make.graphics({ add: false });
    const color = Phaser.Display.Color.HexStringToColor(colorStr || '#888888').color;
    const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(20).color;
    const darker = Phaser.Display.Color.IntegerToColor(color).darken(20).color;
    g.fillStyle(color, 1);
    g.fillRect(1, 1, TS - 2, TS - 2);
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeRect(1, 1, TS - 2, TS - 2);
    g.lineStyle(1, lighter, 0.3);
    g.lineBetween(1, 1, TS - 2, 1);
    g.lineBetween(1, 1, 1, TS - 2);
    g.lineStyle(1, darker, 0.3);
    g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
    g.lineBetween(1, TS - 2, TS - 2, TS - 2);
    g.generateTexture(textureKey, TS, TS);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════════
     ITEMS
     ═══════════════════════════════════════════════════════════════ */

  _generateItemTextures(config, size) {
    for (const item of Object.values(config.items || {})) {
      if (!item || !item.texture) continue;
      if (this.textures.exists(item.texture)) continue;
      if (item.texture === 'item_gem') continue;
      if (item.texture.startsWith('item_seed_')) continue;

      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(item.color || '#888888').color;
      g.fillStyle(0x333355, 1);
      g.fillRoundedRect(0, 0, size, size, 3);

      if (item.itemType === 'block') {
        const inset = 3;
        const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(25).color;
        g.fillStyle(color, 1);
        g.fillRoundedRect(inset, inset, size - inset * 2, size - inset * 2, 2);
        g.lineStyle(1, lighter, 0.4);
        g.strokeRoundedRect(inset, inset, size - inset * 2, size - inset * 2, 2);
      } else {
        g.fillStyle(color, 1);
        g.fillRect(3, 3, size - 6, size - 6);
      }

      g.generateTexture(item.texture, size, size);
      g.destroy();
    }
  }

  _generateGemTexture(size) {
    if (this.textures.exists('item_gem')) return;
    const g = this.make.graphics({ add: false });
    const cx = size / 2;
    const cy = size / 2;
    const half = size / 2 - 1;
    g.fillStyle(0x00ffcc, 1);
    g.beginPath();
    g.moveTo(cx, cy - half);
    g.lineTo(cx + half, cy);
    g.lineTo(cx, cy + half);
    g.lineTo(cx - half, cy);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0xffffff, 0.6);
    g.lineBetween(cx, cy - half + 2, cx + half - 2, cy);
    g.lineBetween(cx, cy - half + 2, cx - half + 2, cy);
    g.generateTexture('item_gem', size, size);
    g.destroy();
  }

  _generateSeedTextures(size) {
    const cx = size / 2;
    const cy = size / 2;

    if (!this.textures.exists('item_seed_dirt')) {
      let g = this.make.graphics({ add: false });
      g.fillStyle(0x6B4226, 1);
      this._drawEllipse(g, cx, cy, size - 4, size - 6);
      g.fillPath();
      g.fillStyle(0x4A2800, 1);
      this._drawEllipse(g, cx, cy + 1, size - 10, size - 12);
      g.fillPath();
      g.generateTexture('item_seed_dirt', size, size);
      g.destroy();
    }

    if (!this.textures.exists('item_seed_rock')) {
      let g = this.make.graphics({ add: false });
      g.fillStyle(0x6A6A6A, 1);
      g.fillTriangle(size / 2, 2, 2, size - 2, size - 2, size - 2);
      g.fillStyle(0x4A4A4A, 1);
      g.fillTriangle(size / 2, 7, 6, size - 4, size - 6, size - 4);
      g.lineStyle(1, 0x888888, 0.5);
      g.lineBetween(size / 2, 3, 3, size - 3);
      g.lineBetween(size / 2, 3, size - 3, size - 3);
      g.generateTexture('item_seed_rock', size, size);
      g.destroy();
    }

    if (!this.textures.exists('item_seed_lava')) {
      let g = this.make.graphics({ add: false });
      g.fillStyle(0xFF4422, 1);
      g.beginPath();
      g.moveTo(cx, 2);
      g.lineTo(size - 2, cy);
      g.lineTo(cx, size - 2);
      g.lineTo(2, cy);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xFFAA00, 1);
      g.beginPath();
      g.moveTo(cx, 6);
      g.lineTo(size - 6, cy);
      g.lineTo(cx, size - 6);
      g.lineTo(6, cy);
      g.closePath();
      g.fillPath();
      g.generateTexture('item_seed_lava', size, size);
      g.destroy();
    }
  }

  _drawEllipse(g, cx, cy, w, h) {
    const segs = 16;
    const rx = w / 2;
    const ry = h / 2;
    g.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  }
}
