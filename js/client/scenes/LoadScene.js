/**
 * Astropia – LoadScene
 * https://github.com/Zecay/Astropia
 *
 * Generates all placeholder textures programmatically so the
 * game is playable without any external image files.
 * When real sprites are added, swap these for Phaser's
 * standard .image() / .spritesheet() loads.
 *
 * All drawing uses Phaser 3 Graphics API only — no native
 * Canvas2D methods (arcTo, quadraticCurveTo, etc.).
 */

class LoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadScene' });
  }

  preload() {
    const config = this.registry.get('config');
    const { width, height } = this.sys.game.config;

    /* ─── Loading Bar ─── */
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
    const TS = config.world.tileSize; // 32

    /* ─── Generate block textures (32×32) ─── */
    this._generateBlockTextures(config, TS);

    /* ─── Generate item textures (24×24) ─── */
    this._generateItemTextures(config, 24);

    /* ─── Generate player sprite (32×64) ─── */
    this._generatePlayerTexture(TS, TS * 2);

    /* ─── Generate gem / fruit textures ─── */
    this._generateGemTexture(20);
    this._generateFruitTextures(config, 20);

    /* ─── Generate seed textures ─── */
    this._generateSeedTextures(config, 20);

    console.log('[Astropia] All placeholder textures generated.');

    this.scene.start('GameScene');
  }

  /* ═══════════════════════════════════════════════════════════
     BLOCKS
     ═══════════════════════════════════════════════════════════ */

  _generateBlockTextures(config, TS) {
    const blocks = config.blocks;

    for (const [id, block] of Object.entries(blocks)) {
      if (!block.texture || block.texture === '') continue;

      const g = this.make.graphics({ add: false });
      const color = Phaser.Display.Color.HexStringToColor(block.color || '#888888').color;

      if (block.platform) {
        /* Platform: thin horizontal bar with supports */
        g.fillStyle(color, 1);
        g.fillRect(0, 0, TS, 6);
        g.fillRect(4, 0, 4, TS);
        g.fillRect(TS - 8, 0, 4, TS);

        /* Wood grain lines */
        g.lineStyle(1, 0x000000, 0.15);
        g.lineBetween(0, 2, TS, 2);
        g.lineBetween(0, 4, TS, 4);
      } else {
        /* Solid block */
        g.fillStyle(color, 1);
        g.fillRect(1, 1, TS - 2, TS - 2);

        /* Subtle border */
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRect(1, 1, TS - 2, TS - 2);

        /* Highlight (top-left) */
        const lighter = Phaser.Display.Color.IntegerToColor(color);
        lighter.lighten(20);
        g.lineStyle(1, lighter.color, 0.3);
        g.lineBetween(1, 1, TS - 2, 1);
        g.lineBetween(1, 1, 1, TS - 2);

        /* Shadow (bottom-right) */
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

  /* ═══════════════════════════════════════════════════════════
     ITEMS
     ═══════════════════════════════════════════════════════════ */

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

      /* Item slot background (rounded rect) */
      g.fillStyle(0x333355, 1);
      g.fillRoundedRect(0, 0, size, size, 3);

      /* Inner icon */
      const inset = 3;
      g.fillStyle(color, 1);
      g.fillRect(inset, inset, size - inset * 2, size - inset * 2);

      g.generateTexture(item.texture, size, size);
      g.destroy();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PLAYER
     ═══════════════════════════════════════════════════════════ */

  _generatePlayerTexture(w, h) {
    const g = this.make.graphics({ add: false });

    /* Body (blue shirt) */
    g.fillStyle(0x3366cc, 1);
    g.fillRect(4, 16, w - 8, 24);

    /* Head */
    g.fillStyle(0xffd5a0, 1);
    g.fillRect(6, 2, w - 12, 16);

    /* Eyes */
    g.fillStyle(0x000000, 1);
    g.fillRect(10, 8, 4, 4);
    g.fillRect(18, 8, 4, 4);

    /* Legs */
    g.fillStyle(0x333366, 1);
    g.fillRect(6, 40, 9, 20);
    g.fillRect(17, 40, 9, 20);

    /* Shoes */
    g.fillStyle(0x4a2800, 1);
    g.fillRect(5, 56, 11, 8);
    g.fillRect(16, 56, 11, 8);

    g.generateTexture('player', w, h);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════
     GEM
     ═══════════════════════════════════════════════════════════ */

  _generateGemTexture(size) {
    const g = this.make.graphics({ add: false });
    const cx = size / 2;
    const cy = size / 2;
    const half = size / 2 - 1;

    /* Diamond shape via filled polygon path */
    g.fillStyle(0x00ffcc, 1);
    g.beginPath();
    g.moveTo(cx, cy - half);        // top
    g.lineTo(cx + half, cy);        // right
    g.lineTo(cx, cy + half);        // bottom
    g.lineTo(cx - half, cy);        // left
    g.closePath();
    g.fillPath();

    /* Shine highlight lines */
    g.lineStyle(1, 0xffffff, 0.6);
    g.lineBetween(cx, cy - half + 2, cx + half - 2, cy);
    g.lineBetween(cx, cy - half + 2, cx - half + 2, cy);

    g.generateTexture('item_gem', size, size);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════
     FRUITS
     ═══════════════════════════════════════════════════════════ */

  _generateFruitTextures(config, size) {
    const h = size; // use full size as reference

    /* ─── Apple ─── */
    let g = this.make.graphics({ add: false });
    // Red apple body (circle)
    g.fillStyle(0xff3333, 1);
    g.fillCircle(size / 2, size / 2 + 1, size / 2 - 2);
    // Stem (small brown rect)
    g.fillStyle(0x4a2800, 1);
    g.fillRect(size / 2 - 1, 2, 2, 5);
    // Small green leaf (tiny triangle)
    g.fillStyle(0x33aa33, 1);
    g.fillTriangle(size / 2 - 3, 3, size / 2 - 6, 5, size / 2 - 1, 5);
    g.generateTexture('item_apple', size, size);
    g.destroy();

    /* ─── Pinecone ─── */
    g = this.make.graphics({ add: false });
    // Pinecone body (triangle-ish shape via polygon)
    g.fillStyle(0x8B6F47, 1);
    g.beginPath();
    g.moveTo(size / 2, 1);
    g.lineTo(size - 1, size / 2 + 2);
    g.lineTo(size / 2, size - 1);
    g.lineTo(0, size / 2 + 2);
    g.closePath();
    g.fillPath();
    // Scale lines
    g.lineStyle(1, 0x6B4F27, 0.6);
    for (let y = 5; y < size; y += 5) {
      g.lineBetween(3, y, size - 3, y);
    }
    g.generateTexture('item_pinecone', size, size);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════
     SEEDS
     ═══════════════════════════════════════════════════════════ */

  _generateSeedTextures(config, size) {
    const cx = size / 2;
    const cy = size / 2;

    /* ─── Apple Seed (oval shape) ─── */
    let g = this.make.graphics({ add: false });
    // Outer oval
    g.fillStyle(0x6B4226, 1);
    this._drawEllipse(g, cx, cy, size - 4, size - 6);
    g.fillPath();
    // Inner darker oval
    g.fillStyle(0x4A2800, 1);
    this._drawEllipse(g, cx, cy + 1, size - 10, size - 12);
    g.fillPath();
    g.generateTexture('item_seed_apple', size, size);
    g.destroy();

    /* ─── Pinecone Seed (triangle shape) ─── */
    g = this.make.graphics({ add: false });
    g.fillStyle(0x4A3520, 1);
    g.fillTriangle(size / 2, 2, 2, size - 2, size - 2, size - 2);
    g.fillStyle(0x3A2510, 1);
    g.fillTriangle(size / 2, 6, 6, size - 4, size - 6, size - 4);
    g.generateTexture('item_seed_pine', size, size);
    g.destroy();
  }

  /* ═══════════════════════════════════════════════════════════
     HELPER: Draw ellipse as a filled polygon path
     Phaser 3 Graphics does NOT have fillEllipse on all
     versions, so we manually approximate via a polygon.
     ═══════════════════════════════════════════════════════════ */

  _drawEllipse(g, cx, cy, w, h) {
    const segments = 16;
    const rx = w / 2;
    const ry = h / 2;
    g.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      if (i === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }
    g.closePath();
  }
}
