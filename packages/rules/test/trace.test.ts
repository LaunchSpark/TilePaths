import { describe, expect, it } from "vitest";
import { emptyBoard, slotIndexOf } from "../src/board.js";
import { placeTile } from "../src/placement.js";
import { trace, traceFrom } from "../src/trace.js";
import { Result, Side } from "../src/types.js";

describe("trace", () => {
  it("counts three passes across three level-1 tiles", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.W));
    expect(end).toBe(slotIndexOf(3, 0, 2, Side.E));
    expect(passes).toBe(3);
  });

  it("counts a seam crossing once", () => {
    const b = emptyBoard(3);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.N));
    expect(end).toBe(slotIndexOf(3, 2, 0, Side.S));
    expect(passes).toBe(1);
  });

  it("continues straight through a starting cross", () => {
    const b = emptyBoard(3);
    placeTile(b, [0, 0], [0, 1], 2, 3);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.W));
    expect(end).toBe(slotIndexOf(3, 0, 2, Side.E));
    expect(passes).toBe(1);
  });

  it("crosses an empty board for zero passes", () => {
    expect(trace(emptyBoard(3), 0)).toEqual([slotIndexOf(3, 2, 0, Side.S), 0]);
  });

  // Tile 1 at orientation 1 lays out as (B west, A east).
  // Row 1 tile: (1,0)=B routes W->N, (1,1)=A routes N->E.
  // Row 0 tile: (0,0)=B routes S->E, (0,1)=A routes W->S.
  it("counts a tile crossed twice, twice", () => {
    const b = emptyBoard(3);
    placeTile(b, [1, 1], [1, 0], 1, 1);
    placeTile(b, [0, 1], [0, 0], 1, 1);
    const [end, passes] = trace(b, slotIndexOf(3, 1, 0, Side.W));
    expect(typeof end).toBe("number");
    expect(passes).toBe(3); // 2 if the second crossing were wrongly suppressed
  });

  it("scores 5 across levels 1,1,2,1", () => {
    const b = emptyBoard(4);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    placeTile(b, [0, 2], [0, 3], 2, 3);
    placeTile(b, [1, 2], [1, 3], 2, 3);
    placeTile(b, [0, 2], [1, 2], 2, 0);
    expect([0, 1, 2, 3].map((c) => b.cells[0]![c]!.height)).toEqual([1, 1, 2, 1]);

    const [end, passes] = trace(b, slotIndexOf(4, 0, 0, Side.W));
    expect(end).toBe(slotIndexOf(4, 0, 3, Side.E));
    expect(passes).toBe(5);
  });

  it("terminates on a closed loop", () => {
    const b = emptyBoard(4);
    placeTile(b, [1, 2], [1, 1], 1, 1);
    placeTile(b, [2, 1], [2, 2], 1, 3);
    const [end, passes] = traceFrom(b, 1, 1, Side.E);
    expect(end).toBe(Result.LOOP);
    expect(passes).toBe(3);
  });

  it("is symmetric from both ends", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const west = slotIndexOf(3, 0, 0, Side.W), east = slotIndexOf(3, 0, 2, Side.E);
    expect(trace(b, west)).toEqual([east, 3]);
    expect(trace(b, east)).toEqual([west, 3]);
  });

  /** Re-entering the same cell through a different face is legal and must keep
   *  counting -- the visited key must include the entry face, not just
   *  (row, col). Without that, this line is wrongly reported as a LOOP with a
   *  truncated pass count instead of reaching its real endpoint.
   *
   *  Tracing from (1,1) entering W: X routes W->E into (1,2); B there routes
   *  W->N into (0,2); A routes S->W into (0,1); B there routes E->S, landing
   *  back on (1,1) -- but entering through N this time, a different face than
   *  the original W entry. The line then routes N->S through (1,1) and
   *  continues south through the cross tiles at (2,1)/(3,1) and off the board.
   */
  it("keeps counting when a line re-enters a cell through a different face", () => {
    const b = emptyBoard(4);
    placeTile(b, [0, 1], [0, 2], 1, 0);   // (0,1)=B, (0,2)=A
    placeTile(b, [1, 1], [1, 2], 4, 0);   // (1,1)=X, (1,2)=B
    placeTile(b, [2, 1], [3, 1], 2, 0);   // extends the line south to the border

    const [end, passes] = traceFrom(b, 1, 1, Side.W);

    expect(end).not.toBe(Result.LOOP);
    expect(end).toBe(slotIndexOf(4, 3, 1, Side.S));
    // 1 ((1,1) first visit) + 1 ((0,1)/(0,2) tile, seam-crossed)
    // + 1 ((1,1) second visit, different face) + 1 ((2,1)/(3,1) tile) = 4
    expect(passes).toBe(4);
  });
});
