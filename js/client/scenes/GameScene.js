/**
 * Astropia – GameScene
 * https://github.com/Zecay/Astropia
 *
 * Main gameplay scene. Handles:
 *  • Flat v1 world generation (dirt/rock/lava/bedrock)
 *  • Player with Growtopia-style physics (coyote time, jump buffer, bunny-hop)
 *  • Wall-climb fix (stable grounded tracking)
 *  • Player animations (idle/run/jump/punch with sprite flipping, 1-tile tall)
 *  • Persistent static physics groups for dynamic add/remove of block bodies
 *  • Block health with per-block regen timer
 *  • Dirt/grass auto-conversion based on above-tile neighbor
 *  • Chebyshev/box reach for tile targeting (reach=3)
 *  • Smart left-click: fist-punch / wrench-stub / block-place / seed-stub
 *  • Right-click does nothing (matches Growtopia)
 *  • Item entities with physics, bob/spin, magnet, collect, no despawn
 *  • Drops: blocks, seeds (3 types), gems (direct-to-counter)
 *  • Lava damage (respawn on touch)
 *  • Void respawn
 *  • Landing thud + dust particles
 *  • Lava pulse animation
 *  • Camera flicker fix (disposable clone for break animation)
 *  • Procedural sound effects via SoundManager
 *  • Screen shake on block break
 *  • Camera deadzone
 */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    /* ─── World data ─── */
    this.tileMap = [];
    this.blockSprites = [];
    this.blockCracks = [];
    this.blockHealth = [];

    /* ─── Physics groups (persistent for dynamic add/remove) ─── */
    this.solidGroup = null;
    this.platformGroup = null;
    this.itemGroup = null;

    /* ─── Block damage tracking (regen-based) ─── */
    this._blockDamage = new Map(); // key: "col,row" → { hp, lastHitAt }

    /* ─── Player ─── */
    this.player = null;
    this.playerFacing = 1;
    this.currentAnim = 'idle';
    this.cursors = null;
    this.keys = {};

    /* ─── Jump / coyote / buffer / wall-climb fix ─── */
    this._lastGroundedTime = 0;
    this._jumpBufferTime = 0;
    this._prevJumpHeld = false;
    this._stableGrounded = false;
    this._canJump = false;
    this._wasGrounded = false;

    /* ─── Landing ─── */
    this._wasAirborne = false;

    /* ─── Punch system ─── */
    this._isPunching = false;
    this._punchCooldownTimer = 0;
    this._lastPunchAt = 0;
    this._punchFist = null;
    this._punchFistTween = null;

    /* ─── Build preview ghost ─── */
    this._buildGhost = null;

    /* ─── Sound ─── */
    this.sfx = null;

    /* ─── Misc ─── */
    this.targetMarker = null;
    this.worldContainer = null;
    this.debugText = null;

    /* Sizing */
    this.TS = 32;
    this.worldW = 0;
    this.worldH = 0;
    this.worldPixelW = 0;
    this.worldPixelH = 0;

    /* Inventory ref */
    this.inv = null;
  }

  create() {
    const config = this.registry.get('config');
    this.TS = config.world.tileSize;
    const W = config.world.worldWidthTiles;
    const H = config.world.worldHeightTiles;
    const groundY = config.world.groundLevel;
    const blocks = config.blocks;

    /* ─── Sound ─── */
    this.sfx = new SoundManager(this.game);
    this.registry.set('sfx', this.sfx);

    /* ─── World container ─── */
    this.worldContainer = this.add.container(0, 0);

    /* ─── Generate flat v1 terrain ─── */
    this._generateTerrain(W, H, groundY, blocks);

    /* ─── Physics bounds ─── */
    this.worldPixelW = W * this.TS;
    this.worldPixelH = H * this.TS;
    this.worldW = this.worldPixelW;
    this.worldH = this.worldPixelH;
    this.physics.world.setBounds(0, 0, this.worldPixelW, this.worldPixelH);

    /* ─── Player (1 tile tall: 24x32 sprite) ─── */
    const playerW = Math.round(config.physics.playerWidthTiles * this.TS); // 24
    const playerH = Math.round(config.physics.playerHeightTiles * this.TS); // 32
    const spawnXTiles = config.world.spawnTileX;
    const spawnAboveGround = config.world.spawnAboveGroundTiles || 3;
    const spawnX = spawnXTiles * this.TS + this.TS / 2;
    const spawnY = (groundY - spawnAboveGround) * this.TS;

    this.spawnX = spawnX;
    this.spawnY = spawnY;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle', 0);
    this.player.body.setSize(playerW - 4, playerH - 2);
    this.player.body.setOffset(2, 0);
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(10);

    /* ─── Animations ─── */
    this._createAnimations(config);

    /* ─── Create physics groups ─── */
    this.solidGroup = this.physics.add.staticGroup();
    this.platformGroup = this.physics.add.staticGroup();
    this.itemGroup = this.physics.add.group();

    /* Add existing world blocks to groups */
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const blockId = this.tileMap[row][col];
        const blockDef = blocks[String(blockId)];
        if (!blockDef || blockId === 0) continue;
        const sprite = this.blockSprites[row][col];
        if (!sprite || !sprite.active) continue;

        if (blockDef.solid && blockDef.foreground) {
          this.solidGroup.add(sprite);
          sprite.refreshBody();
        } else if (blockDef.platform) {
          this.platformGroup.add(sprite);
          sprite.body.setSize(this.TS - 4, 6);
          sprite.body.setOffset(2, 0);
          sprite.refreshBody();
        }
      }
    }

    /* Register colliders */
    this.physics.add.collider(this.player, this.solidGroup);
    this.physics.add.collider(this.player, this.platformGroup);
    this.physics.add.collider(this.itemGroup, this.solidGroup);

    /* Item-player overlap for collection */
    this.physics.add.overlap(
      this.player,
      this.itemGroup,
      this._onItemCollect,
      null,
      this
    );

    /* ─── Camera ─── */
    this.cameras.main.setBounds(0, 0, this.worldPixelW, this.worldPixelH);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(
      config.world.cameraDeadzoneWidth || 160,
      config.world.cameraDeadzoneHeight || 60
    );
    this.cameras.main.setBackgroundColor(
      Phaser.Display.Color.HexStringToColor(config.world.backgroundColor).color
    );

    /* ─── Input ─── */
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keys.w = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keys.a = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.d = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    /* ─── Target marker ─── */
    this.targetMarker = this.add.rectangle(0, 0, this.TS, this.TS, 0xffffff, 0.25);
    this.targetMarker.setStrokeStyle(2, 0xffffff, 0.6);
    this.targetMarker.setDepth(20);
    this.targetMarker.setVisible(false);

    /* ─── Build ghost preview (image for texture support) ─── */
    this._buildGhost = this.add.image(0, 0, 'block_dirt');
    this._buildGhost.setDisplaySize(this.TS - 2, this.TS - 2);
    this._buildGhost.setAlpha(0.4);
    this._buildGhost.setDepth(19);
    this._buildGhost.setVisible(false);

    /* ─── Punch fist ─── */
    this._punchFist = this.add.image(0, 0, 'fist');
    this._punchFist.setDepth(25);
    this._punchFist.setVisible(false);
    this._punchFist.setScale(0.7);

    /* ─── Inventory ─── */
    this.inv = new PlayerInventory(config, this.registry);
    this.inv.giveStartingItems(config.inventory.startingItems);
    this.registry.set('inventory', this.inv);

    /* ─── Launch UIScene ─── */
    this.scene.launch('UIScene');

    /* ─── Mouse input: left-click smart action ─── */
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown()) {
        this.sfx.resume();
        this._onSmartClick(pointer);
      }
      /* Right-click does nothing */
    });

    /* Redundant context menu prevention */
    this.input.mouse.disableContextMenu();

    /* ─── Start lava pulse animation ─── */
    this._startLavaAnimation(config);

    /* ─── Debug ─── */
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

    /* ─── Movement ─── */
    this._handleMovement(phys);

    /* ─── Jump (coyote + buffer, wall-climb fixed) ─── */
    this._handleJump(time, phys);

    /* ─── Animation ─── */
    this._updateAnimation();

    /* ─── Landing check ─── */
    this._checkLanding(phys);

    /* ─── Punch cooldown ─── */
    if (this._punchCooldownTimer > 0) {
      this._punchCooldownTimer -= delta;
    }

    /* ─── Hold-to-punch (only if fist selected) ─── */
    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };
    if (sel.kind === 'fist' && this.input.activePointer.isDown && this.input.activePointer.leftButtonDown()) {
      this._onPunchPointerHeld(this.input.activePointer);
    }

    /* ─── Block damage regen check ─── */
    this._checkBlockRegen(time, config);

    /* ─── Target marker & ghost ─── */
    this._updateTargetMarker();

    /* ─── Lava damage ─── */
    this._checkLavaDamage();

    /* ─── Void check ─── */
    if (this.player.y > this.worldPixelH + 32) {
      this._respawnPlayer();
    }

    /* ─── Item magnet ─── */
    this._updateItemMagnet();

    /* ─── Debug ─── */
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

    if (Math.abs(this.player.body.velocity.x) > phys.playerMaxSpeedX) {
      this.player.body.velocity.x = Math.sign(this.player.body.velocity.x) * phys.playerMaxSpeedX;
    }
    if (Math.abs(this.player.body.velocity.y) > phys.playerMaxSpeedY) {
      this.player.body.velocity.y = Math.sign(this.player.body.velocity.y) * phys.playerMaxSpeedY;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     JUMP (wall-climb fix — stable grounded tracking)
     ═══════════════════════════════════════════════════════════════ */

  _handleJump(time, phys) {
    const body = this.player.body;
    const blocked = body.blocked;
    const onGround = blocked.down && !blocked.left && !blocked.right && body.velocity.y >= 0;

    /* Stable grounded: was grounded last frame OR just landed */
    if (onGround && (this._wasGrounded || body.velocity.y >= -10)) {
      this._stableGrounded = true;
      this._canJump = true;
      this._lastGroundedTime = time;
    } else if (!onGround) {
      this._stableGrounded = false;
    }

    this._wasGrounded = onGround;

    /* Jump input: Space, W, Up arrow */
    const jumpDown = this.keys.space.isDown || this.cursors.up.isDown || this.keys.w.isDown;

    /* Track buffer */
    const justPressed = jumpDown && !this._prevJumpHeld;
    if (justPressed) {
      this._jumpBufferTime = time;
    }
    this._prevJumpHeld = jumpDown;

    /* Execute jump */
    const coyoteWindow = phys.coyoteTimeMs || 80;
    const bufferWindow = phys.jumpBufferMs || 100;
    const withinCoyote = (time - this._lastGroundedTime) <= coyoteWindow && this._canJump;
    const hasBuffered = (time - this._jumpBufferTime) <= bufferWindow;

    if (withinCoyote && hasBuffered) {
      body.setVelocityY(0);
      body.setVelocityY(phys.jumpVelocity);
      body.setAccelerationY(0);
      this._canJump = false;
      this._jumpBufferTime = 0;
      this._lastGroundedTime = 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     LANDING
     ═══════════════════════════════════════════════════════════════ */

  _checkLanding(phys) {
    const onGround = this.player.body.blocked.down;
    const vy = this.player.body.velocity.y;

    if (onGround && this._wasAirborne && vy >= -10) {
      /* Just landed — check if fast enough for thud */
      if (Math.abs(this.player.body.velocity.y) > 200) {
        this.sfx.play('land');
        /* Dust particles at feet */
        this._spawnLandingDust();
      }
    }
    this._wasAirborne = !onGround;
  }

  _spawnLandingDust() {
    const config = this.registry.get('config');
    const count = config.effects.landingDustCount || 3;
    const px = this.player.x;
    const py = this.player.y + this.player.height / 2;

    for (let i = 0; i < count; i++) {
      const p = this.add.rectangle(
        px + (Math.random() - 0.5) * 10,
        py,
        3, 3, 0x999999
      );
      p.setDepth(50);
      this.tweens.add({
        targets: p,
        alpha: 0,
        y: py - 15 - Math.random() * 10,
        x: p.x + (Math.random() - 0.5) * 20,
        duration: 200 + Math.random() * 100,
        onComplete: () => p.destroy()
      });
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
      frameRate: a.idleFrameRate, repeat: -1
    });
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('player_run', { start: 0, end: a.runFrameCount - 1 }),
      frameRate: a.runFrameRate, repeat: -1
    });
    this.anims.create({
      key: 'jump',
      frames: this.anims.generateFrameNumbers('player_jump', { start: 0, end: 0 }),
      frameRate: 1, repeat: 0
    });
    this.anims.create({
      key: 'punch',
      frames: this.anims.generateFrameNumbers('player_punch', { start: 0, end: a.punchFrameCount - 1 }),
      frameRate: a.punchFrameRate, repeat: 0
    });
  }

  _updateAnimation() {
    const onGround = this.player.body.blocked.down;
    const moving = Math.abs(this.player.body.velocity.x) > 10;
    this.player.setFlipX(this.playerFacing === -1);

    if (this._isPunching) {
      if (this.currentAnim !== 'punch') {
        this.currentAnim = 'punch';
        this.player.play('punch', true);
      }
      return;
    }

    let key;
    if (!onGround) key = 'jump';
    else if (moving) key = 'run';
    else key = 'idle';

    if (key !== this.currentAnim) {
      this.currentAnim = key;
      this.player.play(key, true);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TERRAIN GENERATION — FLAT v1
     ═══════════════════════════════════════════════════════════════ */

  _generateTerrain(W, H, groundY, blocks) {
    this.tileMap = [];
    this.blockSprites = [];
    this.blockHealth = [];
    this.blockCracks = [];

    const bedrockRows = this.registry.get('config').world.bedrockRows || 6;
    const dirtLayerRows = this.registry.get('config').world.dirtLayerRows || 4;
    const rockChance = this.registry.get('config').world.rockChance || 0.05;

    for (let row = 0; row < H; row++) {
      this.tileMap[row] = [];
      this.blockSprites[row] = [];
      this.blockHealth[row] = [];
      this.blockCracks[row] = [];

      for (let col = 0; col < W; col++) {
        let blockId = 0;

        if (row >= H - bedrockRows) {
          /* Bedrock: bottom 6 rows */
          blockId = 6;
        } else if (row === groundY) {
          /* Surface: dirt with grass */
          blockId = 1;
        } else if (row > groundY && row < groundY + dirtLayerRows) {
          /* Pure dirt for 3 more rows below surface */
          blockId = 1;
        } else if (row >= groundY + dirtLayerRows) {
          /* Mixed layer: dirt + rock + lava */
          const bedrockTop = H - bedrockRows; // first bedrock row
          const rowsAboveBedrock = bedrockTop - 1 - row;

          /* Lava chance: 60% at 0 rows above bedrock, decreasing linearly to 0% at 6+ */
          let lavaChance = 0;
          if (rowsAboveBedrock < 6) {
            lavaChance = 0.6 - 0.12 * rowsAboveBedrock;
            if (lavaChance < 0) lavaChance = 0;
          }

          if (Math.random() < lavaChance) {
            blockId = 9; // lava
          } else if (Math.random() < rockChance) {
            blockId = 3; // rock
          } else {
            blockId = 1; // dirt
          }
        }

        this.tileMap[row][col] = blockId;
        const blockDef = blocks[String(blockId)];
        this.blockHealth[row][col] = blockDef ? blockDef.health : 0;
        this.blockCracks[row][col] = null;

        this.blockSprites[row][col] = this._createBlockSprite(col, row, blockId);
      }
    }

    /* Post-process: run grass-topping on all dirt tiles */
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        if (this.tileMap[row][col] === 1) {
          this._refreshDirtVisual(col, row);
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BLOCK SPRITE CREATION (uses Image with textures, not rectangles)
     ═══════════════════════════════════════════════════════════════ */

  _createBlockSprite(col, row, blockId, useGrass) {
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(blockId)];
    if (!blockDef || blockId === 0 || !blockDef.texture) return null;

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;

    let texKey = blockDef.texture;
    /* For dirt (id=1), choose grass or plain texture */
    if (Number(blockId) === 1) {
      texKey = useGrass ? 'block_grass' : 'block_dirt';
    }

    /* Use image instead of rectangle for proper texture support */
    const sprite = this.add.image(x, y, texKey);
    sprite.setDisplaySize(this.TS, this.TS);
    sprite.setDepth(blockDef.foreground ? 1 : 0);

    /* For lava spritesheet, start at frame 0 */
    if (Number(blockId) === 9 && this.textures.exists('block_lava')) {
      /* Lava is a spritesheet — set frame 0 */
      sprite.setTexture('block_lava', 0);
    }

    return sprite;
  }

  /**
   * Refresh a dirt block's visual based on the tile above it.
   * Uses setTexture instead of setFillStyle.
   */
  _refreshDirtVisual(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    const aboveId = (row > 0) ? this.tileMap[row - 1][col] : 0;
    const config = this.registry.get('config');
    const aboveDef = config.blocks[String(aboveId)];

    const airAbove = aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);

    /* Use setTexture instead of setFillStyle */
    if (airAbove && this.textures.exists('block_grass')) {
      sprite.setTexture('block_grass');
      sprite.setDisplaySize(this.TS, this.TS);
    } else if (this.textures.exists('block_dirt')) {
      sprite.setTexture('block_dirt');
      sprite.setDisplaySize(this.TS, this.TS);
    }
  }

  _updateNeighborDirt(col, row) {
    if (row + 1 < this.tileMap.length && this.tileMap[row + 1][col] === 1) {
      this._refreshDirtVisual(col, row + 1);
    }
    if (this.tileMap[row][col] === 1) {
      this._refreshDirtVisual(col, row);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     COLLISION HELPERS (dynamic add/remove)
     ═══════════════════════════════════════════════════════════════ */

  _addBlockToPhysics(col, row, blockId) {
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    if (!blockDef) return;

    const sprite = this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    if (blockDef.solid && blockDef.foreground) {
      this.solidGroup.add(sprite);
      sprite.body.setSize(this.TS - 2, this.TS - 2);
      sprite.body.setOffset(1, 1);
      sprite.refreshBody();
    } else if (blockDef.platform) {
      this.platformGroup.add(sprite);
      sprite.body.setSize(this.TS - 4, 6);
      sprite.body.setOffset(2, 0);
      sprite.refreshBody();
    }
  }

  /**
   * Remove sprite from physics groups, destroy body, null out ref.
   * Does NOT destroy the sprite — caller decides.
   */
  _removeBlockFromPhysics(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    if (this.solidGroup.contains(sprite)) {
      this.solidGroup.remove(sprite, false, false);
    } else if (this.platformGroup.contains(sprite)) {
      this.platformGroup.remove(sprite, false, false);
    }

    /* Destroy the physics body */
    if (sprite.body) {
      sprite.body.destroy();
    }

    this.blockSprites[row][col] = null;
  }

  /* ═══════════════════════════════════════════════════════════════
     TILE TARGETING (Chebyshev, reach=3)
     ═══════════════════════════════════════════════════════════════ */

  _pointerToTile(pointer) {
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(wp.x / this.TS);
    const row = Math.floor(wp.y / this.TS);
    const config = this.registry.get('config');
    if (col < 0 || col >= config.world.worldWidthTiles ||
        row < 0 || row >= config.world.worldHeightTiles) return null;
    return { col, row };
  }

  _isTileInReach(col, row) {
    const config = this.registry.get('config');
    const reach = config.physics.playerReachTiles || 3;
    const pCol = Math.floor(this.player.x / this.TS);
    const pRow = Math.floor(this.player.y / this.TS);
    return Math.max(Math.abs(col - pCol), Math.abs(row - pRow)) <= reach;
  }

  _doesTileOverlapPlayer(col, row) {
    const tileLeft = col * this.TS;
    const tileRight = tileLeft + this.TS;
    const tileTop = row * this.TS;
    const tileBottom = tileTop + this.TS;

    const pb = this.player.body;
    const pLeft = pb.x;
    const pRight = pb.x + pb.width;
    const pTop = pb.y;
    const pBottom = pb.y + pb.height;

    return tileLeft < pRight && tileRight > pLeft && tileTop < pBottom && tileBottom > pTop;
  }

  _updateTargetMarker() {
    const pointer = this.input.activePointer;
    if (!pointer || !this.targetMarker) {
      if (this.targetMarker) this.targetMarker.setVisible(false);
      return;
    }

    if (pointer.x < 0 || pointer.x > this.game.config.width ||
        pointer.y < 0 || pointer.y > this.game.config.height) {
      this.targetMarker.setVisible(false);
      if (this._buildGhost) this._buildGhost.setVisible(false);
      return;
    }

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) {
      this.targetMarker.setVisible(false);
      if (this._buildGhost) this._buildGhost.setVisible(false);
      return;
    }

    const { col, row } = tilePos;
    const inReach = this._isTileInReach(col, row);
    const blockId = this.tileMap[row][col];
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(blockId)];
    const isAir = blockId === 0;
    const isUnbreakable = blockDef && blockDef.unbreakable;
    const overlapsPlayer = this._doesTileOverlapPlayer(col, row);

    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;

    this.targetMarker.setPosition(cx, cy);

    /* Get selected item to determine mode */
    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };
    const isFist = sel.kind === 'fist';
    const isWrench = sel.kind === 'wrench';
    const isBlock = sel.kind === 'block';
    const isSeed = sel.kind === 'seed';

    /* Default: hide ghost */
    if (this._buildGhost) this._buildGhost.setVisible(false);

    if (!inReach) {
      this.targetMarker.setFillStyle(0xff0000, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
    } else if (isFist) {
      /* Fist mode: green on breakable, red on unbreakable/air */
      if (isAir) {
        this.targetMarker.setFillStyle(0xff0000, 0.1);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.3);
      } else if (isUnbreakable) {
        this.targetMarker.setFillStyle(0xff0000, 0.2);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.6);
      } else {
        this.targetMarker.setFillStyle(0x00ff00, 0.2);
        this.targetMarker.setStrokeStyle(2, 0x00ff00, 0.7);
      }
    } else if (isWrench) {
      /* Wrench: blue marker */
      this.targetMarker.setFillStyle(0x4488ff, 0.2);
      this.targetMarker.setStrokeStyle(2, 0x4488ff, 0.6);
    } else if (isBlock) {
      /* Block placing: ghost if air and placeable */
      if (isAir && !overlapsPlayer) {
        this.targetMarker.setFillStyle(0x00ff00, 0.15);
        this.targetMarker.setStrokeStyle(2, 0x00ff00, 0.7);
        if (this._buildGhost) {
          this._buildGhost.setPosition(cx, cy);
          /* Try to show the block's texture as ghost */
          const blockItemDef = sel.itemDef;
          if (blockItemDef && blockItemDef.blockId) {
            const targetBlockDef = blocks[String(blockItemDef.blockId)];
            if (targetBlockDef && targetBlockDef.texture && this.textures.exists(targetBlockDef.texture)) {
              this._buildGhost.setTexture(targetBlockDef.texture);
              this._buildGhost.setDisplaySize(this.TS - 2, this.TS - 2);
              this._buildGhost.setAlpha(0.4);
            }
          }
          this._buildGhost.setVisible(true);
        }
      } else if (isAir && overlapsPlayer) {
        this.targetMarker.setFillStyle(0xff0000, 0.15);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.5);
      } else {
        this.targetMarker.setFillStyle(0xff0000, 0.1);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.3);
      }
    } else if (isSeed) {
      /* Seed: no ghost, dim marker */
      this.targetMarker.setFillStyle(0xffaa00, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xffaa00, 0.4);
    }

    this.targetMarker.setVisible(true);
  }

  /* ═══════════════════════════════════════════════════════════════
     SMART LEFT-CLICK
     ═══════════════════════════════════════════════════════════════ */

  _onSmartClick(pointer) {
    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };

    switch (sel.kind) {
      case 'fist':
        this._onPunchPointerHeld(pointer);
        break;
      case 'wrench':
        this._onWrenchClick(pointer);
        break;
      case 'block':
        this._onBlockPlace(pointer);
        break;
      case 'seed':
        /* Seeds: stub for now */
        this.sfx.play('error');
        break;
      default:
        this.sfx.play('error');
        break;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     WRENCH CLICK
     ═══════════════════════════════════════════════════════════════ */

  _onWrenchClick(pointer) {
    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;
    const { col, row } = tilePos;
    if (!this._isTileInReach(col, row)) return;

    const blockId = this.tileMap[row][col];
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    const name = (blockDef && blockDef.name) ? blockDef.name : 'Air';

    this.sfx.play('wrench');
    console.log(`[Astropia] Wrench: tile (${col},${row}) = ${name} (id=${blockId})`);

    /* Show a debug text briefly */
    if (this.debugText) {
      const orig = this.debugText.text;
      this.debugText.setText(`Wrench: ${name}`);
      this.time.delayedCall(1500, () => {
        if (this.debugText) this._updateDebugText();
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BLOCK PLACE
     ═══════════════════════════════════════════════════════════════ */

  _onBlockPlace(pointer) {
    const sel = this.inv.getSelectedItem();
    if (!sel.itemDef || !sel.itemDef.blockId) return;

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;
    const { col, row } = tilePos;

    const currentId = this.tileMap[row][col];
    if (currentId !== 0) {
      this.sfx.play('error');
      return;
    }
    if (!this._isTileInReach(col, row)) {
      this.sfx.play('error');
      return;
    }
    if (this._doesTileOverlapPlayer(col, row)) {
      this.sfx.play('error');
      return;
    }

    const blockId = sel.itemDef.blockId;
    const config = this.registry.get('config');
    const blocks = config.blocks;

    /* Place the block */
    this._placeBlock(col, row, blockId, config, blocks);

    /* Remove one from inventory */
    const slotIdx = this.inv.getSelectedSlot();
    this.inv.removeItem(slotIdx, 1);
  }

  _placeBlock(col, row, blockId, config, blocks) {
    const blockDef = blocks[String(blockId)];
    if (!blockDef) return;

    this.tileMap[row][col] = blockId;
    this.blockHealth[row][col] = blockDef.health;

    if (this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
    }

    let useGrass = false;
    if (Number(blockId) === 1) {
      const aboveId = (row > 0) ? this.tileMap[row - 1][col] : 0;
      const aboveDef = config.blocks[String(aboveId)];
      useGrass = aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);
    }

    const sprite = this._createBlockSprite(col, row, blockId, useGrass);
    this.blockSprites[row][col] = sprite;
    if (sprite) {
      sprite.setScale(0.6);
      this.tweens.add({
        targets: sprite,
        scaleX: 1, scaleY: 1,
        duration: 120,
        ease: 'Back.easeOut'
      });
      this._addBlockToPhysics(col, row, blockId);
    }

    this.sfx.play('place');

    if (row > 0) this._updateNeighborDirt(col, row);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUNCH SYSTEM
     ═══════════════════════════════════════════════════════════════ */

  _onPunchPointerHeld(pointer) {
    if (this._punchCooldownTimer > 0) return;

    const now = this.time.now;
    /* Wall-time double-fire prevention */
    if (this._lastPunchAt && (now - this._lastPunchAt) < 50) return;

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
    this._lastPunchAt = now;
  }

  _doPunch(col, row, blockDef) {
    const config = this.registry.get('config');
    const now = this.time.now;
    const regenMs = blockDef.regenMs || 5000;
    const key = `${col},${row}`;

    let dmgEntry = this._blockDamage.get(key);
    if (!dmgEntry || (now - dmgEntry.lastHitAt) > regenMs) {
      dmgEntry = { hp: blockDef.health - 1, lastHitAt: now };
      this._blockDamage.set(key, dmgEntry);
    } else {
      dmgEntry.hp -= 1;
      dmgEntry.lastHitAt = now;
    }

    this.blockHealth[row][col] = dmgEntry.hp;

    /* ─── Visual effects ─── */
    this._isPunching = true;
    this._punchCooldownTimer = config.physics.punchCooldownMs || 350;
    this._showPunchFist(col, row);
    this._spawnParticles(col, row, blockDef.color || '#888888', config);
    this.sfx.play('punchHit');
    this._updateCrackOverlay(col, row, blockDef);

    /* ─── Check if broken ─── */
    if (dmgEntry.hp <= 0) {
      this._breakBlock(col, row, blockDef, config);
      this._blockDamage.delete(key);
    }

    this.time.delayedCall(200, () => {
      this._isPunching = false;
    });
  }

  _checkBlockRegen(now, config) {
    const expired = [];
    for (const [key, entry] of this._blockDamage) {
      const [colS, rowS] = key.split(',');
      const col = parseInt(colS);
      const row = parseInt(rowS);
      const blockId = this.tileMap[row] && this.tileMap[row][col];
      if (blockId === undefined) {
        expired.push(key);
        continue;
      }
      const blockDef = config.blocks[String(blockId)];
      if (!blockDef) {
        expired.push(key);
        continue;
      }
      const regenMs = blockDef.regenMs || 5000;
      if (now - entry.lastHitAt > regenMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this._blockDamage.delete(key);
      const [colS, rowS] = key.split(',');
      const col = parseInt(colS);
      const row = parseInt(rowS);
      const blockId = this.tileMap[row] && this.tileMap[row][col];
      if (blockId === undefined) continue;
      const blockDef = config.blocks[String(blockId)];
      if (blockDef) {
        this.blockHealth[row][col] = blockDef.health;
        this._fadeOutCrackOverlay(col, row);
      }
    }
  }

  _showPunchFist(col, row) {
    if (!this._punchFist) return;

    const config = this.registry.get('config');
    const fistDuration = config.animation.punchFistDurationMs || 200;

    const targetX = col * this.TS + this.TS / 2;
    const targetY = row * this.TS + this.TS / 2;
    const startX = this.player.x + this.playerFacing * 10;
    const startY = this.player.y - 4;

    this._punchFist.setPosition(startX, startY);
    this._punchFist.setVisible(true);

    if (this._punchFistTween) this._punchFistTween.stop();

    this._punchFistTween = this.tweens.add({
      targets: this._punchFist,
      x: targetX, y: targetY,
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

  /* ═══════════════════════════════════════════════════════════════
     BREAK BLOCK (camera flicker fix + drops)
     ═══════════════════════════════════════════════════════════════ */

  _breakBlock(col, row, blockDef, config) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    const blockId = this.tileMap[row][col];
    let sx, sy, color;
    if (sprite && sprite.active) {
      sx = sprite.x;
      sy = sprite.y;
      color = blockDef.color || '#888888';

      /* Immediately remove from physics BEFORE the tween */
      this._removeBlockFromPhysics(col, row);

      /* Update world state immediately */
      this.tileMap[row][col] = 0;
      this.blockHealth[row][col] = 0;
      this._blockDamage.delete(`${col},${row}`);

      /* Destroy original sprite (body already gone) */
      sprite.destroy();

      /* Create disposable non-physics clone for fade animation */
      const clone = this.add.rectangle(sx, sy, this.TS - 1, this.TS - 1,
        Phaser.Display.Color.HexStringToColor(color).color);
      clone.setDepth(1);
      this.tweens.add({
        targets: clone,
        alpha: 0,
        scaleX: 0.8,
        scaleY: 0.8,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => clone.destroy()
      });
    } else {
      /* No sprite, just update state */
      this.tileMap[row][col] = 0;
      this.blockHealth[row][col] = 0;
      sx = col * this.TS + this.TS / 2;
      sy = row * this.TS + this.TS / 2;
      color = blockDef.color || '#888888';
    }

    /* Remove crack overlay */
    this._removeCrackOverlay(col, row);

    /* ─── SPAWN DROPS ─── */
    this._spawnBlockDrops(col, row, blockDef, config);

    /* ─── Effects ─── */
    this._spawnBreakParticles(col, row, color, config);
    this.sfx.play('punchBreak');
    this.cameras.main.shake(
      config.effects.screenShakeDurationMs || 100,
      config.effects.screenShakeIntensity || 0.002
    );

    /* Neighbor grass update */
    this._updateNeighborDirt(col, row);
  }

  /* ═══════════════════════════════════════════════════════════════
     DROPS
     ═══════════════════════════════════════════════════════════════ */

  _spawnBlockDrops(col, row, blockDef, config) {
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;

    /* 1. Guaranteed block drop */
    if (blockDef.drop) {
      this._spawnItemEntity(cx, cy, blockDef.drop.itemId, blockDef.drop.count || 1);
    }

    /* 2. Seed drop */
    if (blockDef.seedDrop) {
      const seedChance = blockDef.seedDrop.chance || 0;
      if (Math.random() < seedChance) {
        this._spawnItemEntity(cx, cy, blockDef.seedDrop.itemId, blockDef.seedDrop.count || 1);
      }
    }

    /* 3. Gem drop (direct to counter) */
    if (blockDef.gemDrops && Array.isArray(blockDef.gemDrops)) {
      for (const gemDrop of blockDef.gemDrops) {
        if (Math.random() < (gemDrop.chance || 0)) {
          const gemCount = gemDrop.count || 1;
          this.inv.addGems(gemCount);
          /* Floating "+N 💎" text */
          this._showFloatingText(cx, cy, `+${gemCount} 💎`, '#00ffcc');
          break; // Only one gem drop type
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ITEM ENTITIES
     ═══════════════════════════════════════════════════════════════ */

  _spawnItemEntity(x, y, itemId, count) {
    const config = this.registry.get('config');
    const itemDef = config.items[String(itemId)];
    if (!itemDef) return;

    const dropCfg = config.itemsDrop;

    /* Create sprite */
    const texKey = itemDef.texture;
    if (!texKey || !this.textures.exists(texKey)) return;

    const item = this.physics.add.image(x, y, texKey);
    item.setDisplaySize(24, 24);
    item.setDepth(8);
    item.setData('itemId', itemId);
    item.setData('count', count);
    item.setData('itemName', itemDef.name);

    /* Circular physics body */
    item.body.setCircle(8);
    item.body.setOffset(4, 4);

    /* Initial bounce */
    item.body.setVelocity(
      (Math.random() - 0.5) * 160,
      dropCfg.bounceUpVelocity || -200
    );
    item.body.setBounce(0.2);
    item.body.setGravityY(config.physics.gravity);

    /* Track in-air for spin */
    item.setData('landed', false);
    item.setData('bobTween', null);

    this.itemGroup.add(item);
  }

  _onItemCollect(player, item) {
    const itemId = item.getData('itemId');
    const count = item.getData('count') || 1;
    const itemName = item.getData('itemName') || 'Item';

    /* Try to add to inventory */
    const unadded = this.inv.addItem(itemId, count);

    /* Show floating +N text */
    const collectedCount = count - unadded;
    if (collectedCount > 0) {
      this._showFloatingText(item.x, item.y, `+${collectedCount} ${itemName}`, '#ffffff');
      this.sfx.play('collect');
    }

    /* Clean up item entity */
    if (item.getData('bobTween')) {
      item.getData('bobTween').stop();
    }
    item.destroy();
  }

  _updateItemMagnet() {
    const config = this.registry.get('config');
    const magnetRange = config.itemsDrop.magnetRangePx || 80;
    const magnetSpeed = config.itemsDrop.magnetSpeed || 200;
    const px = this.player.x;
    const py = this.player.y;

    const children = this.itemGroup.getChildren();
    for (const item of children) {
      if (!item.active) continue;

      /* When landed, disable gravity and start bob */
      if (item.body.blocked.down && !item.getData('landed')) {
        item.setData('landed', true);
        item.body.setGravityY(0);
        item.body.setVelocity(0, 0);
        /* Stop spinning */
        item.body.setAngularVelocity(0);
        /* Start bob */
        const bobTween = this.tweens.add({
          targets: item,
          y: item.y - (config.itemsDrop.bobAmplitude || 2),
          duration: config.itemsDrop.bobDurationMs || 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        item.setData('bobTween', bobTween);
      }

      /* Spin while in air */
      if (!item.getData('landed')) {
        item.body.setAngularVelocity(config.itemsDrop.spinSpeed || 0.5);
      }

      /* Magnet: pull toward player if within range */
      const dx = px - item.x;
      const dy = py - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < magnetRange && dist > 0) {
        /* Disable gravity and bob while being pulled */
        if (item.getData('landed')) {
          item.setData('landed', false);
          if (item.getData('bobTween')) {
            item.getData('bobTween').stop();
            item.setData('bobTween', null);
          }
        }
        item.body.setGravityY(0);
        item.body.setVelocity(
          (dx / dist) * magnetSpeed,
          (dy / dist) * magnetSpeed
        );
      }
    }
  }

  _showFloatingText(wx, wy, text, color) {
    const config = this.registry.get('config');
    const ft = this.add.text(wx, wy, text, {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: color || '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(60);

    this.tweens.add({
      targets: ft,
      y: wy - (config.ui.floatingTextRisePx || 40),
      alpha: 0,
      duration: config.ui.floatingTextDurationMs || 800,
      ease: 'Quad.easeOut',
      onComplete: () => ft.destroy()
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     LAVA DAMAGE & RESPAWN
     ═══════════════════════════════════════════════════════════════ */

  _checkLavaDamage() {
    const config = this.registry.get('config');
    const pb = this.player.body;
    const pLeft = Math.floor(pb.x / this.TS);
    const pRight = Math.floor((pb.x + pb.width) / this.TS);
    const pTop = Math.floor(pb.y / this.TS);
    const pBottom = Math.floor((pb.y + pb.height) / this.TS);

    for (let row = pTop; row <= pBottom; row++) {
      for (let col = pLeft; col <= pRight; col++) {
        if (row >= 0 && row < this.tileMap.length &&
            col >= 0 && col < this.tileMap[row].length) {
          if (this.tileMap[row][col] === 9) {
            this._respawnPlayer();
            return;
          }
        }
      }
    }
  }

  _respawnPlayer() {
    this.sfx.play('hurt');
    this.player.setPosition(this.spawnX, this.spawnY);
    this.player.body.setVelocity(0, 0);
    this.player.body.setAcceleration(0, 0);

    /* Brief red tint */
    this.player.setTint(0xff4444);
    this.time.delayedCall(200, () => {
      if (this.player && this.player.active) {
        this.player.clearTint();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     LAVA PULSE ANIMATION
     ═══════════════════════════════════════════════════════════════ */

  _startLavaAnimation(config) {
    /* Toggle lava frames every 500ms */
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        const H = config.world.worldHeightTiles;
        const W = config.world.worldWidthTiles;
        for (let row = 0; row < H; row++) {
          for (let col = 0; col < W; col++) {
            if (this.tileMap[row][col] === 9) {
              const sprite = this.blockSprites[row] && this.blockSprites[row][col];
              if (sprite && sprite.active && this.textures.exists('block_lava')) {
                const currentFrame = sprite.frame.name;
                const nextFrame = currentFrame === 0 ? 1 : 0;
                sprite.setTexture('block_lava', nextFrame);
              }
            }
          }
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     CRACK OVERLAYS
     ═══════════════════════════════════════════════════════════════ */

  _updateCrackOverlay(col, row, blockDef) {
    const maxHp = blockDef.health;
    const curHp = this.blockHealth[row][col] || 0;
    const ratio = curHp / maxHp;

    this._removeCrackOverlay(col, row);
    if (ratio <= 0) return;

    let key;
    if (ratio <= 0.33) key = 'crack_3';
    else if (ratio <= 0.66) key = 'crack_2';
    else key = 'crack_1';

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;
    const crack = this.add.image(x, y, key);
    crack.setDepth(5);
    this.blockCracks[row][col] = crack;
  }

  _removeCrackOverlay(col, row) {
    const crack = this.blockCracks[row] && this.blockCracks[row][col];
    if (crack) {
      crack.destroy();
      this.blockCracks[row][col] = null;
    }
  }

  _fadeOutCrackOverlay(col, row) {
    const crack = this.blockCracks[row] && this.blockCracks[row][col];
    if (crack) {
      this.tweens.add({
        targets: crack,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          crack.destroy();
          this.blockCracks[row][col] = null;
        }
      });
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
    this._emitParticles(col, row, colorHexStr, count, speedMin, speedMax, lifetime, false);
  }

  _spawnBreakParticles(col, row, colorHexStr, config) {
    const count = config.effects.particleCountBreak || 12;
    const speedMin = config.effects.particleSpeedMin || 50;
    const speedMax = config.effects.particleSpeedMax || 150;
    const lifetime = config.effects.particleLifetimeMs || 500;
    this._emitParticles(col, row, colorHexStr, count, speedMin, speedMax, lifetime, true);
  }

  _emitParticles(col, row, colorHexStr, count, speedMin, speedMax, lifetime, hasGravity) {
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;
    const color = Phaser.Display.Color.HexStringToColor(colorHexStr).color;

    for (let i = 0; i < count; i++) {
      const p = this.add.rectangle(cx, cy, 4, 4, color);
      p.setDepth(50);
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (hasGravity ? 80 : 0);

      this.tweens.add({
        targets: p,
        x: cx + vx * 0.3,
        y: cy + vy * 0.3 + (hasGravity ? 60 : 0),
        alpha: 0,
        duration: lifetime,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     DEBUG UI
     ═══════════════════════════════════════════════════════════════ */

  _createDebugText() {
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '12px', fontFamily: 'monospace',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3
    }).setScrollFactor(0).setDepth(999);
  }

  _updateDebugText() {
    if (!this.debugText || !this.player) return;
    this.debugText.setText([
      `X:${Math.round(this.player.x)} Y:${Math.round(this.player.y)}`,
      `V:${Math.round(this.player.body.velocity.x)},${Math.round(this.player.body.velocity.y)}`,
      `G:${this.player.body.blocked.down} F:${this.playerFacing}`,
      `Anim:${this.currentAnim} Dmg:${this._blockDamage.size}`,
      `FPS:${Math.round(this.game.loop.actualFps)}`
    ]);
  }
}
