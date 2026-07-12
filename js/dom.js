// ─── DOM element references ────────────────────────────────────────────────
// Centralised lookups so every module reads the same cached elements instead
// of re-querying the document.
//
// The references below are resolved at module-evaluation time. Because this
// file is loaded as an ES module (<script type="module">, which is deferred),
// the document is already fully parsed by the time these run — so the lookups
// succeed for every element present in index.html.
//
// initDom() is the explicit, auditable entry point: main() calls it as the
// VERY FIRST step of boot. It re-resolves every reference and validates that
// all REQUIRED ids exist. If a required DOM id is missing or misspelled in
// index.html, initDom() throws a descriptive error immediately — turning a
// confusing later null-deref (e.g. the old renderInventory crash) into a clear
// boot-time failure. Optional / legacy elements (the old hamburger inventory)
// are allowed to be null; code that uses them must null-check.

// ── Required elements (game cannot boot without these) ──────────────────────
export let canvas = document.getElementById('game');
export let ctx = canvas ? canvas.getContext('2d') : null;

export let inventoryWindow = document.getElementById('inventoryWindow');
export let inventoryHeader = document.getElementById('inventoryHeader');
export let inventoryGrid = document.getElementById('inventoryGrid');
export let inventorySearch = document.getElementById('inventorySearch');

export let leftBtn = document.getElementById('leftBtn');
export let rightBtn = document.getElementById('rightBtn');
export let jumpBtn = document.getElementById('jumpBtn');
export let punchBtn = document.getElementById('punchBtn');

export let loginScreen = document.getElementById('loginScreen');
export let usernameInput = document.getElementById('usernameInput');
export let startButton = document.getElementById('startButton');

export let chatUI = document.getElementById('chatUI');
export let chatForm = document.getElementById('chatForm');
export let chatInput = document.getElementById('chatInput');
export let chatLog = document.getElementById('chatLog');

export let networkStatus = document.getElementById('networkStatus');

// ── Optional / legacy elements (may legitimately be null) ──────────────────
// The old hamburger inventory (inventoryUIGroup / inventoryBar / inventoryPanel
// / inventoryPanelContents / inventoryToggle) was replaced by the Growtopia
// floating window; saveQuitBtn is likewise absent on the current build. All
// usages are null-safe.
export let inventoryUIGroup = document.getElementById('inventoryUIGroup') || null;
export let inventoryBar = document.getElementById('inventoryBar') || null;
export let inventoryPanel = document.getElementById('inventoryPanel') || null;
export let inventoryPanelContents = document.getElementById('inventoryPanelContents') || null;
export let inventoryToggle = document.getElementById('inventoryToggle') || null;
export let saveQuitBtn = document.getElementById('saveQuitBtn') || null;

// dom-id -> export name, used only by initDom() for its audit message.
const REQUIRED_IDS = {
  game: 'canvas',
  inventoryWindow: 'inventoryWindow',
  inventoryHeader: 'inventoryHeader',
  inventoryGrid: 'inventoryGrid',
  inventorySearch: 'inventorySearch',
  leftBtn: 'leftBtn',
  rightBtn: 'rightBtn',
  jumpBtn: 'jumpBtn',
  punchBtn: 'punchBtn',
  loginScreen: 'loginScreen',
  usernameInput: 'usernameInput',
  startButton: 'startButton',
  chatUI: 'chatUI',
  chatForm: 'chatForm',
  chatInput: 'chatInput',
  chatLog: 'chatLog',
  networkStatus: 'networkStatus'
};

// Resolve (and audit) every DOM reference. Call once, before any module
// touches the DOM. Re-resolves defensively so it is safe to call again.
export function initDom() {
  if (typeof document === 'undefined') {
    throw new Error('[dom] initDom() called without a document (DOM not available).');
  }

  // Fail loudly if a required element is missing — this is exactly the class
  // of bug that previously surfaced as a null-deref inside renderInventory().
  for (const [id, name] of Object.entries(REQUIRED_IDS)) {
    if (!document.getElementById(id)) {
      throw new Error(
        `[dom] Required element #${id} (export "${name}") is missing from ` +
        `index.html. Boot aborted — index.html and dom.js DOM IDs must match.`
      );
    }
  }

  // Re-resolve everything (idempotent; keeps references fresh if the DOM ever
  // changes after first load). Required first, then the derived context, then
  // the optional/legacy elements.
  canvas = document.getElementById('game');
  ctx = canvas ? canvas.getContext('2d') : null;

  inventoryWindow = document.getElementById('inventoryWindow');
  inventoryHeader = document.getElementById('inventoryHeader');
  inventoryGrid = document.getElementById('inventoryGrid');
  inventorySearch = document.getElementById('inventorySearch');

  leftBtn = document.getElementById('leftBtn');
  rightBtn = document.getElementById('rightBtn');
  jumpBtn = document.getElementById('jumpBtn');
  punchBtn = document.getElementById('punchBtn');

  loginScreen = document.getElementById('loginScreen');
  usernameInput = document.getElementById('usernameInput');
  startButton = document.getElementById('startButton');

  chatUI = document.getElementById('chatUI');
  chatForm = document.getElementById('chatForm');
  chatInput = document.getElementById('chatInput');
  chatLog = document.getElementById('chatLog');

  networkStatus = document.getElementById('networkStatus');

  inventoryUIGroup = document.getElementById('inventoryUIGroup') || null;
  inventoryBar = document.getElementById('inventoryBar') || null;
  inventoryPanel = document.getElementById('inventoryPanel') || null;
  inventoryPanelContents = document.getElementById('inventoryPanelContents') || null;
  inventoryToggle = document.getElementById('inventoryToggle') || null;
  saveQuitBtn = document.getElementById('saveQuitBtn') || null;

  return true;
}
