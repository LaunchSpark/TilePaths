import { describe, expect, it } from "vitest";
import {
  DELTA, Side, opposite, orthogonallyAdjacent, rotated, step,
} from "../src/types.js";

const ALL: Side[] = [Side.N, Side.E, Side.S, Side.W];

describe("Side", () => {
  it("is clockwise N=0 E=1 S=2 W=3", () => {
    expect([Side.N, Side.E, Side.S, Side.W]).toEqual([0, 1, 2, 3]);
  });

  it.each(ALL)("opposite is an involution (%i)", (s) => {
    expect(opposite(opposite(s))).toBe(s);
  });

  it.each(ALL)("opposite is never self (%i)", (s) => {
    expect(opposite(s)).not.toBe(s);
  });

  it.each(ALL)("four quarter turns is identity (%i)", (s) => {
    expect(rotated(s, 4)).toBe(s);
  });

  it("one quarter turn is clockwise", () => {
    expect(rotated(Side.N, 1)).toBe(Side.E);
    expect(rotated(Side.E, 1)).toBe(Side.S);
    expect(rotated(Side.S, 1)).toBe(Side.W);
    expect(rotated(Side.W, 1)).toBe(Side.N);
  });

  it.each(ALL)("two quarter turns equals opposite (%i)", (s) => {
    expect(rotated(s, 2)).toBe(opposite(s));
  });
});

describe("geometry", () => {
  it("treats north as decreasing row", () => {
    expect(DELTA[Side.N]).toEqual([-1, 0]);
    expect(DELTA[Side.E]).toEqual([0, 1]);
    expect(DELTA[Side.S]).toEqual([1, 0]);
    expect(DELTA[Side.W]).toEqual([0, -1]);
  });

  it("steps by the delta", () => {
    expect(step([3, 3], Side.N)).toEqual([2, 3]);
    expect(step([3, 3], Side.W)).toEqual([3, 2]);
  });

  it("detects orthogonal adjacency", () => {
    expect(orthogonallyAdjacent([1, 1], [1, 2])).toBe(true);
    expect(orthogonallyAdjacent([1, 1], [0, 1])).toBe(true);
    expect(orthogonallyAdjacent([1, 1], [1, 1])).toBe(false);
    expect(orthogonallyAdjacent([1, 1], [2, 2])).toBe(false);
    expect(orthogonallyAdjacent([1, 1], [1, 3])).toBe(false);
  });
});
