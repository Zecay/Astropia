/**
 * Astropia – SoundManager
 * https://github.com/Zecay/Astropia
 *
 * Generates all game sounds procedurally using the WebAudio API.
 * No external audio assets required.
 *
 * Usage:
 *   const sfx = new SoundManager(game);
 *   sfx.play('punchHit');
 */

class SoundManager {
  constructor(game) {
    this.game = game;
    this.config = game.registry.get('config');
    this.sfxConfig = this.config.sfx;
    this.context = null;
    this.initialized = false;
    this.muted = false;
  }

  /**
   * Lazily initialises the AudioContext (must be called from a user gesture).
   */
  _ensureContext() {
    if (this.initialized) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('[SoundManager] WebAudio not available:', e.message);
    }
  }

  /**
   * Attempt to resume the context (Chrome requires this after user gesture).
   */
  resume() {
    if (!this.initialized) this._ensureContext();
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  /**
   * Play a sound effect by name.
   * Supported names: 'punchHit', 'punchBreak', 'place', 'collect',
   *                  'error', 'select', 'wrench', 'hurt', 'land'
   */
  play(name) {
    if (this.muted) return;
    this._ensureContext();
    if (!this.context) return;

    switch (name) {
      case 'punchHit':    this._tone(this.sfxConfig.punchHitHz, this.sfxConfig.punchHitDurationMs, 'square', 0.3); break;
      case 'punchBreak':  this._noiseBurst(this.sfxConfig.punchBreakDurationMs, 0.4); break;
      case 'place':       this._tone(this.sfxConfig.placeHz, this.sfxConfig.placeDurationMs, 'sine', 0.2); break;
      case 'collect':     this._tone(this.sfxConfig.collectHz, this.sfxConfig.collectDurationMs, 'sine', 0.25); break;
      case 'error':       this._tone(this.sfxConfig.errorHz, this.sfxConfig.errorDurationMs, 'sawtooth', 0.15); break;
      case 'select':      this._tone(this.sfxConfig.selectHz, this.sfxConfig.selectDurationMs, 'sine', 0.15); break;
      case 'wrench':      this._tone(this.sfxConfig.wrenchHz, this.sfxConfig.wrenchDurationMs, 'triangle', 0.2); break;
      case 'hurt':        this._noiseBurst(this.sfxConfig.hurtDurationMs, 0.35); break;
      case 'land':        this._tone(this.sfxConfig.landHz, this.sfxConfig.landDurationMs, 'triangle', this.sfxConfig.landVolume || 0.1); break;
      default:
        console.warn(`[SoundManager] Unknown sound: "${name}"`);
    }
  }

  /**
   * Generate a simple tone.
   */
  _tone(frequency, durationMs, waveType, volume) {
    try {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = waveType;
      osc.frequency.setValueAtTime(frequency, this.context.currentTime);
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start();
      osc.stop(this.context.currentTime + durationMs / 1000 + 0.05);
    } catch (e) {
      // ignore – audio context may not be ready
    }
  }

  /**
   * Generate a short noise burst (white noise) — good for impacts/breaks.
   */
  _noiseBurst(durationMs, volume) {
    try {
      const duration = durationMs / 1000;
      const sampleRate = this.context.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.context.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * volume * (1 - i / bufferSize);
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      source.connect(gain);
      gain.connect(this.context.destination);
      source.start();
    } catch (e) {
      // ignore
    }
  }
}
