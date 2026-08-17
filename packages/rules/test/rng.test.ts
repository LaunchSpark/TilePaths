import { describe, expect, it } from "vitest";
import { makeRng } from "../src/rng.js";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42), b = makeRng(42);
    const xs = [a.next(), a.next(), a.next()];
    const ys = [b.next(), b.next(), b.next()];
    expect(xs).toEqual(ys);
  });

  it("differs across seeds", () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it("produces values in [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffles deterministically and preserves the multiset", () => {
    const a = [...Array(42).keys()], b = [...Array(42).keys()];
    makeRng(9).shuffle(a);
    makeRng(9).shuffle(b);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(42).keys()]);
  });

  it("actually reorders", () => {
    const a = [...Array(42).keys()];
    makeRng(3).shuffle(a);
    expect(a).not.toEqual([...Array(42).keys()]);
  });

  it("different seeds produce different orderings", () => {
    const a = [...Array(42).keys()], b = [...Array(42).keys()];
    makeRng(9).shuffle(a);
    makeRng(3).shuffle(b);
    expect(a).not.toEqual(b);
  });
});
