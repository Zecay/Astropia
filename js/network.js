// ─── Networking & chat ──────────────────────────────────────────────────────
// Owns the background sync Worker, the shared `allPlayers` snapshot, and the
// entire chat UI. renderer.js reads `allPlayers` / `remoteVisuals` / `myChat`
// to draw remote players and speech bubbles, but never writes to them.
//
// Server URL, ping interval, and chat timing all come from GameConfig so
// they stay in lockstep with config.json — nothing here is hardcoded.

import { GameConfig } from './config.js';
import { chatInput, chatLog, chatForm, usernameInput, networkStatus, canvas } from './dom.js';
import { playerState } from './player.js';

export const myId = 'p_' + Math.floor(Math.random() * 1e9).toString(36) + '_' + Date.now().toString(36);
export let myName = '';
export let gameJoined = false;
export function setMyName(name) { myName = name; }
export function setGameJoined(v) { gameJoined = v; }

let networkWorker = null;
export let allPlayers = {};
const seenRemoteChats = {};
export let myChat = { text: '', t: 0 };

function clampText(value, maxLen) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/%/g, '').trim().slice(0, maxLen);
}

function makeNetworkPayload() {
  return JSON.stringify({ n: clampText(myName, 15), c: clampText(myChat.text, 80), ct: myChat.t || 0 });
}

export function parseNetworkPayload(player, fallbackId) {
  const rawName = player && player.name ? String(player.name) : fallbackId;
  try {
    const obj = JSON.parse(rawName);
    return {
      name: clampText(obj.n || fallbackId, 15) || fallbackId,
      chat: clampText(obj.c || '', 80),
      chatTime: Number(obj.ct || 0) || 0
    };
  } catch (_) {
    return { name: clampText(rawName, 15) || fallbackId, chat: '', chatTime: 0 };
  }
}

export function initNetwork() {
  if (networkWorker) return;
  const networkIntervalMs = GameConfig.timings.networkIntervalMs;
  const serverUrl = GameConfig.network.serverUrl;
  try {
    const workerCode = `
      let X = 0, Y = 0, NM = '', ID = '', URL = '', timer = null;
      function tick(){
        if (!URL || !ID) return;
        fetch(URL + '?id=' + encodeURIComponent(ID) + '&name=' + encodeURIComponent(NM) + '&x=' + Math.round(X) + '&y=' + Math.round(Y) + '&_t=' + Date.now())
          .then(r => r.json())
          .then(d => self.postMessage({ success:true, data:d }))
          .catch(() => self.postMessage({ success:false }));
      }
      self.onmessage = function(e){
        const d = e.data || {};
        if (d.id) ID = d.id;
        if (d.url) URL = d.url;
        if (typeof d.name === 'string') NM = d.name;
        if (typeof d.x === 'number') X = d.x;
        if (typeof d.y === 'number') Y = d.y;
        if (d.init && !timer) { tick(); timer = setInterval(tick, ${networkIntervalMs}); }
      };
    `;
    const blob = new Blob([workerCode], { type: 'text/javascript' });
    networkWorker = new Worker(URL.createObjectURL(blob));
    networkWorker.onmessage = (e) => {
      if (e.data && e.data.success && e.data.data) {
        allPlayers = e.data.data;
        networkStatus.textContent = `Online · ${Math.max(0, Object.keys(allPlayers).length - 1)} nearby`;
        processRemoteChatMessages();
      } else {
        networkStatus.textContent = 'Connecting...';
      }
    };
    sendNetworkPing(true);
  } catch (err) {
    networkStatus.textContent = 'Network unavailable';
    console.warn('Multiplayer worker failed:', err);
  }
}

export function sendNetworkPing(init = false) {
  if (!networkWorker || !gameJoined) return;
  networkWorker.postMessage({
    init,
    url: GameConfig.network.serverUrl,
    id: myId,
    name: makeNetworkPayload(),
    x: playerState.x,
    y: playerState.y
  });
}

// ─── Chat UI ────────────────────────────────────────────────────────────────
function addChatLine(name, text) {
  const line = document.createElement('div');
  line.className = 'chatLine';
  const strong = document.createElement('strong');
  strong.textContent = name + ': ';
  const span = document.createElement('span');
  span.textContent = text;
  line.appendChild(strong);
  line.appendChild(span);
  chatLog.appendChild(line);
  while (chatLog.children.length > 8) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, GameConfig.timings.chatLogMs);
}

function processRemoteChatMessages() {
  for (const id in allPlayers) {
    if (id === myId) continue;
    const packet = parseNetworkPayload(allPlayers[id], id);
    if (!packet.chat || !packet.chatTime) continue;
    if ((seenRemoteChats[id] || 0) >= packet.chatTime) continue;
    seenRemoteChats[id] = packet.chatTime;
    addChatLine(packet.name, packet.chat);
  }
}

export function sendChatMessage(text) {
  const clean = clampText(text, 80);
  if (!clean) return;
  myChat = { text: clean, t: Date.now() };
  addChatLine(myName || 'You', clean);
  sendNetworkPing(false);
}

export function isTypingChat() {
  return document.activeElement === chatInput || document.activeElement === usernameInput;
}

export function setupChat() {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage(chatInput.value);
    chatInput.value = '';
    canvas.focus({ preventScroll: true });
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      chatInput.blur();
      canvas.focus({ preventScroll: true });
    }
  });
}
