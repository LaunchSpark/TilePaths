import { describe, expect, it } from "vitest";
import { at, emptyBoard } from "../src/board.js";
import { canPlace, placeTile } from "../src/placement.js";
import { canon } from "../src/tileTypes.js";
import { resolve } from "../src/tileTypes.js";

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
    const beforeCells = JSON.stringify(b.cells);
    const beforeRing = JSON.stringify(b.ring);
    const beforeNextId = b.nextPlacementId;
    canPlace(b, [0, 0], [0, 1]);
    canPlace(b, [0, 0], [1, 0]);
    canPlace(b, [3, 3], [3, 4]);
    expect(JSON.stringify(b.cells)).toBe(beforeCells);
    expect(JSON.stringify(b.ring)).toBe(beforeRing);
    expect(b.nextPlacementId).toBe(beforeNextId);
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

  it("copies conns arrays to prevent cache aliasing", () => {
    const b = emptyBoard(6);
    const typeId = 2 as const;
    const orientation = 0 as const;
    // Record the canonical form before placement
    const [cachedConnsA, cachedConnsB] = resolve(typeId, orientation);
    const canonBefore = canon(cachedConnsA);

    // Place the tile
    placeTile(b, [0, 0], [1, 0], typeId, orientation);

    // Verify placed conns have different identity from cache
    expect(at(b, [0, 0]).conns).not.toBe(cachedConnsA);
    expect(at(b, [1, 0]).conns).not.toBe(cachedConnsB);

    // Mutate the placed tile's conns in place
    const placed = at(b, [0, 0]);
    if (placed.conns[0]) {
      placed.conns[0]![0] = 3; // corrupt with invalid side value
    }
    if (placed.conns.length > 1) {
      placed.conns.push([0 as never, 1 as never]);
    }

    // Verify the cache was not corrupted
    const [cachedConnsAAfter] = resolve(typeId, orientation);
    expect(canon(cachedConnsAAfter)).toBe(canonBefore);
  });
});
