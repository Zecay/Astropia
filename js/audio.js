// ─── Sound effects ──────────────────────────────────────────────────────────
// Small, self-contained module so world.js (block breaking) and the SDK mute
// callback in main.js can both talk to a single place for audio playback.

import { SOUND_URLS } from './constants.js';

let isMuted = false;
const audioCache = new Map();

export function setMuted(muted) {
  isMuted = !!muted;
}

export function playSound(soundKey) {
  if (isMuted) return;
  try {
    let audio = audioCache.get(soundKey);
    if (!audio) {
      audio = new Audio(SOUND_URLS[soundKey]);
      audio.preload = 'auto';
      audio.volume = 0.7;
      audioCache.set(soundKey, audio);
    }
    const sound = audio.cloneNode();
    sound.volume = 0.7;
    sound.play().catch(() => {});
  } catch (e) {}
}
