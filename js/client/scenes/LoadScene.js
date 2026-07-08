/**
 * Astropia – LoadScene
 * https://github.com/Zecay/Astropia
 *
 * Generates ALL placeholder textures programmatically.
 * Includes player animations, crack overlays, blocks, items, gems, fruits, seeds.
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

    /* Track progress manually since we aren't using real load calls */
    this._genProgress = 0;

    /* ─── Player spritesheets ─── */
    this._generatePlayerIdle(config, TS, TS * 2);
    this._genProgress += 0.2;
    this._generatePlayerRun(config, TS, TS * 2);
    this._genProgress += 0.2;
    this._generatePlayerJump(config, TS, TS * 2);
    this._genProgress += 0.1;
    this._generatePlayerPunch(config, TS, TS * 2);
    this._genProgress += 0.1;

    /* ─── Fist texture ─── */
    this._generateFistTexture(16);

    /* ─── Crack overlays (3 stages) ─── */
    this._generateCrackTextures(TS);

    /* ─── Blocks ─── */
    this._generateBlockTextures(config, TS);
    this._genProgress += 0.1;

    /* ─── Items ─── */
    this._generateItemTextures(config, 24);
    this._genProgress += 0.1;

    /* ─── Gem ─── */
    this._generateGemTexture(20);
    this._genProgress += 0.05;

    /* ─── Fruits ─── */
    this._generateFruitTextures(config, 20);
    this._genProgress += 0.05;

    /* ─── Seeds ─── */
    this._generateSeedTextures(config, 20);
    this._genProgress += 0.1;

    console.log('[Astropia] All placeholder textures generated.');
    this.scene.start('GameScene');
  }

  /* ═══════════════════════════════════════════════════════════════
     SPRITESHEET GENERATION HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Generate a multi-frame spritesheet texture from a drawing callback.
   * @param {string} key  - Texture key to register
   * @param {number} fw   - Frame width
   * @param {number} fh   - Frame height
   * @param {number} fc   - Number of frames
   * @param {function} drawFn - (g, index, fw, fh) → draws one frame at (index*fw, 0)
   */
  _generateSpritesheet(key, fw, fh, fc, drawFn) {
    const totalW = fw * fc;
    const g = this.make.graphics({ add: false });

    for (let i = 0; i < fc; i++) {
      drawFn(g, i, fw, fh);
    }

    /* Generate as a single wide texture, then re-register as spritesheet */
    g.generateTexture(key + '_raw', totalW, fh);
    g.destroy();

    const source = this.textures.get(key + '_raw').getSourceImage();
    this.textures.addSpriteSheet(key, source, { frameWidth: fw, frameHeight: fh });
    this.textures.remove(key + '_raw');
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER IDLE (2 frames — subtle bob)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerIdle(config, w, h) {
    const animConfig = config.animation;
    const fc = animConfig.idleFrameCount; // 2

    this._generateSpritesheet('player_idle', w, h, fc, (g, frame) => {
      const offsetX = frame * w;
      const bobY = frame === 0 ? 0 : -1;

      /* Body (blue shirt) */
      g.fillStyle(0x3366cc, 1);
      g.fillRect(offsetX + 4, 16 + bobY, w - 8, 24);

      /* Head */
      g.fillStyle(0xffd5a0, 1);
      g.fillRect(offsetX + 6, 2 + bobY, w - 12, 16);

      /* Eyes */
      g.fillStyle(0x000000, 1);
      g.fillRect(offsetX + 10, 8 + bobY, 4, 4);
      g.fillRect(offsetX + 18, 8 + bobY, 4, 4);

      /* Legs */
      g.fillStyle(0x333366, 1);
      g.fillRect(offsetX + 6, 40 + bobY, 9, 20);
      g.fillRect(offsetX + 17, 40 + bobY, 9, 20);

      /* Shoes */
      g.fillStyle(0x4a2800, 1);
      g.fillRect(offsetX + 5, 56 + bobY, 11, 8);
      g.fillRect(offsetX + 16, 56 + bobY, 11, 8);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER RUN (4 frames — leg swing)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerRun(config, w, h) {
    const fc = config.animation.runFrameCount; // 4
    const legColors = [0x333366, 0x333366, 0x333366, 0x333366];

    this._generateSpritesheet('player_run', w, h, fc, (g, frame) => {
      const ox = frame * w;

      /* Body (blue shirt) */
      g.fillStyle(0x3366cc, 1);
      g.fillRect(ox + 4, 16, w - 8, 24);

      /* Head */
      g.fillStyle(0xffd5a0, 1);
      g.fillRect(ox + 6, 2, w - 12, 16);

      /* Eyes */
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 10, 8, 4, 4);
      g.fillRect(ox + 18, 8, 4, 4);

      /* Legs — swing based on frame */
      g.fillStyle(0x333366, 1);
      switch (frame) {
        case 0: // left forward
          g.fillRect(ox + 4, 40, 10, 20);
          g.fillRect(ox + 18, 40, 10, 18);
          break;
        case 1: // together
          g.fillRect(ox + 6, 40, 9, 20);
          g.fillRect(ox + 17, 40, 9, 20);
          break;
        case 2: // right forward
          g.fillRect(ox + 4, 40, 10, 18);
          g.fillRect(ox + 18, 40, 10, 20);
          break;
        case 3: // together (slight offset)
          g.fillRect(ox + 6, 40, 9, 20);
          g.fillRect(ox + 17, 40, 9, 20);
          break;
      }

      /* Shoes */
      g.fillStyle(0x4a2800, 1);
      g.fillRect(ox + 5, 56, 11, 8);
      g.fillRect(ox + 16, 56, 11, 8);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER JUMP (1 frame — legs tucked)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerJump(config, w, h) {
    this._generateSpritesheet('player_jump', w, h, 1, (g, frame) => {
      const ox = frame * w;

      /* Body (blue shirt) */
      g.fillStyle(0x3366cc, 1);
      g.fillRect(ox + 4, 14, w - 8, 22);

      /* Head */
      g.fillStyle(0xffd5a0, 1);
      g.fillRect(ox + 6, 0, w - 12, 16);

      /* Eyes */
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 10, 6, 4, 4);
      g.fillRect(ox + 18, 6, 4, 4);

      /* Arms up */
      g.fillStyle(0xffd5a0, 1);
      g.fillRect(ox + 0, 18, 5, 8);
      g.fillRect(ox + 27, 18, 5, 8);

      /* Legs tucked */
      g.fillStyle(0x333366, 1);
      g.fillRect(ox + 5, 42, 10, 14);
      g.fillRect(ox + 17, 42, 10, 14);

      /* Shoes */
      g.fillStyle(0x4a2800, 1);
      g.fillRect(ox + 4, 52, 12, 8);
      g.fillRect(ox + 16, 52, 12, 8);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     PLAYER PUNCH (2 frames — windup + extended)
     ═══════════════════════════════════════════════════════════════ */

  _generatePlayerPunch(config, w, h) {
    const fc = config.animation.punchFrameCount; // 2

    this._generateSpritesheet('player_punch', w, h, fc, (g, frame) => {
      const ox = frame * w;

      /* Body */
      g.fillStyle(0x3366cc, 1);
      g.fillRect(ox + 4, 16, w - 8, 24);

      /* Head */
      g.fillStyle(0xffd5a0, 1);
      g.fillRect(ox + 6, 2, w - 12, 16);

      /* Eyes */
      g.fillStyle(0x000000, 1);
      g.fillRect(ox + 10, 8, 4, 4);
      g.fillRect(ox + 18, 8, 4, 4);

      if (frame === 0) {
        /* Windup: arm pulled back */
        g.fillStyle(0xffd5a0, 1);
        g.fillRect(ox + 21, 18, 8, 6); // arm
        g.fillRect(ox + 26, 14, 6, 6); // fist behind
      } else {
        /* Extended: arm forward */
        g.fillStyle(0xffd5a0, 1);
        g.fillRect(ox + 24, 20, 8, 5); // arm forward
      }

      /* Legs */
      g.fillStyle(0x333366, 1);
      g.fillRect(ox + 6, 40, 9, 20);
      g.fillRect(ox + 17, 40, 9, 20);

      /* Shoes */
      g.fillStyle(0x4a2800, 1);
      g.fillRect(ox + 5, 56, 11, 8);
      g.fillRect(ox + 16, 56, 11, 8);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     FIST TEXTURE
     ═══════════════════════════════════════════════════════════════ */

  _generateFistTexture(size) {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffd5a0, 1);
    g.fillRoundedRect(0, 0, size, size, 4);
    g.lineStyle(1, 0xccaa80, 0.5);
    g.strokeRoundedRect(0, 0, size, size, 4);
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

    /* Stage 3: large cracks (bolder) */
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
      }

      g.generateTexture(block.texture, TS, TS);
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
    /* Apple */
    let g = this.make.graphics({ add: false });
    g.fillStyle(0xff3333, 1);
    g.fillCircle(size / 2, size / 2 + 1, size / 2 - 2);
    g.fillStyle(0x4a2800, 1);
    g.fillRect(size / 2 - 1, 2, 2, 5);
    g.fillStyle(0x33aa33, 1);
    g.fillTriangle(size / 2 - 3, 3, size / 2 - 6, 5, size / 2 - 1, 5);
    g.generateTexture('item_apple', size, size);
    g.destroy();

    /* Pinecone */
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

    /* Apple Seed */
    let g = this.make.graphics({ add: false });
    g.fillStyle(0x6B4226, 1);
    this._drawEllipse(g, cx, cy, size - 4, size - 6);
    g.fillPath();
    g.fillStyle(0x4A2800, 1);
    this._drawEllipse(g, cx, cy + 1, size - 10, size - 12);
    g.fillPath();
    g.generateTexture('item_seed_apple', size, size);
    g.destroy();

    /* Pinecone Seed */
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
