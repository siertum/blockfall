// Board model. ROWS_PLAY = ROWS visible + 2 hidden spawn rows above.
// Internal coordinates: row 0..1 = hidden, row HIDDEN..HIDDEN+ROWS-1 = visible.
// Snapshot board (and everything the renderer/tests see) is indexed with the
// guideline convention: board[y][x], y=0 = TOP VISIBLE row.
import type { Cell, PieceKind } from '../shared/types';
import { COLS, ROWS } from '../shared/constants';

export const HIDDEN_ROWS = 2;
export const ROWS_PLAY = ROWS + HIDDEN_ROWS;

export function emptyBoard(): Cell[][] {
  const b: Cell[][] = [];
  for (let y = 0; y < ROWS_PLAY; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < COLS; x++) row.push(0);
    b.push(row);
  }
  return b;
}

export function isFullRow(board: Cell[][], y: number): boolean {
  for (let x = 0; x < COLS; x++) {
    if (board[y][x] === 0) return false;
  }
  return true;
}

/** Remove full rows, dropping everything above by gravity. Returns cleared play-row indices. */
export function clearFullRows(board: Cell[][]): number[] {
  const rows: number[] = [];
  for (let y = 0; y < ROWS_PLAY; y++) {
    if (isFullRow(board, y)) rows.push(y);
  }
  if (rows.length === 0) return rows;
  const keep = board.filter((_row, y) => !rows.includes(y));
  const empties: Cell[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const e: Cell[] = [];
    for (let x = 0; x < COLS; x++) e.push(0);
    empties.push(e);
  }
  const next = empties.concat(keep);
  for (let y = 0; y < ROWS_PLAY; y++) {
    for (let x = 0; x < COLS; x++) board[y][x] = next[y][x];
  }
  return rows;
}

/** Stamp a piece kind into every cell of the given coordinates. */
export function stamp(
  board: Cell[][],
  cells: ReadonlyArray<{ x: number; y: number }>,
  kind: PieceKind,
): void {
  for (const c of cells) {
    if (c.y >= 0 && c.y < ROWS_PLAY && c.x >= 0 && c.x < COLS) {
      board[c.y][c.x] = kind;
    }
  }
}

/**
 * Extract the visible portion of the internal board into the snapshot shape
 * (ROWS x COLS, y=0 = top visible row).
 */
export function toVisible(internal: Cell[][]): Cell[][] {
  const out: Cell[][] = [];
  for (let y = 0; y < ROWS; y++) {
    out.push(internal[y + HIDDEN_ROWS].slice());
  }
  return out;
}

/** Build an internal board from a visible ROWS x COLS snapshot board. */
export function fromVisible(visible: Cell[][]): Cell[][] {
  const b = emptyBoard();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      b[y + HIDDEN_ROWS][x] = visible[y][x];
    }
  }
  return b;
}

/** True if any occupied cell of the internal board sits above the visible field. */
export function hasCellsAboveVisible(internal: Cell[][]): boolean {
  for (let y = 0; y < HIDDEN_ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (internal[y][x] !== 0) return true;
    }
  }
  return false;
}
