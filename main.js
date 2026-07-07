import Phaser from "phaser";

import { GAME, PHYSICS } from "./config.js";
import { InputSystem } from "./systems/input.js";
import { InventorySystem } from "./systems/inventory.js";
import { PhysicsSystem } from "./systems/physics.js";
import { PlayerSystem } from "./systems/player.js";
import { UISystem } from "./systems/ui.js";
import { WorldSystem } from "./systems/world.js";

// main.js is the central loader. It imports each gameplay system, creates the
// Phaser scene, and coordinates update order without hiding logic in globals.
class AstropiaScene extends Phaser.Scene {
  constructor() {
    super("AstropiaScene");
  }

  preload() {
    this.createLoadingScreen();

    // Generated textures keep version 1 self-contained while preserving a real
    // loading phase for future image/audio files in assets/.
    this.load.on("progress", (value) => {
      this.loadingBar.width = 360 * value;
    });

    this.load.on("complete", () => {
      this.loadingText.setText("Preparing world...");
    });
  }

  create() {
    this.loadingGroup?.destroy(true);

    WorldSystem.createTextures(this);
    PlayerSystem.createTextures(this);

    this.inventorySystem = new InventorySystem();
    this.worldSystem = new WorldSystem(this);
    this.playerSystem = new PlayerSystem(this, this.worldSystem);
    this.physicsSystem = new PhysicsSystem(this, this.worldSystem, this.playerSystem, this.inventorySystem);
    this.inputSystem = new InputSystem(this);
    this.uiSystem = new UISystem(this, this.inventorySystem);

    this.cameras.main.setBounds(0, 0, this.worldSystem.widthInPixels, this.worldSystem.heightInPixels);
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);
  }

  update(_time, delta) {
    const selectedSlot = this.inputSystem.consumeHotbarSelection();
    if (selectedSlot !== null) {
      this.inventorySystem.selectSlot(selectedSlot);
    }

    for (const action of this.inputSystem.consumePointerActions()) {
      if (this.uiSystem.handlePointerAction(action, this.inventorySystem)) {
        continue;
      }

      const result = this.worldSystem.handlePointerAction(action, this.inventorySystem, this.playerSystem);
      if (!result.success) {
        this.uiSystem.showNotice(result.message);
      }
    }

    this.playerSystem.update(this.inputSystem, delta);
    this.uiSystem.update(delta);
  }

  createLoadingScreen() {
    this.loadingGroup = this.add.container(GAME.width / 2, GAME.height / 2);

    const panel = this.add.rectangle(0, 0, 440, 150, 0x0f172a, 0.9);
    panel.setStrokeStyle(2, 0x38bdf8, 0.65);

    const title = this.add.text(0, -46, "Astropia", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "34px",
      color: "#e0f2fe"
    }).setOrigin(0.5);

    this.loadingText = this.add.text(0, 0, "Loading systems...", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "16px",
      color: "#93c5fd"
    }).setOrigin(0.5);

    const barBack = this.add.rectangle(0, 44, 362, 18, 0x020617, 1).setOrigin(0.5);
    barBack.setStrokeStyle(1, 0x475569, 1);

    this.loadingBar = this.add.rectangle(-180, 44, 0, 16, 0x38bdf8, 1).setOrigin(0, 0.5);

    this.loadingGroup.add([panel, title, this.loadingText, barBack, this.loadingBar]);
  }
}

const gameConfig = {
  type: Phaser.CANVAS,
  parent: "game",
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: PHYSICS.gravityY },
      debug: false
    }
  },
  render: {
    pixelArt: true,
    antialias: false
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [AstropiaScene]
};

new Phaser.Game(gameConfig);
