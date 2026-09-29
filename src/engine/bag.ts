// 7-bag randomizer on top of a seeded RNG (guideline: every 7 consecutive
// pieces are a permutation of all 7 tetromino kinds).
import type { PieceKind } from '../shared/types';
import { mulberry32, type Rng } from './rng';

export const ALL_KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export interface Bag {
  /** Next piece kind, refilling + shuffling a fresh bag when exhausted. */
  next(): PieceKind;
}

export function createBag(seed: number): Bag {
  const rng: Rng = mulberry32(seed);
  let queue: PieceKind[] = [];

  function fill(): void {
    queue = ALL_KINDS.slice();
    // Fisher-Yates
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
  }

  return {
    next(): PieceKind {
      if (queue.length === 0) fill();
      return queue.shift() as PieceKind;
    },
  };
}
