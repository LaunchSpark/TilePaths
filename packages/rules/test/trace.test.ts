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
    expect(end).toBe(Result.DEAD);
    expect(passes).toBe(1);
  });

  it("dies on an empty cell", () => {
    const b = emptyBoard(3);
    placeTile(b, [0, 0], [0, 1], 2, 3);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.W));
    expect(end).toBe(Result.DEAD);
    expect(passes).toBe(1);
  });

  it("returns zero passes from an empty board", () => {
    expect(trace(emptyBoard(3), 0)).toEqual([Result.DEAD, 0]);
  });

  // Tile 1 at orientation 1 lays out as (B west, A east).
  // Row 1 tile: (1,0)=B routes W->N, (1,1)=A routes N->E.
  // Row 0 tile: (0,0)=B routes S->E, (0,1)=A routes W->S.
  it("counts a tile crossed twice, twice", () => {
    const b = emptyBoard(3);
    placeTile(b, [1, 1], [1, 0], 1, 1);
    placeTile(b, [0, 1], [0, 0], 1, 1);
    const [end, passes] = trace(b, slotIndexOf(3, 1, 0, Side.W));
    expect(end).toBe(Result.DEAD);
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
});
