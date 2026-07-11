// ─── DOM element references ────────────────────────────────────────────────
// Centralised lookups so every module reads the same cached elements instead
// of re-querying the document.

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');
export const stats = document.getElementById('stats');

export const inventoryUIGroup = document.getElementById('inventoryUIGroup');
export const inventoryBar = document.getElementById('inventoryBar');
export const inventoryPanel = document.getElementById('inventoryPanel');
export const inventoryPanelContents = document.getElementById('inventoryPanelContents');
export const inventoryToggle = document.getElementById('inventoryToggle');

// New Growtopia-style floating windows
export const inventoryWindow = document.getElementById('inventoryWindow');
export const inventoryHeader = document.getElementById('inventoryHeader');
export const inventoryGrid = document.getElementById('inventoryGrid');
export const inventorySearch = document.getElementById('inventorySearch');

export const leftBtn = document.getElementById('leftBtn');
export const rightBtn = document.getElementById('rightBtn');
export const jumpBtn = document.getElementById('jumpBtn');
export const punchBtn = document.getElementById('punchBtn');
export const saveQuitBtn = document.getElementById('saveQuitBtn');

export const loginScreen = document.getElementById('loginScreen');
export const usernameInput = document.getElementById('usernameInput');
export const startButton = document.getElementById('startButton');

export const chatUI = document.getElementById('chatUI');
export const chatForm = document.getElementById('chatForm');
export const chatInput = document.getElementById('chatInput');
export const chatLog = document.getElementById('chatLog');

export const networkStatus = document.getElementById('networkStatus');
