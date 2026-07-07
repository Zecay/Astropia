import { BLOCK_IDS, BLOCKS, DEPTH, TILE_SIZE, WORLD } from "../config.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// WorldSystem owns terrain data, block sprites, block breaking/placement, and
// physical item drops. It intentionally keeps generation deterministic for now
// so save/load can later persist or reproduce worlds cleanly.
export class WorldSystem {
  constructor(scene) {
    this.scene = scene;
    this.widthInTiles = WORLD.widthInTiles;
    this.heightInTiles = WORLD.heightInTiles;
    this.widthInPixels = this.widthInTiles * TILE_SIZE;
    this.heightInPixels = this.heightInTiles * TILE_SIZE;

    this.tiles = Array.from({ length: this.heightInTiles }, () => Array(this.widthInTiles).fill(BLOCK_IDS.AIR));
    this.blockSprites = Array.from({ length: this.heightInTiles }, () => Array(this.widthInTiles).fill(null));
    this.surfaceHeights = Array(this.widthInTiles).fill(WORLD.baseSurfaceTileY);

    this.blockGroup = scene.physics.add.staticGroup();
    this.itemDrops = scene.physics.add.group({
      allowGravity: true,
      collideWorldBounds: false
    });

    this.createBackground();
    this.generateTerrain();
  }

  static createTextures(scene) {
    const graphics = scene.add.graphics();

    const makeBlock = (textureKey, baseColor, options = {}) => {
      graphics.clear();
      graphics.fillStyle(baseColor, 1);
      graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

      if (options.grassTop) {
        graphics.fillStyle(0x52d273, 1);
        graphics.fillRect(0, 0, TILE_SIZE, 9);
        graphics.fillStyle(0x277a3d, 1);
        graphics.fillRect(0, 8, TILE_SIZE, 3);
      }

      if (options.noiseColor) {
        graphics.fillStyle(options.noiseColor, 0.35);
        for (let i = 0; i < 13; i++) {
          const x = (i * 11) % TILE_SIZE;
          const y = (i * 17) % TILE_SIZE;
          graphics.fillRect(x, y, 4, 4);
        }
      }

      graphics.lineStyle(1, 0x000000, 0.28);
      graphics.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      graphics.generateTexture(textureKey, TILE_SIZE, TILE_SIZE);
    };

    makeBlock(BLOCKS[BLOCK_IDS.GRASS].texture, 0x8b5a2b, { grassTop: true, noiseColor: 0x4a2c18 });
    makeBlock(BLOCKS[BLOCK_IDS.DIRT].texture, 0x9a6a3a, { noiseColor: 0x5b3920 });
    makeBlock(BLOCKS[BLOCK_IDS.STONE].texture, 0x8b95a1, { noiseColor: 0x4b5563 });

    Object.values(BLOCKS)
      .filter((block) => block.itemTexture)
      .forEach((block) => {
        graphics.clear();
        graphics.fillStyle(block.color, 1);
        graphics.fillRoundedRect(2, 2, 14, 14, 3);
        graphics.lineStyle(1, 0xffffff, 0.5);
        graphics.strokeRoundedRect(2.5, 2.5, 13, 13, 3);
        graphics.generateTexture(block.itemTexture, 18, 18);
      });

    graphics.destroy();
  }

  createBackground() {
    // Lightweight parallax-style background generated with Phaser primitives.
    const sky = this.scene.add.rectangle(0, 0, this.widthInPixels, this.heightInPixels, 0x122034)
      .setOrigin(0)
      .setDepth(DEPTH.background);

    const stars = this.scene.add.graphics().setDepth(DEPTH.background + 1);
    stars.fillStyle(0xe0f2fe, 0.85);

    for (let i = 0; i < 180; i++) {
      const x = (i * 137) % this.widthInPixels;
      const y = (i * 61) % (WORLD.baseSurfaceTileY * TILE_SIZE - 60);
      const size = i % 11 === 0 ? 2 : 1;
      stars.fillRect(x, y + 24, size, size);
    }

    this.background = sky;
    this.stars = stars;
  }

  generateTerrain() {
    for (let x = 0; x < this.widthInTiles; x++) {
      const surfaceY = this.getGeneratedSurfaceY(x);
      this.surfaceHeights[x] = surfaceY;

      for (let y = surfaceY; y < this.heightInTiles; y++) {
        let blockId = BLOCK_IDS.STONE;

        if (y === surfaceY) {
          blockId = BLOCK_IDS.GRASS;
        } else if (y < surfaceY + WORLD.dirtDepth) {
          blockId = BLOCK_IDS.DIRT;
        }

        this.setBlockAtTile(x, y, blockId, { spawnDrop: false });
      }
    }
  }

  getGeneratedSurfaceY(x) {
    const rollingHill = Math.sin(x * 0.18) * 2.3;
    const longSlope = Math.sin(x * 0.055) * 3.2;
    return clamp(
      Math.round(WORLD.baseSurfaceTileY + rollingHill + longSlope),
      10,
      this.heightInTiles - 12
    );
  }

  worldToTile(worldX, worldY) {
    return {
      x: Math.floor(worldX / TILE_SIZE),
      y: Math.floor(worldY / TILE_SIZE)
    };
  }

  tileToWorldCenter(tileX, tileY) {
    return {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2
    };
  }

  isInBounds(tileX, tileY) {
    return tileX >= 0 && tileX < this.widthInTiles && tileY >= 0 && tileY < this.heightInTiles;
  }

  getBlockIdAtTile(tileX, tileY) {
    if (!this.isInBounds(tileX, tileY)) return BLOCK_IDS.AIR;
    return this.tiles[tileY][tileX];
  }

