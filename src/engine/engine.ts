// Blockfall gameplay engine. No DOM, no timers: pure fixed-step simulation
// driven by tick(dtMs) / input(action). Single public export: createEngine().
import type {
  ActivePiece,
  Cell,
  Engine,
  GameEvent,
  GameStateSnapshot,
  InputAction,
  LineClearInfo,
  PieceKind,
  Phase,
} from '../shared/types';
import {
  COMBO_BONUS,
  HARD_DROP_POINTS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  LOCK_RESET_LIMIT,
  MAX_LEVEL,
  NEXT_PREVIEW_SIZE,
  PIECES,
  SCORE_TABLE,
  SOFT_DROP_POINTS,
  SPAWN_Y,
  gravityInterval,
} from '../shared/constants';
import {
  clearFullRows,
  emptyBoard,
  fromVisible,
  HIDDEN_ROWS,
  hasCellsAboveVisible,
  stamp,
  toVisible,
} from './board';
import { collides, ghostPiece, tryRotate } from './pieces';
import { createBag, type Bag } from './bag';

// Spawn anchor in INTERNAL coords: snapshot pos.y = SPAWN_Y (-2) =>
// internal y = SPAWN_Y + HIDDEN_ROWS = 0.
const SPAWN_POS = { x: 3, y: HIDDEN_ROWS + SPAWN_Y };

const QUEUE_KEEP = 7;

interface EngineInternals {
  phase: Phase;
  board: Cell[][]; // internal (ROWS+HIDDEN_ROWS) x COLS; rows 0..HIDDEN_ROWS-1 hidden
  active: ActivePiece | null;
  hold: PieceKind | null;
  canHold: boolean;
  queue: PieceKind[];
  bag: Bag;
  score: number;
  highScore: number;
  lines: number;
  level: number;
  combo: number; // -1 = no chain; 0 = first clear; n = (n+1)-th consecutive clear
  b2b: boolean; // previous CLEAR was a Tetris (survives non-clearing locks)
  time: number; // seconds spent in 'playing'
  gravityAcc: number; // ms toward next natural gravity step
  lockAcc: number; // ms grounded without lock
  lockResets: number; // lock-delay resets used since spawn (cap LOCK_RESET_LIMIT)
  grounded: boolean;
  over: boolean;
  piecesPlaced: number;
  lastClear: LineClearInfo | null;
}

