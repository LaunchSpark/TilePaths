import { describe, expect, it } from "vitest";
import {
  at, buildRing, emptyBoard, follow, inBounds, makeCell, partnerOffset, slotIndexOf,
} from "../src/board.js";
import { Side } from "../src/types.js";

const SIZES = [4, 5, 6, 7, 8];

describe("ring construction", () => {
  it.each(SIZES)("slot index round-trips exhaustively (n=%i)", (n) => {
    const ring = buildRing(n);
    expect(ring.length).toBe(4 * n);
    ring.forEach((slot, i) => {
      expect(slotIndexOf(n, slot.row, slot.col, slot.side)).toBe(i);
    });
  });

  it.each(SIZES)("every slot is on the border (n=%i)", (n) => {
    for (const s of buildRing(n)) {
      expect(s.row === 0 || s.row === n - 1 || s.col === 0 || s.col === n - 1).toBe(true);
    }
  });

  it.each(SIZES)("ring entries are unique (n=%i)", (n) => {
    const seen = new Set(buildRing(n).map((s) => `${s.row},${s.col},${s.side}`));
    expect(seen.size).toBe(4 * n);
  });

  it("puts a corner cell under two sides", () => {
    const sides = buildRing(6).filter((s) => s.row === 0 && s.col === 0).map((s) => s.side);
    expect(new Set(sides)).toEqual(new Set([Side.N, Side.W]));
  });

  it("starts at top-left going clockwise", () => {
    const r = buildRing(6);
    expect([r[0]!.row, r[0]!.col, r[0]!.side]).toEqual([0, 0, Side.N]);
    expect([r[6]!.row, r[6]!.col, r[6]!.side]).toEqual([0, 5, Side.E]);
    expect([r[12]!.row, r[12]!.col, r[12]!.side]).toEqual([5, 5, Side.S]);
    expect([r[18]!.row, r[18]!.col, r[18]!.side]).toEqual([5, 0, Side.W]);
  });
});

describe("board", () => {
  it("starts empty", () => {
    const b = emptyBoard(6);
    expect(b.n).toBe(6);
    expect(b.cells.flat().every((c) => c.height === 0 && c.placementId === null)).toBe(true);
    expect(b.ring.every((s) => s.occupant === null)).toBe(true);
  });

  it("knows its bounds", () => {
    const b = emptyBoard(6);
    expect(inBounds(b, [0, 0])).toBe(true);
    expect(inBounds(b, [5, 5])).toBe(true);
    expect(inBounds(b, [-1, 0])).toBe(false);
    expect(inBounds(b, [6, 0])).toBe(false);
    expect(inBounds(b, [0, 6])).toBe(false);
  });

  it("returns null partner for an empty cell", () => {
    expect(partnerOffset(emptyBoard(6), 0, 0)).toBeNull();
  });
});

describe("partnerOffset", () => {
  it("finds horizontal right neighbor with matching placementId", () => {
    const b = emptyBoard(6);
    b.cells[2]![2]! = makeCell({ placementId: 1, height: 1, conns: [] });
    b.cells[2]![3]! = makeCell({ placementId: 1, height: 1, conns: [] });
    expect(partnerOffset(b, 2, 2)).toEqual([0, 1]);
    expect(partnerOffset(b, 2, 3)).toEqual([0, -1]);
  });

  it("finds horizontal left neighbor with matching placementId", () => {
    const b = emptyBoard(6);
    b.cells[3]![4]! = makeCell({ placementId: 2, height: 1, conns: [] });
    b.cells[3]![3]! = makeCell({ placementId: 2, height: 1, conns: [] });
    expect(partnerOffset(b, 3, 4)).toEqual([0, -1]);
    expect(partnerOffset(b, 3, 3)).toEqual([0, 1]);
  });

  it("finds vertical down neighbor with matching placementId", () => {
    const b = emptyBoard(6);
    b.cells[1]![1]! = makeCell({ placementId: 3, height: 1, conns: [] });
    b.cells[2]![1]! = makeCell({ placementId: 3, height: 1, conns: [] });
    expect(partnerOffset(b, 1, 1)).toEqual([1, 0]);
    expect(partnerOffset(b, 2, 1)).toEqual([-1, 0]);
  });

  it("finds vertical up neighbor with matching placementId", () => {
    const b = emptyBoard(6);
    b.cells[4]![2]! = makeCell({ placementId: 4, height: 1, conns: [] });
    b.cells[3]![2]! = makeCell({ placementId: 4, height: 1, conns: [] });
    expect(partnerOffset(b, 4, 2)).toEqual([-1, 0]);
    expect(partnerOffset(b, 3, 2)).toEqual([1, 0]);
  });

  it("returns null when all neighbors have different placementIds", () => {
    const b = emptyBoard(6);
    b.cells[2]![2]! = makeCell({ placementId: 5, height: 1, conns: [] });
    b.cells[1]![2]! = makeCell({ placementId: 10, height: 1, conns: [] });
    b.cells[3]![2]! = makeCell({ placementId: 11, height: 1, conns: [] });
    b.cells[2]![1]! = makeCell({ placementId: 12, height: 1, conns: [] });
    b.cells[2]![3]! = makeCell({ placementId: 13, height: 1, conns: [] });
    expect(partnerOffset(b, 2, 2)).toBeNull();
  });

  it("returns null when no neighbors share placementId (buried partner)", () => {
    const b = emptyBoard(6);
    b.cells[2]![2]! = makeCell({ placementId: 6, height: 2, conns: [] });
    // All neighbors either empty or have different IDs
    expect(partnerOffset(b, 2, 2)).toBeNull();
  });

  it("does not crash on edge cell with no out-of-bounds partner", () => {
    const b = emptyBoard(6);
    b.cells[0]![0]! = makeCell({ placementId: 7, height: 1, conns: [] });
    b.cells[0]![1]! = makeCell({ placementId: 7, height: 1, conns: [] });
    // Top-left has only right and down neighbors in bounds
    expect(partnerOffset(b, 0, 0)).toEqual([0, 1]);
  });
});

describe("follow", () => {
  it("matches either end of a pair", () => {
    const c = makeCell({
      placementId: 1, height: 1,
      conns: [[Side.N, Side.W], [Side.S, Side.E]],
    });
    expect(follow(c, Side.N)).toBe(Side.W);
    expect(follow(c, Side.W)).toBe(Side.N);
    expect(follow(c, Side.S)).toBe(Side.E);
    expect(follow(c, Side.E)).toBe(Side.S);
  });

  it("returns null when the face is absent", () => {
    const c = makeCell({ placementId: 1, height: 1, conns: [[Side.N, Side.S]] });
    expect(follow(c, Side.E)).toBeNull();
    expect(follow(makeCell(), Side.N)).toBeNull();
  });
});
