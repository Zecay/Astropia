// ─── Sound effects ──────────────────────────────────────────────────────────
// Small, self-contained module for playback. Sound URLs come from
// GameConfig.sounds (config.json) instead of a hardcoded constant.

import { GameConfig } from './config.js';

let isMuted = false;
const audioCache = new Map();

export function setMuted(muted) {
  isMuted = !!muted;
}

export function playSound(soundKey) {
  if (isMuted) return;
  const url = GameConfig.sounds && GameConfig.sounds[soundKey];
  if (!url) return;
  try {
    let audio = audioCache.get(soundKey);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 0.7;
      audioCache.set(soundKey, audio);
    }
    const sound = audio.cloneNode();
    sound.volume = 0.7;
    sound.play().catch(() => {});
  } catch (e) {}
}
