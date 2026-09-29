// ============================================================================
// Blockfall — процедурный WebAudio (src/audio). Зона SA2. Никаких внешних
// файлов: осцилляторы + noise buffer. Музыка — генеративный ambient loop
// (тёплый pad + пентатонический pluck 128 BPM) через lookahead-scheduler
// (setInterval 25ms, гориз 0.1s). Autoplay-политика: ничего не бросаем,
// всё в try/catch; реальный старт — после unlock() из пользовательского жеста.
// ============================================================================
import type { AudioEvent, AudioManager, Settings } from '../shared/types';

const PENTA = [0, 3, 5, 7, 10]; // минорная пентатоника, полутоны
const BASE_A3 = 220; // Гц — тоника
const MUSIC_BPM = 128;
const LOOKAHEAD_MS = 25;
const SCHEDULE_HORIZON = 0.1; // сек

const midiRatio = (semitones: number): number => Math.pow(2, semitones / 12);

class AudioEngine implements AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private musicOn = false;
  private wantMusic = false;
  private sfxEnabled = true;
  private musicEnabled = true;
  private schedId = 0;
  private nextNoteTime = 0;
  private step = 0;

  // комбо-цепочка: +полтона за каждый элемент цепочки
  private comboLevel = 0;

  unlock(): void {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
        if (!AC) return;
        this.ctx = new AC();
        this.buildGraph();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      if (this.wantMusic && !this.musicOn) this.startMusic();
    } catch {
      /* автоплей заблокирован — попробуем при следующем жесте */
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0; // поднимем ramp'ом при старте
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1400; // тёплая, не раздражает
    this.musicFilter.Q.value = 0.5;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);

    // белый noise buffer 0.5с — переиспользуется
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------------------------- SFX-примитивы ----------------------------
  private tone(
    freq: number, at: number, dur: number, vol: number,
    type: OscillatorType = 'sine', bus?: GainNode, detune = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(bus ?? this.sfxBus!);
      o.start(at);
      o.stop(at + dur + 0.05);
    } catch {
      /* ctx закрыт на лету — игнорируем */
    }
  }

  private noise(at: number, dur: number, vol: number, freq: number, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    try {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.playbackRate.value = 1;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(f);
      f.connect(g);
      g.connect(this.sfxBus!);
      s.start(at, Math.random() * 0.2, dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  /** мягкий wood/pearl щелчок: синус с быстрой огибающей + капля шума */
  private click(freq: number, vol = 0.25, bright = false): void {
    if (!this.ctx || !this.sfxEnabled) return;
    const t = this.now();
    this.tone(freq, t, 0.07, vol, bright ? 'triangle' : 'sine');
    this.tone(freq * 2.01, t, 0.045, vol * 0.35, 'sine');
    this.noise(t, 0.03, vol * 0.25, freq * 3, 1.4);
  }

  private chord(freqs: number[], at: number, dur: number, vol: number, delayEcho = false): void {
    for (let i = 0; i < freqs.length; i++) {
      this.tone(freqs[i], at + i * 0.03, dur, vol, 'triangle');
      if (delayEcho) {
        // "reverb-ish": затухающее эхо через задержку
        this.tone(freqs[i], at + i * 0.03 + 0.16, dur * 0.7, vol * 0.35, 'sine');
        this.tone(freqs[i], at + i * 0.03 + 0.32, dur * 0.5, vol * 0.14, 'sine');
      }
    }
  }

  // ------------------------------ API --------------------------------------
  play(event: AudioEvent): void {
    if (!this.ctx) {
      this.unlock();
      if (!this.ctx) return;
    }
    if (!this.sfxEnabled) return;
    const t = this.now();
    switch (event) {
      case 'move':
        this.click(520, 0.14);
        break;
      case 'rotate':
        this.click(660, 0.16, true);
        break;
      case 'lock':
        this.click(400, 0.18);
        break;
      case 'hold':
        this.click(760, 0.18, true);
        break;
      case 'reject':
        this.tone(180, t, 0.09, 0.16, 'square');
        break;
      case 'hard-drop': {
        // thud + шум
        this.tone(90, t, 0.14, 0.5, 'sine');
        this.tone(55, t, 0.2, 0.45, 'sine');
        this.noise(t, 0.1, 0.3, 900, 0.7);
        break;
      }
      case 'line-clear':
        // восходящий аккорд C-E-G
        this.comboLevel = 0;
        this.chord([261.6, 329.6, 392.0].map((f) => f * 2), t, 0.22, 0.22);
        break;
      case 'tetris':
        this.comboLevel = 0;
        this.chord([261.6, 329.6, 392.0, 523.3].map((f) => f * 2), t, 0.3, 0.26, true);
        break;
      case 'combo': {
        // +полтона за каждый элемент цепочки
        const k = Math.min(this.comboLevel, 12);
        this.comboLevel++;
        const f = 392 * midiRatio(k * 0.5);
        this.chord([f, f * midiRatio(4), f * midiRatio(7)], t, 0.2, 0.22);
        break;
      }
      case 'level-up': {
        // арпеджио вверх
        const seq = [261.6, 329.6, 392.0, 523.3, 659.3];
        for (let i = 0; i < seq.length; i++) this.tone(seq[i], t + i * 0.07, 0.18, 0.2, 'triangle');
        break;
      }
      case 'game-over': {
        this.comboLevel = 0;
        // нисходящий минор i-VI-V (A3 F3 E3) с удлинением
        const seq = [220.0, 174.6, 164.8, 110.0];
        for (let i = 0; i < seq.length; i++) {
          this.tone(seq[i], t + i * 0.16, 0.4, 0.24, 'triangle');
          this.tone(seq[i] * 1.003, t + i * 0.16, 0.4, 0.1, 'sine');
        }
        break;
      }
      case 'ui-click':
      case 'start':
        this.click(880, 0.18, true); // pearl pop
        if (event === 'start') this.tone(523.3, t + 0.05, 0.15, 0.16, 'triangle');
        break;
      case 'pause':
        this.tone(440, t, 0.12, 0.16, 'sine');
        this.tone(330, t + 0.08, 0.14, 0.14, 'sine');
        break;
      case 'resume':
        this.tone(330, t, 0.1, 0.16, 'sine');
        this.tone(440, t + 0.07, 0.14, 0.16, 'sine');
        break;
      default:
        break;
    }
  }

  // ------------------------------ музыка -----------------------------------
  startMusic(): void {
    this.wantMusic = true;
    if (!this.ctx || !this.musicEnabled) return;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextNoteTime = this.now() + 0.1;
    // fade-in без щелчка
    const g = this.musicBus!.gain;
    g.cancelScheduledValues(this.now());
    g.setValueAtTime(0.0001, this.now());
    g.linearRampToValueAtTime(0.16, this.now() + 1.2);
    this.schedId = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stopMusic(): void {
    this.wantMusic = false;
    if (!this.musicOn) return;
    this.musicOn = false;
    if (this.schedId) {
      clearInterval(this.schedId);
      this.schedId = 0;
    }
    if (this.ctx && this.musicBus) {
      const g = this.musicBus.gain;
      g.cancelScheduledValues(this.now());
      g.setValueAtTime(g.value, this.now());
      g.linearRampToValueAtTime(0.0001, this.now() + 0.5);
    }
  }

  private scheduler(): void {
    try {
      if (!this.ctx || !this.musicOn) return;
      const spb = 60 / MUSIC_BPM / 4; // 16-е
      while (this.nextNoteTime < this.now() + SCHEDULE_HORIZON) {
        this.scheduleStep(this.step, this.nextNoteTime);
        this.step = (this.step + 1) % 32;
        this.nextNoteTime += spb;
      }
    } catch {
      /* контекст мог уснуть между тиками */
    }
  }

  /** Генеративный паттерн: pad на тактовых долях + псевдослучайный pluck. */
  private scheduleStep(step: number, at: number): void {
    const bus = this.musicBus!;
    const bar = Math.floor(step / 8) % 4;
    const rootShift = [0, 5, 3, 7][bar]; // мягкий гармонический круиз по пентатонике

    // pad — два расстроенных осциллятора с LFO, каждые 8 шагов
    if (step % 8 === 0) {
      const f = BASE_A3 * 0.5 * midiRatio(rootShift);
      this.padVoice(f, at, (60 / MUSIC_BPM) * 2, bus);
      this.padVoice(f * midiRatio(7), at, (60 / MUSIC_BPM) * 2, bus, 6);
    }

    // pluck-паттерн: 16-е, плотность от позиции, детерминированно-случайный
    const s = step % 8;
    const hit = s === 0 || s === 3 || s === 6 || (s === 5 && ((step * 7 + bar) % 3 === 0));
    if (hit && Math.random() < 0.75) {
      const deg = PENTA[(step * 5 + bar * 3 + (s === 0 ? 2 : 0)) % PENTA.length];
      const oct = s === 0 ? 2 : Math.random() < 0.3 ? 4 : 2;
      const f = BASE_A3 * midiRatio(rootShift + deg) * (oct === 4 ? 2 : 1);
      this.pluck(f, at, bus);
    }
  }

  private padVoice(freq: number, at: number, dur: number, bus: GainNode, detune = -5): void {
    const ctx = this.ctx!;
    try {
      const o1 = ctx.createOscillator();
      o1.type = 'triangle';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq;
      o2.detune.value = detune * 2; // лёгкий расстрой
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.05, at + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, at + dur);
      // LFO на громкость — дыхание
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.15 + (freq % 7) * 0.01;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.012;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      o1.connect(g);
      o2.connect(g);
      g.connect(bus);
      o1.start(at); o2.start(at); lfo.start(at);
      o1.stop(at + dur + 0.1); o2.stop(at + dur + 0.1); lfo.stop(at + dur + 0.1);
    } catch {
      /* ignore */
    }
  }

  private pluck(freq: number, at: number, bus: GainNode): void {
    const ctx = this.ctx!;
    try {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.09, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(g);
      g.connect(bus);
      o.start(at);
      o.stop(at + 0.4);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------ lifecycle ----------------------------------
  suspend(): void {
    try {
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  resumeCtx(): void {
    try {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  setSettings(s: Settings): void {
    const musicWas = this.musicEnabled;
    this.musicEnabled = s.music;
    this.sfxEnabled = s.sfx;
    if (!s.music && this.musicOn) this.stopMusic();
    else if (s.music && !musicWas && this.wantMusic) this.startMusic();
    // sfx off -> тишина: play() уже рангируется по this.sfxEnabled
  }
}

export function createAudio(): AudioManager {
  return new AudioEngine();
}
