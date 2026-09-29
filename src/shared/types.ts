// ============================================================================
// SHARED CONTRACTS — owned by Lead. Subagents MUST NOT change signatures here;
// if a change is needed, report it to Lead instead of editing this file.
// ============================================================================

// ---------- Core game data types ----------
export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 0 = empty cell, otherwise the piece kind occupying it. */
export type Cell = 0 | PieceKind;

export interface Vec {
  x: number;
  y: number;
}

export interface ActivePiece {
  kind: PieceKind;
  /** Top-left of the piece's rotation-state bounding box, in board coords. May be negative (spawn area above visible field). */
  pos: Vec;
  /** Rotation state index 0..3 (SRS). */
  rot: number;
}

export type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

export interface LineClearInfo {
  /** Row indices cleared (0 = top visible row). */
  rows: number[];
  count: number;
  /** Engine time (sec) when it happened — for renderer animation scheduling. */
  at: number;
  backToBack: boolean;
}

export interface GameStateSnapshot {
  phase: Phase;
  /** ROWS x COLS, indexed [y][x], y=0 top. */
  board: Cell[][];
  active: ActivePiece | null;
  /** Same shape/matrix as `active`, projected straight down. */
  ghost: ActivePiece | null;
  hold: PieceKind | null;
  /** False after a hold until the next lock. */
  canHold: boolean;
  /** Upcoming pieces, at least NEXT_PREVIEW_SIZE entries. */
  queue: PieceKind[];
  score: number;
  highScore: number;
  lines: number;
  level: number;
  /** -1 = no combo chain, 0 = first clear w/o combo bonus... see constants doc. Combo counter as in guideline (0 when chain broken). */
  combo: number;
  /** Seconds of gameplay accumulated in 'playing' phase. */
  time: number;
  /** Seconds per one row of natural gravity at current level (for HUD/debug). */
  gravity: number;
  lastClear: LineClearInfo | null;
  /** True = game over (block-out on spawn or top-out on lock). */
  over: boolean;
  /** Piece counter for stats/debug. */
  piecesPlaced: number;
}

// ---------- Engine public API (src/engine/engine.ts) ----------
export type InputAction =
  | 'left'
  | 'right'
  | 'soft-drop'
  | 'hard-drop'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'rotate-180'
  | 'hold'
  | 'pause'
  | 'resume';

export type GameEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'rotate-blocked' }
  | { type: 'soft-drop' }
  | { type: 'hard-drop'; cells: number }
  | { type: 'lock' }
  | { type: 'hold' }
  | { type: 'hold-blocked' }
  | {
      type: 'line-clear';
      rows: number[];
      count: number;
      combo: number;
      backToBack: boolean;
      points: number;
    }
  | { type: 'level-up'; level: number }
  | { type: 'spawn'; kind: PieceKind }
  | { type: 'game-over' };

export interface Engine {
  /** Current snapshot. The object may be reused between frames; read it, don't mutate. */
  readonly state: GameStateSnapshot;
  /** Start a new game from menu/gameover. seed = deterministic RNG for tests. */
  start(seed?: number): GameEvent[];
  /** Apply one player action. Returns emitted events. No-op when phase != playing (except pause/resume). */
  input(action: InputAction): GameEvent[];
  /** Advance fixed-step simulation. dtMs = elapsed real ms since previous tick. Returns events emitted this tick. Must not be called when phase != 'playing' (main loop guards). */
  tick(dtMs: number): GameEvent[];
  pause(): void;
  resume(): void;
  toMenu(): void;
  /** Debug/test hook: force-set board + next queue. */
  setBoardForTest(board: Cell[][], queue?: PieceKind[]): void;
}

/** Factory — the ONLY export of src/engine/engine.ts besides types. */
export declare function createEngine(opts?: { highScore?: number }): Engine;

// ---------- Renderer (src/render/renderer.ts) ----------
export interface Renderer {
  /** Draw one frame. Called every rAF from main. */
  render(state: GameStateSnapshot, dtMs: number): void;
  /** React to a game event (particles, shake, flash). */
  pulse(events: GameEvent[]): void;
  /** Recompute canvas size / DPR from container. Call on resize & phase changes. */
  resize(): void;
  /** True when all end-of-action animations (particles, clears) have settled. */
  idle(): boolean;
}
export declare function createRenderer(canvas: HTMLCanvasElement): Renderer;

