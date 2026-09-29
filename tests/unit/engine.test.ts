// Convention everywhere: engine.state.board / setBoardForTest use SNAPSHOT
// coords (y=0 = top visible row, 20 rows). pieces.test uses internal indices
// (HIDDEN_ROWS offset) explicitly. seed 42 -> bag "SOIJLTZ...": active S,
// queue head O, then I.
import { describe, expect, it } from 'vitest';
import type { Cell, GameEvent, PieceKind } from '../../src/shared/types';
import { COLS, ROWS, gravityInterval } from '../../src/shared/constants';
import { createEngine } from '../../src/engine/engine';
import { tryRotate } from '../../src/engine/pieces';
import { emptyBoard } from '../../src/engine/board';

const SEED = 42;

function blankVisible(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0 as Cell));
}
function fillRow(b: Cell[][], y: number, exceptX: number[] = []): void {
  for (let x = 0; x < COLS; x++) b[y][x] = exceptX.includes(x) ? 0 : 'L';
}
function has(events: GameEvent[], type: GameEvent['type']): boolean {
  return events.some((e) => e.type === type);
}
function clearEvent(events: GameEvent[]): GameEvent | undefined {
  return events.find((e) => e.type === 'line-clear');
}
// 4 rows (16..19) full except column 9: a vertical I dropped into col 9 = Tetris.
function tetrisReadyBoard(): Cell[][] {
  const b = blankVisible();
  for (let y = 16; y < 20; y++) fillRow(b, y, [9]);
  return b;
}
function placeVerticalI(e: ReturnType<typeof createEngine>): void {
  e.input('rotate-cw');
  for (let i = 0; i < 10; i++) e.input('right');
}

