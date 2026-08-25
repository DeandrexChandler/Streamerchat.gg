import { describe, expect, it } from "vitest";
import { createRng } from "../rng";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = Array.from({ length: 20 }, createRng(1).next);
    const b = createRng(2);
    expect(a).not.toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it("keeps next() in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("keeps int() inclusive of both bounds", () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 5));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("respects weights, approximately", () => {
    const rng = createRng(123);
    const items = [
      { id: "common", w: 90 },
      { id: "rare", w: 10 },
    ];
    let common = 0;
    const runs = 10_000;
    for (let i = 0; i < runs; i++) {
      if (rng.weighted(items, (x) => x.w).id === "common") common++;
    }
    // Expect ~90%; allow generous slack so this can't flake.
    expect(common / runs).toBeGreaterThan(0.86);
    expect(common / runs).toBeLessThan(0.94);
  });

  it("falls back to uniform when all weights are zero", () => {
    const rng = createRng(3);
    const items = ["a", "b", "c"];
    const seen = new Set(
      Array.from({ length: 200 }, () => rng.weighted(items, () => 0)),
    );
    expect(seen.size).toBe(3);
  });

  it("never picks a weighted item with negative weight over positives", () => {
    const rng = createRng(5);
    const items = [
      { id: "no", w: -100 },
      { id: "yes", w: 1 },
    ];
    for (let i = 0; i < 200; i++) {
      expect(rng.weighted(items, (x) => x.w).id).toBe("yes");
    }
  });

  it("sample() returns distinct items and never more than requested", () => {
    const rng = createRng(11);
    const items = [1, 2, 3, 4, 5];
    const picked = rng.sample(items, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(rng.sample(items, 99)).toHaveLength(5);
  });

  it("shuffle() preserves the multiset and does not mutate the input", () => {
    const rng = createRng(13);
    const items = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual(items);
  });

  it("throws on empty pick", () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});
