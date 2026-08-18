import { describe, expect, it } from "vitest";
import { emptyBoard, slotIndexOf } from "../src/board.js";
import type { Board } from "../src/board.js";
import { placeTile } from "../src/placement.js";
import { passesToVp, scoreFor, scoreLines } from "../src/trace.js";
import { Side } from "../src/types.js";

describe("passesToVp", () => {
  it.each([
    [0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [6, 3], [7, 4], [10, 4],
    [11, 5], [15, 5], [16, 6], [21, 6], [22, 7], [28, 7], [29, 8],
    [36, 8], [37, 9], [45, 9], [46, 10], [55, 10], [56, 15], [500, 15],
  ])("maps %i passes to %i VP", (total, vp) => {
    expect(passesToVp(total)).toBe(vp);
  });
});

/** A 4x4 board with a 2-pass line along row 0 and another along row 3. */
function twoParallelLines(): Board {
  const b = emptyBoard(4);
  for (const row of [0, 3]) {
    placeTile(b, [row, 0], [row, 1], 2, 3);
    placeTile(b, [row, 2], [row, 3], 2, 3);
  }
  return b;
}

describe("scoreLines", () => {
  it("scores a placed tile connected by the board's starting paths", () => {
    const b = emptyBoard(4);
    placeTile(b, [1, 1], [1, 2], 2, 3);
    const slots = [slotIndexOf(4, 1, 0, Side.W), slotIndexOf(4, 1, 3, Side.E)];

    expect([...scoreLines(b, slots).values()]).toEqual([1]);
    expect(scoreFor(b, slots)).toBe(1);
  });

  it("scores one connected pair as a single line", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E)];
    const lines = scoreLines(b, slots);
    expect(lines.size).toBe(1);
    expect([...lines.values()]).toEqual([2]);
  });

  it("dedupes a pair found from both ends", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E)];
    expect(scoreLines(b, slots).size).toBe(1);
  });

  it("scores nothing for unconnected markers", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 2, 0, Side.W)];
    expect(scoreLines(b, slots).size).toBe(0);
    expect(scoreFor(b, slots)).toBe(0);
  });

  it("sums before converting", () => {
    const b = twoParallelLines();
    const slots = [
      slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E),
      slotIndexOf(4, 3, 0, Side.W), slotIndexOf(4, 3, 3, Side.E),
    ];
    expect([...scoreLines(b, slots).values()].sort()).toEqual([2, 2]);
    // Summed first: 4 passes -> 3 VP. Converted separately: 2 + 2 = 4 VP.
    expect(passesToVp(2) + passesToVp(2)).toBe(4);
    expect(scoreFor(b, slots)).toBe(3);
  });
});
