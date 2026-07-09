# 🌌 Astropia

A 2D sandbox platformer inspired by *Growtopia*, built with **Phaser 3** (Arcade Physics) and ES6 JavaScript.

> **Repository:** [github.com/Zecay/Astropia](https://github.com/Zecay/Astropia)

---

## 🎯 Design Philosophy

- **Config-driven:** Every magic number lives in `config.json`. Tweak the game without touching a single JS file.
- **Multiplayer-ready:** A strict **Mock Server / Client** architecture separates rendering from authoritative game logic. All actions are validated server-side.
- **Modular ES6:** Clean file separation — scenes, physics, world logic, networking, and UI are independent modules.

---

## 📁 Project Structure

```
Astropia/
├── config.json                        ← Centralized config (no hardcoded values)
├── index.html                         ← Entry page
├── css/
│   └── style.css                      ← Minimal layout styling
├── assets/
│   └── textures/                      ← (Future) sprite & block images
├── js/
│   ├── main.js                        ← Boot sequence (fetch config → create Phaser game)
│   ├── shared/
│   │   ├── PacketTypes.js             ← Packet type enums for client↔server messages
│   │   └── Constants.js               ← Shared helpers
│   ├── client/
│   │   ├── NetworkClient.js           ← Sends action packets to (mock) server
│   │   └── scenes/
│   │       ├── BootScene.js           ← Fetches config.json, validates, stores in registry
│   │       ├── LoadScene.js           ← Generates placeholder textures + loading bar
│   │       ├── GameScene.js           ← Main game loop: player, world, interactions
│   │       └── UIScene.js             ← Inventory & HUD overlay (future)
│   └── server-mock/
│       ├── GameServer.js              ← Processes action packets, orchestrates validation
│       ├── WorldGrid.js               ← Authoritative tile matrix
│       ├── ActionValidator.js         ← Validates punch / build / place actions
│       ├── DropTable.js               ← RNG-based loot drops from config
│       └── FarmingEngine.js           ← Seed growth timers & splicing recipes
```

---

## 🚀 Getting Started

### 1. Serve locally

Because `index.html` uses `fetch()` to load `config.json` and loads Phaser from a CDN, you **must** serve it via HTTP:

```bash
cd Astropia
python3 -m http.server 8080
```

### 2. Open in browser

Navigate to [http://localhost:8080](http://localhost:8080)

### 3. Play

| Action                | Input                        |
|-----------------------|------------------------------|
| Move left / right     | `← →` / `A D`               |
| Jump                  | `Space` / `↑` / `W`         |
| Smart left-click      | Fist=punch, Block=place, ... |
| Select hotbar slot    | `0`-`9`                     |
| Cycle hotbar          | `Tab` / `Shift+Tab` / Wheel |
| Toggle Fist/Wrench    | `F`                          |
| Open inventory        | `I`                          |
| Close inventory       | `I` / `Esc`                  |
| Chat (stub)           | `Enter`                      |

---

## 🎮 Current Features (MVP)

- ✅ Config-driven physics (gravity, acceleration, drag, jump)
- ✅ Growtopia-style movement (accel-on-press, drag-on-release)
- ✅ Player sprite (32×64) with proper collision against solid blocks
- ✅ One-way platform collision (jump-through)
- ✅ World generation from config dimensions
- ✅ Tile targeting with reach validation
- ✅ Punch/destroy blocks (left-click)
- ✅ Place blocks (right-click)
- ✅ Placeholder textures generated in code (no external assets needed)

---

## 🧪 Planned Features

- Inventory grid UI (hotbar at bottom)
- Farming: plant seeds → trees grow on a timer → harvest fruit
- Splicing: combine two seed types to create new blocks
- RNG loot drops (gems, seeds, extra items)
- Block health (multi-punch to break)
- Mock Server validates all actions & maintains authoritative state
- Background blocks (decorative, no collision)
- Multiplayer via WebSockets

---

## 🧱 Architecture for Multiplayer

```
 ┌──────────┐   Action Packet   ┌────────────┐   Validate   ┌──────────────┐
 │  Client   │ ────────────────→ │ Mock Server │ ──────────→ │ ActionValid. │
 │ (Phaser)  │                   │ (EventDriven)│             │ + WorldGrid  │
 │           │ ←──────────────── │             │ ←────────── │              │
 │           │   Tile Update /   └────────────┘   Response   └──────────────┘
 │           │   Inventory Sync
 └──────────┘

The client NEVER makes authoritative decisions. It renders what the server tells it to.
When multiplayer is added, swap MockServer for a real WebSocket server — the packet
contract stays the same.
```

---

## ⚙️ Configuration (`config.json`)

All gameplay parameters are driven by `config.json`:

```jsonc
{
  "physics": {
    "gravity": 1800,
    "playerMaxSpeedX": 260,
    "playerAccelerationX": 2800,
    "playerDragX": 2600,
    "jumpVelocity": -550,
    "playerReachTiles": 4
  },
  "world": {
    "tileSize": 32,          // strictly 32
    "worldWidthTiles": 100,
    "worldHeightTiles": 60
  },
  "blocks": {
    "1": { "name": "dirt", "solid": true, "foreground": true, "health": 6, ... }
  },
  "items": { ... },
  "farming": { "splicingRecipes": [...] },
  "rng": { ... }
}
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE) (TBD)
