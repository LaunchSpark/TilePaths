/** Seeded PRNG. Python's random.Random does not port, so deals are NOT
 *  reproducible across the two engines -- oracle fixtures record dealt piles
 *  explicitly rather than seeds. */

export type Rng = {
  next(): number;
  shuffle<T>(arr: T[]): void;
};

/** mulberry32 -- small, fast, good enough for dealing tiles. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    shuffle<T>(arr: T[]): void {
      // Fisher-Yates, descending.
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
    },
  };
}
