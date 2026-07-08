# 🗺️ Astropia — Feature Tracker

Updated: 2026-07-09

---

## ✅ Implemented

- **Config-driven architecture** — all physics, world, block, item, farming, RNG, UI, SFX values in `config.json`
- **Boot sequence** — `BootScene` fetches `config.json` → `LoadScene` generates textures → `GameScene` runs game
- **Procedural textures** — player spritesheets, blocks, items, gems, seeds, fruits, fist, crack overlays all generated with Phaser Graphics API (no external image assets)
- **Procedural audio** — `SoundManager` generates punch-hit, break, place, collect, error sounds via WebAudio (no external audio assets)
- **Player: 1-tile tall chibi style** — 24×32 px sprite with idle (2-frame bob), run (4-frame leg swing), jump (1-frame), punch (2-frame) animations; flipped by movement direction
- **Growtopia-style physics** — acceleration + drag (not instant velocity), air control, max speed clamping
- **Jump: coyote time (80ms) + jump buffer (100ms)** — can jump briefly after walking off ledge; press early and jump queues until landing
- **Bunny-hop** — holding jump key re-jumps immediately on landing (Growtopia feel)
- **Hold-to-punch** — hold left-click to continuously punch with 350ms cooldown between hits
- **Block health with regen timer (5s)** — blocks track damage in a `Map` with last-hit timestamps; stop punching for 5s → HP regens to full (matches Growtopia)
- **Crack overlays** — 3 stages of procedural crack textures on damaged blocks; fade out on regen
- **Punch fist animation** — fist sprite tweens from player to target tile and retracts
- **Chebyshev/box reach** — `max(|dx|, |dy|) ≤ reach` for tile targeting
- **Green/red target marker** — green when in range & valid, red when out of range / unbreakable / blocked
- **Build ghost preview** — semi-transparent block preview when hovering buildable air tile in range
- **Block collision (static physics groups)** — `solidGroup` and `platformGroup` are persistent; blocks are dynamically added/removed on place/break
- **One-way platforms** — physics body is a thin 6px sliver at the top of the tile; player lands from above, passes through from below
- **Placement animation** — block scales from 0.6→1.0 with `Back.easeOut` over 120ms
- **Block break animation** — block fades alpha + shrinks over 150ms before removal
- **Punch particles** — 5 particles on hit, 12 particles on break, with gravity for break
- **Screen shake** — 2px, 100ms on block break
- **Camera deadzone** — 160×60 px center area where player moves freely without camera moving
- **Debug HUD** — position, velocity, grounded state, animation, damage entries, FPS
- **Dirt/grass auto-convert** — dirt tile shows grass top if tile above is air; reverts to plain dirt when covered by a solid block; updates propagate on place/break
- **Context menu prevention** — right-click blocked on canvas (canvas-level, not document)
- **Drag/select prevention** — `user-select: none`, `dragstart` and `selectstart` prevented on canvas
- **Phaser input.mouse.disableContextMenu()** — Phaser 3.55+ built-in context menu prevention
- **Block placing blocked on player position** — cannot place a block overlapping player body
- **World generation** — grass surface → dirt layer → dirt/rock mix → deep rock → bedrock (bottom row, unbreakable)
- **Camera follow with lerp** — smooth camera tracking

## 🚧 In Progress / Partially Done

- **Inventory / Hotbar UI** — `UIScene.js` not yet created; `config.json` has `inventory` section with starting items and hotbar settings, but no rendering
- **Item entities / drops** — blocks don't drop items on break yet (RNG drop table not wired)
- **Dirt with Grass item (itemId 2)** — removed from config; dirt always drops as itemId 1; grass-topping is visual-only
- **Block health array vs damage Map** — using both `this.blockHealth[][]` (for crack display) and `this._blockDamage` (for regen); slightly redundant, should merge in future
- **Farming / seeds** — config has seed items, growth timers, splicing recipes, but game logic not implemented

## ❌ Missing

- **Inventory system** — 40-slot inventory with addItem/removeItem, stacking, maxStack from config
- **Hotbar UI** — 10 visible slots at screen bottom; keyboard 1-0 and mouse wheel to select
- **Place from selected slot** — right-click currently always places dirt (blockId 1); should use inventory
- **Item entities in world** — physics-based item sprites, bobbing, spinning, magnet pickup
- **"+N ItemName" pickup text** — floating text on item collect
- **Drop key (Q)** — drop 1 of selected item in front of player
- **RNG drop table** — gems, seeds, extra drops from `config.rng` when breaking blocks
- **Seeded RNG** — `js/shared/RNG.js` not created; world seed from URL param not implemented
- **Procedural terrain (noise-based)** — surface height variation, caves, trees, clouds
- **Background parallax** — sun, mountains, background tile layer
- **Natural trees / world decoration** — tree placement during world gen
- **World seed from URL** — `?seed=XYZ` parameter support
- **Loading bar** — manual progress tracking during texture generation
- **Mock Server architecture** — all `server-mock/` files missing (GameServer, WorldGrid, ActionValidator, DropTable, FarmingEngine, NetworkClient)
- **Packet wiring** — `PacketType` enum defined but not used in client↔server flow
- **Custom crosshair cursor** — hide default cursor, draw Growtopia-style hand/finger cursor
- **Player name tag** — text label above player head
- **Chat box** — bottom-left chat log, T to open, Enter to send
- **Wrench / interact (E key)** — display tile info
- **Doors** — blockId 7 exists in config; no interaction logic
- **Full inventory panel** — Tab/I to open 40-slot grid overlay
- **Gem counter** — top-right HUD with gem icon + count
- **Void respawn** — falling past world bottom teleports to spawn
- **Pause / Esc menu** — overlay with Respawn and Close options
- **Multiplayer architecture** — all PacketTypes, NetworkClient, GameServer not wired
