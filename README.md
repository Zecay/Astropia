# 🌌 Astropia

A 2D sandbox platformer inspired by *Growtopia*, built with **Phaser 3** (Arcade Physics) and vanilla ES6 JavaScript.

> **Repository:** [github.com/Zecay/Astropia](https://github.com/Zecay/Astropia)

---

## 🎯 Design Philosophy

- **Config-driven:** Tunable gameplay values live in `config.json`.
- **Procedural-first:** Blocks, items, player sprites, cracks, and SFX are generated in code.
- **Growtopia feel:** Fast punching, snappy movement, layered underground, dropped items, hotbar + inventory.

---

## 🚀 Getting Started

Because `index.html` fetches `config.json`, serve the project over HTTP:

```bash
cd Astropia
python3 -m http.server 8080
```

Then open:

- [http://localhost:8080](http://localhost:8080)

---

## 🎮 Controls

| Action | Input |
|---|---|
| Move | `A D` / `← →` |
| Jump | `Space` / `W` / `↑` |
| Smart left-click | Punch / wrench / place depending on selected slot |
| Select quick slot | `0` = Fist/Wrench, `1` / `2` / `3` = hotbar slots |
| Cycle quick bar | `Tab`, `Shift+Tab`, mouse wheel |
| Toggle Fist/Wrench | `F` |
| Open / close inventory | `I` |
| Close inventory | `Esc` |
| Chat stub | `Enter` |

---

## ✅ Current Gameplay Features

- 100×60 world with:
  - Y0–24 air
  - Y25 grass surface
  - Y26–28 pure dirt
  - Y29–48 dirt + 5% rock
  - Y49–53 lava ramp
  - Y54–59 bedrock
- Cave background layer underground
- 1-tile-tall chibi player with idle / run / jump / punch animations
- Growtopia-style acceleration, drag, coyote time, jump buffer, bunny-hop feel
- Fast 200ms punching with fist tween aimed toward the target tile
- Breakable dirt / rock / lava, unbreakable bedrock
- Crack overlays and per-block regen timers
- Dirt-to-grass surface visual updates when tiles are exposed / covered
- Lava pulse animation, damage-over-time hits, knockback, tint, respawn
- Seamless full-tile solid collisions with no micro-gaps between blocks
- Block placement with ghost preview and placement animation
- Item drops with light gravity, spin in air, constant float, landed bob, overlap pickup
- Gems go directly to the counter with floating text
- 4-slot quick bar + 40-slot inventory panel
- Slot 0 permanently reserved for Fist/Wrench
- New item types auto-fill quick slots 1–3 when available
- Wrench tile inspection stub
- Procedural SFX via WebAudio

---

## 🖼️ Custom Textures

The `texture` field in `config.json` is a **Phaser texture key**.

### Built-in procedural keys

Examples:

- `block_dirt`
- `block_grass`
- `block_rock`
- `block_lava`
- `block_bedrock`
- `block_cavebg`
- `item_dirt`
- `item_rock`
- `item_lava`
- `item_cavebg`
- `item_seed_dirt`
- `item_seed_rock`
- `item_seed_lava`
- `item_gem`
- `fist`
- `wrench`

### Using your own image

You can also point `texture` to:

- an `http://` or `https://` image URL, or
- a local image path ending in `.png`, `.jpg`, `.jpeg`, or `.webp`

Example:

```json
{
  "blocks": {
    "3": {
      "name": "rock",
      "texture": "https://example.com/rock.png"
    }
  }
}
```

Astropia will automatically preload that image before `LoadScene`. If the image loads successfully, procedural generation is skipped for that texture and the custom art is used as-is. If loading fails, the game falls back to the procedural texture.

This makes it easy to swap placeholder art for real sprites later without changing gameplay code.

---

## 📁 Project Structure

```text
Astropia/
├── config.json
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── shared/
│   │   └── PacketTypes.js
│   └── client/
│       ├── PlayerInventory.js
│       ├── SoundManager.js
│       └── scenes/
│           ├── BootScene.js
│           ├── LoadScene.js
│           ├── GameScene.js
│           └── UIScene.js
└── FEATURES.md
```

---

## 🧪 Planned / Future Work

- Farming / seeds / tree growth
- Splicing
- Noise-based terrain / caves
- Chat UI
- Doors / locks / signs
- Name tags
- Multiplayer / networking
- Drag-and-drop inventory management

---

## 📄 License

MIT — see `LICENSE` when added.