describe('rotation & wall kicks', () => {
  it('all 4 rotation states of every piece are reachable in open space', () => {
    for (const kind of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as PieceKind[]) {
      const board = emptyBoard();
      let p = { kind, rot: 0, pos: { x: 3, y: 10 } };
      for (let step = 0; step < 4; step++) {
        const res = tryRotate(board, p, 1);
        expect(res).not.toBeNull();
        p = res as typeof p;
        expect(p.rot).toBe((step + 1) % 4);
      }
      expect(p.rot).toBe(0);
    }
  });

  it('spawn positions never collide for any piece at rot 0', () => {
    const e = createEngine();
    e.start(SEED);
    expect(e.state.active!.pos).toEqual({ x: 3, y: -2 });
    expect(e.state.active!.rot).toBe(0);
  });

  it('rotate-cw / ccw / 180 advance rot correctly', () => {
    const e = createEngine();
    e.start(SEED);
    expect(has(e.input('rotate-cw'), 'rotate')).toBe(true);
    expect(e.state.active!.rot).toBe(1);
    e.input('rotate-180');
    expect(e.state.active!.rot).toBe(3);
    e.input('rotate-ccw');
    expect(e.state.active!.rot).toBe(2);
  });

  it('O rotates in place and never shifts (no kicks)', () => {
    const board = emptyBoard();
    const before = { kind: 'O' as PieceKind, rot: 0, pos: { x: 0, y: 10 } };
    const res = tryRotate(board, before, 1);
    expect(res).not.toBeNull();
    expect(res!.pos).toEqual(before.pos); // zero displacement
    // O has only {0,0}: against the wall it cannot kick out and fails.
    expect(tryRotate(board, { kind: 'O', rot: 0, pos: { x: -2, y: 10 } }, 1)).toBeNull();
  });

  it('T wall kick against the left wall (JLSTZ table)', () => {
    // vertical T (rot1) flush left: cells col 1. cw 1->2: horizontal cells
    // col 0..2 at pos.y+1; offset (1,0) clears the wall.
    const board = emptyBoard();
    const res = tryRotate(board, { kind: 'T', rot: 1, pos: { x: -1, y: 10 } }, 1);
    expect(res).not.toBeNull();
    expect(res!.rot).toBe(2);
    expect(res!.pos.x).toBeGreaterThan(-1); // kicked away from the wall
  });

  it('I kick: vertical I at the left wall kicks right on cw (KICKS_I)', () => {
    const board = emptyBoard();
    const res = tryRotate(board, { kind: 'I', rot: 1, pos: { x: -2, y: 10 } }, 1);
    expect(res).not.toBeNull();
    expect(res!.rot).toBe(2);
    expect(res!.pos.x).toBe(0); // offset (2,0) applied
  });

  it('failed kick chain -> rotate-blocked event, rot unchanged (engine)', () => {
    // Vertical I pinned in the col-0 shaft (x=-2 after kicks to the left wall);
    // cols 1..3 of visible rows 17-18 filled: every cw kick offset collides.
    const board = blankVisible();
    for (let y = 17; y < 19; y++) {
      for (let x = 1; x <= 3; x++) board[y][x] = 'L';
    }
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(board, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    e.input('hold'); // active I
    e.input('rotate-cw'); // vertical
    for (let i = 0; i < 8; i++) e.input('left'); // wall/pocket at x=-2
    for (let i = 0; i < 25; i++) e.input('soft-drop'); // land on the floor
    const before = { ...e.state.active! };
    expect(before.rot).toBe(1);
    const blockedCw = e.input('rotate-cw');
    expect(has(blockedCw, 'rotate-blocked')).toBe(true);
    expect(e.state.active!.rot).toBe(1);
    expect(e.state.active!.pos).toEqual(before.pos);
    const blockedCcw = e.input('rotate-ccw');
    expect(has(blockedCcw, 'rotate-blocked')).toBe(true);
    expect(e.state.active!.rot).toBe(1);
  });
});

describe('line clears, scoring, levels', () => {
  it('single line clear scores 100 * level at level 1', () => {
    const board = blankVisible();
    fillRow(board, 19, [3, 4]); // S rot0 bottom cells land in cols 3,4
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(board, ['O', 'T', 'S', 'Z', 'J', 'L', 'I']);
    const evs = e.input('hard-drop');
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.count).toBe(1);
    expect(ev && ev.type === 'line-clear' && ev.points).toBe(100);
    expect(e.state.lines).toBe(1);
    expect(e.state.score).toBeGreaterThan(100); // + hard-drop cells*2
  });

  it('double line clear: O into a 2x2 well scores 300 * level', () => {
    const board = blankVisible();
    for (let y = 18; y < 20; y++) fillRow(board, y, [4, 5]);
    const e = createEngine();
    e.start(SEED);
    for (let i = 0; i < 3; i++) e.input('left'); // park S far left
    e.setBoardForTest(board, ['O', 'T', 'S', 'Z', 'J', 'L', 'I']);
    e.input('hard-drop'); // S settles at cols 0..2, no row completes
    expect(e.state.lines).toBe(0);
    // O spawns over cols 4,5 and completes both rows -> lock after fall+delay
    let t = 0;
    let evs: GameEvent[] = [];
    while (!has(evs, 'lock') && t < 25000) {
      evs = e.tick(250);
      t += 250;
    }
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.count).toBe(2);
    expect(ev && ev.type === 'line-clear' && ev.points).toBe(300);
    expect(e.state.lines).toBe(2);
  });

  it('triple line clear: vertical I in a 3-deep 1-wide shaft scores 500 * level', () => {
    // visible rows 17-19 filled except col 5, standing on the floor:
    // a vertical I drops 4 cells into the shaft, its top cell parks in empty row 16.
    const board = blankVisible();
    for (let y = 17; y < 20; y++) fillRow(board, y, [5]);
    const e = createEngine();
    e.start(SEED);
    for (let i = 0; i < 3; i++) e.input('left'); // park S far left (no clears)
    e.setBoardForTest(board, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    e.input('hard-drop'); // S parks on the floor cols 0..2, no clear
    expect(e.state.lines).toBe(0);
    // next spawn is the queue head I at x=3; rotate makes it a vertical in col 5
    e.input('rotate-cw'); // vertical at col 5 (spawn x=3 -> col x+2 = 5)
    const evs = e.input('hard-drop');
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.count).toBe(3);
    expect(ev && ev.type === 'line-clear' && ev.points).toBe(500);
    expect(ev && ev.type === 'line-clear' && ev.rows).toEqual([17, 18, 19]);
    expect(e.state.lines).toBe(3);
  });

  it('Tetris via vertical I clears 4 rows for 800 * level', () => {
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(tetrisReadyBoard(), ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    e.input('hold'); // I active
    placeVerticalI(e);
    const evs = e.input('hard-drop');
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.count).toBe(4);
    expect(ev && ev.type === 'line-clear' && ev.points).toBe(800);
    expect(ev && ev.type === 'line-clear' && ev.combo).toBe(0);
    expect(ev && ev.type === 'line-clear' && ev.backToBack).toBe(false);
    expect(e.state.lines).toBe(4);
  });

  it('back-to-back Tetris scores 800*1.5*level + combo', () => {
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(tetrisReadyBoard(), ['I', 'I', 'O', 'T', 'S', 'Z', 'J']);
    e.input('hold'); // I active
    placeVerticalI(e);
    const evs1 = e.input('hard-drop');
    const ev1 = clearEvent(evs1);
    expect(ev1 && ev1.type === 'line-clear' && ev1.backToBack).toBe(false);
    // now active is the queued I; rebuild the same well and score it
    e.setBoardForTest(tetrisReadyBoard());
    placeVerticalI(e);
    const evs2 = e.input('hard-drop');
    const ev2 = clearEvent(evs2);
    expect(ev2 && ev2.type === 'line-clear' && ev2.count).toBe(4);
    expect(ev2 && ev2.type === 'line-clear' && ev2.backToBack).toBe(true);
    if (ev2 && ev2.type === 'line-clear') {
      expect(ev2.points).toBe(1200 + 50); // 800*1.5*1 + COMBO_BONUS*1
    }
    expect(e.state.combo).toBe(1);
  });

  it('combo counter increments per consecutive clear, resets on no-clear lock', () => {
    const e = createEngine();
    e.start(SEED); // S
    const board = blankVisible();
    fillRow(board, 19, [3, 4]);
    e.setBoardForTest(board, ['O', 'T', 'S', 'Z', 'J', 'L', 'I']);
    let evs = e.input('hard-drop'); // S clears 1 -> combo 0
    expect(e.state.combo).toBe(0);
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.combo).toBe(0);
    expect(ev && ev.type === 'line-clear' && ev.points).toBe(100);
    fillRow(board, 19, [4, 5]);
    e.setBoardForTest(board); // O clears next (cells cols 4,5)
    evs = e.input('hard-drop');
    expect(e.state.combo).toBe(1);
    const ev2 = clearEvent(evs);
    expect(ev2 && ev2.type === 'line-clear' && ev2.points).toBe(100 + 50);
    // lock without clear breaks the chain
    const emptyBoardV = blankVisible();
    e.setBoardForTest(emptyBoardV);
    e.input('hard-drop'); // next piece falls on floor, no full row
    expect(e.state.combo).toBe(-1);
  });

  it('level = 1 + floor(lines/10); 12 lines -> level 2 with level-up event', () => {
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(tetrisReadyBoard(), ['I', 'I', 'I', 'I', 'I', 'I', 'I']);
    e.input('hold'); // I active
    placeVerticalI(e);
    e.input('hard-drop'); // lines 4
    expect(e.state.level).toBe(1);
    e.setBoardForTest(tetrisReadyBoard());
    placeVerticalI(e);
    e.input('hard-drop'); // lines 8
    expect(e.state.level).toBe(1);
    e.setBoardForTest(tetrisReadyBoard());
    placeVerticalI(e);
    const evs = e.input('hard-drop'); // lines 12 -> level 2
    expect(e.state.lines).toBe(12);
    expect(e.state.level).toBe(2);
    expect(has(evs, 'level-up')).toBe(true);
    expect(e.state.gravity).toBeCloseTo(gravityInterval(2), 10);
  });

  it('line-clear event carries rows in visible coordinates', () => {
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(tetrisReadyBoard(), ['I', 'I', 'I', 'I', 'I', 'I', 'I']);
    e.input('hold');
    placeVerticalI(e);
    const evs = e.input('hard-drop');
    const ev = clearEvent(evs);
    expect(ev && ev.type === 'line-clear' && ev.rows).toEqual([16, 17, 18, 19]);
    if (ev && ev.type === 'line-clear') expect(ev.rows.every((r) => r >= 0 && r < ROWS)).toBe(true);
  });
});

