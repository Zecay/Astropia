# 🗺️ Astropia — Feature Tracker

Updated: 2026-07-09

---

## ✅ Implemented

- **Config-driven architecture** — all physics, world, block, item, farming, RNG, UI, SFX values in `config.json`
- **Boot sequence** — `BootScene` fetches `config.json` → `LoadScene` generates textures → `GameScene` runs game
- **Procedural textures** — player spritesheets, blocks (dirt/grass, rock, bedrock, lava spritesheet), items, gems, seeds (dirt/rock/lava), wrench icon, crack overlays all generated with Phaser Graphics API (no external image assets)
- **Procedural audio** — `SoundManager` generates punch-hit, break, place, collect, error, select, wrench, hurt, land sounds via WebAudio (no external audio assets)
- **Player: 1-tile tall chibi style** — 24×32 px sprite with idle (2-frame bob), run (4-frame leg swing), jump (1-frame), punch (2-frame) animations; flipped by movement direction
- **Growtopia-style physics** — acceleration + drag (not instant velocity), air control, max speed clamping
- **Jump: coyote time (80ms) + jump buffer (100ms)** — can jump briefly after walking off ledge; press early and jump queues until landing
- **Bunny-hop** — holding jump key re-jumps immediately on landing (Growtopia feel)
- **Wall-climb fix** — stable grounded tracking prevents climbing walls by holding jump
- **Camera flicker fixed** — block break animation uses disposable non-physics clone; physics removal happens immediately
- **Jump keys: Space / W / Up arrow** — three keys all trigger jump
- **Hold-to-punch** — hold left-click to continuously punch with 350ms cooldown between hits; wall-time double-fire prevention
- **Block health with per-block regen** — blocks track damage in a `Map` with last-hit timestamps; regen matches per-block `regenMs` (Dirt: 5s, Rock: 8s, Lava: 5s)
- **Crack overlays** — 3 stages of procedural crack textures on damaged blocks; fade out on regen
- **Punch fist animation** — fist sprite tweens from player to target tile and retracts
- **Chebyshev/box reach** — `max(|dx|, |dy|) ≤ reach` for tile targeting; reach = 3 tiles
- **Green/red target marker** — context-sensitive based on selected item: green/red for fist, blue for wrench, ghost for block placing, orange for seed
- **Build ghost preview** — semi-transparent block preview when hovering buildable air tile in range; uses actual block texture
- **Block collision (static physics groups)** — `solidGroup` and `platformGroup` are persistent; blocks are dynamically added/removed on place/break
- **Placement animation** — block scales from 0.6→1.0 with `Back.easeOut` over 120ms
- **Punch particles** — 5 particles on hit, 12 particles on break, with gravity for break
- **Screen shake** — 0.002 intensity, 100ms on block break (small enough to not cause visible issues)
- **Camera deadzone** — 160×60 px center area where player moves freely without camera moving
- **Debug HUD** — position, velocity, grounded state, animation, damage entries, FPS
- **Dirt/grass auto-convert** — dirt tile shows grass texture if tile above is air; reverts to plain dirt when covered by a solid block; updates propagate on place/break
- **Context menu prevention** — right-click blocked via `disableContextMenu()`, event listeners, and CSS
- **Drag/select prevention** — `user-select: none`, `dragstart` and `selectstart` prevented on canvas
- **Flat v1 world generation** — 1 surface grass row, 3 pure dirt rows below, mixed dirt/rock layer with 5% rock chance, lava near bedrock (60% at bedrock top, decreasing to 0% at 6 tiles above), 6 unbreakable bedrock rows at bottom
- **Lava glow/pulse animation** — lava spritesheet (2 frames) swaps every 500ms for animated glow effect
- **Lava damage** — touching lava respawns player at spawn with hurt sound and brief red tint
- **Void respawn** — falling below world bottom respawns player at spawn
- **Landing thud** — when player lands from fall faster than 200px/s: `land` sound + 3 gray dust particles at feet
- **PlayerInventory class** — 40-slot inventory with stacking, addItem/removeItem, gem counter (separate from slots), fist/wrench toggle, slot 0 permanently fist/wrench, `inventoryChanged` event emission
- **UIScene hotbar** — 10 slots at bottom-center; slot 0 shows fist/wrench icon, slots 1-9 show item icons with stack counts; selected slot has gold border; item name tooltip fades after 2s
- **Gem counter** — top-right HUD with gem icon + count, updates on inventory change
- **Full inventory panel** — toggle with I key or Esc to close; 40-slot grid (8 columns); clicking a slot selects it; first row mirrors hotbar
- **Hotbar input** — number keys 0-9 select slots, Tab/Shift+Tab cycle, mouse wheel cycles, F toggles fist/wrench, I opens inventory, Enter prints chat stub
- **Smart left-click** — context-sensitive based on selected item: fist = punch, wrench = tile info, block = place, seed = stub (no action yet), other = error sound
- **Right-click does nothing** — matches Growtopia behavior
- **Item entities** — physics-based item sprites (24×24), circular body, bounce up on spawn, spin in air, bob when landed, magnet pull within 80px, collected on player overlap, no despawn timer
- **Block drops** — guaranteed 1× block item on break; seed drops based on per-block chance (dirt: 25%, rock: 15%, lava: 10%); gem drops direct to counter with floating "+N 💎" text
- **Floating "+N ItemName" text** — on item collect and gem drop, rises 40px over 800ms and fades
- **Collect sound** — plays on item pickup
- **Starting items** — 50 Dirt in slot 1, 10 Gems

## 🚧 In Progress / Partially Done

- **Wrench interactions** — wrench click shows tile info in console/debug text; no door/sign/lock interactions yet
- **Seeds** — 3 seed types defined (Dirt Seed, Rock Seed, Lava Seed) with growth timers; planting not implemented (left-click with seed does nothing)
- **Tree blocks** — Dirt Tree (20), Rock Tree (21), Lava Tree (22) defined in config for future farming; not placeable or obtainable
- **Chat** — Enter key is bound but prints a console stub only

## ❌ Missing

- **Farming / seed planting** — seed items exist but planting/splicing/harvesting not implemented
- **Procedural terrain (noise-based)** — flat world only; no surface variation, caves
- **Trees, clouds, platforms, doors** — removed for v1 flat world; will be re-added in future versions
- **Pause / Esc menu** — Esc only closes inventory panel for now
- **Custom crosshair cursor** — default browser cursor used
- **Player name tag** — no text label above player head
- **Inventory drag-and-drop** — not implemented; dropping items not in scope for this version
- **Mock Server architecture** — all `server-mock/` files missing (GameServer, WorldGrid, ActionValidator, DropTable, FarmingEngine, NetworkClient)
- **Packet wiring** — `PacketType` enum defined but not used in client↔server flow
- **Multiplayer architecture** — all PacketTypes, NetworkClient, GameServer not wired
- **World seed from URL** — `?seed=XYZ` parameter not supported
- **Seeded RNG** — `js/shared/RNG.js` not created
- **Background parallax** — sky blue background color only; no mountains/sun/cloud background layers
- **Shop / spending gems** — gem counter is display-only
- **Loading bar** — manual progress tracking during texture generation not implemented
