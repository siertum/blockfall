import type { PieceKind, Vec } from './types';

// Board geometry — visible field is COLS x ROWS. Engine keeps ROWS_PLAY rows
// with the top 2 hidden spawn rows (y = -2..-1 conceptually via pos.y < 0).
export const COLS = 10;
export const ROWS = 20;

export const NEXT_PREVIEW_SIZE = 5;

// Timing
export const LOCK_DELAY_MS = 500;
export const LOCK_RESET_LIMIT = 15; // move/rotate resets of lock delay before force-lock
export const SOFT_DROP_FACTOR = 20; // soft drop speed = gravity interval / factor
export const HARD_DROP_SNAP_MS = 60; // minimal time hard drop takes visually (renderer may animate)
export const CLEAR_ANIM_MS = 320; // engine does not wait; renderer animates this long

// Scoring (guideline-flavoured; b2b = x1.5)
export const SCORE_TABLE: Record<number, number> = { 0: 0, 1: 100, 2: 300, 3: 500, 4: 800 };
export const COMBO_BONUS = 50;
export const SOFT_DROP_POINTS = 1; // per cell
export const HARD_DROP_POINTS = 2; // per cell
export const LINES_PER_LEVEL = 10;
export const MAX_LEVEL = 20;

/** Tetris Guideline gravity: seconds per row for level (1-based). */
export function gravityInterval(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

// Piece spawn positions: x offset so piece is roughly centered, y = top spawn row
// (above the visible field).
export const SPAWN_Y = -2;

// SRS piece definitions: for each kind, 4 rotation states of cell offsets
// relative to bounding-box top-left. Bounding boxes: I/O are 4x4/2x2 grids as below.
export const PIECES: Record<PieceKind, Vec[][]> = {
  // rotation states listed; cells relative to box top-left.
  I: [
    [ { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 } ],
    [ { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 } ],
    [ { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 } ],
  ],
  O: [
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
  ],
  T: [
    [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 } ],
    [ { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 } ],
    [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 } ],
  ],
  S: [
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 } ],
    [ { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 } ],
    [ { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 } ],
  ],
  Z: [
    [ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 } ],
    [ { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 } ],
    [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 } ],
  ],
  J: [
    [ { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 } ],
    [ { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 } ],
    [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 } ],
  ],
  L: [
    [ { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 } ],
    [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 } ],
    [ { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 } ],
    [ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 } ],
  ],
};

// SRS wall-kick tables. Offsets applied to (x, y) with y DOWN positive => the
// standard tables list (x, y) with y UP; engine must negate y from tables below,
// which are given already in DOWN-positive coordinates (Lead normalized them).
export type KickTable = Record<string, Vec[]>;

const k = (from: number, to: number, pts: Vec[]): [string, Vec[]] => [`${from}>${to}`, pts];

export const KICKS_JLSTZ: KickTable = Object.fromEntries([
  k(0, 1, [ {x:0,y:0}, {x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:0,y:1} ]),
  k(1, 0, [ {x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:0,y:-1} ]),
  k(1, 2, [ {x:0,y:0}, {x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:0,y:1} ]),
  k(2, 1, [ {x:0,y:0}, {x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:0,y:-1} ]),
  k(2, 3, [ {x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:0,y:-1} ]),
  k(3, 2, [ {x:0,y:0}, {x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:0,y:1} ]),
  k(3, 0, [ {x:0,y:0}, {x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:0,y:-1} ]),
  k(0, 3, [ {x:0,y:0}, {x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:0,y:1} ]),
]);

export const KICKS_I: KickTable = Object.fromEntries([
  k(0, 1, [ {x:0,y:0}, {x:-2,y:0}, {x:1,y:0}, {x:-2,y:1}, {x:1,y:-2} ]),
  k(1, 0, [ {x:0,y:0}, {x:2,y:0}, {x:-1,y:0}, {x:2,y:-1}, {x:-1,y:2} ]),
  k(1, 2, [ {x:0,y:0}, {x:-1,y:0}, {x:2,y:0}, {x:-1,y:-2}, {x:2,y:1} ]),
  k(2, 1, [ {x:0,y:0}, {x:1,y:0}, {x:-2,y:0}, {x:1,y:2}, {x:-2,y:-1} ]),
  k(2, 3, [ {x:0,y:0}, {x:2,y:0}, {x:-1,y:0}, {x:2,y:-1}, {x:-1,y:2} ]),
  k(3, 2, [ {x:0,y:0}, {x:-2,y:0}, {x:1,y:0}, {x:-2,y:1}, {x:1,y:-2} ]),
  k(3, 0, [ {x:0,y:0}, {x:1,y:0}, {x:-2,y:0}, {x:1,y:2}, {x:-2,y:-1} ]),
  k(0, 3, [ {x:0,y:0}, {x:-1,y:0}, {x:2,y:0}, {x:-1,y:-2}, {x:2,y:1} ]),
]);

// ---------- Visual identity: "Blockfall" ----------
// Dusk garden palette; pieces are clusters of glowing sap-bubbles.
export const PIECE_COLORS: Record<PieceKind, { base: string; glow: string; hi: string }> = {
  I: { base: '#5fd4d0', glow: 'rgba(95,212,208,0.55)', hi: '#c9fff9' }, // mint stream
  O: { base: '#f2c14e', glow: 'rgba(242,193,78,0.55)', hi: '#ffedbb' }, // amber nectar
  T: { base: '#b57bee', glow: 'rgba(181,123,238,0.55)', hi: '#e8d4ff' }, // wisteria
  S: { base: '#6fce74', glow: 'rgba(111,206,116,0.55)', hi: '#d3ffd6' }, // leaf
  Z: { base: '#ef7d7d', glow: 'rgba(239,125,125,0.55)', hi: '#ffd6d6' }, // berry
  J: { base: '#6f9bee', glow: 'rgba(111,155,238,0.55)', hi: '#d4e2ff' }, // firefly blue
  L: { base: '#ef9f5f', glow: 'rgba(239,159,95,0.55)', hi: '#ffe0c2' }, // sunset peach
};

export const BG_TOP = '#12283a';
export const BG_BOTTOM = '#1d3c33';
export const FIELD_TINT = 'rgba(8,20,18,0.55)';
export const GRID_LINE = 'rgba(120,190,170,0.08)';