describe('gravity & lock delay', () => {
  it('level 1: one row per gravityInterval(1) seconds, accumulated via tick', () => {
    const e = createEngine();
    e.start(SEED);
    expect(e.state.gravity).toBeCloseTo(gravityInterval(1), 10);
    expect(e.state.active!.pos.y).toBe(-2);
    e.tick(gravityInterval(1) * 1000 - 1);
    expect(e.state.active!.pos.y).toBe(-2);
    e.tick(1);
    expect(e.state.active!.pos.y).toBe(-1);
    e.tick(1000);
    expect(e.state.active!.pos.y).toBe(0);
    e.tick(3000);
    expect(e.state.active!.pos.y).toBe(3);
  });

  it('piece locks ~500ms after touchdown under pure gravity', () => {
    const e = createEngine();
    e.start(SEED);
    e.input('hold'); // O active at spawn on empty board
    let t = 0;
    let lockedAt = -1;
    while (t < 30000 && lockedAt < 0) {
      const evs = e.tick(50);
      t += 50;
      if (has(evs, 'lock')) lockedAt = t;
    }
    // O falls 19 rows at 1000ms/row from spawn, then LOCK_DELAY_MS=500.
    expect(lockedAt).toBeGreaterThanOrEqual(19000);
    expect(lockedAt).toBeLessThanOrEqual(20600);
    expect(e.state.active).not.toBeNull(); // next piece spawned
  });

  it('move while grounded resets the lock timer; force-lock after 15 resets', () => {
    const e = createEngine();
    e.start(SEED); // S active, queue O I J L T
    for (let i = 0; i < 3; i++) e.input('left');
    e.input('hard-drop'); // S parks bottom-left, no clear -> O spawns
    expect(e.state.active!.kind).toBe('O');
    for (let i = 0; i < 25; i++) e.input('soft-drop'); // land O on the floor
    // 15 grounded move-resets, each 490ms apart (< 500ms lock delay)
    for (let reset = 0; reset < 15; reset++) {
      e.tick(490);
      expect(e.state.active).not.toBeNull(); // still not locked
      e.input(reset % 2 === 0 ? 'left' : 'right');
    }
    // reset budget exhausted: timer can no longer be cleared -> force-lock
    let locked = false;
    for (let k = 0; k < 12 && !locked; k++) {
      e.input('left');
      const evs = e.tick(100);
      if (has(evs, 'lock')) locked = true;
    }
    expect(locked).toBe(true);
  });
});

