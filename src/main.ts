// ============================================================================
// Blockfall — main orchestrator. OWNED BY LEAD. Subagents: do not edit.
// Wires: Engine <-> Renderer <-> UI <-> Audio <-> Platform <-> Store.
// ============================================================================
import type {
  AudioEvent,
  Engine,
  GameEvent,
  GameStateSnapshot,
  InputAction,
  PlatformAdapter,
  Renderer,
  Settings,
  UI,
  UIHandlers,
  Store,
} from './shared/types';
import { HIGHSCORE_KEY, SETTINGS_KEY } from './shared/types';
import { createEngine } from './engine/engine';
import { createRenderer } from './render/renderer';
import { createAudio } from './audio/audio';
import { createUI } from './ui/ui';
import { createPlatform } from './platform/telegram';
import { createStore } from './platform/store';

const DEFAULT_SETTINGS: Settings = {
  music: true,
  sfx: true,
  haptics: true,
  onboarded: false,
  // язык по умолчанию — английский; меняется кнопкой в меню
  lang: 'en',
};

const AUDIO_MAP: Partial<Record<GameEvent['type'], AudioEvent>> = {
  move: 'move',
  rotate: 'rotate',
  lock: 'lock',
  'hard-drop': 'hard-drop',
  hold: 'hold',
  'rotate-blocked': 'reject',
  'hold-blocked': 'reject',
  'game-over': 'game-over',
  'level-up': 'level-up',
};

class App {
  private engine: Engine;
  private renderer: Renderer;
  private audio: ReturnType<typeof createAudio>;
  private ui: UI;
  private platform: PlatformAdapter;
  private store: Store;
  private settings: Settings;
  private lastT = 0;
  private portrait: boolean;

  constructor() {
    const app = document.getElementById('app')!;
    this.platform = createPlatform();
    this.store = createStore(this.platform);
    this.settings = { ...DEFAULT_SETTINGS, ...this.store.get<Partial<Settings>>(SETTINGS_KEY, {}) };

    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.setAttribute('aria-label', 'Игровое поле');
    app.appendChild(canvas);

    this.engine = createEngine({ highScore: this.store.get<number>(HIGHSCORE_KEY, 0) });
    this.renderer = createRenderer(canvas);
    this.audio = createAudio();
    this.audio.setSettings(this.settings);

    const handlers: UIHandlers = {
      onStart: () => this.startGame(),
      onRestart: () => this.startGame(),
      onResume: () => this.setPaused(false),
      onPause: () => this.setPaused(true),
      onQuitToMenu: () => this.quitToMenu(),
      onSettingsChanged: (s) => this.saveSettings(s),
      onUserGesture: () => this.unlockAudio(),
      onOnboardingDone: () => {
        this.settings.onboarded = true;
        this.persistSettings();
        this.ui.show('menu');
      },
    };
    this.ui = createUI(app, handlers);
    this.ui.bindInput((a) => this.dispatch(a));
    this.ui.setSettings(this.settings);

    this.portrait = window.innerHeight >= window.innerWidth;
    this.platform.init();
    this.platform.onVisibility((v) => {
      if (!v && this.engine.state.phase === 'playing') this.setPaused(true);
    });
    this.platform.onOrientation((p) => this.updateOrientation(p));
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () =>
      this.updateOrientation(window.innerHeight >= window.innerWidth),
    );

    this.updateOrientation(this.portrait);
    if (!this.settings.onboarded && this.portrait) this.ui.show('onboarding');
    else this.ui.show('menu');

    this.lastT = performance.now();
    requestAnimationFrame(this.frame);
  }

  // ---------- main loop ----------
  private frame = (t: number) => {
    const dt = Math.min(50, t - this.lastT);
    this.lastT = t;
    const st = this.engine.state;
    if (st.phase === 'playing' && this.portrait) {
      this.emit(this.engine.tick(dt));
    }
    this.renderer.render(st, dt);
    this.ui.updateHud(st);
    this.platform.confirmClose(st.phase === 'playing');
    requestAnimationFrame(this.frame);
  };

  private emit(events: GameEvent[]) {
    if (events.length === 0) return;
    this.renderer.pulse(events);
    for (const e of events) {
      const a = AUDIO_MAP[e.type];
      if (a) this.audio.play(a);
      if (e.type === 'line-clear') {
        this.audio.play(e.count >= 4 ? 'tetris' : e.combo > 0 ? 'combo' : 'line-clear');
        if (this.settings.haptics)
          this.platform.haptic({ style: e.count >= 4 ? 'heavy' : 'medium' });
      } else if (e.type === 'hard-drop' && this.settings.haptics) {
        this.platform.haptic({ style: 'light' });
      } else if (e.type === 'game-over') {
        this.onGameOver(this.engine.state);
      }
    }
  }

  // ---------- flow ----------
  private startGame() {
    this.unlockAudio();
    const ev = this.engine.start();
    this.emit(ev);
    this.audio.startMusic();
    this.ui.show('game');
    this.onResize();
  }

  private setPaused(paused: boolean) {
    if (paused) {
      this.engine.pause();
      this.audio.suspend();
      this.audio.stopMusic();
      this.ui.show('pause');
    } else {
      this.engine.resume();
      this.audio.resumeCtx();
      if (this.settings.music) this.audio.startMusic();
      this.ui.show('game');
    }
    this.audio.play(paused ? 'pause' : 'resume');
  }

  private quitToMenu() {
    this.engine.toMenu();
    this.audio.stopMusic();
    this.ui.show('menu');
  }

  private onGameOver(st: GameStateSnapshot) {
    this.audio.stopMusic();
    if (st.score > this.store.get<number>(HIGHSCORE_KEY, 0)) {
      this.store.set(HIGHSCORE_KEY, st.score);
    }
    this.ui.show('gameover');
  }

  private dispatch(a: InputAction) {
    this.unlockAudio();
    const st = this.engine.state;
    if (a === 'pause') {
      if (st.phase === 'playing') this.setPaused(true);
      else if (st.phase === 'paused') this.setPaused(false);
      return;
    }
    if (st.phase !== 'playing' || !this.portrait) return;
    this.emit(this.engine.input(a));
    if (a === 'hold' && this.settings.haptics) this.platform.haptic({ style: 'light' });
  }

  // ---------- settings / storage ----------
  private saveSettings(s: Settings) {
    this.settings = { ...this.settings, ...s };
    this.persistSettings();
    this.audio.setSettings(this.settings);
    if (!this.settings.music) this.audio.stopMusic();
    else if (this.engine.state.phase === 'playing') this.audio.startMusic();
  }

  private persistSettings() {
    this.store.set(SETTINGS_KEY, this.settings);
  }

  private audioUnlocked = false;
  private unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.audio.unlock();
  }

  // ---------- responsive ----------
  private onResize() {
    this.renderer.resize();
  }

  private updateOrientation(portrait: boolean) {
    const wasLandscape = !this.portrait;
    this.portrait = portrait;
    if (!portrait) {
      if (this.engine.state.phase === 'playing') this.engine.pause();
      this.ui.show('orientation');
    } else {
      if (wasLandscape && this.engine.state.phase === 'paused') {
        // returning from landscape gate back into a paused game
        this.ui.show('pause');
      } else if (this.engine.state.phase === 'playing') {
        this.ui.show('game');
      } else if (!this.settings.onboarded) {
        this.ui.show('onboarding');
      } else {
        this.ui.show('menu');
      }
      this.onResize();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new App();
});
