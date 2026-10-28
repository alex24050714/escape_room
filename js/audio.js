/* Retro chiptune ambient music + SFX, synthesized with WebAudio (no audio files). */
(function (root) {
  'use strict';

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Am - F - C - G, 16 sixteenth-steps per bar.
  const CHORDS = [
    { bass: 45, arp: [57, 60, 64, 69] },
    { bass: 41, arp: [53, 57, 60, 65] },
    { bass: 48, arp: [55, 60, 64, 67] },
    { bass: 43, arp: [55, 59, 62, 67] },
  ];
  const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1];
  const MELODY = [
    [76, 0, 0, 0, 0, 0, 72, 0, 74, 0, 0, 0, 0, 0, 0, 0],
    [77, 0, 0, 0, 0, 0, 76, 0, 72, 0, 0, 0, 0, 0, 0, 0],
    [76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0],
    [74, 0, 0, 0, 0, 0, 71, 0, 67, 0, 0, 0, 0, 0, 0, 0],
  ];
  const BPM = 82;
  const STEP = 60 / BPM / 4;

  const Audio = {
    ctx: null, master: null, musicBus: null, sfxBus: null, noise: null,
    timer: null, nextTime: 0, step: 0, bar: 0,
    muted: false, started: false,

    init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 5200;
      this.master.connect(lp); lp.connect(c.destination);

      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.55;
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9;
      this.musicBus.connect(this.master); this.sfxBus.connect(this.master);

      // Echo for the lead voice.
      this.delay = c.createDelay(1); this.delay.delayTime.value = STEP * 3;
      const fb = c.createGain(); fb.gain.value = 0.38;
      const wet = c.createGain(); wet.gain.value = 0.45;
      this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(wet); wet.connect(this.musicBus);

      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

    tone(freq, t, dur, { type = 'square', gain = 0.05, bus, send, slideTo } = {}) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || this.sfxBus);
      if (send) g.connect(send);
      o.start(t); o.stop(t + dur + 0.05);
    },

    hat(t, gain) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(hp); hp.connect(g); g.connect(this.musicBus);
      s.start(t, Math.random() * 0.5, 0.06);
    },

    scheduleStep(t) {
      const chord = CHORDS[this.bar % 4];
      const s = this.step;
      // arpeggio
      this.tone(mtof(chord.arp[ARP_PATTERN[s]]), t, STEP * 1.6, { gain: 0.03, bus: this.musicBus });
      // bass
      if (s % 8 === 0) this.tone(mtof(chord.bass), t, STEP * 7, { type: 'triangle', gain: 0.16, bus: this.musicBus });
      if (s % 8 === 4) this.tone(mtof(chord.bass + 12), t, STEP * 2, { type: 'triangle', gain: 0.07, bus: this.musicBus });
      // lead
      const n = MELODY[this.bar % 4][s];
      if (n) this.tone(mtof(n), t, STEP * 3.2, { type: 'square', gain: 0.045, bus: this.musicBus, send: this.delay });
      // hat
      if (s % 4 === 2) this.hat(t, 0.05);
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
    },

    scheduler() {
      const c = this.ctx;
      while (this.nextTime < c.currentTime + 0.25) {
        this.scheduleStep(this.nextTime);
        this.nextTime += STEP;
      }
    },

    startMusic() {
      this.init();
      if (!this.ctx) return;
      this.resume();
      if (this.timer) return;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.scheduler(), 60);
      this.started = true;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
      try { localStorage.setItem('escape_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    toggleMute() { this.setMuted(!this.muted); return this.muted; },

    // ---- Sound effects ----
    sfx(name, arg) {
      if (!this.ctx || this.muted) return;
      this.resume();
      const t = this.ctx.currentTime + 0.01;
      switch (name) {
        case 'step': this.tone(110 + Math.random() * 20, t, 0.05, { type: 'triangle', gain: 0.05 }); break;
        case 'bump': this.tone(90, t, 0.12, { gain: 0.07, slideTo: 60 }); break;
        case 'blip': this.tone(660 + Math.random() * 80, t, 0.03, { gain: 0.025 }); break;
        case 'click': this.tone(520, t, 0.05, { gain: 0.05 }); break;
        case 'error':
          this.tone(220, t, 0.14, { gain: 0.07 });
          this.tone(165, t + 0.14, 0.22, { gain: 0.07 });
          break;
        case 'pickup':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.12, { gain: 0.06 }));
          break;
        case 'unlock': {
          [392, 494, 587, 784].forEach((f, i) => this.tone(f, t + i * 0.09, 0.2, { gain: 0.06 }));
          const s = this.ctx.createBufferSource(); s.buffer = this.noise;
          const g = this.ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
          s.connect(lp); lp.connect(g); g.connect(this.sfxBus); s.start(t, 0, 0.5);
          break;
        }
        case 'rune': {
          const f = [262, 330, 392, 523][arg || 0];
          this.tone(f, t, 0.32, { gain: 0.07, type: 'square' });
          break;
        }
        case 'win':
          [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.13, 0.25, { gain: 0.07 }));
          break;
        default: break;
      }
    },
  };

  try { Audio.muted = localStorage.getItem('escape_muted') === '1'; } catch (e) { /* ignore */ }
  root.GameAudio = Audio;
})(window);