export function createEngine(opts?: { highScore?: number }): Engine {
  const I: EngineInternals = {
    phase: 'menu',
    board: emptyBoard(),
    active: null,
    hold: null,
    canHold: true,
    queue: [],
    bag: createBag(1),
    score: 0,
    highScore: opts?.highScore ?? 0,
    lines: 0,
    level: 1,
    combo: -1,
    b2b: false,
    time: 0,
    gravityAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    grounded: false,
    over: false,
    piecesPlaced: 0,
    lastClear: null,
  };

  // ---------------- helpers (internal coordinates) ----------------

  function gravityMs(): number {
    return gravityInterval(I.level) * 1000; // level 1 -> 1000 ms/row
  }

  function makePiece(kind: PieceKind): ActivePiece {
    return { kind, pos: { x: SPAWN_POS.x, y: SPAWN_POS.y }, rot: 0 };
  }

  function shifted(p: ActivePiece, dx: number, dy: number): ActivePiece {
    return { kind: p.kind, rot: p.rot, pos: { x: p.pos.x + dx, y: p.pos.y + dy } };
  }

  function ensureQueue(): void {
    while (I.queue.length < QUEUE_KEEP) I.queue.push(I.bag.next());
  }

  function resetLockTimers(): void {
    I.gravityAcc = 0;
    I.lockAcc = 0;
    I.lockResets = 0;
    I.grounded = false;
  }

  function refreshGrounded(): void {
    I.grounded = I.active ? collides(I.board, shifted(I.active, 0, 1)) : false;
  }

  /** Player move/rotate while grounded: reset lock timer, max LOCK_RESET_LIMIT times. */
  function registerManipulation(): void {
    refreshGrounded();
    if (I.grounded && I.lockResets < LOCK_RESET_LIMIT) {
      I.lockAcc = 0;
      I.lockResets++;
    }
  }

  function gameOver(events: GameEvent[]): void {
    if (I.over) return;
    I.over = true;
    I.phase = 'gameover';
    I.active = null;
    if (I.score > I.highScore) I.highScore = I.score;
    events.push({ type: 'game-over' });
  }

  function spawnNext(events: GameEvent[]): void {
    ensureQueue();
    const kind = I.queue.shift() as PieceKind;
    ensureQueue();
    const piece = makePiece(kind);
    if (collides(I.board, piece)) {
      gameOver(events); // block-out
      return;
    }
    I.active = piece;
    I.canHold = true;
    resetLockTimers();
    events.push({ type: 'spawn', kind });
  }

  function lockPiece(events: GameEvent[]): void {
    const piece = I.active;
    if (!piece) return;
    const cells = PIECES[piece.kind][piece.rot & 3].map((o) => ({
      x: piece.pos.x + o.x,
      y: piece.pos.y + o.y,
    }));
    stamp(I.board, cells, piece.kind);
    I.active = null;
    I.piecesPlaced++;
    events.push({ type: 'lock' });

    // Line clears + gravity shift of rows above.
    const cleared = clearFullRows(I.board);
    if (cleared.length > 0) {
      const count = cleared.length;
      I.combo += 1; // -1 -> 0 (no bonus), 0 -> 1 (+50), etc.
      const difficult = count === 4;
      const backToBack = difficult && I.b2b;
      I.b2b = difficult;
      const base = (SCORE_TABLE[count] ?? 0) * I.level;
      const points = Math.floor(base * (backToBack ? 1.5 : 1)) + COMBO_BONUS * Math.max(0, I.combo);
      I.score += points;
      I.lines += count;
      const prevLevel = I.level;
      I.level = Math.min(1 + Math.floor(I.lines / LINES_PER_LEVEL), MAX_LEVEL);

      const info: LineClearInfo = {
        rows: cleared.map((y) => y - HIDDEN_ROWS), // visible coords, 0 = top
        count,
        at: I.time,
        backToBack,
      };
      I.lastClear = info;
      events.push({ type: 'line-clear', rows: info.rows, count, combo: I.combo, backToBack, points });
      if (I.level > prevLevel) {
        I.gravityAcc = 0; // accumulator reset on level change
        events.push({ type: 'level-up', level: I.level });
      }
    } else {
      I.combo = -1; // lock without clear breaks the combo chain
    }

    if (I.score > I.highScore) I.highScore = I.score;

    // top-out: any locked cell still rests above the visible field (y < 0 snapshot)
    if (hasCellsAboveVisible(I.board)) {
      gameOver(events);
      return;
    }
    spawnNext(events);
  }

  function toVisual(p: ActivePiece): ActivePiece {
    return { kind: p.kind, rot: p.rot, pos: { x: p.pos.x, y: p.pos.y - HIDDEN_ROWS } };
  }

  function snapshot(): GameStateSnapshot {
    return {
      phase: I.phase,
      board: toVisible(I.board),
      active: I.active ? toVisual(I.active) : null,
      ghost: I.active ? toVisual(ghostPiece(I.board, I.active)) : null,
      hold: I.hold,
      canHold: I.canHold,
      queue: I.queue.slice(0, NEXT_PREVIEW_SIZE),
      score: I.score,
      highScore: I.highScore,
      lines: I.lines,
      level: I.level,
      combo: I.combo,
      time: I.time,
      gravity: gravityInterval(I.level),
      lastClear: I.lastClear,
      over: I.over,
      piecesPlaced: I.piecesPlaced,
    };
  }

  // ---------------- public API ----------------

  const engine: Engine = {
    get state(): GameStateSnapshot {
      return snapshot();
    },

    start(seed?: number): GameEvent[] {
      const events: GameEvent[] = [];
      I.bag = createBag(seed !== undefined ? seed >>> 0 : (Date.now() * 2654435761) >>> 0);
      I.board = emptyBoard();
      I.active = null;
      I.hold = null;
      I.canHold = true;
      I.queue = [];
      I.score = 0;
      I.lines = 0;
      I.level = 1;
      I.combo = -1;
      I.b2b = false;
      I.time = 0;
      I.over = false;
      I.piecesPlaced = 0;
      I.lastClear = null;
      resetLockTimers();
      ensureQueue();
      I.phase = 'playing';
      spawnNext(events);
      return events;
    },

    input(action: InputAction): GameEvent[] {
      const events: GameEvent[] = [];
      if (action === 'pause') {
        if (I.phase === 'playing') I.phase = 'paused';
        return events;
      }
      if (action === 'resume') {
        if (I.phase === 'paused') I.phase = 'playing';
        return events;
      }
      if (I.phase !== 'playing' || !I.active) return events;

      switch (action) {
        case 'left':
        case 'right': {
          const cand = shifted(I.active, action === 'left' ? -1 : 1, 0);
          if (!collides(I.board, cand)) {
            I.active = cand;
            registerManipulation();
            events.push({ type: 'move' });
          }
          break;
        }
        case 'rotate-cw':
        case 'rotate-ccw':
        case 'rotate-180': {
          const dir = action === 'rotate-cw' ? 1 : action === 'rotate-ccw' ? -1 : 2;
          const res = tryRotate(I.board, I.active, dir);
          if (res) {
            I.active = res;
            registerManipulation();
            events.push({ type: 'rotate' });
          } else {
            events.push({ type: 'rotate-blocked' });
          }
          break;
        }
        case 'soft-drop': {
          const down = shifted(I.active, 0, 1);
          if (!collides(I.board, down)) {
            I.active = down;
            I.score += SOFT_DROP_POINTS;
            I.gravityAcc = 0;
            I.lockAcc = 0;
            refreshGrounded();
            events.push({ type: 'soft-drop' });
          }
          break;
        }
        case 'hard-drop': {
          let dy = 0;
          while (!collides(I.board, shifted(I.active, 0, dy + 1))) dy++;
          I.active = shifted(I.active, 0, dy);
          I.score += dy * HARD_DROP_POINTS;
          events.push({ type: 'hard-drop', cells: dy });
          lockPiece(events); // immediate lock; lock delay not applied
          break;
        }
        case 'hold': {
          if (!I.canHold) {
            events.push({ type: 'hold-blocked' });
            break;
          }
          const current = I.active.kind;
          let incoming: PieceKind;
          if (I.hold) {
            incoming = I.hold;
          } else {
            ensureQueue();
            incoming = I.queue.shift() as PieceKind;
            ensureQueue();
          }
          I.hold = current;
          I.canHold = false;
          const piece = makePiece(incoming); // swapped piece returns to spawn pos, rot 0
          I.active = piece;
          resetLockTimers();
          events.push({ type: 'hold' });
          if (collides(I.board, piece)) gameOver(events);
          break;
        }
      }
      return events;
    },

    tick(dtMs: number): GameEvent[] {
      const events: GameEvent[] = [];
      if (I.phase !== 'playing') return events;
      I.time += dtMs / 1000;

      // Natural gravity: accumulator, one row per gravityMs().
      const gMs = gravityMs();
      I.gravityAcc += dtMs;
      let landedThisTick = false;
      while (I.gravityAcc >= gMs && I.active) {
        I.gravityAcc -= gMs;
        const down = shifted(I.active, 0, 1);
        if (!collides(I.board, down)) {
          I.active = down;
          I.lockAcc = 0;
          I.grounded = false;
        } else if (!I.grounded) {
          I.grounded = true;
          landedThisTick = true;
        }
      }

      // Lock delay: while grounded the 500ms timer runs; manipulations reset it
      // (max LOCK_RESET_LIMIT), after which the pending time force-locks. A
      // piece that touches down mid-tick starts its timer on the next tick.
      if (I.active) {
        refreshGrounded();
        if (I.grounded) {
          if (!landedThisTick) I.lockAcc += dtMs;
          if (I.lockAcc >= LOCK_DELAY_MS) {
            lockPiece(events);
          }
        } else {
          I.lockAcc = 0;
        }
      }
      return events;
    },

    pause(): void {
      if (I.phase === 'playing') I.phase = 'paused';
    },

    resume(): void {
      if (I.phase === 'paused') I.phase = 'playing';
    },

    toMenu(): void {
      I.phase = 'menu';
      I.active = null;
    },

    setBoardForTest(board: Cell[][], queue?: PieceKind[]): void {
      I.board = fromVisible(board);
      if (queue && queue.length > 0) {
        I.queue = queue.slice();
        ensureQueue();
      }
    },
  };

  return engine;
}
