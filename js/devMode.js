// ─── Developer Mode (Cheat Panel) ─────────────────────────────────────────
// Toggle with Ctrl+Shift+D
// Completely self-contained module — safe to delete before release.

import { GameConfig } from './config.js';
import {
  addInventoryItem,
  renderInventory
} from './inventory.js';
import { playerState } from './player.js';
import { canvas } from './dom.js';

export const devState = {
  enabled: false,
  noclip: false,
  fly: false,
  panel: null
};

let panelEl = null;

function createDevPanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'devPanel';
  panelEl.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 260px;
    background: #0f1f33;
    border: 4px solid #4aa3ff;
    border-radius: 12px;
    box-shadow: 6px 6px 0 #00000055;
    color: #fff;
    font-family: inherit;
    z-index: 1000;
    padding: 12px;
    display: none;
    pointer-events: auto;
  `;

  panelEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <strong style="font-size:15px; color:#7ed957;">🛠️ ASTROPIA DEV MODE</strong>
      <button id="devCloseBtn" style="background:#c33; color:white; border:none; width:24px; height:24px; border-radius:4px; cursor:pointer;">×</button>
    </div>

    <div style="display:flex; flex-direction:column; gap:8px;">
      <button id="devNoclipBtn" class="dev-btn">Noclip: OFF</button>
      <button id="devFlyBtn" class="dev-btn">Fly Mode: OFF</button>

      <div style="border-top:1px solid #4aa3ff33; margin:4px 0;"></div>

      <div>
        <label style="font-size:12px; display:block; margin-bottom:3px;">Give Item</label>
        <select id="devItemSelect" style="width:100%; padding:6px; background:#1a2b3c; color:#fff; border:2px solid #4aa3ff; border-radius:6px;">
          <!-- populated dynamically -->
        </select>
        <button id="devGiveBtn" class="dev-btn" style="margin-top:6px; width:100%;">Give 10</button>
      </div>

      <div>
        <label style="font-size:12px; display:block; margin-bottom:3px;">Player Stats</label>
        <div style="display:flex; gap:6px;">
          <input id="devPosX" type="number" placeholder="X" style="flex:1; padding:4px; background:#1a2b3c; color:#fff; border:2px solid #4aa3ff; border-radius:4px;">
          <input id="devPosY" type="number" placeholder="Y" style="flex:1; padding:4px; background:#1a2b3c; color:#fff; border:2px solid #4aa3ff; border-radius:4px;">
          <button id="devTeleportBtn" class="dev-btn">TP</button>
        </div>
        <button id="devResetSpeedBtn" class="dev-btn" style="margin-top:6px; width:100%;">Reset Speed</button>
      </div>
    </div>
  `;

  document.body.appendChild(panelEl);

  // Style buttons
  const style = document.createElement('style');
  style.textContent = `
    .dev-btn {
      padding: 8px 12px;
      background: #1f3b5e;
      border: 3px solid #4aa3ff;
      color: #fff;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .dev-btn:hover { background: #2a4f7a; }
    .dev-btn.active { background: #3a7a4f; border-color: #7ed957; }
  `;
  document.head.appendChild(style);

  // Event listeners
  const closeBtn = panelEl.querySelector('#devCloseBtn');
  closeBtn.onclick = () => toggleDevPanel(false);

  const noclipBtn = panelEl.querySelector('#devNoclipBtn');
  noclipBtn.onclick = () => {
    devState.noclip = !devState.noclip;
    noclipBtn.textContent = `Noclip: ${devState.noclip ? 'ON' : 'OFF'}`;
    noclipBtn.classList.toggle('active', devState.noclip);
  };

  const flyBtn = panelEl.querySelector('#devFlyBtn');
  flyBtn.onclick = () => {
    devState.fly = !devState.fly;
    flyBtn.textContent = `Fly Mode: ${devState.fly ? 'ON' : 'OFF'}`;
    flyBtn.classList.toggle('active', devState.fly);
    if (!devState.fly) {
      playerState.vy = 0;
    }
  };

  // Populate Give Item dropdown
  const select = panelEl.querySelector('#devItemSelect');
  const allItems = Object.keys(GameConfig.items);
  allItems.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = GameConfig.items[key].name || key;
    select.appendChild(opt);
  });

  const giveBtn = panelEl.querySelector('#devGiveBtn');
  giveBtn.onclick = () => {
    const itemKey = select.value;
    if (itemKey) {
      addInventoryItem(itemKey, 10);
      renderInventory();
    }
  };

  // Teleport
  const tpBtn = panelEl.querySelector('#devTeleportBtn');
  tpBtn.onclick = () => {
    const x = parseFloat(panelEl.querySelector('#devPosX').value) || playerState.x;
    const y = parseFloat(panelEl.querySelector('#devPosY').value) || playerState.y;
    playerState.x = x;
    playerState.y = y;
    playerState.vx = 0;
    playerState.vy = 0;
  };

  const resetSpeedBtn = panelEl.querySelector('#devResetSpeedBtn');
  resetSpeedBtn.onclick = () => {
    playerState.vx = 0;
    playerState.vy = 0;
  };

  return panelEl;
}

export function toggleDevPanel(show = null) {
  if (!panelEl) createDevPanel();
  const visible = show !== null ? show : panelEl.style.display === 'none';
  panelEl.style.display = visible ? 'block' : 'none';
  devState.enabled = visible;
}

export function initDevMode() {
  // Keyboard shortcut: Ctrl + Shift + D
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleDevPanel();
    }
  });

  // Expose helpers globally so player.js can access without circular imports
  window.__devMode = {
    isNoclip: () => devState.noclip,
    isFlyMode: () => devState.fly
  };

  // Initial hidden panel
  createDevPanel();
}

// Export helper to be used in player.js
export function isNoclip() { return devState.noclip; }
export function isFlyMode() { return devState.fly; }