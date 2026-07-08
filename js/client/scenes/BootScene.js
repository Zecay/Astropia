/**
 * Astropia – BootScene
 * https://github.com/Zecay/Astropia
 *
 * BootScene is the very first scene. It fetches config.json,
 * validates it, stores it in the game registry, then advances
 * to the LoadScene.
 */

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    /* Show a simple "Loading…" text while we wait */
    const { width, height } = this.sys.game.config;
    this.add.text(width / 2, height / 2, 'Loading Astropia…', {
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

      /* ─── Validate critical fields ─── */
      this._validateConfig(config);

      /* Store in registry so every scene can access `this.registry.get('config')` */
      this.registry.set('config', config);

      console.log(`[Astropia] Config loaded – ${config.game.name} v${config.game.version}`);

      /* Advance to the asset-loading scene */
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

  /**
   * Lightweight sanity check on required config keys.
   * Throws if essential fields are missing.
   */
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
}
