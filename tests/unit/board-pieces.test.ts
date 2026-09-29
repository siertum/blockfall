// Convention: snapshot rows (y=0 = top visible) map to internal rows via
// internalY(y) = y + HIDDEN_ROWS. emptyBoard() is INTERNAL (22 rows: 2 hidden).
import { describe, expect, it } from 'vitest';
import type { ActivePiece, Cell, PieceKind } from '../../src/shared/types';
import { COLS, PIECES, ROWS } from '../../src/shared/constants';
import { emptyBoard, HIDDEN_ROWS, ROWS_PLAY, toVisible } from '../../src/engine/board';
import { cellsOf, collides, ghostPiece } from '../../src/engine/pieces';

function piece(kind: PieceKind, x: number, y: number, rot = 0): ActivePiece {
  return { kind, rot, pos: { x, y } };
}

/** Internal row index of a snapshot (visible) row. */
function internalY(visibleY: number): number {
  return visibleY + HIDDEN_ROWS;
}

describe('piece geometry & collisions', () => {
  it('each piece has 4 rotation states of 4 cells', () => {
    for (const kind of Object.keys(PIECES) as PieceKind[]) {
      expect(PIECES[kind].length).toBe(4);
      for (const st of PIECES[kind]) expect(st.length).toBe(4);
    }
  });

  it('emptyBoard is internal-shaped; toVisible is snapshot-shaped', () => {
    const b = emptyBoard();
    expect(b.length).toBe(ROWS_PLAY); // 22 = 2 hidden + 20 visible
    expect(b[0].length).toBe(COLS);
    const v = toVisible(b);
    expect(v.length).toBe(ROWS);
    for (const row of v) expect(row.length).toBe(COLS);
    const cell: Cell = 0;
    expect(cell).toBe(0);
  });

  it('cellsOf maps rotation state onto absolute coords', () => {
    const p = piece('O', 3, 18, 0);
    expect(cellsOf(p)).toEqual([
      { x: 4, y: 18 },
      { x: 5, y: 18 },
      { x: 4, y: 19 },
      { x: 5, y: 19 },
    ]);
  });

  it('no collision on empty board inside bounds', () => {
    const b = emptyBoard();
    for (const kind of Object.keys(PIECES) as PieceKind[]) {
      for (let rot = 0; rot < 4; rot++) {
        expect(collides(b, piece(kind, 3, 10, rot))).toBe(false);
      }
    }
  });

  it('spawns never collide on an empty board (all kinds, rot 0, spawn x=3, internal y=0)', () => {
    const b = emptyBoard();
    for (const kind of Object.keys(PIECES) as PieceKind[]) {
      expect(collides(b, piece(kind, 3, 0))).toBe(false);
    }
  });

  it('collides with walls and floor', () => {
    const b = emptyBoard();
    expect(collides(b, piece('T', -1, 10))).toBe(true); // left wall
    expect(collides(b, piece('T', COLS - 2, 10))).toBe(true); // right wall (T cell at x=10)
    expect(collides(b, piece('T', 3, ROWS_PLAY - 1))).toBe(true); // T bottom cell y+1 -> row 22
    expect(collides(b, piece('T', 3, ROWS_PLAY - 2))).toBe(false); // rests on the floor row
  });

  it('hidden top rows do not collide on empty board', () => {
    const b = emptyBoard();
    expect(collides(b, piece('T', 3, -1))).toBe(false);
    expect(collides(b, piece('T', 3, -2))).toBe(false);
  });

  it('collides with filled stack cell (internal indices)', () => {
    const b = emptyBoard();
    b[internalY(19)][5] = 'I'; // snapshot bottom row (internal row 21), col 5
    expect(collides(b, piece('T', 4, internalY(20) /* == 22, below */ - 2))).toBe(true); // T cell (5,21)
    expect(collides(b, piece('T', 3, 18))).toBe(false); // T cells rows 18-19 only
  });

  it('ghostPiece drops to the floor', () => {
    const b = emptyBoard();
    const g = ghostPiece(b, piece('T', 3, 0));
    // T rot0 lowest offset y=1 -> rests so that pos.y+1 = ROWS_PLAY-1
    expect(g.pos.y).toBe(ROWS_PLAY - 2);
    expect(collides(b, g)).toBe(false);
    expect(collides(b, piece('T', 3, g.pos.y + 1))).toBe(true);
  });

  it('ghostPiece stops on a stack', () => {
    const b = emptyBoard();
    // stack top at snapshot row 17 (internal 19), cols 3..6
    for (let x = 3; x <= 6; x++) b[internalY(17)][x] = 'L';
    const g = ghostPiece(b, piece('T', 3, 0));
    expect(collides(b, g)).toBe(false);
    expect(collides(b, piece('T', 3, g.pos.y + 1))).toBe(true);
    // T bottom cells (offset +1) rest just above the stack: internal row 18
    expect(g.pos.y + 1).toBe(internalY(17) - 1);
  });
});