  setBlockAtTile(tileX, tileY, blockId, options = {}) {
    if (!this.isInBounds(tileX, tileY)) return false;

    const oldSprite = this.blockSprites[tileY][tileX];
    if (oldSprite) {
      this.blockGroup.remove(oldSprite, true, true);
      this.blockSprites[tileY][tileX] = null;
    }

    this.tiles[tileY][tileX] = blockId;

    if (blockId !== BLOCK_IDS.AIR) {
      const block = BLOCKS[blockId];
      const center = this.tileToWorldCenter(tileX, tileY);
      const sprite = this.blockGroup.create(center.x, center.y, block.texture);
      sprite.setDepth(DEPTH.blocks);
      sprite.setData("tileX", tileX);
      sprite.setData("tileY", tileY);
      sprite.setData("blockId", blockId);
      sprite.refreshBody();
      this.blockSprites[tileY][tileX] = sprite;
    }

    if (options.spawnDrop) {
      this.spawnItemDrop(blockId, tileX, tileY);
    }

    return true;
  }

  breakBlockAt(tileX, tileY) {
    const blockId = this.getBlockIdAtTile(tileX, tileY);
    if (blockId === BLOCK_IDS.AIR) {
      return { success: false, message: "There is no block to break." };
    }

    this.setBlockAtTile(tileX, tileY, BLOCK_IDS.AIR);
    this.spawnItemDrop(blockId, tileX, tileY);
    return { success: true, message: `Broke ${BLOCKS[blockId].name}.` };
  }

  placeBlockAt(tileX, tileY, blockId, playerBounds) {
    if (!this.isInBounds(tileX, tileY)) {
      return { success: false, message: "That spot is outside the world." };
    }

    if (this.getBlockIdAtTile(tileX, tileY) !== BLOCK_IDS.AIR) {
      return { success: false, message: "That spot is already occupied." };
    }

    if (!BLOCKS[blockId]?.solid) {
      return { success: false, message: "Select a block before placing." };
    }

    if (!this.hasSolidNeighbor(tileX, tileY)) {
      return { success: false, message: "Place blocks next to existing terrain." };
    }

    if (this.tileIntersectsBounds(tileX, tileY, playerBounds)) {
      return { success: false, message: "Cannot place blocks inside the player." };
    }

    this.setBlockAtTile(tileX, tileY, blockId);
    return { success: true, message: `Placed ${BLOCKS[blockId].name}.` };
  }

  hasSolidNeighbor(tileX, tileY) {
    const neighbors = [
      [tileX + 1, tileY],
      [tileX - 1, tileY],
      [tileX, tileY + 1],
      [tileX, tileY - 1]
    ];

    return neighbors.some(([x, y]) => BLOCKS[this.getBlockIdAtTile(x, y)]?.solid);
  }

  tileIntersectsBounds(tileX, tileY, bounds) {
    if (!bounds) return false;

    const tileLeft = tileX * TILE_SIZE;
    const tileRight = tileLeft + TILE_SIZE;
    const tileTop = tileY * TILE_SIZE;
    const tileBottom = tileTop + TILE_SIZE;

    return !(
      tileRight <= bounds.left ||
      tileLeft >= bounds.right ||
      tileBottom <= bounds.top ||
      tileTop >= bounds.bottom
    );
  }

  isWithinInteractionRange(player, tileX, tileY) {
    const playerCenter = player.getCenter();
    const tileCenter = this.tileToWorldCenter(tileX, tileY);
    const distance = distanceBetween(playerCenter, tileCenter);
    return distance <= WORLD.interactionRange;
  }

  handlePointerAction(action, inventory, player) {
    const tile = this.worldToTile(action.worldX, action.worldY);

    if (!this.isInBounds(tile.x, tile.y)) {
      return { success: false, message: "Outside the world." };
    }

    if (!this.isWithinInteractionRange(player, tile.x, tile.y)) {
      return { success: false, message: "Move closer to interact." };
    }

    const targetBlockId = this.getBlockIdAtTile(tile.x, tile.y);

    // Primary/tap breaks blocks. If the target tile is empty, it places instead
    // so touch screens can still use the core block-placement loop.
    if (action.button === "primary" && targetBlockId !== BLOCK_IDS.AIR) {
      return this.breakBlockAt(tile.x, tile.y);
    }

    if (!inventory.canPlaceSelectedBlock()) {
      return { success: false, message: "No selected blocks to place." };
    }

    const selectedBlockId = inventory.getSelectedBlockId();
    const placement = this.placeBlockAt(tile.x, tile.y, selectedBlockId, player.getBounds());

    if (placement.success) {
      inventory.removeSelectedBlock(1);
    }

    return placement;
  }

  spawnItemDrop(blockId, tileX, tileY) {
    if (blockId === BLOCK_IDS.AIR) return null;

    const block = BLOCKS[blockId];
    const center = this.tileToWorldCenter(tileX, tileY);
    const drop = this.itemDrops.create(center.x, center.y, block.itemTexture);

    drop.setDepth(DEPTH.items);
    drop.setData("blockId", blockId);
    drop.setData("quantity", 1);
    drop.setBounce(0.18);
    drop.setDragX(45);
    drop.setMaxVelocity(180, 500);
    drop.setVelocity((Math.random() - 0.5) * 90, -135);

    if (drop.body) {
      drop.body.setSize(14, 14);
      drop.body.setOffset(2, 2);
    }

    return drop;
  }

  getSpawnPosition(tileX) {
    const clampedX = clamp(tileX, 0, this.widthInTiles - 1);
    const surfaceY = this.surfaceHeights[clampedX];

    return {
      x: clampedX * TILE_SIZE + TILE_SIZE / 2,
      y: surfaceY * TILE_SIZE - 24
    };
  }
}
