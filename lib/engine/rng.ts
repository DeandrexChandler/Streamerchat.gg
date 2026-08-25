/**
 * Seeded RNG.
 *
 * Everything random in the simulation goes through this rather than
 * Math.random(). Two reasons:
 *
 *  1. Tests. A seeded run is reproducible, so we can assert on distributions
 *     and on exact scheduling output instead of just "it didn't throw".
 *  2. Replay. A session seed lets us reproduce a chat log a user reports as
 *     weird.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Uniformly picks one item. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Picks one item using `weightOf`. Falls back to uniform if all weights <= 0. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
  /** Returns up to `n` distinct items. */
  sample<T>(items: readonly T[], n: number): T[];
  /** New array, shuffled (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32 — small, fast, good enough distribution for simulation. */
export function createRng(seed: number = Date.now()): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    chance: (p) => next() < p,

    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[Math.floor(next() * items.length)];
    },

    weighted(items, weightOf) {
      if (items.length === 0) throw new Error("rng.weighted: empty array");

      let total = 0;
      for (const item of items) total += Math.max(0, weightOf(item));
      if (total <= 0) return rng.pick(items);

      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll < 0) return item;
      }
      // Only reachable through float drift on the final item.
      return items[items.length - 1];
    },

    sample(items, n) {
      if (n >= items.length) return rng.shuffle(items);
      return rng.shuffle(items).slice(0, n);
    },

    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };

  return rng;
}