// ---------- Audio (src/audio/audio.ts) ----------
export type AudioEvent =
  | 'move'
  | 'rotate'
  | 'lock'
  | 'hard-drop'
  | 'line-clear'
  | 'tetris'
  | 'combo'
  | 'level-up'
  | 'hold'
  | 'reject'
  | 'game-over'
  | 'ui-click'
  | 'start'
  | 'pause'
  | 'resume';

export interface AudioManager {
  /** Must be called from a user gesture before any sound (autoplay policy). Safe to call repeatedly. */
  unlock(): void;
  play(event: AudioEvent): void;
  startMusic(): void;
  stopMusic(): void;
  /** When the app goes to background / game pauses. */
  suspend(): void;
  resumeCtx(): void;
  setSettings(s: Settings): void;
}
export declare function createAudio(): AudioManager;

// ---------- UI / screens / touch (src/ui/ui.ts) ----------
export type ScreenName =
  | 'menu'
  | 'game'
  | 'pause'
  | 'gameover'
  | 'settings'
  | 'orientation'
  | 'onboarding';

export interface UIHandlers {
  onStart(): void;
  onRestart(): void;
  onResume(): void;
  onPause(): void;
  /** 'back-to-menu' e.g. from pause or gameover. */
  onQuitToMenu(): void;
  onSettingsChanged(s: Settings): void;
  /** Fired on any user interaction — main uses it to unlock audio. */
  onUserGesture(): void;
  /** Onboarding finished/skipped. */
  onOnboardingDone(): void;
}

export interface UI {
  show(screen: ScreenName): void;
  current(): ScreenName;
  /** HUD refresh (score/level/lines/queue/hold). Called by main every frame or on change. */
  updateHud(state: GameStateSnapshot): void;
  /** Settings toggles state sync. */
  setSettings(s: Settings): void;
  /** Main registers engine action dispatch here (touch buttons + gestures + keyboard). */
  bindInput(cb: (action: InputAction) => void): void;
  /** Show 'rotate your phone' gate or dismiss it. Handled through show('orientation'). */
}
export declare function createUI(root: HTMLElement, handlers: UIHandlers): UI;

// ---------- Platform (src/platform/telegram.ts) ----------
export interface HapticStyle {
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
}
export interface HapticNotification {
  type: 'error' | 'success' | 'warning';
}

export interface PlatformAdapter {
  readonly isTelegram: boolean;
  /** WebApp.ready() + expand() + fullscreen/portrait setup. Call once at boot. */
  init(): void;
  /** Send data to Telegram cloud if available (best-effort, must never throw). */
  cloudSet(key: string, value: string): void;
  cloudGet(key: string): string | null;
  haptic(o: HapticStyle | HapticNotification): void;
  /** Visibility / lifecycle callbacks (Telegram activated/deactivated + document visibilitychange). */
  onVisibility(cb: (visible: boolean) => void): void;
  onOrientation(cb: (portrait: boolean) => void): void;
  /** Enable closing confirmation while playing; disable when not playing. */
  confirmClose(enabled: boolean, message?: string): void;
  /** Back-button-ish: register handler for Telegram BackButton if available. */
  onBack(cb: () => void): void;
  /** Theme of client. */
  theme(): 'light' | 'dark';
}
export declare function createPlatform(): PlatformAdapter;

// ---------- Settings + Store (shared shapes) ----------
export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  /** Set after first onboarding completed. */
  onboarded: boolean;
  /** Right-hand layout preference etc. reserved; UI may add keys ONLY as optional. */
}

export const SETTINGS_KEY = 'blockfall:settings';
export const HIGHSCORE_KEY = 'blockfall:highscore';
export const BOARDSTATS_KEY = 'blockfall:stats';

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
/** src/platform/store.ts — localStorage-backed with Telegram CloudStorage overlay (SA3). */
export declare function createStore(platform: PlatformAdapter): Store;

// ---------- Event mapping helper (defined in main.ts by Lead) ----------
// audio map for GameEvent -> AudioEvent is done in main; no contract needed.
