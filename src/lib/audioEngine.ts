class AudioEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private musicEnabled = false;
  private musicInterval: number | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  setPreferences(soundEffects: boolean, music: boolean) {
    this.soundEnabled = soundEffects;
    this.musicEnabled = music;
    if (music) {
      this.startGentleAmbient();
    } else {
      this.stopGentleAmbient();
    }
  }

  playTone(freq: number, duration = 0.12, volume = 0.06, type: OscillatorType = 'sine', delay = 0) {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playSelect() {
    this.playTone(523.25, 0.09, 0.04, 'sine', 0);
  }

  playStep() {
    this.playTone(440, 0.08, 0.04, 'triangle', 0);
    this.playTone(587.33, 0.1, 0.04, 'triangle', 0.06);
  }

  playCheckpoint() {
    this.playTone(523.25, 0.14, 0.05, 'triangle', 0);
    this.playTone(659.25, 0.14, 0.05, 'triangle', 0.1);
    this.playTone(783.99, 0.22, 0.06, 'triangle', 0.2);
  }

  playComplete() {
    this.playTone(523.25, 0.15, 0.05, 'sine', 0);
    this.playTone(659.25, 0.15, 0.05, 'sine', 0.12);
    this.playTone(783.99, 0.15, 0.05, 'sine', 0.24);
    this.playTone(1046.5, 0.35, 0.06, 'sine', 0.36);
  }

  private startGentleAmbient() {
    if (this.musicInterval !== null || typeof window === 'undefined') return;
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    let step = 0;
    this.musicInterval = window.setInterval(() => {
      if (!this.musicEnabled) return;
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[step % notes.length], now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.015, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.95);
      step++;
    }, 1200);
  }

  private stopGentleAmbient() {
    if (this.musicInterval !== null && typeof window !== 'undefined') {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  speak(text: string, lang = 'id-ID') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const audioEngine = new AudioEngine();
