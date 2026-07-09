/**
 * Astropia – BootScene
 * https://github.com/Zecay/Astropia
 *
 * BootScene is the first scene. It fetches config.json,
 * validates it, preloads any custom texture URLs/paths,
 * stores the config in the registry, then advances to LoadScene.
 */

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
    this._statusText = null;
  }

  preload() {
    const { width, height } = this.sys.game.config;
    this._statusText = this.add.text(width / 2, height / 2, 'Loading Astropia…', {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  async create() {
    try {
      const response = await fetch('config.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json();
      this._validateConfig(config);

      const customTextures = this._collectCustomTextures(config);
      if (customTextures.length > 0) {
        this._statusText.setText('Loading custom textures…');
        this._queueCustomTextures(customTextures);
        this.load.once('complete', () => {
          this.registry.set('config', config);
          console.log(`[Astropia] Config loaded – ${config.game.name} v${config.game.version}`);
          this.scene.start('LoadScene');
        });
        this.load.start();
        return;
      }

      this.registry.set('config', config);
      console.log(`[Astropia] Config loaded – ${config.game.name} v${config.game.version}`);
      this.scene.start('LoadScene');
    } catch (err) {
      console.error('[Astropia] Failed to load config.json:', err);
      const { width, height } = this.sys.game.config;
      this.add.text(width / 2, height / 2 + 40,
        'ERROR: Could not load config.json\nCheck the console for details.', {
          fontSize: '18px',
          fontFamily: 'monospace',
          color: '#ff4444',
          align: 'center'
        }).setOrigin(0.5);
    }
  }

  _validateConfig(cfg) {
    const required = ['physics', 'world', 'blocks', 'items'];
    for (const key of required) {
      if (!cfg[key]) throw new Error(`Missing required config section: "${key}"`);
    }

    if (cfg.world.tileSize !== 32) {
      console.warn('[Astropia] tileSize is not 32 — forcing to 32.');
      cfg.world.tileSize = 32;
    }

    if (!cfg.physics.gravity) throw new Error('physics.gravity is required');
    if (!cfg.physics.jumpVelocity) throw new Error('physics.jumpVelocity is required');
  }

  _collectCustomTextures(config) {
    const entries = [];
    const seen = new Set();

    const pushTexture = (key) => {
      if (!key || !this._isCustomTextureSource(key) || seen.has(key)) return;
      seen.add(key);
      entries.push({ key, url: key });
    };

    for (const block of Object.values(config.blocks || {})) {
      if (block && block.texture) pushTexture(block.texture);
    }

    for (const item of Object.values(config.items || {})) {
      if (item && item.texture) pushTexture(item.texture);
    }

    return entries;
  }

  _queueCustomTextures(entries) {
    this.load.setCORS('anonymous');

    this.load.on('loaderror', (file) => {
      console.warn(`[Astropia] Custom texture failed to load: ${file.key}`);
    });

    for (const entry of entries) {
      if (!this.textures.exists(entry.key)) {
        this.load.image(entry.key, entry.url);
      }
    }
  }

  _isCustomTextureSource(value) {
    if (typeof value !== 'string') return false;
    return /^https?:\/\//i.test(value) || /\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(value);
  }
}
