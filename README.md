# Astropia

Astropia is a modular 2D browser-based sandbox game foundation built with **HTML**, **CSS**, **JavaScript ES Modules**, and **Phaser 3**.

This first version focuses on the playable foundation: player movement, gravity, terrain generation, block breaking/placing, item drops, pickups, and a hotbar UI.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build

```bash
npm run build
```

## Controls

- **A / D** or **Left / Right arrows**: move
- **Space**, **W**, or **Up arrow**: jump
- **Click / tap a block**: break it
- **Click / tap an empty tile**: place the selected block
- **Right click an empty tile**: place the selected block
- **1-9** or click the hotbar: select a hotbar slot

## Project structure

```text
Astropia/
├── index.html
├── main.js              # Central Phaser loader and scene orchestration
├── config.js            # Game, world, block, player, physics, and UI settings
├── package.json
├── README.md
├── style.css
│
├── systems/
│   ├── player.js        # Player sprite, movement, and jump behavior
│   ├── physics.js       # Gravity, collisions, and item pickup overlap
│   ├── world.js         # Tile world generation, block handling, item drops
│   ├── inventory.js     # Item stacks, hotbar slots, selected block logic
│   ├── ui.js            # Hotbar, selected item display, feedback notices
│   └── input.js         # Keyboard and mouse/touch input routing
│
├── assets/
│   ├── textures/
│   └── sounds/
```

## Architecture notes

- `main.js` imports and initializes every system.
- Each file in `systems/` owns one responsibility.
- Systems communicate through explicit classes and methods.
- Textures are generated in code for version 1 so the game is playable without external art assets.
- The structure is ready to expand toward saving/loading worlds, multiplayer, online accounts, trading, more blocks/items, events, and custom mechanics later.

Multiplayer is intentionally **not** implemented yet.
