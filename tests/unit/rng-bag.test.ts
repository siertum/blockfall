import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/engine/rng';
import { createBag, ALL_KINDS } from '../../src/engine/bag';

describe('rng mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('7-bag', () => {
  it('every window of 7 is a permutation of all kinds', () => {
    for (const seed of [1, 42, 1337]) {
      const bag = createBag(seed);
      const seq: string[] = [];
      for (let i = 0; i < 70; i++) seq.push(bag.next());
      for (let w = 0; w < seq.length; w += 7) {
        const window = seq.slice(w, w + 7);
        expect([...window].sort()).toEqual([...ALL_KINDS].sort());
      }
    }
  });

  it('seed 42 is reproducible across instances', () => {
    const a = createBag(42);
    const b = createBag(42);
    const sa: string[] = [];
    const sb: string[] = [];
    for (let i = 0; i < 28; i++) {
      sa.push(a.next());
      sb.push(b.next());
    }
    expect(sa).toEqual(sb);
  });
});
