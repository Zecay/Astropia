/**
 * Astropia – Main Entry Point
 * https://github.com/Zecay/Astropia
 *
 * 1. Fetches config.json from the server root.
 * 2. Creates the Phaser.Game instance using config values.
 * 3. Registers scenes (Boot → Load → Game).
 *
 * Phaser Arcade Physics is used for all movement & collisions.
 * All magic numbers come from config.json – never from JS.
 */

(async function () {
  'use strict';

  /* ─── Fetch config.json ─── */
  let config;
  try {
    const response = await fetch('config.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    config = await response.json();
  } catch (err) {
    console.error('[Astropia] Fatal: Could not load config.json', err);
    document.body.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;height:100vh;
                  background:#1a1a2e;color:#ff4444;font-family:monospace;font-size:1.2rem;">
        <div>
          <h1>⚠️ Astropia</h1>
          <p>Could not load <code>config.json</code>.</p>
          <p style="font-size:0.9rem;color:#aaa;">${err.message}</p>
        </div>
      </div>`;
    return;
  }

  /* ─── Build Phaser config from our config ─── */
  const TS = config.world.tileSize;
  const W = config.world.worldWidthTiles * TS;
  const H = config.world.worldHeightTiles * TS;

  const phaserConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 800,   /* viewport width  – scaled to window later if desired */
    height: 600,  /* viewport height */
    backgroundColor: Phaser.Display.Color.HexStringToColor(
      config.world.backgroundColor
    ).color,
    pixelArt: true,  // keep pixel-art crisp
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: config.physics.gravity },
        debug: false   // set to true for collision boxes during dev
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,     // scale to fill window
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, LoadScene, GameScene]
  };

  /* ─── Launch ─── */
  const game = new Phaser.Game(phaserConfig);

  /* Expose game instance for debugging via browser console */
  window.astropia = game;

  console.log(`[Astropia] ${config.game.name} v${config.game.version} initialized.`);
  console.log(`[Astropia] World: ${config.world.worldWidthTiles}×${config.world.worldHeightTiles} tiles (${W}×${H}px)`);
})();
