/**
 * Astropia – GameScene
 * https://github.com/Zecay/Astropia
 *
 * Main gameplay scene:
 *  • Generates the world from config dimensions
 *  • Spawns the player with acceleration/drag-based physics (Growtopia feel)
 *  • Handles camera follow & tile targeting
 *  • Skeleton for punch/build interaction (future: sends packets to mock server)
 */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    /* ─── State ─── */
    this.tileMap = [];    // 2D array [row][col] → blockId (0 = air)
    this.blockSprites = []; // 2D array of Phaser.GameObjects.Rectangle
    this.player = null;
    this.cursors = null;
    this.keys = {};
    this.worldContainer = null;
    this.tileSize = 32;

    /* Interaction */
    this.targetMarker = null;  // highlights the targeted tile
  }

  create() {
    const config = this.registry.get('config');
    const W = config.world.worldWidthTiles;
    const H = config.world.worldHeightTiles;
    this.TS = config.world.tileSize;
    const groundY = config.world.groundLevel;
    const blocks = config.blocks;

    /* ─── World Container (for camera scrolling) ─── */
    this.worldContainer = this.add.container(0, 0);

    /* ─── Generate Tile Map ─── */
    this.tileMap = [];
    for (let row = 0; row < H; row++) {
      this.tileMap[row] = [];
      for (let col = 0; col < W; col++) {
        let blockId = 0; // air

        if (row === groundY) {
          blockId = 2; // grass
        } else if (row > groundY && row < groundY + 6) {
          blockId = 1; // dirt
        } else if (row >= groundY + 6 && row < groundY + 10) {
          // Mix rock & dirt
          blockId = (col + row) % 5 === 0 ? 3 : 1; // rock
        } else if (row >= groundY + 10) {
          blockId = 3; // deep rock
        }

        this.tileMap[row][col] = blockId;
      }
    }

    /* ─── Render Blocks ─── */
    this.blockSprites = [];
    for (let row = 0; row < H; row++) {
      this.blockSprites[row] = [];
      for (let col = 0; col < W; col++) {
        const blockId = this.tileMap[row][col];
        const sprite = this._createBlockSprite(col, row, blockId);
        this.blockSprites[row][col] = sprite;
      }
    }

    /* ─── Physics World Bounds ─── */
    const worldPixelW = W * this.TS;
    const worldPixelH = H * this.TS;
    this.physics.world.setBounds(0, 0, worldPixelW, worldPixelH);

    /* ─── Player ─── */
    const spawnX = config.world.spawnTileX * this.TS + this.TS / 2;
    const spawnY = (groundY - 3) * this.TS; // 3 tiles above ground
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player');
    this.player.body.setSize(28, 60);  // slightly smaller than visual for forgiving collisions
    this.player.body.setOffset(2, 4);
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(10);

    /* ─── Colliders: collide with solid foreground blocks only ─── */
    this._setupColliders(blocks);

    /* ─── Camera ─── */
    this.cameras.main.setBounds(0, 0, worldPixelW, worldPixelH);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBackgroundColor(
      Phaser.Display.Color.HexStringToColor(config.world.backgroundColor).color
    );

    /* ─── Input ─── */
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keys.a = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.d = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    /* ─── Target Marker ─── */
    this.targetMarker = this.add.rectangle(0, 0, this.TS, this.TS, 0xffffff, 0.25);
    this.targetMarker.setStrokeStyle(2, 0xffffff, 0.6);
    this.targetMarker.setDepth(20);
    this.targetMarker.setVisible(false);

    /* ─── Left-click → Punch / Right-click → Build (placeholder) ─── */
    this.input.on('pointerdown', (pointer) => {
      const tilePos = this._pointerToTile(pointer);
      if (!tilePos) return;

      if (pointer.leftButtonDown()) {
        this._onPunchTile(tilePos.col, tilePos.row);
      } else if (pointer.rightButtonDown()) {
        this._onBuildTile(tilePos.col, tilePos.row);
      }
    });

    /* ─── Debug info ─── */
    this._createDebugText();
  }

  /* ═══════════════════════════════════════════════════════════
     UPDATE LOOP
     ═══════════════════════════════════════════════════════════ */

  update() {
    if (!this.player) return;

    const config = this.registry.get('config');
    const phys = config.physics;

    /* ─── Horizontal Movement (Acceleration / Drag) ─── */
    let left = this.cursors.left.isDown || this.keys.a.isDown;
    let right = this.cursors.right.isDown || this.keys.d.isDown;

    if (left && !right) {
      this.player.body.setAccelerationX(-phys.playerAccelerationX);
      this.player.body.setDragX(0);
    } else if (right && !left) {
      this.player.body.setAccelerationX(phys.playerAccelerationX);
      this.player.body.setDragX(0);
    } else {
      /* No keys → drag to a quick stop */
      this.player.body.setAccelerationX(0);
      this.player.body.setDragX(phys.playerDragX);
    }

    /* Clamp horizontal speed */
    if (Math.abs(this.player.body.velocity.x) > phys.playerMaxSpeedX) {
      this.player.body.velocity.x =
        Math.sign(this.player.body.velocity.x) * phys.playerMaxSpeedX;
    }

    /* Clamp vertical speed */
    if (Math.abs(this.player.body.velocity.y) > phys.playerMaxSpeedY) {
      this.player.body.velocity.y =
        Math.sign(this.player.body.velocity.y) * phys.playerMaxSpeedY;
    }

    /* ─── Jumping ─── */
    if ((this.keys.space.isDown || this.cursors.up.isDown)
        && this.player.body.blocked.down) {
      this.player.body.setVelocityY(phys.jumpVelocity);
      this.player.body.setAccelerationY(0); // reset any vertical accel
    }

    /* ─── Update target marker ─── */
    this._updateTargetMarker();

    /* ─── Debug overlay ─── */
    this._updateDebugText();
  }

  /* ═══════════════════════════════════════════════════════════
     COLLISION SETUP
     ═══════════════════════════════════════════════════════════ */

  _setupColliders(blocks) {
    /* Build static physics groups for solid & platform blocks in a single pass. */
    const solidGroup = this.physics.add.staticGroup();
    const platformGroup = this.physics.add.staticGroup();

    for (let row = 0; row < this.tileMap.length; row++) {
      for (let col = 0; col < this.tileMap[row].length; col++) {
        const blockId = this.tileMap[row][col];
        const blockDef = blocks[String(blockId)];
        if (!blockDef) continue;

        const sprite = this.blockSprites[row][col];
        if (!sprite || !sprite.active) continue;

        if (blockDef.solid && blockDef.foreground) {
          solidGroup.add(sprite);
        } else if (blockDef.platform) {
          platformGroup.add(sprite);
        }
      }
    }

    /* Solid blocks: full collision */
    this.physics.add.collider(this.player, solidGroup);

    /* Platform blocks: one-way (jump-through from below) */
    this.physics.add.collider(this.player, platformGroup, null, (player, platform) => {
      /* Only collide if player is landing on top of the platform */
      const playerBottom = player.body.y + player.body.height;
      const platformTop = platform.body.y + 4;
      const velCompensation = player.body.velocity.y * (1 / 60);
      return player.body.blocked.down || (playerBottom - velCompensation <= platformTop);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     BLOCK SPRITE CREATION
     ═══════════════════════════════════════════════════════════ */

  _createBlockSprite(col, row, blockId) {
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(blockId)];

    if (!blockDef || blockId === 0 || !blockDef.texture) {
      return null;
    }

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;

    /* Use a Rectangle with color from the block config */
    const color = Phaser.Display.Color.HexStringToColor(blockDef.color || '#888888').color;
    const sprite = this.add.rectangle(x, y, this.TS - 1, this.TS - 1, color);

    /* Set alpha for background/non-solid blocks */
    if (!blockDef.foreground && !blockDef.solid) {
      sprite.setAlpha(0.7);
    }

    sprite.setDepth(blockDef.foreground ? 1 : 0);
    return sprite;
  }

  /* ═══════════════════════════════════════════════════════════
     TILE TARGETING
     ═══════════════════════════════════════════════════════════ */

  _pointerToTile(pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / this.TS);
    const row = Math.floor(worldPoint.y / this.TS);
    const config = this.registry.get('config');
    const W = config.world.worldWidthTiles;
    const H = config.world.worldHeightTiles;

    if (col < 0 || col >= W || row < 0 || row >= H) return null;

    /* Check reach distance from player */
    const playerTileCol = Math.floor(this.player.x / this.TS);
    const playerTileRow = Math.floor(this.player.y / this.TS);
    const dist = Math.abs(col - playerTileCol) + Math.abs(row - playerTileRow);
    if (dist > config.physics.playerReachTiles) return null;

    return { col, row };
  }

  _updateTargetMarker() {
    const pointer = this.input.activePointer;
    if (!pointer) { this.targetMarker.setVisible(false); return; }

    /* Only show when pointer is over the game canvas */
    if (!this.sys.game.canvas.contains(pointer.event?.target || pointer.target)) {
      this.targetMarker.setVisible(false);
      return;
    }

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) {
      this.targetMarker.setVisible(false);
      return;
    }

    this.targetMarker.setPosition(
      tilePos.col * this.TS + this.TS / 2,
      tilePos.row * this.TS + this.TS / 2
    );
    this.targetMarker.setVisible(true);
  }

  /* ═══════════════════════════════════════════════════════════
     PUNCH / BUILD (Placeholder – future: send packet to Mock Server)
     ═══════════════════════════════════════════════════════════ */

  _onPunchTile(col, row) {
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockId = this.tileMap[row][col];

    if (blockId === 0) return; // can't punch air

    const blockDef = blocks[String(blockId)];
    if (!blockDef) return;

    console.log(`[Action] Punch tile (${col}, ${row}) – ${blockDef.name}`);

    /* For now: instant break (future: chip health per click) */
    this._removeTile(col, row);

    /* TODO: Send packet → Mock Server → validate → drop items */
  }

  _onBuildTile(col, row) {
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const currentId = this.tileMap[row][col];

    if (currentId !== 0) {
      console.log(`[Action] Tile occupied – cannot build`);
      return;
    }

    /* For demo: place a dirt block (itemId 1 → blockId 1) */
    const blockId = 1;
    console.log(`[Action] Build tile (${col}, ${row}) – ${blocks[String(blockId)].name}`);

    this.tileMap[row][col] = blockId;

    /* Remove old sprite if any */
    if (this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
    }

    this.blockSprites[row][col] = this._createBlockSprite(col, row, blockId);

    /* TODO: Send packet → Mock Server → validate → deduct from inventory */
  }

  _removeTile(col, row) {
    if (this.blockSprites[row] && this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
      this.blockSprites[row][col] = null;
    }
    this.tileMap[row][col] = 0;
  }

  /* ═══════════════════════════════════════════════════════════
     DEBUG UI
     ═══════════════════════════════════════════════════════════ */

  _createDebugText() {
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(999);
  }

  _updateDebugText() {
    if (!this.debugText || !this.player) return;
    this.debugText.setText([
      `Pos: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Vel: ${Math.round(this.player.body.velocity.x)}, ${Math.round(this.player.body.velocity.y)}`,
      `Accel: ${Math.round(this.player.body.acceleration.x)}, ${Math.round(this.player.body.acceleration.y)}`,
      `On ground: ${this.player.body.blocked.down}`,
      `FPS: ${Math.round(this.game.loop.actualFps)}`
    ]);
  }
}
