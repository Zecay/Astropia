import { DEPTH, PLAYER } from "../config.js";

// PlayerSystem owns the player sprite and movement rules that are specific to
// direct character control. World collisions are wired by PhysicsSystem.
export class PlayerSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    const spawn = world.getSpawnPosition(PLAYER.spawnTileX);
    this.sprite = scene.physics.add.sprite(spawn.x, spawn.y, "player");
    this.sprite.setDepth(DEPTH.player);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight);
    this.sprite.body.setOffset(5, 2);
    this.sprite.body.setMaxVelocity(PLAYER.moveSpeed, 900);

    scene.cameras.main.startFollow(this.sprite, true, 0.09, 0.09);
  }

  static createTextures(scene) {
    const graphics = scene.add.graphics();

    graphics.clear();
    graphics.fillStyle(0xdbeafe, 1);
    graphics.fillRoundedRect(4, 2, 24, 28, 8);
    graphics.lineStyle(2, 0x172554, 1);
    graphics.strokeRoundedRect(4, 2, 24, 28, 8);

    // Helmet visor.
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillRoundedRect(9, 7, 14, 9, 4);
    graphics.lineStyle(1, 0x0f172a, 0.75);
    graphics.strokeRoundedRect(9, 7, 14, 9, 4);

    // Boots.
    graphics.fillStyle(0x334155, 1);
    graphics.fillRect(7, 28, 7, 4);
    graphics.fillRect(18, 28, 7, 4);

    graphics.generateTexture("player", 32, 32);
    graphics.destroy();
  }

  update(inputSystem) {
    const direction = inputSystem.getHorizontalDirection();
    this.sprite.setVelocityX(direction * PLAYER.moveSpeed);

    if (direction !== 0) {
      this.sprite.setFlipX(direction < 0);
    }

    if (inputSystem.consumeJump() && this.isGrounded()) {
      this.sprite.setVelocityY(PLAYER.jumpVelocity);
    }
  }

  isGrounded() {
    return this.sprite.body.blocked.down || this.sprite.body.touching.down;
  }

  getCenter() {
    return {
      x: this.sprite.body.center.x,
      y: this.sprite.body.center.y
    };
  }

  getBounds() {
    return {
      left: this.sprite.body.x,
      right: this.sprite.body.x + this.sprite.body.width,
      top: this.sprite.body.y,
      bottom: this.sprite.body.y + this.sprite.body.height
    };
  }
}
