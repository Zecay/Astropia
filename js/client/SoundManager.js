/**
 * Astropia – SoundManager
 * https://github.com/Zecay/Astropia
 *
 * Generates all game sounds procedurally using the WebAudio API.
 * No external audio assets required.
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

  _ensureContext() {
    if (this.initialized) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('[SoundManager] WebAudio not available:', e.message);
    }
  }

  resume() {
    if (!this.initialized) this._ensureContext();
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  play(name, options = {}) {
    if (this.muted) return;
    this._ensureContext();
    if (!this.context) return;

    const volumeScale = options.volumeScale === undefined ? 1 : options.volumeScale;

    switch (name) {
      case 'punchHit':
        this._tone(this.sfxConfig.punchHitHz, this.sfxConfig.punchHitDurationMs, 'square', 0.3 * volumeScale);
        break;
      case 'punchBreak':
        this._noiseBurst(this.sfxConfig.punchBreakDurationMs, 0.4 * volumeScale);
        break;
      case 'place':
        this._tone(this.sfxConfig.placeHz, this.sfxConfig.placeDurationMs, 'sine', 0.2 * volumeScale);
        break;
      case 'collect':
        this._tone(this.sfxConfig.collectHz, this.sfxConfig.collectDurationMs, 'sine', 0.25 * volumeScale);
        break;
      case 'error':
        this._tone(this.sfxConfig.errorHz, this.sfxConfig.errorDurationMs, 'sawtooth', 0.15 * volumeScale);
        break;
      case 'select':
        this._tone(this.sfxConfig.selectHz, this.sfxConfig.selectDurationMs, 'sine', 0.15 * volumeScale);
        break;
      case 'wrench':
        this._tone(this.sfxConfig.wrenchHz, this.sfxConfig.wrenchDurationMs, 'triangle', 0.2 * volumeScale);
        break;
      case 'hurt':
        this._noiseBurst(this.sfxConfig.hurtDurationMs, 0.45 * volumeScale);
        break;
      case 'land':
        this._tone(this.sfxConfig.landHz, this.sfxConfig.landDurationMs, 'triangle', (this.sfxConfig.landVolume || 0.1) * volumeScale);
        break;
      default:
        console.warn(`[SoundManager] Unknown sound: "${name}"`);
    }
  }

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
      /* Ignore audio errors */
    }
  }

  _noiseBurst(durationMs, volume) {
    try {
      const duration = durationMs / 1000;
      const sampleRate = this.context.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.context.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const falloff = 1 - i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * falloff;
      }

      const source = this.context.createBufferSource();
      source.buffer = buffer;

      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(220, this.context.currentTime);
      filter.Q.setValueAtTime(1.2, this.context.currentTime);

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.context.destination);
      source.start();
    } catch (e) {
      /* Ignore audio errors */
    }
  }
}
