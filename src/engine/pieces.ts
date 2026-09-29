// Piece geometry helpers: absolute cells, collision tests, ghost projection,
// SRS rotation targets + wall-kick resolution.
import type { ActivePiece, Cell, PieceKind, Vec } from '../shared/types';
import { COLS, KICKS_I, KICKS_JLSTZ, PIECES } from '../shared/constants';
import { ROWS_PLAY } from './board';

/** Absolute board coordinates (internal, y-down, 0 = top hidden row) of a piece. */
export function cellsOf(piece: ActivePiece): Vec[] {
  const offsets = PIECES[piece.kind][piece.rot & 3];
  return offsets.map((o) => ({ x: piece.pos.x + o.x, y: piece.pos.y + o.y }));
}

/** True when any cell is out of bounds (sides/bottom; top rows above 0 allowed pre-lock) or overlaps. */
export function collides(board: Cell[][], piece: ActivePiece): boolean {
  for (const c of cellsOf(piece)) {
    if (c.x < 0 || c.x >= COLS) return true;
    if (c.y >= ROWS_PLAY) return true;
    if (c.y >= 0 && board[c.y][c.x] !== 0) return true;
  }
  return false;
}

/** Piece slid straight down as far as possible without collision. */
export function ghostPiece(board: Cell[][], piece: ActivePiece): ActivePiece {
  let dy = 0;
  const probe: ActivePiece = { kind: piece.kind, pos: { x: piece.pos.x, y: piece.pos.y }, rot: piece.rot };
  while (true) {
    probe.pos.y = piece.pos.y + dy + 1;
    if (collides(board, probe)) break;
    dy++;
    if (dy > ROWS_PLAY + 4) break; // safety
  }
  probe.pos.y = piece.pos.y + dy;
  return probe;
}

/** Rotation target state for a direction: +1 cw, -1 ccw, 2 = 180. */
export function rotTarget(rot: number, dir: number): number {
  return ((rot + dir) % 4 + 4) % 4;
}

/** Kick offsets for a transition; O never kicks (only {0,0}). */
export function kicksFor(kind: PieceKind, from: number, to: number): Vec[] {
  if (kind === 'O') return [{ x: 0, y: 0 }];
  const table = kind === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`] ?? [{ x: 0, y: 0 }];
}

/**
 * Try rotation `dir` with SRS wall kicks. Returns the landed piece or null when
 * every offset collides.
 */
export function tryRotate(board: Cell[][], piece: ActivePiece, dir: number): ActivePiece | null {
  const to = rotTarget(piece.rot, dir);
  const kicks = kicksFor(piece.kind, piece.rot, to);
  for (const kick of kicks) {
    const cand: ActivePiece = {
      kind: piece.kind,
      pos: { x: piece.pos.x + kick.x, y: piece.pos.y + kick.y },
      rot: to,
    };
    if (!collides(board, cand)) return cand;
  }
  return null;
}