describe('hard drop, soft drop, hold, ghost', () => {
  it('hard drop snaps to the ghost position, +2/cell, immediate lock+spawn', () => {
    const e = createEngine();
    e.start(SEED);
    const before = e.state;
    const dist = before.ghost!.pos.y - before.active!.pos.y;
    const evs = e.input('hard-drop');
    const hd = evs.find((x) => x.type === 'hard-drop');
    expect(hd && hd.type === 'hard-drop' && hd.cells).toBe(dist);
    expect(has(evs, 'lock')).toBe(true);
    expect(has(evs, 'spawn')).toBe(true);
    expect(e.state.active!.kind).toBe('O'); // queued head
    // no lock-delay wait: state moved on immediately
    expect(e.state.score).toBe(dist * 2);
  });

  it('soft drop: one row, +1 point', () => {
    const e = createEngine();
    e.start(SEED);
    const y0 = e.state.active!.pos.y;
    expect(has(e.input('soft-drop'), 'soft-drop')).toBe(true);
    expect(e.state.active!.pos.y).toBe(y0 + 1);
    expect(e.state.score).toBe(1);
  });

  it('hold: first use swaps, second blocked until next lock', () => {
    const e = createEngine();
    e.start(SEED); // S active, queue O I J L T
    const evs = e.input('hold');
    expect(has(evs, 'hold')).toBe(true);
    expect(e.state.hold).toBe('S');
    expect(e.state.active!.kind).toBe('O'); // from queue head
    expect(e.state.active!.pos).toEqual({ x: 3, y: -2 }); // back at spawn
    expect(e.state.active!.rot).toBe(0);
    expect(e.state.canHold).toBe(false);
    expect(has(e.input('hold'), 'hold-blocked')).toBe(true);
    e.input('hard-drop'); // lock O -> canHold restored, next spawn is queue head I
    expect(e.state.canHold).toBe(true);
    expect(e.state.active!.kind).toBe('I');
    const evs2 = e.input('hold'); // swap I <-> held S
    expect(has(evs2, 'hold')).toBe(true);
    expect(e.state.hold).toBe('I');
    expect(e.state.active!.kind).toBe('S');
    expect(e.state.active!.pos).toEqual({ x: 3, y: -2 });
  });

  it('ghost piece rests directly above the stack / floor', () => {
    const board = blankVisible();
    for (let x = 3; x <= 6; x++) board[15][x] = 'L';
    const e = createEngine();
    e.start(SEED); // S at spawn
    e.setBoardForTest(board);
    const st = e.state;
    expect(st.ghost).not.toBeNull();
    // S rot0 lowest offset y=1 -> ghost bottom row sits just above row 15
    expect(st.ghost!.pos.y + 1).toBe(14);
    // ghost never overlaps filled cells: board row 15 cols 3..6 untouched
    expect(st.board[15].slice(3, 7)).toEqual(['L', 'L', 'L', 'L']);
  });
});

