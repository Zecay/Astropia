/**
 * Astropia – GameScene
 * https://github.com/Zecay/Astropia
 *
 * Main gameplay scene. Handles:
 *  • World generation & rendering
 *  • Player with Growtopia-style physics (coyote time, jump buffer)
 *  • Player animations (idle/run/jump/punch with sprite flipping)
 *  • Punch fist animation
 *  • Block health tracking with crack overlays
 *  • Chebyshev/box reach for tile targeting
 *  • Green/red target marker
 *  • Particles on punch/break
 *  • Procedural sound effects via SoundManager
 *  • Screen shake on block break
 */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    /* World data */
    this.tileMap = [];
    this.blockSprites = [];
    this.blockCracks = [];   // crack image overlays per tile
    this.blockHealth = [];   // current health per tile [row][col]

    /* Player */
    this.player = null;
    this.playerFacing = 1;   // 1 = right, -1 = left
    this.currentAnim = 'idle';
    this.cursors = null;
    this.keys = {};

    /* Coyote time & jump buffer */
    this._lastGroundedTime = 0;
    this._jumpBufferTime = 0;

    /* Punch system */
    this._isPunching = false;
    this._punchCooldownTimer = 0;
    this._punchFist = null;
    this._punchFistTween = null;
    this._punchBlockTarget = null; // {col, row} being actively punched

    /* Particles pool */
    this._particles = [];

    /* Sound */
    this.sfx = null;

    /* Misc */
    this.targetMarker = null;
    this.worldContainer = null;
    this.debugText = null;

    /* Sizing shortcuts (set in create) */
    this.TS = 32;
    this.worldW = 0;
    this.worldH = 0;
  }

  create() {
    const config = this.registry.get('config');
    this.TS = config.world.tileSize;
    const W = config.world.worldWidthTiles;
    const H = config.world.worldHeightTiles;
    const groundY = config.world.groundLevel;
    const blocks = config.blocks;

    /* ─── Sound manager ─── */
    this.sfx = new SoundManager(this.game);

    /* ─── World container (for camera scrolling) ─── */
    this.worldContainer = this.add.container(0, 0);

    /* ─── Generate tile map ─── */
    this._generateTerrain(W, H, groundY, blocks);

    /* ─── Physics bounds ─── */
    const worldPixelW = W * this.TS;
    const worldPixelH = H * this.TS;
    this.worldW = worldPixelW;
    this.worldH = worldPixelH;
    this.physics.world.setBounds(0, 0, worldPixelW, worldPixelH);

    /* ─── Player ─── */
    const spawnX = config.world.spawnTileX * this.TS + this.TS / 2;
    const spawnY = (groundY - 3) * this.TS;
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle', 0);
    this.player.body.setSize(
      config.physics.playerWidth || 28,
      config.physics.playerHeight || 60
    );
    this.player.body.setOffset(2, 4);
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(10);

    /* ─── Animations ─── */
    this._createAnimations(config);

    /* ─── Colliders ─── */
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

    /* ─── Target marker ─── */
    this.targetMarker = this.add.rectangle(0, 0, this.TS, this.TS, 0xffffff, 0.25);
    this.targetMarker.setStrokeStyle(2, 0xffffff, 0.6);
    this.targetMarker.setDepth(20);
    this.targetMarker.setVisible(false);

    /* ─── Punch fist (hidden initially) ─── */
    this._punchFist = this.add.image(0, 0, 'fist');
    this._punchFist.setDepth(25);
    this._punchFist.setVisible(false);
    this._punchFist.setScale(0.75);

    /* ─── Mouse input ─── */
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown()) {
        this.sfx.resume(); // resume AudioContext on first user gesture
        this._onPunchPointer(pointer);
      } else if (pointer.rightButtonDown()) {
        this._onBuildTileFromPointer(pointer);
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (pointer.leftButtonReleased()) {
        this._onPunchRelease();
      }
    });

    /* ─── Debug text ─── */
    if (config.ui && config.ui.debugTextEnabled) {
      this._createDebugText();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     UPDATE
     ═══════════════════════════════════════════════════════════════ */

  update(time, delta) {
    if (!this.player || !this.player.active) return;

    const config = this.registry.get('config');
    const phys = config.physics;
    const dt = delta / 1000; // seconds

    /* ─── Horizontal movement ─── */
    this._handleMovement(phys);

    /* ─── Coyote time & jump buffer ─── */
    this._handleJump(time, phys);

    /* ─── Player animation ─── */
    this._updateAnimation();

    /* ─── Punch cooldown ─── */
    if (this._punchCooldownTimer > 0) {
      this._punchCooldownTimer -= delta;
    }

    /* ─── Hold-to-punch (Growtopia style) ─── */
    if (this.input.activePointer.isDown && this.input.activePointer.leftButtonDown()) {
      this._onPunchPointerHeld(this.input.activePointer);
    }

    /* ─── Target marker ─── */
    this._updateTargetMarker();

    /* ─── Debug overlay ─── */
    if (this.debugText) this._updateDebugText();
  }

  /* ═══════════════════════════════════════════════════════════════
     MOVEMENT
     ═══════════════════════════════════════════════════════════════ */

  _handleMovement(phys) {
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const onGround = this.player.body.blocked.down;
    const airCtrl = phys.airControl || 1.0;

    if (left && !right) {
      const accel = onGround ? phys.playerAccelerationX : phys.playerAccelerationX * airCtrl;
      this.player.body.setAccelerationX(-accel);
      this.player.body.setDragX(0);
      this.playerFacing = -1;
    } else if (right && !left) {
      const accel = onGround ? phys.playerAccelerationX : phys.playerAccelerationX * airCtrl;
      this.player.body.setAccelerationX(accel);
      this.player.body.setDragX(0);
      this.playerFacing = 1;
    } else {
      this.player.body.setAccelerationX(0);
      this.player.body.setDragX(phys.playerDragX);
    }

    /* Clamp speeds */
    if (Math.abs(this.player.body.velocity.x) > phys.playerMaxSpeedX) {
      this.player.body.velocity.x = Math.sign(this.player.body.velocity.x) * phys.playerMaxSpeedX;
    }
    if (Math.abs(this.player.body.velocity.y) > phys.playerMaxSpeedY) {
      this.player.body.velocity.y = Math.sign(this.player.body.velocity.y) * phys.playerMaxSpeedY;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     JUMP (coyote time + jump buffer)
     ═══════════════════════════════════════════════════════════════ */

  _handleJump(time, phys) {
    const onGround = this.player.body.blocked.down;
    const jumpPressed = this.keys.space.isDown || this.cursors.up.isDown;

    /* Track last grounded time (coyote) */
    if (onGround) {
      this._lastGroundedTime = time;
    }

    /* Jump buffer: if pressed, store the time */
    if (Phaser.Input.Keyboard.JustDown(this.keys.space) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this._jumpBufferTime = time;
    }

    /* Try to jump: within coyote window AND jump pressed/buffered */
    const coyoteWindow = phys.coyoteTimeMs || 80;
    const bufferWindow = phys.jumpBufferMs || 100;
    const withinCoyote = (time - this._lastGroundedTime) <= coyoteWindow;
    const hasJumpBuffered = (time - this._jumpBufferTime) <= bufferWindow;

    if (withinCoyote && hasJumpBuffered) {
      this.player.body.setVelocityY(phys.jumpVelocity);
      this.player.body.setAccelerationY(0);
      this._jumpBufferTime = 0; // consume buffer
      this._lastGroundedTime = 0; // prevent re-trigger
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ANIMATIONS
     ═══════════════════════════════════════════════════════════════ */

  _createAnimations(config) {
    const a = config.animation;

    this.anims.create({
      key: 'idle',
      frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: a.idleFrameCount - 1 }),
      frameRate: a.idleFrameRate,
      repeat: -1
    });

    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('player_run', { start: 0, end: a.runFrameCount - 1 }),
      frameRate: a.runFrameRate,
      repeat: -1
    });

    this.anims.create({
      key: 'jump',
      frames: this.anims.generateFrameNumbers('player_jump', { start: 0, end: a.jumpFrameCount - 1 }),
      frameRate: 1,
      repeat: 0
    });

    this.anims.create({
      key: 'punch',
      frames: this.anims.generateFrameNumbers('player_punch', { start: 0, end: a.punchFrameCount - 1 }),
      frameRate: a.punchFrameRate,
      repeat: 0
    });
  }

  _updateAnimation() {
    const onGround = this.player.body.blocked.down;
    const moving = Math.abs(this.player.body.velocity.x) > 10;

    /* Apply flip (always) */
    this.player.setFlipX(this.playerFacing === -1);

    /* If we're punching, play punch once and don't switch away until it's done */
    if (this._isPunching) {
      if (this.currentAnim !== 'punch') {
        this.currentAnim = 'punch';
        this.player.play('punch', true);
      }
      return;
    }

    /* Determine animation */
    let animKey;
    if (!onGround) {
      animKey = 'jump';
    } else if (moving) {
      animKey = 'run';
    } else {
      animKey = 'idle';
    }

    if (animKey !== this.currentAnim) {
      this.currentAnim = animKey;
      this.player.play(animKey, true);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     COLLISION SETUP
     ═══════════════════════════════════════════════════════════════ */

  _setupColliders(blocks) {
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

    this.physics.add.collider(this.player, solidGroup);
    this.physics.add.collider(this.player, platformGroup, null, (player, platform) => {
      const pb = player.body;
      const platTop = platform.body.y + 4;
      const velComp = pb.velocity.y * (1 / 60);
      return pb.blocked.down || (pb.y + pb.height - velComp <= platTop);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     TERRAIN GENERATION
     ═══════════════════════════════════════════════════════════════ */

  _generateTerrain(W, H, groundY, blocks) {
    this.tileMap = [];
    this.blockSprites = [];
    this.blockHealth = [];
    this.blockCracks = [];

    for (let row = 0; row < H; row++) {
      this.tileMap[row] = [];
      this.blockSprites[row] = [];
      this.blockHealth[row] = [];
      this.blockCracks[row] = [];

      for (let col = 0; col < W; col++) {
        let blockId = 0;

        if (row === H - 1) {
          blockId = 6; // bedrock
        } else if (row === groundY) {
          blockId = 2; // grass
        } else if (row > groundY && row < groundY + 6) {
          blockId = (col + row) % 7 === 0 ? 3 : 1;
        } else if (row >= groundY + 6 && row < groundY + 12) {
          blockId = (col + row) % 4 === 0 ? 1 : 3;
        } else if (row >= groundY + 12) {
          blockId = 3;
        }

        this.tileMap[row][col] = blockId;

        const blockDef = blocks[String(blockId)];
        this.blockHealth[row][col] = blockDef ? blockDef.health : 0;
        this.blockCracks[row][col] = null;

        const sprite = this._createBlockSprite(col, row, blockId);
        this.blockSprites[row][col] = sprite;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BLOCK SPRITE CREATION
     ═══════════════════════════════════════════════════════════════ */

  _createBlockSprite(col, row, blockId) {
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(blockId)];

    if (!blockDef || blockId === 0 || !blockDef.texture) return null;

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;
    const color = Phaser.Display.Color.HexStringToColor(blockDef.color || '#888888').color;

    const sprite = this.add.rectangle(x, y, this.TS - 1, this.TS - 1, color);
    sprite.setDepth(blockDef.foreground ? 1 : 0);
    return sprite;
  }

  /* ═══════════════════════════════════════════════════════════════
     TILE TARGETING (Chebyshev / box reach)
     ═══════════════════════════════════════════════════════════════ */

  _pointerToTile(pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(worldPoint.x / this.TS);
    const row = Math.floor(worldPoint.y / this.TS);
    const config = this.registry.get('config');
    const W = config.world.worldWidthTiles;
    const H = config.world.worldHeightTiles;

    if (col < 0 || col >= W || row < 0 || row >= H) return null;
    return { col, row };
  }

  _isTileInReach(col, row) {
    const config = this.registry.get('config');
    const reach = config.physics.playerReachTiles || 4;
    const pCol = Math.floor(this.player.x / this.TS);
    const pRow = Math.floor(this.player.y / this.TS);

    /* Chebyshev distance: max(|dx|, |dy|) */
    const dx = Math.abs(col - pCol);
    const dy = Math.abs(row - pRow);
    return Math.max(dx, dy) <= reach;
  }

  _updateTargetMarker() {
    const pointer = this.input.activePointer;
    if (!pointer || !this.targetMarker) {
      if (this.targetMarker) this.targetMarker.setVisible(false);
      return;
    }

    /* Check pointer is over canvas by testing pointer is within game bounds */
    if (pointer.x < 0 || pointer.x > this.game.config.width ||
        pointer.y < 0 || pointer.y > this.game.config.height) {
      this.targetMarker.setVisible(false);
      return;
    }

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) {
      this.targetMarker.setVisible(false);
      return;
    }

    const inReach = this._isTileInReach(tilePos.col, tilePos.row);
    const blockId = this.tileMap[tilePos.row][tilePos.col];
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(blockId)];

    /* Position */
    this.targetMarker.setPosition(
      tilePos.col * this.TS + this.TS / 2,
      tilePos.row * this.TS + this.TS / 2
    );

    if (inReach) {
      /* Can punch air too — green means "in range" */
      const isBlocked = blockId !== 0 && blockDef && blockDef.unbreakable;
      this.targetMarker.setFillStyle(isBlocked ? 0xff0000 : 0x00ff00, 0.2);
      this.targetMarker.setStrokeStyle(2, isBlocked ? 0xff0000 : 0x00ff00, 0.7);
    } else {
      this.targetMarker.setFillStyle(0xff0000, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
    }
    this.targetMarker.setVisible(true);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUNCH SYSTEM
     ═══════════════════════════════════════════════════════════════ */

  _onPunchPointer(pointer) {
    /* First click: delegates to held handler */
    this._onPunchPointerHeld(pointer);
  }

  /**
   * Called every frame while the left mouse button is held.
   * Applies cooldown so we don't punch every frame.
   */
  _onPunchPointerHeld(pointer) {
    if (this._punchCooldownTimer > 0) return;

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;

    const { col, row } = tilePos;
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockId = this.tileMap[row][col];
    const blockDef = blocks[String(blockId)];

    if (blockId === 0 || !blockDef) return;
    if (blockDef.unbreakable) return;
    if (!this._isTileInReach(col, row)) return;

    this._doPunch(col, row, blockDef);
  }

  _onPunchRelease() {
    /* When releasing left-click, reset health on the target we were punching.
       In Growtopia, if you stop punching, the block health resets. */
    if (this._punchBlockTarget) {
      const { col, row } = this._punchBlockTarget;
      const config = this.registry.get('config');
      const blocks = config.blocks;
      const blockId = this.tileMap[row][col];
      const blockDef = blocks[String(blockId)];
      if (blockDef) {
        this.blockHealth[row][col] = blockDef.health;
        this._removeCrackOverlay(col, row);
      }
      this._punchBlockTarget = null;
    }
  }

  _doPunch(col, row, blockDef) {
    const config = this.registry.get('config');

    this._isPunching = true;
    this._punchCooldownTimer = config.physics.punchCooldownMs || 350;

    /* Track punching target for health reset on release */
    this._punchBlockTarget = { col, row };

    /* ─── Fist animation ─── */
    this._showPunchFist(col, row);

    /* ─── Damage block ─── */
    this.blockHealth[row][col] = (this.blockHealth[row][col] || blockDef.health) - 1;

    /* Particles */
    this._spawnParticles(col, row, blockDef.color || '#888888', config);

    /* Sound */
    this.sfx.play('punchHit');

    /* Crack overlay update */
    this._updateCrackOverlay(col, row, blockDef);

    /* Check if broken */
    if (this.blockHealth[row][col] <= 0) {
      this._breakBlock(col, row, blockDef, config);
    }

    /* End punch animation after a short delay */
    this.time.delayedCall(200, () => {
      this._isPunching = false;
    });
  }

  _showPunchFist(col, row) {
    if (!this._punchFist) return;

    const config = this.registry.get('config');
    const fistReachTiles = config.animation.punchFistTilesReach || 1.2;
    const fistDuration = config.animation.punchFistDurationMs || 200;
    const fistRetract = config.animation.punchFistRetractMs || 100;

    /* Target world position (center of the punched tile) */
    const targetX = col * this.TS + this.TS / 2;
    const targetY = row * this.TS + this.TS / 2;

    /* Start from player's fist position */
    const startX = this.player.x + this.playerFacing * 12;
    const startY = this.player.y - 8;

    this._punchFist.setPosition(startX, startY);
    this._punchFist.setVisible(true);

    /* Kill any existing tween */
    if (this._punchFistTween) {
      this._punchFistTween.stop();
    }

    /* Extend tween */
    this._punchFistTween = this.tweens.add({
      targets: this._punchFist,
      x: targetX,
      y: targetY,
      duration: fistDuration,
      ease: 'Power2',
      yoyo: true,
      hold: 30,
      onComplete: () => {
        this._punchFist.setVisible(false);
        this._punchFistTween = null;
      }
    });
  }

  _breakBlock(col, row, blockDef, config) {
    /* Remove from tile map */
    this._removeTile(col, row);

    /* Break particles */
    this._spawnBreakParticles(col, row, blockDef.color || '#888888', config);

    /* Sound */
    this.sfx.play('punchBreak');

    /* Screen shake */
    this.cameras.main.shake(
      config.effects.screenShakeDurationMs || 100,
      config.effects.screenShakeIntensity || 2 / 1000
    );

    /* Reset punch target */
    this._punchBlockTarget = null;

    /* TODO: Drop items (Phase 3) */
  }

  /* ═══════════════════════════════════════════════════════════════
     CRACK OVERLAYS
     ═══════════════════════════════════════════════════════════════ */

  _updateCrackOverlay(col, row, blockDef) {
    const maxHp = blockDef.health;
    const curHp = this.blockHealth[row][col] || 0;
    const ratio = curHp / maxHp;

    /* Remove old crack */
    this._removeCrackOverlay(col, row);

    if (ratio <= 0) return; // just broke

    let crackKey;
    if (ratio <= 0.33) {
      crackKey = 'crack_3';
    } else if (ratio <= 0.66) {
      crackKey = 'crack_2';
    } else {
      crackKey = 'crack_1';
    }

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;
    const crack = this.add.image(x, y, crackKey);
    crack.setDepth(5);
    this.blockCracks[row][col] = crack;
  }

  _removeCrackOverlay(col, row) {
    if (this.blockCracks[row] && this.blockCracks[row][col]) {
      this.blockCracks[row][col].destroy();
      this.blockCracks[row][col] = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PARTICLES
     ═══════════════════════════════════════════════════════════════ */

  _spawnParticles(col, row, colorHexStr, config) {
    const count = config.effects.particleCount || 5;
    const speedMin = config.effects.particleSpeedMin || 30;
    const speedMax = config.effects.particleSpeedMax || 100;
    const lifetime = config.effects.particleLifetimeMs || 400;
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;
    const color = Phaser.Display.Color.HexStringToColor(colorHexStr).color;

    for (let i = 0; i < count; i++) {
      this._emitParticle(cx, cy, color, speedMin, speedMax, lifetime, false);
    }
  }

  _spawnBreakParticles(col, row, colorHexStr, config) {
    const count = config.effects.particleCountBreak || 12;
    const speedMin = config.effects.particleSpeedMin || 50;
    const speedMax = config.effects.particleSpeedMax || 150;
    const lifetime = config.effects.particleLifetimeMs || 500;
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;
    const color = Phaser.Display.Color.HexStringToColor(colorHexStr).color;

    for (let i = 0; i < count; i++) {
      this._emitParticle(cx, cy, color, speedMin, speedMax, lifetime, true);
    }
  }

  _emitParticle(x, y, color, speedMin, speedMax, lifetime, gravity) {
    const p = this.add.rectangle(x, y, 4, 4, color);
    p.setDepth(50);

    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - (gravity ? 80 : 0);

    this.tweens.add({
      targets: p,
      x: x + vx * 0.3,
      y: y + vy * 0.3 + (gravity ? 60 : 0),
      alpha: 0,
      duration: lifetime,
      ease: 'Quad.easeOut',
      onComplete: () => p.destroy()
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     BUILD / PLACE
     ═══════════════════════════════════════════════════════════════ */

  _onBuildTileFromPointer(pointer) {
    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;

    const { col, row } = tilePos;
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const currentId = this.tileMap[row][col];

    if (currentId !== 0) {
      this.sfx.play('error');
      return;
    }
    if (!this._isTileInReach(col, row)) {
      this.sfx.play('error');
      return;
    }

    /* Place a dirt block (Phase 2 will use inventory) */
    const blockId = 1;
    this.tileMap[row][col] = blockId;
    const blockDef = blocks[String(blockId)];
    this.blockHealth[row][col] = blockDef.health;

    /* Remove old sprite */
    if (this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
    }

    /* Create with placement animation */
    const sprite = this._createBlockSprite(col, row, blockId);
    this.blockSprites[row][col] = sprite;
    if (sprite) {
      sprite.setScale(0.5);
      this.tweens.add({
        targets: sprite,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Back.easeOut'
      });
    }

    this.sfx.play('place');
  }

  /* ═══════════════════════════════════════════════════════════════
     REMOVE TILE
     ═══════════════════════════════════════════════════════════════ */

  _removeTile(col, row) {
    /* Remove block sprite */
    if (this.blockSprites[row] && this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
      this.blockSprites[row][col] = null;
    }

    /* Remove crack overlay */
    this._removeCrackOverlay(col, row);

    /* Reset health */
    this.blockHealth[row][col] = 0;
    this.tileMap[row][col] = 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     DEBUG UI
     ═══════════════════════════════════════════════════════════════ */

  _createDebugText() {
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(999);
  }

  _updateDebugText() {
    if (!this.debugText || !this.player) return;
    this.debugText.setText([
      `X:${Math.round(this.player.x)} Y:${Math.round(this.player.y)}`,
      `VX:${Math.round(this.player.body.velocity.x)} VY:${Math.round(this.player.body.velocity.y)}`,
      `Grounded:${this.player.body.blocked.down} Facing:${this.playerFacing}`,
      `Anim:${this.currentAnim} Punch:${this._isPunching}`,
      `FPS:${Math.round(this.game.loop.actualFps)}`
    ]);
  }
}
