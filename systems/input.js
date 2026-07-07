// InputSystem centralizes keyboard and pointer input. Other systems ask this
// class for intent instead of binding directly to browser/Phaser events.

export class InputSystem {
  constructor(scene) {
    this.scene = scene;
    this.pointerActions = [];
    this.pendingHotbarSelection = null;
    this.jumpQueued = false;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys({
      left: "A",
      right: "D",
      up: "W",
      jump: "SPACE"
    });

    this.registerKeyboardEvents();
    this.registerPointerEvents();
  }

  registerKeyboardEvents() {
    this.scene.input.keyboard.on("keydown", (event) => {
      // Digit1 through Digit9 select hotbar slots 0 through 8.
      if (event.code?.startsWith("Digit")) {
        const digit = Number(event.code.replace("Digit", ""));
        if (digit >= 1 && digit <= 9) {
          this.pendingHotbarSelection = digit - 1;
        }
      }

      // Queue a jump press so player movement can consume it during update.
      if (!event.repeat && ["Space", "KeyW", "ArrowUp"].includes(event.code)) {
        this.jumpQueued = true;
      }
    });
  }

  registerPointerEvents() {
    this.scene.input.mouse?.disableContextMenu();

    this.scene.input.on("pointerdown", (pointer) => {
      const isSecondary = pointer.rightButtonDown?.() ?? false;

      this.pointerActions.push({
        button: isSecondary ? "secondary" : "primary",
        worldX: pointer.worldX,
        worldY: pointer.worldY,
        screenX: pointer.x,
        screenY: pointer.y
      });
    });
  }

  getHorizontalDirection() {
    const movingLeft = this.cursors.left.isDown || this.keys.left.isDown;
    const movingRight = this.cursors.right.isDown || this.keys.right.isDown;

    if (movingLeft && !movingRight) return -1;
    if (movingRight && !movingLeft) return 1;
    return 0;
  }

  consumeJump() {
    const shouldJump = this.jumpQueued;
    this.jumpQueued = false;
    return shouldJump;
  }

  consumeHotbarSelection() {
    const selected = this.pendingHotbarSelection;
    this.pendingHotbarSelection = null;
    return selected;
  }

  consumePointerActions() {
    const actions = this.pointerActions;
    this.pointerActions = [];
    return actions;
  }
}
