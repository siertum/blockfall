// Deterministic 60-second app loop: identical seeds -> identical snapshots.
import { describe, expect, it } from 'vitest';
import type { Cell, Engine, InputAction, PieceKind } from '../../src/shared/types';
import { COLS, ROWS } from '../../src/shared/constants';
import { createEngine } from '../../src/engine/engine';
import { mulberry32 } from '../../src/engine/rng';

const ACTIONS: InputAction[] = [
  'left',
  'right',
  'rotate-cw',
  'rotate-ccw',
  'rotate-180',
  'soft-drop',
  'hard-drop',
  'hold',
];

function play(seed: number, gameSeed: number): Engine {
  const e = createEngine();
  e.start(gameSeed);
  const rng = mulberry32(seed);
  const STEP = 16.7; // ~60fps
  let sinceWell = 0;
  for (let t = 0; t < 60000; t += STEP) {
    sinceWell += STEP;
    // every ~1.5s: build a single-hole well and hard-drop into it, so the
    // loop reliably exercises line clears, scoring and level-ups.
    if (sinceWell > 1500 && e.state.phase === 'playing') {
      sinceWell = 0;
      const board: Cell[][] = Array.from({ length: ROWS }, (_r, y) =>
        Array.from({ length: COLS }, (_c, x) =>
          y >= 16 && x !== 9 ? ('L' as Cell) : (0 as Cell),
        ),
      );
      const kinds: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      e.setBoardForTest(board, kinds);
      e.input('hard-drop');
      e.input('rotate-cw');
      for (let i = 0; i < COLS; i++) e.input('right'); // pin to wall
      e.input('hard-drop');
    }
    if (rng() < 1 / 6) {
      const a = ACTIONS[Math.floor(rng() * ACTIONS.length)];
      e.input(a);
    }
    e.tick(STEP);
    if (e.state.phase === 'gameover') {
      // restart deterministically within the same loop window
      e.start(gameSeed + 1);
    }
  }
  return e;
}

describe('engine app loop determinism', () => {
  it('two 60s runs with the same seeds produce identical snapshots', () => {
    const a = play(1234, 42).state;
    const b = play(1234, 42).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.piecesPlaced).toBeGreaterThan(0);
  });

  it('the run reaches a meaningful state (pieces placed, score progresses)', () => {
    const s = play(1234, 42).state;
    expect(s.piecesPlaced).toBeGreaterThan(10);
    expect(s.score).toBeGreaterThan(0);
    expect(s.lines).toBeGreaterThan(0);
  });

  it('different input seeds diverge (test is not vacuous)', () => {
    const a = JSON.stringify(play(1234, 42).state);
    const b = JSON.stringify(play(4321, 42).state);
    expect(a).not.toBe(b);
  });

  it('events during the loop are well-formed', () => {
    const e = createEngine();
    e.start(99);
    const rng = mulberry32(7);
    const seen = new Set<string>();
    let sinceWell = 0;
    for (let t = 0; t < 60000; t += 16.7) {
      sinceWell += 16.7;
      if (sinceWell > 2000 && e.state.phase === 'playing') {
        sinceWell = 0;
        const board: Cell[][] = Array.from({ length: ROWS }, (_r, y) =>
          Array.from({ length: COLS }, (_c, x) =>
            y >= 19 && x !== 5 ? ('L' as Cell) : (0 as Cell),
          ),
        );
        e.setBoardForTest(board, ['O', 'T', 'S', 'Z', 'J', 'L', 'I']);
        e.input('hold'); // active piece -> hold, O spawns at x=3 (no cells in col 5 yet)
        e.input('right'); // O cells cols 5,6 -> fills the col-5 hole
        for (const ev of e.input('hard-drop')) {
          seen.add(ev.type);
          if (ev.type === 'line-clear') {
            expect(ev.count).toBeGreaterThanOrEqual(1);
            expect(ev.count).toBeLessThanOrEqual(4);
            expect(ev.points).toBeGreaterThan(0);
            expect(Array.isArray(ev.rows)).toBe(true);
            expect(ev.rows.every((r) => r >= 0 && r < ROWS)).toBe(true);
          }
        }
      }
      if (rng() < 1 / 6) {
        const a = ACTIONS[Math.floor(rng() * ACTIONS.length)];
        for (const ev of e.input(a)) seen.add(ev.type);
      }
      for (const ev of e.tick(16.7)) seen.add(ev.type);
      if (e.state.phase === 'gameover') e.start(100);
    }
    expect(seen.has('spawn')).toBe(true);
    expect(seen.has('lock')).toBe(true);
    expect(seen.has('line-clear')).toBe(true);
  });
});
