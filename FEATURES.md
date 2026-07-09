# 🗺️ Astropia — Feature Tracker

Updated: 2026-07-09

---

## ✅ Implemented

- Config-driven architecture — gameplay values live in `config.json`
- Boot → Load → Game scene flow
- Procedural textures for player, blocks, items, cracks, fist, wrench, gem, seeds
- Procedural WebAudio SFX via `SoundManager`
- Custom texture URL/path support for block/item `texture` keys with fallback to procedural art
- 1-tile-tall chibi player with idle / run / jump / punch animations and facing flip
- Growtopia-style acceleration / drag movement
- Coyote time + jump buffer + bunny-hop feel
- Wall-climb prevention using grounded checks plus seamless full-tile collisions
- Flat v1 world layout updated to 100×60:
  - Y0–24 air
  - Y25 grass surface
  - Y26–28 pure dirt
  - Y29–48 dirt + 5% rock
  - Y49–53 lava ramp
  - Y54–59 bedrock
- Cave background layer underground (non-solid, no collision)
- Dirt/grass auto-convert visuals based on exposure to air
- Seamless full-tile solid collision bodies for world blocks and placed blocks
- Fast punching: 200ms cooldown, faster player punch animation, snappier fist tween
- Fist tween aims from player toward the target tile
- Crack overlays at depth 5 with per-block regen timers
- Block placement with ghost preview and placement animation
- Smart left-click: fist punch / wrench inspect / block place / seed stub
- Bedrock unbreakable with red invalid target marker in fist mode
- Lava pulse animation fixed to frame-swap without flicker/disappear
- Lava damage-over-time with knockback, bounce-up, red hit tint, i-frames, respawn after configurable hits
- Void respawn
- Landing thud + dust particles
- Wrench tile info stub
- Block drops, seed drops, direct gem drops to HUD counter, floating pickup text
- Item entities with light gravity, air float, spin while falling, landed bob, direct-overlap pickup, no magnet pull
- PlayerInventory with 40 slots total and 4-slot quick bar
- Slot 0 permanently reserved for Fist/Wrench
- Quick-bar auto-populates slots 1–3 with newly acquired item types when available
- UIScene hotbar centered at bottom with 4 slots
- Full 40-slot inventory panel (8×5) with click-to-select on any slot
- Holding indicator for selected deep-inventory items outside the quick bar
- Number keys `0` / `1` / `2` / `3`, Tab, Shift+Tab, and mouse wheel for quick-slot selection
- Gem counter HUD top-right
- Right-click / context menu suppressed

## 🚧 In Progress / Partial

- Wrench interactions beyond tile inspection
- Seeds exist as items, but planting / farming flow is still stubbed
- Tree items / future farming items are defined in config for later use
- Chat key binding exists, but chat UI is still a stub

## ❌ Missing

- Farming, planting, growth, harvesting, splicing
- Noise-based terrain / caves / procedural surface variation
- Crosshair cursor
- Player nametag
- Drag-and-drop inventory management
- Dropping items from inventory UI
- Doors / signs / locks / interactive world objects
- Shops / gem spending
- Multiplayer / networking / authoritative server wiring
- Packet flow usage beyond the shared enum stub
- World seed from URL
- Background parallax / decorative sky layers
