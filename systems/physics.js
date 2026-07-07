import { PHYSICS } from "../config.js";

// PhysicsSystem is intentionally thin for version 1. It centralizes gravity,
// collisions, and pickup overlap rules so later movement/saving/multiplayer
// changes have one place to hook into physical behavior.
export class PhysicsSystem {
  constructor(scene, world, player, inventory) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.inventory = inventory;

    scene.physics.world.gravity.y = PHYSICS.gravityY;
    scene.physics.world.setBounds(0, 0, world.widthInPixels, world.heightInPixels);

    this.playerWorldCollider = scene.physics.add.collider(player.sprite, world.blockGroup);
    this.itemWorldCollider = scene.physics.add.collider(world.itemDrops, world.blockGroup);
    this.pickupOverlap = scene.physics.add.overlap(player.sprite, world.itemDrops, this.handlePickup, undefined, this);
  }

  handlePickup(_playerSprite, itemSprite) {
    const blockId = itemSprite.getData("blockId");
    const quantity = itemSprite.getData("quantity") ?? 1;
    const accepted = this.inventory.addItem(blockId, quantity);

    if (accepted >= quantity) {
      itemSprite.destroy();
    } else if (accepted > 0) {
      itemSprite.setData("quantity", quantity - accepted);
    }
  }
}
