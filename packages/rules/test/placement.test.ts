import { describe, expect, it } from "vitest";
import { at, emptyBoard } from "../src/board.js";
import { canPlace, placeTile } from "../src/placement.js";

describe("canPlace", () => {
  it("allows empty adjacent cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(true);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(true);
  });

  it("rejects non-adjacent cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [0, 2])).toBe(false);
    expect(canPlace(b, [0, 0], [1, 1])).toBe(false);
    expect(canPlace(b, [0, 0], [0, 0])).toBe(false);
  });

  it("rejects off-board cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [-1, 0])).toBe(false);
    expect(canPlace(b, [5, 5], [6, 5])).toBe(false);
  });

  it("allows level 2 on two level-1 tiles", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(true);
  });

  it("rejects straddling both halves of one tile", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(false);
  });

  it("rejects spanning two different heights", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    placeTile(b, [0, 0], [0, 1], 2, 3);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(false);
  });

  it("rejects half on a tile and half on bare board", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(false);
  });

  it("does not mutate", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    const before = JSON.stringify(b.cells);
    canPlace(b, [0, 0], [0, 1]);
    canPlace(b, [0, 0], [1, 0]);
    canPlace(b, [3, 3], [3, 4]);
    expect(JSON.stringify(b.cells)).toBe(before);
  });
});

describe("placeTile", () => {
  it("sets id, height and conns on both cells", () => {
    const b = emptyBoard(6);
    const pid = placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(pid).toBe(1);
    expect(at(b, [0, 0]).placementId).toBe(pid);
    expect(at(b, [1, 0]).placementId).toBe(pid);
    expect(at(b, [0, 0]).height).toBe(1);
    expect(at(b, [1, 0]).height).toBe(1);
    expect(at(b, [0, 0]).conns.length).toBeGreaterThan(0);
    expect(b.nextPlacementId).toBe(2);
  });

  it("stacking increments height and replaces the top", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    const top = placeTile(b, [0, 0], [0, 1], 6, 3);
    expect(at(b, [0, 0]).height).toBe(2);
    expect(at(b, [0, 1]).height).toBe(2);
    expect(at(b, [0, 0]).placementId).toBe(top);
    expect(at(b, [1, 0]).height).toBe(1);
  });
});
