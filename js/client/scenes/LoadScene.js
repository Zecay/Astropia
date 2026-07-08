/**
 * Astropia – LoadScene
 * https://github.com/Zecay/Astropia
 *
 * Generates ALL placeholder textures programmatically.
 * Includes player animations (1-tile tall chibi style), crack overlays,
 * blocks, items, gems, fruits, seeds.
 *
 * No external image assets required. Uses Phaser 3 Graphics API only.
 */

class LoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadScene' });
  }

  preload() {
    const config = this.registry.get('config');
    const { width, height } = this.sys.game.config;

    /* Loading bar */
    const barW = 320, barH = 24;
    const barX = (width - barW) / 2, barY = height / 2;

    const bgBar = this.add.graphics();
    bgBar.fillStyle(0x222244, 1);
    bgBar.fillRect(barX, barY, barW, barH);

    const fillBar = this.add.graphics();
    const loadingText = this.add.text(width / 2, barY - 30,
      'Generating assets…', {
        fontSize: '18px', fontFamily: 'monospace', color: '#ffffff'
      }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      fillBar.clear();
      fillBar.fillStyle(0x66ccff, 1);
      fillBar.fillRect(barX + 2, barY + 2, (barW - 4) * value, barH - 4);
    });

    this.load.on('complete', () => {
      fillBar.destroy(); bgBar.destroy(); loadingText.destroy();
    });
  }

  create() {
    const config = this.registry.get('config');
    const TS = config.world.tileSize;

    /* ─── Player spritesheets (1 tile tall: 24x32) ─── */
    const pw = Math.round(config.physics.playerWidthTiles * TS); // 24
    const ph = Math.round(config.physics.playerHeightTiles * TS); // 32
    this._generatePlayerIdle(config, pw, ph);
    this._generatePlayerRun(config, pw, ph);
    this._generatePlayerJump(config, pw, ph);
    this._generatePlayerPunch(config, pw, ph);

    /* ─── Fist texture ─── */
    this._generateFistTexture(12);

    /* ─── Crack overlays (3 stages) ─── */
    this._generateCrackTextures(TS);

    /* ─── Blocks (dirt has both plain and grass textures) ─── */
    this._generateBlockTextures(config, TS);

    /* ─── Items ─── */
    this._generateItemTextures(config, 24);

    /* ─── Gem ─── */
    this._generateGemTexture(20);

    /* ─── Fruits ─── */
    this._generateFruitTextures(config, 20);

    /* ─── Seeds ─── */
    this._generateSeedTextures(config, 20);

    console.log('[Astropia] All placeholder textures generated.');
    this.scene.start('GameScene');
  }

  /* ═══════════════════════════════════════════════════════════════
     SPRITESHEET GENERATOR
     ═══════════════════════════════════════════════════════════════ */

  _generateSpritesheet(key, fw, fh, fc, drawFn) {
    const totalW = fw * fc;
    const g = this.make.graphics({ add: false });
    for (let i = 0; i < fc; i++) {
      drawFn(g, i, fw, fh);
    }
    g.generateTexture(key + '_raw', totalW, fh);
    g.destroy();

    const source = this.textures.get(key + '_raw').getSourceImage();
    this.textures.addSpriteSheet(key, source, { frameWidth: fw, frameHeight: fh });
    this.textures.remove(key + '_raw');
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER IDLE (2 frames — 24x32, chibi style)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerIdle(config, w, h) {
    const fc = config.animation.idleFrameCount;
    const colors = {
      skin: Phaser.Display.Color.HexStringToColor(config.player.skinColor).color,
      body: Phaser.Display.Color.HexStringToColor(config.player.bodyColor).color,
      pants: Phaser.Display.Color.HexStringToColor(config.player.pantsColor).color,
      shoes: Phaser.Display.Color.HexStringToColor(config.player.shoeColor).color
    };

    this._generateSpritesheet('player_idle', w, h, fc, (g, frame) => {
      const ox = frame * w;
      const bobY = frame === 0 ? 0 : -1;

      /* Legs (bottom 8px) */
      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 5, 21 + bobY, 5, 7);
      g.fillRect(ox + 14, 21 + bobY, 5, 7);
      /* Shoes */
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26 + bobY, 7, 6);
      g.fillRect(ox + 13, 26 + bobY, 7, 6);

      /* Body / shirt (middle 12px) */
      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10 + bobY, w - 6, 12);

      /* Head (top 10px) - big chibi head */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1 + bobY, w - 8, 10);

      /* Eyes */
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4 + bobY, 3, 3);
      g.fillRect(ox + 14, 4 + bobY, 3, 3);

      /* Arms at sides */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 12 + bobY, 4, 5);
      g.fillRect(ox + w - 4, 12 + bobY, 4, 5);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER RUN (4 frames — leg swing)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerRun(config, w, h) {
    const fc = config.animation.runFrameCount;
    const colors = {
      skin: Phaser.Display.Color.HexStringToColor(config.player.skinColor).color,
      body: Phaser.Display.Color.HexStringToColor(config.player.bodyColor).color,
      pants: Phaser.Display.Color.HexStringToColor(config.player.pantsColor).color,
      shoes: Phaser.Display.Color.HexStringToColor(config.player.shoeColor).color
    };

    this._generateSpritesheet('player_run', w, h, fc, (g, frame) => {
      const ox = frame * w;

      /* Shirt */
      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10, w - 6, 12);

      /* Head */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1, w - 8, 10);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4, 3, 3);
      g.fillRect(ox + 14, 4, 3, 3);

      /* Legs based on frame */
      g.fillStyle(colors.pants, 1);
      switch (frame) {
        case 0:
          g.fillRect(ox + 4, 21, 6, 7);
          g.fillRect(ox + 15, 21, 5, 5);
          break;
        case 1:
          g.fillRect(ox + 5, 21, 5, 7);
          g.fillRect(ox + 14, 21, 5, 7);
          break;
        case 2:
          g.fillRect(ox + 4, 21, 5, 5);
          g.fillRect(ox + 15, 21, 6, 7);
          break;
        case 3:
          g.fillRect(ox + 5, 21, 5, 7);
          g.fillRect(ox + 14, 21, 5, 7);
          break;
      }
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26, 7, 6);
      g.fillRect(ox + 13, 26, 7, 6);

      /* Arms swinging */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 12, 4, 5);
      g.fillRect(ox + w - 4, 12, 4, 5);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER JUMP (1 frame — arms up)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerJump(config, w, h) {
    const colors = {
      skin: Phaser.Display.Color.HexStringToColor(config.player.skinColor).color,
      body: Phaser.Display.Color.HexStringToColor(config.player.bodyColor).color,
      pants: Phaser.Display.Color.HexStringToColor(config.player.pantsColor).color,
      shoes: Phaser.Display.Color.HexStringToColor(config.player.shoeColor).color
    };

    this._generateSpritesheet('player_jump', w, h, 1, (g, frame) => {
      const ox = frame * w;

      /* Shirt */
      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 8, w - 6, 11);

      /* Head */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 0, w - 8, 9);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 3, 3, 3);
      g.fillRect(ox + 14, 3, 3, 3);

      /* Arms up */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 0, 4, 4, 6);
      g.fillRect(ox + w - 4, 4, 4, 6);

      /* Legs tucked */
      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 4, 20, 7, 6);
      g.fillRect(ox + 13, 20, 7, 6);
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 3, 24, 8, 6);
      g.fillRect(ox + 13, 24, 8, 6);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER PUNCH (2 frames)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerPunch(config, w, h) {
    const fc = config.animation.punchFrameCount;
    const colors = {
      skin: Phaser.Display.Color.HexStringToColor(config.player.skinColor).color,
      body: Phaser.Display.Color.HexStringToColor(config.player.bodyColor).color,
      pants: Phaser.Display.Color.HexStringToColor(config.player.pantsColor).color,
      shoes: Phaser.Display.Color.HexStringToColor(config.player.shoeColor).color
    };

    this._generateSpritesheet('player_punch', w, h, fc, (g, frame) => {
      const ox = frame * w;

      /* Shirt */
      g.fillStyle(colors.body, 1);
      g.fillRect(ox + 3, 10, w - 6, 12);

      /* Head */
      g.fillStyle(colors.skin, 1);
      g.fillRect(ox + 4, 1, w - 8, 10);
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 7, 4, 3, 3);
      g.fillRect(ox + 14, 4, 3, 3);

      if (frame === 0) {
        /* Windup: fist back */
        g.fillStyle(colors.skin, 1);
        g.fillRect(ox + 18, 12, 5, 5);
      } else {
        /* Extended: arm forward */
        g.fillStyle(colors.skin, 1);
        g.fillRect(ox + 20, 13, 5, 4);
      }

      /* Legs */
      g.fillStyle(colors.pants, 1);
      g.fillRect(ox + 5, 21, 5, 7);
      g.fillRect(ox + 14, 21, 5, 7);
      g.fillStyle(colors.shoes, 1);
      g.fillRect(ox + 4, 26, 7, 6);
      g.fillRect(ox + 13, 26, 7, 6);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     FIST TEXTURE
     ═══════════════════════════════════════════════════════════════ */

  _generateFistTexture(size) {
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

  /* ═══════════════════════════════════════════════════════════════
     CRACK OVERLAYS (3 stages)
     ═══════════════════════════════════════════════════════════════ */

  _generateCrackTextures(TS) {
    /* Stage 1: small cracks */
    let g = this.make.graphics({ add: false });
    g.lineStyle(1, 0x000000, 0.5);
    g.lineBetween(TS * 0.3, TS * 0.2, TS * 0.6, TS * 0.5);
    g.lineBetween(TS * 0.6, TS * 0.5, TS * 0.5, TS * 0.7);
    g.generateTexture('crack_1', TS, TS);
    g.destroy();

    /* Stage 2: medium cracks */
    g = this.make.graphics({ add: false });
    g.lineStyle(2, 0x000000, 0.6);
    g.lineBetween(TS * 0.2, TS * 0.1, TS * 0.5, TS * 0.4);
    g.lineBetween(TS * 0.5, TS * 0.4, TS * 0.7, TS * 0.3);
    g.lineBetween(TS * 0.7, TS * 0.3, TS * 0.8, TS * 0.6);
    g.lineBetween(TS * 0.8, TS * 0.6, TS * 0.3, TS * 0.8);
    g.lineBetween(TS * 0.3, TS * 0.8, TS * 0.5, TS * 0.9);
    g.generateTexture('crack_2', TS, TS);
    g.destroy();

    /* Stage 3: large cracks */
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
    const blocks = config.blocks;

    for (const [id, block] of Object.entries(blocks)) {
      if (!block.texture || block.texture === '') continue;

      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(block.color || '#888888').color;

      if (block.platform) {
        g.fillStyle(color, 1);
        g.fillRect(0, 0, TS, 6);
        g.fillRect(4, 0, 4, TS);
        g.fillRect(TS - 8, 0, 4, TS);
        g.lineStyle(1, 0x000000, 0.15);
        g.lineBetween(0, 2, TS, 2);
        g.lineBetween(0, 4, TS, 4);
      } else if (Number(id) === 1) {
        /* Dirt: generate TWO textures (plain dirt + grass-topped) */
        /* Plain dirt */
        g.fillStyle(color, 1);
        g.fillRect(1, 1, TS - 2, TS - 2);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRect(1, 1, TS - 2, TS - 2);
        const lighter = Phaser.Display.Color.IntegerToColor(color);
        lighter.lighten(20);
        g.lineStyle(1, lighter.color, 0.3);
        g.lineBetween(1, 1, TS - 2, 1);
        g.lineBetween(1, 1, 1, TS - 2);
        const darker = Phaser.Display.Color.IntegerToColor(color);
        darker.darken(20);
        g.lineStyle(1, darker.color, 0.3);
        g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
        g.lineBetween(1, TS - 2, TS - 2, TS - 2);
        g.generateTexture('block_dirt', TS, TS);
        g.clear();

        /* Grass-topped dirt: same as dirt but with green strip on top */
        const grassColor = Phaser.Display.Color.HexStringToColor(block.grassColor || '#5B8C2A').color;
        g.fillStyle(color, 1);
        g.fillRect(1, 1, TS - 2, TS - 2);
        g.fillStyle(grassColor, 1);
        g.fillRect(1, 1, TS - 2, 6);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRect(1, 1, TS - 2, TS - 2);
        g.lineStyle(1, lighter.color, 0.3);
        g.lineBetween(1, 1, TS - 2, 1);
        g.lineBetween(1, 1, 1, TS - 2);
        g.lineStyle(1, darker.color, 0.3);
        g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
        g.lineBetween(1, TS - 2, TS - 2, TS - 2);
        g.generateTexture('block_grass', TS, TS);
      } else {
        g.fillStyle(color, 1);
        g.fillRect(1, 1, TS - 2, TS - 2);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRect(1, 1, TS - 2, TS - 2);
        const lighter = Phaser.Display.Color.IntegerToColor(color);
        lighter.lighten(20);
        g.lineStyle(1, lighter.color, 0.3);
        g.lineBetween(1, 1, TS - 2, 1);
        g.lineBetween(1, 1, 1, TS - 2);
        const darker = Phaser.Display.Color.IntegerToColor(color);
        darker.darken(20);
        g.lineStyle(1, darker.color, 0.3);
        g.lineBetween(TS - 2, 1, TS - 2, TS - 2);
        g.lineBetween(1, TS - 2, TS - 2, TS - 2);
        g.generateTexture(block.texture, TS, TS);
      }

      g.destroy();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ITEMS
     ═══════════════════════════════════════════════════════════════ */

  _generateItemTextures(config, size) {
    const items = config.items;
    for (const [id, item] of Object.entries(items)) {
      if (!item.texture || item.texture === '') continue;
      if (item.texture.startsWith('block_')) continue;
      if (item.texture.startsWith('item_seed_')) continue;
      if (item.texture.startsWith('item_apple') || item.texture.startsWith('item_pinecone')) continue;
      if (item.texture === 'item_gem') continue;

      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(item.color || '#888888').color;
      g.fillStyle(0x333355, 1);
      g.fillRoundedRect(0, 0, size, size, 3);
      const inset = 3;
      g.fillStyle(color, 1);
      g.fillRect(inset, inset, size - inset * 2, size - inset * 2);
      g.generateTexture(item.texture, size, size);
      g.destroy();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     GEM
     ═══════════════════════════════════════════════════════════════ */

  _generateGemTexture(size) {
    const g = this.make.graphics({ add: false });
    const cx = size / 2, cy = size / 2, half = size / 2 - 1;
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

  /* ═══════════════════════════════════════════════════════════════
     FRUITS
     ═══════════════════════════════════════════════════════════════ */

  _generateFruitTextures(config, size) {
    let g = this.make.graphics({ add: false });
    g.fillStyle(0xff3333, 1);
    g.fillCircle(size / 2, size / 2 + 1, size / 2 - 2);
    g.fillStyle(0x4a2800, 1);
    g.fillRect(size / 2 - 1, 2, 2, 5);
    g.fillStyle(0x33aa33, 1);
    g.fillTriangle(size / 2 - 3, 3, size / 2 - 6, 5, size / 2 - 1, 5);
    g.generateTexture('item_apple', size, size);
    g.destroy();

    g = this.make.graphics({ add: false });
    g.fillStyle(0x8B6F47, 1);
    g.beginPath();
    g.moveTo(size / 2, 1);
    g.lineTo(size - 1, size / 2 + 2);
    g.lineTo(size / 2, size - 1);
    g.lineTo(0, size / 2 + 2);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0x6B4F27, 0.6);
    for (let y = 5; y < size; y += 5) {
      g.lineBetween(3, y, size - 3, y);
    }
    g.generateTexture('item_pinecone', size, size);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════════
     SEEDS
     ═══════════════════════════════════════════════════════════════ */

  _generateSeedTextures(config, size) {
    const cx = size / 2, cy = size / 2;

    let g = this.make.graphics({ add: false });
    g.fillStyle(0x6B4226, 1);
    this._drawEllipse(g, cx, cy, size - 4, size - 6);
    g.fillPath();
    g.fillStyle(0x4A2800, 1);
    this._drawEllipse(g, cx, cy + 1, size - 10, size - 12);
    g.fillPath();
    g.generateTexture('item_seed_apple', size, size);
    g.destroy();

    g = this.make.graphics({ add: false });
    g.fillStyle(0x4A3520, 1);
    g.fillTriangle(size / 2, 2, 2, size - 2, size - 2, size - 2);
    g.fillStyle(0x3A2510, 1);
    g.fillTriangle(size / 2, 6, 6, size - 4, size - 6, size - 4);
    g.generateTexture('item_seed_pine', size, size);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════════
     HELPER: Ellipse polygon
     ═══════════════════════════════════════════════════════════════ */

  _drawEllipse(g, cx, cy, w, h) {
    const segs = 16, rx = w / 2, ry = h / 2;
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
