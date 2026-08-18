import { TILE_TYPES, distinctOrientations, offsetOf } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { normalizePlacement } from "../src/orient.js";

const IDS = [1, 2, 3, 4, 5, 6] as TypeId[];

describe("normalizePlacement", () => {
  it.each(IDS)("always lands in the tile's distinct set (tile %i)", (typeId) => {
    for (const orientation of [0, 1, 2, 3]) {
      expect(distinctOrientations(typeId)).toContain(
        normalizePlacement(typeId, [3, 3], orientation).orientation,
      );
    }
  });

  it.each(IDS)("preserves the footprint (tile %i)", (typeId) => {
    for (const orientation of [0, 1, 2, 3]) {
      const raw = new Set([
        "3,3",
        `${3 + offsetOf(orientation)[0]},${3 + offsetOf(orientation)[1]}`,
      ]);
      const normalized = normalizePlacement(typeId, [3, 3], orientation);
      const footprint = new Set([
        `${normalized.anchor[0]},${normalized.anchor[1]}`,
        `${normalized.anchor[0] + offsetOf(normalized.orientation)[0]},${normalized.anchor[1] + offsetOf(normalized.orientation)[1]}`,
      ]);
      expect(footprint).toEqual(raw);
    }
  });

  it("leaves an already-distinct orientation untouched", () => {
    for (const orientation of [0, 1, 2, 3]) {
      expect(normalizePlacement(1, [2, 2], orientation)).toEqual({ anchor: [2, 2], orientation });
    }
  });

  it("rewrites a collapsed orientation for a symmetric tile", () => {
    expect(distinctOrientations(2)).toEqual([0, 1]);
    expect(normalizePlacement(2, [3, 3], 2)).toEqual({ anchor: [2, 3], orientation: 0 });
    expect(normalizePlacement(2, [3, 3], 3)).toEqual({ anchor: [3, 4], orientation: 1 });
  });

  it("covers every tile in the data", () => {
    expect(Object.keys(TILE_TYPES).length).toBe(6);
  });
});
