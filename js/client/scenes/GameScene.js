/**
 * Astropia – GameScene
 * https://github.com/Zecay/Astropia
 *
 * Main gameplay scene. Handles:
 *  • World generation & rendering
 *  • Player with Growtopia-style physics (coyote time, jump buffer, bunny-hop)
 *  • Player animations (idle/run/jump/punch with sprite flipping, 1-tile tall)
 *  • Persistent static physics groups for dynamic add/remove of block bodies
 *  • One-way platforms (thin body at top of tile)
 *  • Block health with regen timer (NOT on release — 5s timeout)
 *  • Dirt/grass auto-conversion based on above-tile neighbor
 *  • Chebyshev/box reach for tile targeting
 *  • Green/red target marker + ghost preview for placing
 *  • Punch fist animation
 *  • Particles on punch/break
 *  • Procedural sound effects via SoundManager
 *  • Screen shake on block break
 *  • Camera deadzone
 *  • Prevent placing on player position
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

    /* ─── Block damage tracking (regen-based, not release-based) ─── */
    this._blockDamage = new Map(); // key: "col,row" → { hp, lastHitAt }

    /* ─── Player ─── */
    this.player = null;
    this.playerFacing = 1;
    this.currentAnim = 'idle';
    this.cursors = null;
    this.keys = {};

    /* ─── Coyote & jump buffer ─── */
    this._lastGroundedTime = 0;
    this._jumpBufferTime = 0;
    this._prevJumpHeld = false; // prevent re-jump from holding

    /* ─── Punch system ─── */
    this._isPunching = false;
    this._punchCooldownTimer = 0;
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

    /* ─── World container ─── */
    this.worldContainer = this.add.container(0, 0);

    /* ─── Generate terrain ─── */
    this._generateTerrain(W, H, groundY, blocks);

    /* ─── Physics bounds ─── */
    const worldPixelW = W * this.TS;
    const worldPixelH = H * this.TS;
    this.worldW = worldPixelW;
    this.worldH = worldPixelH;
    this.physics.world.setBounds(0, 0, worldPixelW, worldPixelH);

    /* ─── Player (1 tile tall: 24x32 sprite) ─── */
    const playerW = Math.round(config.physics.playerWidthTiles * this.TS); // 24
    const playerH = Math.round(config.physics.playerHeightTiles * this.TS); // 32

    const spawnX = config.world.spawnTileX * this.TS + this.TS / 2;
    const spawnY = (groundY - 2) * this.TS;
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle', 0);
    /* Body: slightly smaller than sprite for forgiving movement */
    this.player.body.setSize(playerW - 4, playerH - 2);
    this.player.body.setOffset(2, 0);
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(10);

    /* ─── Animations ─── */
    this._createAnimations(config);

    /* ─── Create physics groups and colliders ─── */
    this.solidGroup = this.physics.add.staticGroup();
    this.platformGroup = this.physics.add.staticGroup();

    /* Add existing world blocks to groups */
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const blockId = this.tileMap[row][col];
        const blockDef = blocks[String(blockId)];
        if (!blockDef) continue;
        const sprite = this.blockSprites[row][col];
        if (!sprite || !sprite.active) continue;

        if (blockDef.solid && blockDef.foreground) {
          this.solidGroup.add(sprite);
          sprite.refreshBody();
        } else if (blockDef.platform) {
          /* Platform: thin body at top */
          this.platformGroup.add(sprite);
          sprite.body.setSize(this.TS - 4, 6);
          sprite.body.setOffset(2, 0);
          sprite.refreshBody();
        }
      }
    }

    /* Register colliders (do this once, groups are persistent) */
    this.physics.add.collider(this.player, this.solidGroup);
    this.physics.add.collider(this.player, this.platformGroup);

    /* ─── Camera ─── */
    this.cameras.main.setBounds(0, 0, worldPixelW, worldPixelH);
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
    this.keys.a = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.d = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    /* ─── Target marker ─── */
    this.targetMarker = this.add.rectangle(0, 0, this.TS, this.TS, 0xffffff, 0.25);
    this.targetMarker.setStrokeStyle(2, 0xffffff, 0.6);
    this.targetMarker.setDepth(20);
    this.targetMarker.setVisible(false);

    /* ─── Build ghost preview ─── */
    this._buildGhost = this.add.rectangle(0, 0, this.TS - 2, this.TS - 2, 0xffffff, 0.3);
    this._buildGhost.setStrokeStyle(1, 0xffffff, 0.5);
    this._buildGhost.setDepth(19);
    this._buildGhost.setVisible(false);

    /* ─── Punch fist ─── */
    this._punchFist = this.add.image(0, 0, 'fist');
    this._punchFist.setDepth(25);
    this._punchFist.setVisible(false);
    this._punchFist.setScale(0.7);

    /* ─── Mouse input ─── */
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown()) {
        this.sfx.resume();
        this._onPunchPointer(pointer);
      } else if (pointer.rightButtonDown()) {
        this._onBuildTileFromPointer(pointer);
      }
    });

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

    /* ─── Jump (coyote + buffer, no re-jump from holding) ─── */
    this._handleJump(time, phys);

    /* ─── Animation ─── */
    this._updateAnimation();

    /* ─── Punch cooldown ─── */
    if (this._punchCooldownTimer > 0) {
      this._punchCooldownTimer -= delta;
    }

    /* ─── Hold-to-punch ─── */
    if (this.input.activePointer.isDown && this.input.activePointer.leftButtonDown()) {
      this._onPunchPointerHeld(this.input.activePointer);
    }

    /* ─── Block damage regen check ─── */
    this._checkBlockRegen(time, phys.blockRegenMs || 5000);

    /* ─── Target marker & ghost ─── */
    this._updateTargetMarker();

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
     JUMP (coyote + buffer + prevent hold-rejump)
     ═══════════════════════════════════════════════════════════════ */

  _handleJump(time, phys) {
    const onGround = this.player.body.blocked.down;
    const jumpDown = this.keys.space.isDown || this.cursors.up.isDown;

    /* Track last grounded time (coyote) */
    if (onGround) {
      this._lastGroundedTime = time;
    }

    /* Jump buffer: track fresh press (not held) */
    const justPressed = jumpDown && !this._prevJumpHeld;
    if (justPressed) {
      this._jumpBufferTime = time;
    }
    this._prevJumpHeld = jumpDown;

    /* Execute jump: within coyote window AND has buffer press */
    const coyoteWindow = phys.coyoteTimeMs || 80;
    const bufferWindow = phys.jumpBufferMs || 100;
    const withinCoyote = (time - this._lastGroundedTime) <= coyoteWindow;
    const hasBuffered = (time - this._jumpBufferTime) <= bufferWindow;

    if (withinCoyote && hasBuffered) {
      this.player.body.setVelocityY(phys.jumpVelocity);
      this.player.body.setAccelerationY(0);
      this._jumpBufferTime = 0; // consume
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
          blockId = 6;
        } else if (row === groundY) {
          blockId = 1; // dirt (grass check happens after)
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
     BLOCK SPRITE CREATION
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

    const color = Phaser.Display.Color.HexStringToColor(
      texKey === 'block_grass' ? (blockDef.grassColor || '#5B8C2A') : (blockDef.color || '#888888')
    ).color;

    const sprite = this.add.rectangle(x, y, this.TS - 1, this.TS - 1, color);
    sprite.setDepth(blockDef.foreground ? 1 : 0);
    return sprite;
  }

  /**
   * Refresh a dirt block's visual based on the tile above it.
   * Only changes texture, not blockId or physics.
   */
  _refreshDirtVisual(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    const aboveId = (row > 0) ? this.tileMap[row - 1][col] : 0;
    const config = this.registry.get('config');
    const aboveDef = config.blocks[String(aboveId)];

    /* Show grass if tile above is air (or non-solid/non-foreground) */
    const airAbove = aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);

    if (airAbove) {
      sprite.setFillStyle(
        Phaser.Display.Color.HexStringToColor(config.blocks['1'].grassColor || '#5B8C2A').color
      );
    } else {
      sprite.setFillStyle(
        Phaser.Display.Color.HexStringToColor(config.blocks['1'].color || '#8B5E3C').color
      );
    }
  }

  /**
   * When a block is placed or broken, check the tiles below for dirt visual updates.
   */
  _updateNeighborDirt(col, row) {
    /* Check tile below */
    if (row + 1 < this.tileMap.length && this.tileMap[row + 1][col] === 1) {
      this._refreshDirtVisual(col, row + 1);
    }
    /* Check tile at this position if it was just changed */
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

  _removeBlockFromPhysics(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    /* Remove from whichever group it belongs to */
    if (this.solidGroup.contains(sprite)) {
      this.solidGroup.remove(sprite, true, true);
    } else if (this.platformGroup.contains(sprite)) {
      this.platformGroup.remove(sprite, true, true);
    } else {
      sprite.destroy();
    }

    this.blockSprites[row][col] = null;
  }

  /* ═══════════════════════════════════════════════════════════════
     TILE TARGETING (Chebyshev)
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
    const reach = config.physics.playerReachTiles || 4;
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

    if (inReach && !isUnbreakable) {
      /* Build mode (air tile) — show ghost */
      if (isAir && !overlapsPlayer) {
        this.targetMarker.setFillStyle(0x00ff00, 0.15);
        this.targetMarker.setStrokeStyle(2, 0x00ff00, 0.7);
        if (this._buildGhost) {
          this._buildGhost.setPosition(cx, cy);
          this._buildGhost.setVisible(true);
        }
      } else if (isAir && overlapsPlayer) {
        this.targetMarker.setFillStyle(0xff0000, 0.15);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.5);
        if (this._buildGhost) this._buildGhost.setVisible(false);
      } else {
        /* Punchable block */
        this.targetMarker.setFillStyle(isUnbreakable ? 0xff0000 : 0x00ff00, 0.2);
        this.targetMarker.setStrokeStyle(2, isUnbreakable ? 0xff0000 : 0x00ff00, 0.7);
        if (this._buildGhost) this._buildGhost.setVisible(false);
      }
    } else {
      this.targetMarker.setFillStyle(0xff0000, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
      if (this._buildGhost) this._buildGhost.setVisible(false);
    }

    this.targetMarker.setVisible(true);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUNCH SYSTEM (regen-based HP)
     ═══════════════════════════════════════════════════════════════ */

  _onPunchPointer(pointer) {
    this._onPunchPointerHeld(pointer);
  }

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

  _doPunch(col, row, blockDef) {
    const config = this.registry.get('config');
    const now = this.time.now;
    const regenMs = config.physics.blockRegenMs || 5000;
    const key = `${col},${row}`;

    /* Check existing damage entry */
    let dmgEntry = this._blockDamage.get(key);
    if (!dmgEntry || (now - dmgEntry.lastHitAt) > regenMs) {
      /* Fresh start — reset to full health - 1 (first hit) */
      dmgEntry = { hp: blockDef.health - 1, lastHitAt: now };
      this._blockDamage.set(key, dmgEntry);
    } else {
      /* Continue from existing damage */
      dmgEntry.hp -= 1;
      dmgEntry.lastHitAt = now;
    }

    /* Sync the tile health array for crack display */
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

  /**
   * Every frame, check for blocks that haven't been hit in a while → regen.
   */
  _checkBlockRegen(now, regenMs) {
    const expired = [];
    for (const [key, entry] of this._blockDamage) {
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
      const config = this.registry.get('config');
      const blockDef = config.blocks[String(blockId)];
      if (blockDef) {
        this.blockHealth[row][col] = blockDef.health;
        /* Fade out crack overlay */
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

  _breakBlock(col, row, blockDef, config) {
    /* Animate block out */
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (sprite && sprite.active) {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: 0.8,
        scaleY: 0.8,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this._removeBlockFromPhysics(col, row);
          this._removeCrackOverlay(col, row);
        }
      });
    }

    /* Update world state immediately */
    this.tileMap[row][col] = 0;
    this.blockHealth[row][col] = 0;
    this._blockDamage.delete(`${col},${row}`);

    /* Break particles */
    this._spawnBreakParticles(col, row, blockDef.color || '#888888', config);
    this.sfx.play('punchBreak');
    this.cameras.main.shake(
      config.effects.screenShakeDurationMs || 100,
      config.effects.screenShakeIntensity || 2 / 1000
    );

    /* Check neighbor for dirt/grass update */
    this._updateNeighborDirt(col, row);
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
    if (this._doesTileOverlapPlayer(col, row)) {
      this.sfx.play('error');
      return;
    }

    /* Place block (Phase 2 will use inventory) — for now: dirt */
    const blockId = 1;
    this._placeBlock(col, row, blockId, config, blocks);
  }

  _placeBlock(col, row, blockId, config, blocks) {
    const blockDef = blocks[String(blockId)];
    if (!blockDef) return;

    this.tileMap[row][col] = blockId;
    this.blockHealth[row][col] = blockDef.health;

    /* Destroy old sprite (shouldn't exist, but just in case) */
    if (this.blockSprites[row][col]) {
      this.blockSprites[row][col].destroy();
    }

    /* Determine grass/dirt visual for blocks placed at surface */
    let useGrass = false;
    if (Number(blockId) === 1) {
      const aboveId = (row > 0) ? this.tileMap[row - 1][col] : 0;
      const aboveDef = config.blocks[String(aboveId)];
      useGrass = aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);
    }

    /* Create sprite with placement animation */
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

    /* Check neighbor for dirt/grass update */
    if (row > 0) this._updateNeighborDirt(col, row);
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
      `Anim:${this.currentAnim} ∅Dmg:${this._blockDamage.size}`,
      `FPS:${Math.round(this.game.loop.actualFps)}`
    ]);
  }
}
