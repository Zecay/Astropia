/**
 * Astropia – GameScene
 * https://github.com/Zecay/Astropia
 *
 * Main gameplay scene. Handles:
 *  • Flat 100×60 world generation with cave background layer
 *  • Growtopia-style movement, coyote time, jump buffer, bunny-hop feel
 *  • Fast punch / break / place flow
 *  • Seamless full-tile solid collisions
 *  • Lava pulse animation, knockback damage, tint, respawn
 *  • Dropped items with light gravity, air float, spin, landed bob, overlap pickup
 *  • 4-slot quick bar + 40-slot inventory support via PlayerInventory / UIScene
 */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    /* ─── World data ─── */
    this.tileMap = [];
    this.bgTileMap = [];
    this.blockSprites = [];
    this.bgSprites = [];
    this.blockCracks = [];
    this.blockHealth = [];

    /* ─── Physics groups ─── */
    this.solidGroup = null;
    this.itemGroup = null;

    /* ─── Damage / regen ─── */
    this._blockDamage = new Map();

    /* ─── Player ─── */
    this.player = null;
    this.playerFacing = 1;
    this.currentAnim = 'idle';
    this.cursors = null;
    this.keys = {};

    /* ─── Jump helpers ─── */
    this._lastGroundedTime = 0;
    this._jumpBufferTime = 0;
    this._prevJumpHeld = false;
    this._stableGrounded = false;
    this._canJump = false;
    this._wasGrounded = false;
    this._wasAirborne = false;
    this._lastFrameVelocityY = 0;

    /* ─── Punch system ─── */
    this._isPunching = false;
    this._punchCooldownTimer = 0;
    this._lastPunchAt = 0;
    this._punchFist = null;
    this._punchFistTween = null;
    this._buildGhost = null;

    /* ─── Lava damage ─── */
    this._lavaDamageAccum = 0;
    this._iframesUntil = 0;
    this._maxLavaHits = 4;
    this._lavaDamageCooldownMs = 500;
    this._lastLavaContact = -Infinity;
    this._playerTintTimer = null;

    /* ─── Misc ─── */
    this.sfx = null;
    this.inv = null;
    this.targetMarker = null;
    this.debugText = null;
    this.spawnX = 0;
    this.spawnY = 0;

    this.TS = 32;
    this.worldPixelW = 0;
    this.worldPixelH = 0;
  }

  create() {
    const config = this.registry.get('config');
    this.TS = config.world.tileSize;
    this.worldPixelW = config.world.worldWidthTiles * this.TS;
    this.worldPixelH = config.world.worldHeightTiles * this.TS;

    /* ─── Sound ─── */
    this.sfx = new SoundManager(this.game);
    this.registry.set('sfx', this.sfx);

    /* ─── World ─── */
    this._generateTerrain(config.world.worldWidthTiles, config.world.worldHeightTiles, config.world.groundLevel, config.blocks);
    this.physics.world.setBounds(0, 0, this.worldPixelW, this.worldPixelH);

    /* ─── Player ─── */
    const playerW = Math.round(config.physics.playerWidthTiles * this.TS);
    const playerH = Math.round(config.physics.playerHeightTiles * this.TS);
    this.spawnX = config.world.spawnTileX * this.TS + this.TS / 2;
    this.spawnY = (config.world.groundLevel - (config.world.spawnAboveGroundTiles || 3)) * this.TS;

    this.player = this.physics.add.sprite(this.spawnX, this.spawnY, 'player_idle', 0);
    this.player.body.setSize(playerW - 4, playerH - 2);
    this.player.body.setOffset(2, 0);
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(10);

    this._createAnimations(config);

    /* ─── Physics groups ─── */
    this.solidGroup = this.physics.add.staticGroup();
    this.itemGroup = this.physics.add.group();

    for (let row = 0; row < this.tileMap.length; row++) {
      for (let col = 0; col < this.tileMap[row].length; col++) {
        const blockId = this.tileMap[row][col];
        const blockDef = config.blocks[String(blockId)];
        if (!blockDef || !blockDef.solid || !blockDef.foreground) continue;
        this._addBlockToPhysics(col, row, blockId);
      }
    }

    this.physics.add.collider(this.player, this.solidGroup);
    this.physics.add.collider(this.itemGroup, this.solidGroup);
    this.physics.add.overlap(this.player, this.itemGroup, this._onItemCollect, null, this);

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

    /* ─── Target marker / build ghost / fist ─── */
    this.targetMarker = this.add.rectangle(0, 0, this.TS, this.TS, 0xffffff, 0.25);
    this.targetMarker.setStrokeStyle(2, 0xffffff, 0.6);
    this.targetMarker.setDepth(20);
    this.targetMarker.setVisible(false);

    this._buildGhost = this.add.image(0, 0, 'block_dirt');
    this._buildGhost.setDisplaySize(this.TS, this.TS);
    this._buildGhost.setAlpha(config.ui.placeGhostAlpha || 0.4);
    this._buildGhost.setDepth(19);
    this._buildGhost.setVisible(false);

    this._punchFist = this.add.image(0, 0, 'fist');
    this._punchFist.setDepth(25);
    this._punchFist.setScale(0.7);
    this._punchFist.setVisible(false);

    /* ─── Inventory ─── */
    this.inv = new PlayerInventory(config, this.registry);
    this.inv.giveStartingItems(config.inventory.startingItems);
    this.registry.set('inventory', this.inv);
    this.scene.launch('UIScene');

    /* ─── Lava config ─── */
    this._maxLavaHits = config.player.maxLavaHitsBeforeRespawn || 4;
    this._lavaDamageCooldownMs = config.player.lavaDamageCooldownMs || 500;

    /* ─── Mouse input ─── */
    this.input.on('pointerdown', (pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this._isInventoryOpen()) return;
      this.sfx.resume();
      this._onSmartClick(pointer);
    });
    this.input.mouse.disableContextMenu();

    /* ─── Lava animation ─── */
    this._startLavaAnimation(config);

    /* ─── Debug ─── */
    if (config.ui && config.ui.debugTextEnabled) {
      this._createDebugText();
    }

    console.log('[Astropia] World rows: Y0-24 air, Y25 grass, Y26-28 pure dirt, Y29-48 dirt+rock, Y49-53 lava ramp, Y54-59 bedrock.');
  }

  /* ═══════════════════════════════════════════════════════════════
     UPDATE
     ═══════════════════════════════════════════════════════════════ */

  update(time, delta) {
    if (!this.player || !this.player.active) return;

    const config = this.registry.get('config');
    const phys = config.physics;

    this._handleMovement(phys);
    this._handleJump(time, phys);
    this._updateAnimation();
    this._checkLanding();

    if (this._punchCooldownTimer > 0) {
      this._punchCooldownTimer -= delta;
    }

    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };
    if (!this._isInventoryOpen() && sel.kind === 'fist' && this.input.activePointer.isDown && this.input.activePointer.leftButtonDown()) {
      this._onPunchPointerHeld(this.input.activePointer);
    }

    this._checkBlockRegen(time, config);
    this._updateTargetMarker();

    const touchingLava = this._checkLavaDamage(time);
    if (!touchingLava && this.player.body.blocked.down && (time - this._lastLavaContact) > (config.player.lavaDamageResetMs || 1000)) {
      this._lavaDamageAccum = 0;
    }

    if (this.player.y > this.worldPixelH + 32) {
      this._respawnPlayer();
    }

    this._updateItems(delta);

    if (this.debugText) this._updateDebugText();
    this._lastFrameVelocityY = this.player.body.velocity.y;
  }

  /* ═══════════════════════════════════════════════════════════════
     MOVEMENT / JUMP / LANDING
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

  _handleJump(time, phys) {
    const body = this.player.body;
    const blocked = body.blocked;
    const onGround = blocked.down && !blocked.left && !blocked.right && body.velocity.y >= 0;

    if (onGround && (this._wasGrounded || body.velocity.y >= -10)) {
      this._stableGrounded = true;
      this._canJump = true;
      this._lastGroundedTime = time;
    } else if (!onGround) {
      this._stableGrounded = false;
    }
    this._wasGrounded = onGround;

    const jumpDown = this.keys.space.isDown || this.cursors.up.isDown || this.keys.w.isDown;
    const justPressed = jumpDown && !this._prevJumpHeld;
    if (justPressed) {
      this._jumpBufferTime = time;
    }
    this._prevJumpHeld = jumpDown;

    const withinCoyote = (time - this._lastGroundedTime) <= (phys.coyoteTimeMs || 80) && this._canJump;
    const hasBuffered = (time - this._jumpBufferTime) <= (phys.jumpBufferMs || 100);

    if (withinCoyote && hasBuffered) {
      body.setVelocityY(0);
      body.setVelocityY(phys.jumpVelocity);
      body.setAccelerationY(0);
      this._canJump = false;
      this._jumpBufferTime = 0;
      this._lastGroundedTime = 0;
    }
  }

  _checkLanding() {
    const onGround = this.player.body.blocked.down;
    if (onGround && this._wasAirborne && this._lastFrameVelocityY > 200) {
      this.sfx.play('land');
      this._spawnLandingDust();
    }
    this._wasAirborne = !onGround;
  }

  _spawnLandingDust() {
    const config = this.registry.get('config');
    const count = config.effects.landingDustCount || 3;
    const px = this.player.x;
    const py = this.player.y + this.player.height / 2;

    for (let i = 0; i < count; i++) {
      const p = this.add.rectangle(px + (Math.random() - 0.5) * 10, py, 3, 3, 0x999999);
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
      frames: this.anims.generateFrameNumbers('player_jump', { start: 0, end: 0 }),
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
    this.player.setFlipX(this.playerFacing === -1);

    if (this._isPunching) {
      if (this.currentAnim !== 'punch') {
        this.currentAnim = 'punch';
        this.player.play('punch', true);
      }
      return;
    }

    let next = 'idle';
    if (!onGround) next = 'jump';
    else if (moving) next = 'run';

    if (next !== this.currentAnim) {
      this.currentAnim = next;
      this.player.play(next, true);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TERRAIN / BACKGROUND
     ═══════════════════════════════════════════════════════════════ */

  _generateTerrain(W, H, groundY, blocks) {
    const config = this.registry.get('config');
    const bedrockRows = config.world.bedrockRows || 6;
    const noRockRows = config.world.noRockRows || 4;
    const rockChance = config.world.rockChance || 0.05;
    const lavaRows = config.world.lavaStartRowsAboveBedrock || 5;
    const lavaMaxChance = config.world.lavaMaxChance || 0.6;
    const bedrockTop = H - bedrockRows;

    this.tileMap = [];
    this.bgTileMap = [];
    this.blockSprites = [];
    this.bgSprites = [];
    this.blockHealth = [];
    this.blockCracks = [];

    for (let row = 0; row < H; row++) {
      this.tileMap[row] = [];
      this.bgTileMap[row] = [];
      this.blockSprites[row] = [];
      this.bgSprites[row] = [];
      this.blockHealth[row] = [];
      this.blockCracks[row] = [];

      for (let col = 0; col < W; col++) {
        let blockId = 0;

        if (row >= bedrockTop) {
          blockId = 6;
        } else if (row < groundY) {
          blockId = 0;
        } else if (row <= groundY + noRockRows - 1) {
          blockId = 1;
        } else {
          const rowsAboveBedrock = (bedrockTop - 1) - row;
          let lavaChance = 0;
          if (rowsAboveBedrock < lavaRows) {
            lavaChance = lavaMaxChance - ((lavaMaxChance / lavaRows) * rowsAboveBedrock);
            lavaChance = Phaser.Math.Clamp(lavaChance, 0, lavaMaxChance);
          }

          if (Math.random() < lavaChance) blockId = 9;
          else if (Math.random() < rockChance) blockId = 3;
          else blockId = 1;
        }

        this.tileMap[row][col] = blockId;
        this.blockHealth[row][col] = blocks[String(blockId)] ? blocks[String(blockId)].health : 0;
        this.blockCracks[row][col] = null;
        this.blockSprites[row][col] = this._createBlockSprite(col, row, blockId, false);
      }
    }

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        if (this.tileMap[row][col] === 1) {
          this._refreshDirtVisual(col, row);
        }
      }
    }

    const caveBgId = 8;
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        if (row >= groundY) {
          this.bgTileMap[row][col] = caveBgId;
          this.bgSprites[row][col] = this._createBackgroundSprite(col, row, caveBgId);
        } else {
          this.bgTileMap[row][col] = 0;
          this.bgSprites[row][col] = null;
        }
      }
    }
  }

  _createBackgroundSprite(col, row, blockId) {
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    if (!blockDef || !blockDef.texture) return null;

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;
    const sprite = this.add.image(x, y, blockDef.texture);
    sprite.setDepth(-1);
    sprite.setAlpha(0.85);
    return sprite;
  }

  _createBlockSprite(col, row, blockId, useGrass) {
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    if (!blockDef || blockId === 0 || !blockDef.texture) return null;

    const x = col * this.TS + this.TS / 2;
    const y = row * this.TS + this.TS / 2;
    const texKey = this._getBlockTextureKey(blockId, useGrass);
    const sprite = this.add.image(x, y, texKey);
    sprite.setDepth(blockDef.foreground ? 1 : (blockDef.background ? -1 : 0));

    if (Number(blockId) === 9 && texKey === 'block_lava' && this.textures.exists('block_lava')) {
      sprite.setFrame(0);
      const glowColor = Phaser.Display.Color.HexStringToColor(blockDef.glowColor || '#FFBB2A').color;
      const glow = this.add.circle(x, y, Math.round(this.TS * 0.56), glowColor, 0.25);
      glow.setDepth(0);
      sprite.setData('lavaGlow', glow);
    }

    return sprite;
  }

  _getBlockTextureKey(blockId, useGrass) {
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    if (!blockDef) return '';

    if (Number(blockId) === 1) {
      const customDirt = blockDef.texture && this._isCustomTextureSource(blockDef.texture) && this.textures.exists(blockDef.texture);
      if (customDirt) return blockDef.texture;
      return useGrass ? 'block_grass' : 'block_dirt';
    }

    return blockDef.texture;
  }

  _refreshDirtVisual(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite || !sprite.active) return;

    const aboveId = row > 0 ? this.tileMap[row - 1][col] : 0;
    const config = this.registry.get('config');
    const aboveDef = config.blocks[String(aboveId)];
    const airAbove = aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);
    const texKey = this._getBlockTextureKey(1, airAbove);

    if (texKey && this.textures.exists(texKey)) {
      sprite.setTexture(texKey);
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
     COLLISION HELPERS
     ═══════════════════════════════════════════════════════════════ */

  _addBlockToPhysics(col, row, blockId) {
    const config = this.registry.get('config');
    const blockDef = config.blocks[String(blockId)];
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!blockDef || !sprite || !sprite.active) return;
    if (!(blockDef.solid && blockDef.foreground)) return;

    if (!this.solidGroup.contains(sprite)) {
      this.solidGroup.add(sprite);
    }

    if (sprite.body) {
      sprite.body.setSize(this.TS, this.TS);
      sprite.body.setOffset(0, 0);
      if (sprite.refreshBody) sprite.refreshBody();
      else if (sprite.body.updateFromGameObject) sprite.body.updateFromGameObject();
    }
  }

  _removeBlockFromPhysics(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite) return;

    if (this.solidGroup && this.solidGroup.contains(sprite)) {
      this.solidGroup.remove(sprite, false, false);
    }

    if (sprite.body) {
      sprite.body.destroy();
    }
  }

  _destroyBlockSprite(col, row) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    if (!sprite) return;

    const glow = sprite.getData && sprite.getData('lavaGlow');
    if (glow) glow.destroy();
    sprite.destroy();
    this.blockSprites[row][col] = null;
  }

  /* ═══════════════════════════════════════════════════════════════
     TARGETING / MARKER
     ═══════════════════════════════════════════════════════════════ */

  _pointerToTile(pointer) {
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(wp.x / this.TS);
    const row = Math.floor(wp.y / this.TS);
    const config = this.registry.get('config');

    if (col < 0 || row < 0 || col >= config.world.worldWidthTiles || row >= config.world.worldHeightTiles) {
      return null;
    }

    return { col, row };
  }

  _isTileInReach(col, row) {
    const reach = this.registry.get('config').physics.playerReachTiles || 3;
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
    if (this._isInventoryOpen()) {
      this.targetMarker.setVisible(false);
      this._buildGhost.setVisible(false);
      return;
    }

    const pointer = this.input.activePointer;
    if (!pointer || pointer.x < 0 || pointer.x > this.game.config.width || pointer.y < 0 || pointer.y > this.game.config.height) {
      this.targetMarker.setVisible(false);
      this._buildGhost.setVisible(false);
      return;
    }

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) {
      this.targetMarker.setVisible(false);
      this._buildGhost.setVisible(false);
      return;
    }

    const { col, row } = tilePos;
    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockId = this.tileMap[row][col];
    const blockDef = blocks[String(blockId)];
    const inReach = this._isTileInReach(col, row);
    const isAir = blockId === 0;
    const isUnbreakable = blockDef && blockDef.unbreakable;
    const overlapsPlayer = this._doesTileOverlapPlayer(col, row);
    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };

    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;
    this.targetMarker.setPosition(cx, cy);
    this._buildGhost.setVisible(false);

    if (!inReach) {
      this.targetMarker.setFillStyle(0xff0000, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
      this.targetMarker.setVisible(true);
      return;
    }

    if (sel.kind === 'fist') {
      if (isAir || isUnbreakable) {
        this.targetMarker.setFillStyle(0xff0000, isUnbreakable ? 0.2 : 0.1);
        this.targetMarker.setStrokeStyle(2, 0xff0000, isUnbreakable ? 0.6 : 0.3);
      } else {
        this.targetMarker.setFillStyle(0x00ff00, 0.2);
        this.targetMarker.setStrokeStyle(2, 0x00ff00, 0.7);
      }
    } else if (sel.kind === 'wrench') {
      this.targetMarker.setFillStyle(0x4488ff, 0.2);
      this.targetMarker.setStrokeStyle(2, 0x4488ff, 0.6);
    } else if (sel.kind === 'block') {
      const placeBlockDef = sel.itemDef ? blocks[String(sel.itemDef.blockId)] : null;
      if (placeBlockDef && placeBlockDef.background) {
        this.targetMarker.setFillStyle(0xff0000, 0.1);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
      } else if (isAir && !overlapsPlayer) {
        this.targetMarker.setFillStyle(0x00ff00, 0.15);
        this.targetMarker.setStrokeStyle(2, 0x00ff00, 0.7);
        const ghostUseGrass = sel.itemDef && sel.itemDef.blockId === 1 ? this._shouldUseGrassTexture(col, row) : false;
        const texKey = placeBlockDef ? this._getBlockTextureKey(sel.itemDef.blockId, ghostUseGrass) : '';
        if (texKey && this.textures.exists(texKey)) {
          this._buildGhost.setTexture(texKey);
        }
        this._buildGhost.setPosition(cx, cy);
        this._buildGhost.setVisible(true);
      } else {
        this.targetMarker.setFillStyle(0xff0000, 0.1);
        this.targetMarker.setStrokeStyle(2, 0xff0000, 0.4);
      }
    } else if (sel.kind === 'seed') {
      this.targetMarker.setFillStyle(0xffaa00, 0.15);
      this.targetMarker.setStrokeStyle(2, 0xffaa00, 0.4);
    } else {
      this.targetMarker.setFillStyle(0xff0000, 0.1);
      this.targetMarker.setStrokeStyle(2, 0xff0000, 0.3);
    }

    this.targetMarker.setVisible(true);
  }

  /* ═══════════════════════════════════════════════════════════════
     SMART CLICK / WRENCH / PLACE
     ═══════════════════════════════════════════════════════════════ */

  _onSmartClick(pointer) {
    const sel = this.inv ? this.inv.getSelectedItem() : { kind: 'fist' };

    if (sel.kind === 'fist') this._onPunchPointerHeld(pointer);
    else if (sel.kind === 'wrench') this._onWrenchClick(pointer);
    else if (sel.kind === 'block') this._onBlockPlace(pointer);
    else if (sel.kind === 'seed') this.sfx.play('error');
    else this.sfx.play('error');
  }

  _onWrenchClick(pointer) {
    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;
    const { col, row } = tilePos;
    if (!this._isTileInReach(col, row)) return;

    const config = this.registry.get('config');
    const fgId = this.tileMap[row][col];
    const bgId = this.bgTileMap[row][col];
    const fgName = fgId ? (config.blocks[String(fgId)]?.name || 'unknown') : 'air';
    const bgName = bgId ? (config.blocks[String(bgId)]?.name || 'unknown') : 'none';

    this.sfx.play('wrench');
    console.log(`[Astropia] Wrench: tile (${col},${row}) foreground=${fgName}(${fgId}) background=${bgName}(${bgId})`);
  }

  _onBlockPlace(pointer) {
    const sel = this.inv.getSelectedItem();
    if (!sel.itemDef || !sel.itemDef.blockId) return;

    const config = this.registry.get('config');
    const blocks = config.blocks;
    const blockDef = blocks[String(sel.itemDef.blockId)];
    if (!blockDef || blockDef.background) {
      this.sfx.play('error');
      return;
    }

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;
    const { col, row } = tilePos;

    if (this.tileMap[row][col] !== 0 || !this._isTileInReach(col, row) || this._doesTileOverlapPlayer(col, row)) {
      this.sfx.play('error');
      return;
    }

    this._placeBlock(col, row, sel.itemDef.blockId, config, blocks);
    this.inv.removeItem(this.inv.getSelectedSlot(), 1);
  }

  _placeBlock(col, row, blockId, config, blocks) {
    const blockDef = blocks[String(blockId)];
    if (!blockDef) return;

    this.tileMap[row][col] = blockId;
    this.blockHealth[row][col] = blockDef.health;
    this._removeCrackOverlay(col, row);

    if (this.blockSprites[row][col]) {
      this._removeBlockFromPhysics(col, row);
      this._destroyBlockSprite(col, row);
    }

    const useGrass = Number(blockId) === 1 ? this._shouldUseGrassTexture(col, row) : false;
    const sprite = this._createBlockSprite(col, row, blockId, useGrass);
    this.blockSprites[row][col] = sprite;

    if (sprite) {
      this._addBlockToPhysics(col, row, blockId);
      sprite.setScale(0.6);
      this.tweens.add({
        targets: sprite,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Back.easeOut'
      });
    }

    this.sfx.play('place');
    this._updateNeighborDirt(col, row);
  }

  _shouldUseGrassTexture(col, row) {
    const aboveId = row > 0 ? this.tileMap[row - 1][col] : 0;
    const config = this.registry.get('config');
    const aboveDef = config.blocks[String(aboveId)];
    return aboveId === 0 || !aboveDef || !(aboveDef.solid && aboveDef.foreground);
  }

  /* ═══════════════════════════════════════════════════════════════
     PUNCH / BREAK / REGEN
     ═══════════════════════════════════════════════════════════════ */

  _onPunchPointerHeld(pointer) {
    if (this._punchCooldownTimer > 0) return;

    const now = this.time.now;
    const cooldown = this.registry.get('config').physics.punchCooldownMs || 200;
    if (this._lastPunchAt && (now - this._lastPunchAt) < cooldown) return;

    const tilePos = this._pointerToTile(pointer);
    if (!tilePos) return;

    const { col, row } = tilePos;
    const config = this.registry.get('config');
    const blockId = this.tileMap[row][col];
    const blockDef = config.blocks[String(blockId)];

    if (!blockDef || blockId === 0 || blockDef.unbreakable || !this._isTileInReach(col, row)) return;

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
    this._isPunching = true;
    this._punchCooldownTimer = config.physics.punchCooldownMs || 200;
    this._showPunchFist(col, row);
    this._spawnParticles(col, row, blockDef.color || '#888888', config);
    this._updateCrackOverlay(col, row, blockDef);
    this.sfx.play('punchHit');

    if (dmgEntry.hp <= 0) {
      this._breakBlock(col, row, blockDef, config);
      this._blockDamage.delete(key);
    }
  }

  _showPunchFist(col, row) {
    if (!this._punchFist) return;

    const config = this.registry.get('config');
    const outMs = config.animation.punchFistDurationMs || 120;
    const holdMs = config.animation.punchFistHoldMs || 15;
    const retractMs = config.animation.punchFistRetractMs || 80;

    const targetX = col * this.TS + this.TS / 2;
    const targetY = row * this.TS + this.TS / 2;
    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    if (dx !== 0) {
      this.playerFacing = dx < 0 ? -1 : 1;
    }

    const startX = this.player.x + (dx / dist) * 12;
    const startY = this.player.y + (dy / dist) * 8;

    this._punchFist.setPosition(startX, startY);
    this._punchFist.setVisible(true);

    if (this._punchFistTween) {
      this._punchFistTween.stop();
      this._punchFistTween = null;
    }

    this._punchFistTween = this.tweens.add({
      targets: this._punchFist,
      x: targetX,
      y: targetY,
      duration: outMs,
      ease: 'Power1',
      onComplete: () => {
        this.time.delayedCall(holdMs, () => {
          this._punchFistTween = this.tweens.add({
            targets: this._punchFist,
            x: startX,
            y: startY,
            duration: retractMs,
            ease: 'Power1',
            onComplete: () => {
              this._punchFist.setVisible(false);
              this._punchFistTween = null;
              this._isPunching = false;
              this._updateAnimation();
            }
          });
        });
      }
    });
  }

  _breakBlock(col, row, blockDef, config) {
    const sprite = this.blockSprites[row] && this.blockSprites[row][col];
    const particleColor = blockDef.glowColor || blockDef.color || '#888888';

    if (sprite && sprite.active) {
      const clone = this.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name);
      clone.setDepth(sprite.depth);
      clone.setScale(sprite.scaleX, sprite.scaleY);

      this._removeBlockFromPhysics(col, row);
      this._destroyBlockSprite(col, row);

      this.tweens.add({
        targets: clone,
        alpha: 0,
        scaleX: 0.8,
        scaleY: 0.8,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => clone.destroy()
      });
    }

    this.tileMap[row][col] = 0;
    this.blockHealth[row][col] = 0;
    this._blockDamage.delete(`${col},${row}`);
    this._removeCrackOverlay(col, row);

    this._spawnBlockDrops(col, row, blockDef, config);
    this._spawnBreakParticles(col, row, particleColor, config);
    this.sfx.play('punchBreak');
    this.cameras.main.shake(config.effects.screenShakeDurationMs || 100, config.effects.screenShakeIntensity || 0.002);
    this._updateNeighborDirt(col, row);
  }

  _checkBlockRegen(now, config) {
    const expired = [];

    for (const [key, entry] of this._blockDamage.entries()) {
      const [colStr, rowStr] = key.split(',');
      const col = Number(colStr);
      const row = Number(rowStr);
      const blockId = this.tileMap[row] && this.tileMap[row][col];
      const blockDef = config.blocks[String(blockId)];
      if (!blockDef) {
        expired.push(key);
        continue;
      }
      if ((now - entry.lastHitAt) > (blockDef.regenMs || 5000)) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this._blockDamage.delete(key);
      const [colStr, rowStr] = key.split(',');
      const col = Number(colStr);
      const row = Number(rowStr);
      const blockId = this.tileMap[row] && this.tileMap[row][col];
      const blockDef = config.blocks[String(blockId)];
      if (!blockDef) continue;
      this.blockHealth[row][col] = blockDef.health;
      this._fadeOutCrackOverlay(col, row);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     DROPS / ITEMS
     ═══════════════════════════════════════════════════════════════ */

  _spawnBlockDrops(col, row, blockDef, config) {
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;

    if (blockDef.drop) {
      this._spawnItemEntity(cx, cy, blockDef.drop.itemId, blockDef.drop.count || 1);
    }

    if (blockDef.seedDrop && Math.random() < (blockDef.seedDrop.chance || 0)) {
      this._spawnItemEntity(cx, cy, blockDef.seedDrop.itemId, blockDef.seedDrop.count || 1);
    }

    if (Array.isArray(blockDef.gemDrops)) {
      for (const gemDrop of blockDef.gemDrops) {
        if (Math.random() < (gemDrop.chance || 0)) {
          const gemCount = gemDrop.count || 1;
          this.inv.addGems(gemCount);
          this._showFloatingText(cx, cy, `+${gemCount} 💎`, '#00ffcc');
          break;
        }
      }
    }
  }

  _spawnItemEntity(x, y, itemId, count) {
    const config = this.registry.get('config');
    const itemDef = config.items[String(itemId)];
    if (!itemDef || !itemDef.texture || !this.textures.exists(itemDef.texture)) return;

    const item = this.physics.add.image(x, y, itemDef.texture);
    item.setDisplaySize(24, 24);
    item.setDepth(8);
    item.setData('itemId', itemId);
    item.setData('count', count);
    item.setData('itemName', itemDef.name);
    item.setData('landed', false);
    item.setData('bobTween', null);
    item.setData('airFloatPhase', Math.random() * Math.PI * 2);
    item.setData('airOffsetX', 0);
    item.setData('airOffsetY', 0);

    item.body.setCircle(8);
    item.body.setOffset(4, 4);
    item.body.setVelocity((Math.random() - 0.5) * 160, config.itemsDrop.bounceUpVelocity || -200);
    item.body.setBounce(0.2);
    item.body.setGravityY((config.physics.gravity || 2000) * 0.5);
    item.body.setAngularVelocity(config.itemsDrop.spinSpeed || 75);

    this.itemGroup.add(item);
  }

  _onItemCollect(player, item) {
    const itemId = item.getData('itemId');
    const count = item.getData('count') || 1;
    const itemName = item.getData('itemName') || 'Item';
    const unadded = this.inv.addItem(itemId, count);
    const collected = count - unadded;

    if (collected > 0) {
      this._showFloatingText(item.x, item.y, `+${collected} ${itemName}`, '#ffffff');
      this.sfx.play('collect');
    }

    if (unadded > 0) {
      item.setData('count', unadded);
      item.setData('itemName', itemName);
      return;
    }

    const bobTween = item.getData('bobTween');
    if (bobTween) bobTween.stop();
    item.destroy();
  }

  _updateItems(delta) {
    const config = this.registry.get('config');
    const bobAmplitude = config.itemsDrop.bobAmplitude || 4;
    const bobDuration = config.itemsDrop.bobDurationMs || 900;
    const spinSpeed = config.itemsDrop.spinSpeed || 75;
    const airFloatAmp = config.itemsDrop.airFloatAmplitudePx || 1.2;
    const airFloatSpeed = config.itemsDrop.airFloatSpeed || 0.004;

    for (const item of this.itemGroup.getChildren()) {
      if (!item.active) continue;

      if (item.body.blocked.down && !item.getData('landed')) {
        const prevX = item.getData('airOffsetX') || 0;
        const prevY = item.getData('airOffsetY') || 0;
        item.x -= prevX;
        item.y -= prevY;
        if (item.body) {
          item.body.x -= prevX;
          item.body.y -= prevY;
        }
        item.setData('airOffsetX', 0);
        item.setData('airOffsetY', 0);
        item.setData('landed', true);
        item.body.setGravityY(0);
        item.body.setVelocity(0, 0);
        item.body.setAngularVelocity(0);

        const bobTween = this.tweens.add({
          targets: item,
          y: item.y - bobAmplitude,
          duration: bobDuration,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        item.setData('bobTween', bobTween);
      }

      if (!item.getData('landed')) {
        const bobTween = item.getData('bobTween');
        if (bobTween) {
          bobTween.stop();
          item.setData('bobTween', null);
        }

        item.body.setAngularVelocity(spinSpeed);

        const phase = (item.getData('airFloatPhase') || 0) + delta * airFloatSpeed;
        const desiredX = Math.cos(phase * 0.8) * (airFloatAmp * 0.5);
        const desiredY = Math.sin(phase) * airFloatAmp;
        const prevX = item.getData('airOffsetX') || 0;
        const prevY = item.getData('airOffsetY') || 0;

        const diffX = desiredX - prevX;
        const diffY = desiredY - prevY;
        item.x += diffX;
        item.y += diffY;
        if (item.body) {
          item.body.x += diffX;
          item.body.y += diffY;
        }
        item.setData('airFloatPhase', phase);
        item.setData('airOffsetX', desiredX);
        item.setData('airOffsetY', desiredY);
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
     LAVA DAMAGE / RESPAWN / ANIMATION
     ═══════════════════════════════════════════════════════════════ */

  _checkLavaDamage(time) {
    const pb = this.player.body;
    const pLeft = pb.x;
    const pRight = pb.x + pb.width;
    const pTop = pb.y;
    const pBottom = pb.y + pb.height;
    const startCol = Math.floor(pLeft / this.TS);
    const endCol = Math.floor((pRight - 1) / this.TS);
    const startRow = Math.floor(pTop / this.TS);
    const endRow = Math.floor((pBottom - 1) / this.TS);

    let bestOverlap = null;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (row < 0 || col < 0 || row >= this.tileMap.length || col >= this.tileMap[row].length) continue;
        if (this.tileMap[row][col] !== 9) continue;

        const tileLeft = col * this.TS;
        const tileRight = tileLeft + this.TS;
        const tileTop = row * this.TS;
        const tileBottom = tileTop + this.TS;
        const overlapW = Math.min(pRight, tileRight) - Math.max(pLeft, tileLeft);
        const overlapH = Math.min(pBottom, tileBottom) - Math.max(pTop, tileTop);
        if (overlapW <= 0 || overlapH <= 0) continue;

        const area = overlapW * overlapH;
        if (!bestOverlap || area > bestOverlap.area) {
          bestOverlap = {
            area,
            left: tileLeft,
            right: tileRight,
            top: tileTop,
            bottom: tileBottom,
            centerX: tileLeft + this.TS / 2,
            centerY: tileTop + this.TS / 2
          };
        }
      }
    }

    if (!bestOverlap) return false;

    this._lastLavaContact = time;
    if (time < this._iframesUntil) return true;

    const config = this.registry.get('config');
    const hitThreshold = this.TS * 0.25;
    const pushX = config.player.lavaPushHorizontalVelocity || 250;

    if (pBottom <= bestOverlap.top + hitThreshold) {
      this.player.body.setVelocityY(config.player.lavaBounceUpVelocity || -520);
    } else if (pTop >= bestOverlap.bottom - hitThreshold) {
      this.player.body.setVelocityY(config.player.lavaPushDownVelocity || 200);
    } else if ((pLeft + pRight) * 0.5 < bestOverlap.centerX) {
      this.player.body.setVelocityX(-pushX);
    } else {
      this.player.body.setVelocityX(pushX);
    }

    this._lavaDamageAccum += 1;
    this._iframesUntil = time + (config.player.lavaDamageCooldownMs || 500);
    this._flashPlayerTint(config.player.lavaHitTint || '#ff6666', config.player.lavaHitTintDurationMs || 200);
    this.sfx.play('hurt', { volumeScale: 0.65 });

    if (this._lavaDamageAccum >= this._maxLavaHits) {
      this._respawnPlayer();
    }

    return true;
  }

  _respawnPlayer() {
    const config = this.registry.get('config');
    this.sfx.play('hurt', { volumeScale: 1 });
    this._lavaDamageAccum = 0;
    this._iframesUntil = 0;
    this._lastLavaContact = -Infinity;
    this._isPunching = false;
    this._punchCooldownTimer = 0;
    this._lastPunchAt = 0;

    if (this._punchFistTween) {
      this._punchFistTween.stop();
      this._punchFistTween = null;
    }
    this._punchFist.setVisible(false);

    if (this._playerTintTimer) {
      this._playerTintTimer.remove();
      this._playerTintTimer = null;
    }

    this.player.clearTint();
    this.player.setPosition(this.spawnX, this.spawnY);
    this.player.body.setVelocity(0, 0);
    this.player.body.setAcceleration(0, 0);
    this._flashPlayerTint(config.player.lavaRespawnTint || '#ff4444', config.player.lavaRespawnTintDurationMs || 400);
  }

  _flashPlayerTint(colorStr, durationMs) {
    const tint = Phaser.Display.Color.HexStringToColor(colorStr).color;
    if (this._playerTintTimer) {
      this._playerTintTimer.remove();
      this._playerTintTimer = null;
    }

    this.player.setTint(tint);
    this._playerTintTimer = this.time.delayedCall(durationMs, () => {
      if (this.player && this.player.active) {
        this.player.clearTint();
      }
      this._playerTintTimer = null;
    });
  }

  _startLavaAnimation(config) {
    this.time.addEvent({
      delay: config.world.lavaPulseMs || 300,
      loop: true,
      callback: () => {
        for (let row = 0; row < this.tileMap.length; row++) {
          for (let col = 0; col < this.tileMap[row].length; col++) {
            if (this.tileMap[row][col] !== 9) continue;
            const sprite = this.blockSprites[row] && this.blockSprites[row][col];
            if (!sprite || !sprite.active) continue;
            if (sprite.texture.key !== 'block_lava') continue;

            const currentFrame = Number(sprite.frame.name) || 0;
            const nextFrame = currentFrame === 0 ? 1 : 0;
            sprite.setFrame(nextFrame);
            if (sprite.body && sprite.body.updateFromGameObject) {
              sprite.body.updateFromGameObject();
            }

            const glow = sprite.getData && sprite.getData('lavaGlow');
            if (glow) {
              glow.setAlpha(nextFrame === 0 ? 0.18 : 0.28);
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

    let key = 'crack_1';
    if (ratio <= 0.33) key = 'crack_3';
    else if (ratio <= 0.66) key = 'crack_2';

    const crack = this.add.image(col * this.TS + this.TS / 2, row * this.TS + this.TS / 2, key);
    crack.setDepth(5);
    this.blockCracks[row][col] = crack;
  }

  _removeCrackOverlay(col, row) {
    const crack = this.blockCracks[row] && this.blockCracks[row][col];
    if (!crack) return;
    crack.destroy();
    this.blockCracks[row][col] = null;
  }

  _fadeOutCrackOverlay(col, row) {
    const crack = this.blockCracks[row] && this.blockCracks[row][col];
    if (!crack) return;
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

  /* ═══════════════════════════════════════════════════════════════
     PARTICLES
     ═══════════════════════════════════════════════════════════════ */

  _spawnParticles(col, row, colorHexStr, config) {
    this._emitParticles(
      col,
      row,
      colorHexStr,
      config.effects.particleCount || 5,
      config.effects.particleSpeedMin || 30,
      config.effects.particleSpeedMax || 100,
      config.effects.particleLifetimeMs || 400,
      false
    );
  }

  _spawnBreakParticles(col, row, colorHexStr, config) {
    this._emitParticles(
      col,
      row,
      colorHexStr,
      config.effects.particleCountBreak || 12,
      config.effects.particleSpeedMin || 50,
      config.effects.particleSpeedMax || 150,
      config.effects.particleLifetimeMs || 500,
      true
    );
  }

  _emitParticles(col, row, colorHexStr, count, speedMin, speedMax, lifetime, hasGravity) {
    const cx = col * this.TS + this.TS / 2;
    const cy = row * this.TS + this.TS / 2;
    const color = Phaser.Display.Color.HexStringToColor(colorHexStr).color;

    for (let i = 0; i < count; i++) {
      const p = this.add.rectangle(cx, cy, 4, 4, color).setDepth(50);
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
     DEBUG
     ═══════════════════════════════════════════════════════════════ */

  _createDebugText() {
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(999);
  }

  _updateDebugText() {
    this.debugText.setText([
      `X:${Math.round(this.player.x)} Y:${Math.round(this.player.y)}`,
      `V:${Math.round(this.player.body.velocity.x)},${Math.round(this.player.body.velocity.y)}`,
      `G:${this.player.body.blocked.down} F:${this.playerFacing}`,
      `Anim:${this.currentAnim} Dmg:${this._blockDamage.size} Lava:${this._lavaDamageAccum}/${this._maxLavaHits}`,
      `FPS:${Math.round(this.game.loop.actualFps)}`
    ]);
  }

  /* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */

  _isInventoryOpen() {
    const ui = this.scene.get('UIScene');
    return !!(ui && ui.scene.isActive() && ui.inventoryOpen);
  }

  _isCustomTextureSource(value) {
    return typeof value === 'string' && (/^https?:\/\//i.test(value) || /\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(value));
  }
}