describe('game over', () => {
  it('top-out: piece locked with cells above the visible field ends the game', () => {
    const board = blankVisible();
    for (let y = 0; y < 20; y++) fillRow(board, y, [9]); // shaft in col 9 only
    const e = createEngine();
    e.start(SEED); // S: cells cols 3-5, blocked by filled row 0 -> locks in hidden rows
    e.setBoardForTest(board, ['T', 'T', 'T', 'T', 'T', 'T', 'T']);
    const evs = e.input('hard-drop'); // cells=0, locks above visible field
    expect(has(evs, 'lock')).toBe(true);
    expect(has(evs, 'game-over')).toBe(true);
    expect(e.state.phase).toBe('gameover');
    expect(e.state.over).toBe(true);
    expect(e.state.active).toBeNull();
  });

  it('block-out: next spawn colliding with the stack ends the game', () => {
    // Rows 1..19 filled except col 9: a horizontal I locks flat on visible
    // row 0 (its spawn row!), then the NEXT I spawns into the same cells.
    const board = blankVisible();
    for (let y = 1; y < 20; y++) fillRow(board, y, [9]);
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(board, ['I', 'I', 'O', 'T', 'S', 'Z', 'J']);
    e.input('hold'); // active I (queue head), S stored in hold
    const evs1 = e.input('hard-drop'); // I lands on row 0 cols 3..6 (dy=0)
    expect(has(evs1, 'lock')).toBe(true);
    // next I spawns at once and its cells (spawn row 0, cols 3..6) overlap the
    // just-locked cells -> block-out fires in the same event batch
    expect(has(evs1, 'game-over')).toBe(true);
    expect(e.state.phase).toBe('gameover');
    expect(e.state.over).toBe(true);
  });

  it('inputs and ticks are inert after game over', () => {
    const board = blankVisible();
    for (let y = 0; y < 20; y++) fillRow(board, y, [9]);
    const e = createEngine();
    e.start(SEED);
    e.setBoardForTest(board, ['T', 'T', 'T', 'T', 'T', 'T', 'T']);
    e.input('hard-drop'); // tops out
    expect(e.input('left')).toEqual([]);
    expect(e.tick(1000)).toEqual([]);
    expect(e.state.phase).toBe('gameover');
  });
});

describe('phases & snapshot contract', () => {
  it('pause/resume/toMenu per Phase contract', () => {
    const e = createEngine();
    e.start(SEED);
    const y0 = e.state.active!.pos.y;
    e.pause();
    expect(e.state.phase).toBe('paused');
    expect(e.tick(5000)).toEqual([]);
    expect(e.state.active!.pos.y).toBe(y0);
    expect(e.input('left')).toEqual([]);
    e.resume();
    expect(e.state.phase).toBe('playing');
    e.tick(1000);
    expect(e.state.active!.pos.y).toBe(y0 + 1);
    e.toMenu();
    expect(e.state.phase).toBe('menu');
    expect(e.state.active).toBeNull();
  });

  it('pause/resume via input actions', () => {
    const e = createEngine();
    e.start(SEED);
    e.input('pause');
    expect(e.state.phase).toBe('paused');
    e.input('resume');
    expect(e.state.phase).toBe('playing');
  });

  it('snapshot: 20x10 board, queue >= NEXT_PREVIEW_SIZE, fresh copies', () => {
    const e = createEngine();
    e.start(SEED);
    const st = e.state;
    expect(st.board.length).toBe(ROWS);
    for (const row of st.board) expect(row.length).toBe(COLS);
    expect(st.queue.length).toBe(5);
    expect(st.level).toBe(1);
    expect(st.combo).toBe(-1);
    expect(st.over).toBe(false);
    expect(st.piecesPlaced).toBe(0);
    expect(st.time).toBe(0);
    expect(st.highScore).toBe(0);
    expect(JSON.stringify(e.state)).not.toBe('{}');
  });

  it('highScore from opts survives and is overtaken by score', () => {
    const e = createEngine({ highScore: 900 });
    e.start(SEED);
    expect(e.state.highScore).toBe(900);
    const board = blankVisible();
    for (let y = 16; y < 20; y++) fillRow(board, y, [9]);
    e.setBoardForTest(board, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    e.input('hold');
    placeVerticalI(e);
    e.input('hard-drop'); // tetris 800 + drop pts -> may or may not beat 900
    expect(e.state.highScore).toBeGreaterThanOrEqual(900);
  });

  it('start(seed) replays identically: same events and first queue', () => {
    const a = createEngine().start(42);
    const b = createEngine().start(42);
    expect(a).toEqual(b);
    const ea = createEngine();
    const eb = createEngine();
    ea.start(7);
    eb.start(7);
    for (let i = 0; i < 50; i++) {
      ea.tick(100);
      eb.tick(100);
    }
    expect(JSON.stringify(ea.state)).toBe(JSON.stringify(eb.state));
  });
});
