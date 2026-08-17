import { describe, expect, it } from "vitest";
import {
  canon, distinctOrientations, offsetOf, ORIENTATIONS, resolve, rotConns,
  shapeOf, TILE_TYPES,
} from "../src/tileTypes.js";
import { Side } from "../src/types.js";
import type { TypeId } from "../src/types.js";

const IDS: TypeId[] = [1, 2, 3, 4, 5, 6];

describe("tile data", () => {
  it("has six designs", () => {
    expect(Object.keys(TILE_TYPES).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("matches the spec shape table", () => {
    const actual = Object.fromEntries(
      IDS.map((t) => [t, [shapeOf(TILE_TYPES[t][0]), shapeOf(TILE_TYPES[t][1])]]),
    );
    expect(actual).toEqual({
      1: ["B", "A"], 2: ["X", "X"], 3: ["X", "A"],
      4: ["X", "B"], 5: ["B", "B"], 6: ["A", "A"],
    });
  });

  it("covers all six unordered shape pairs", () => {
    const pairs = new Set(
      IDS.map((t) => [shapeOf(TILE_TYPES[t][0]), shapeOf(TILE_TYPES[t][1])].sort().join("")),
    );
    expect(pairs.size).toBe(6);
  });

  it("rejects a cell that is not a perfect matching", () => {
    expect(() => shapeOf([[Side.N, Side.E]])).toThrow(/perfect matching/i);
  });
});

describe("rotation", () => {
  it.each(IDS)("every resolved cell is a perfect matching (tile %i)", (t) => {
    for (const o of ORIENTATIONS) {
      for (const conns of resolve(t, o)) {
        expect(["X", "A", "B"]).toContain(shapeOf(conns));
        const faces = conns.flat().sort();
        expect(faces).toEqual([0, 1, 2, 3]);
      }
    }
  });

  // Verify that rotConns transforms shapes correctly across all tile cells.
  // X is 180°-invariant; A and B swap with odd turns; 4-turn cycle returns to canon.
  // This catches a broken rotConns because shapes would not transform correctly.
  it.each(IDS)("cell shapes transform correctly under rotation (tile %i)", (t) => {
    for (const cell of TILE_TYPES[t]) {
      const shape0 = shapeOf(cell);
      const rot1 = rotConns(cell, 1);
      const rot2 = rotConns(cell, 2);
      const rot3 = rotConns(cell, 3);
      const rot4 = rotConns(rot3, 1);

      const shape1 = shapeOf(rot1);
      const shape2 = shapeOf(rot2);
      const shape3 = shapeOf(rot3);
      const shape4 = shapeOf(rot4);

      // After 2 and 4 turns, shape is unchanged
      expect(shape2).toBe(shape0);
      expect(shape4).toBe(shape0);

      // After odd turns: X stays X, A↔B
      if (shape0 === "X") {
        expect(shape1).toBe("X");
        expect(shape3).toBe("X");
      } else {
        expect(shape1).not.toBe(shape0);
        expect(shape3).not.toBe(shape0);
        expect(shape1).toBe(shape3);
      }

      // 4-turn cycle returns to canonical form
      expect(canon(rot4)).toBe(canon(cell));
    }
  });

  it("swaps A and B on an odd number of turns", () => {
    const aCell: [Side, Side][] = [[Side.N, Side.E], [Side.S, Side.W]];
    expect(shapeOf(aCell)).toBe("A");
    expect(shapeOf(rotConns(aCell, 1))).toBe("B");
    expect(shapeOf(rotConns(aCell, 2))).toBe("A");
    expect(shapeOf(rotConns(aCell, 3))).toBe("B");
  });

  it("leaves the cross shape unchanged", () => {
    const xCell: [Side, Side][] = [[Side.N, Side.S], [Side.E, Side.W]];
    for (const k of ORIENTATIONS) expect(shapeOf(rotConns(xCell, k))).toBe("X");
  });

  it("follows the orientation offset convention", () => {
    expect(offsetOf(0)).toEqual([1, 0]);
    expect(offsetOf(1)).toEqual([0, -1]);
    expect(offsetOf(2)).toEqual([-1, 0]);
    expect(offsetOf(3)).toEqual([0, 1]);
  });
});

describe("orientation dedupe", () => {
  it("counts 4,2,4,4,2,2", () => {
    const counts = Object.fromEntries(IDS.map((t) => [t, distinctOrientations(t).length]));
    expect(counts).toEqual({ 1: 4, 2: 2, 3: 4, 4: 4, 5: 2, 6: 2 });
  });

  it("keeps the first of each equivalent pair", () => {
    expect(distinctOrientations(2)).toEqual([0, 1]);
    expect(distinctOrientations(5)).toEqual([0, 1]);
    expect(distinctOrientations(6)).toEqual([0, 1]);
    expect(distinctOrientations(1)).toEqual([0, 1, 2, 3]);
  });
});

describe("canon", () => {
  it("is order-independent", () => {
    const a: [Side, Side][] = [[Side.N, Side.S], [Side.E, Side.W]];
    const b: [Side, Side][] = [[Side.W, Side.E], [Side.S, Side.N]];
    expect(canon(a)).toBe(canon(b));
  });

  it("distinguishes different matchings", () => {
    expect(canon([[Side.N, Side.S], [Side.E, Side.W]]))
      .not.toBe(canon([[Side.N, Side.E], [Side.S, Side.W]]));
  });
});
