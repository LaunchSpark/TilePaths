import { buildRing, slotIndexOf } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { cellRect, hitTest, layoutFor, slotRect, unit } from "../src/geometry.js";

const SIZES = [4, 5, 6, 7, 8];
const layout = (n: number) => layoutFor(n, 500);

function centre(n: number, u: number, v: number): [number, number] {
  const current = layout(n);
  const size = unit(current);
  return [current.originX + (u + 0.5) * size, current.originY + (v + 0.5) * size];
}

describe("layout", () => {
  it("makes the board region n + 2 units across", () => {
    expect(unit(layoutFor(6, 500))).toBeCloseTo(500 / 8);
    expect(unit(layoutFor(4, 500))).toBeCloseTo(500 / 6);
  });
});

describe("hitTest", () => {
  it.each(SIZES)("finds every grid cell (n=%i)", (n) => {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const [x, y] = centre(n, col + 1, row + 1);
        expect(hitTest(x, y, layout(n))).toEqual({ kind: "cell", row, col });
      }
    }
  });

  it.each(SIZES)("finds every ring slot (n=%i)", (n) => {
    buildRing(n).forEach((slot, index) => {
      const u = slot.side === 3 ? 0 : slot.side === 1 ? n + 1 : slot.col + 1;
      const v = slot.side === 0 ? 0 : slot.side === 2 ? n + 1 : slot.row + 1;
      const [x, y] = centre(n, u, v);
      expect(hitTest(x, y, layout(n))).toEqual({ kind: "slot", index });
      expect(slotIndexOf(n, slot.row, slot.col, slot.side)).toBe(index);
    });
  });

  it.each(SIZES)("treats ring corners as dead space (n=%i)", (n) => {
    for (const [u, v] of [[0, 0], [n + 1, 0], [0, n + 1], [n + 1, n + 1]]) {
      const [x, y] = centre(n, u!, v!);
      expect(hitTest(x, y, layout(n))).toEqual({ kind: "none" });
    }
  });

  it("returns none outside the board region", () => {
    const current = layout(6);
    expect(hitTest(current.originX - 1, current.originY + 10, current)).toEqual({ kind: "none" });
    expect(hitTest(current.originX + 10, current.originY - 1, current)).toEqual({ kind: "none" });
    expect(hitTest(current.originX + 501, current.originY + 10, current)).toEqual({ kind: "none" });
    expect(hitTest(current.originX + 10, current.originY + 501, current)).toEqual({ kind: "none" });
  });

  it("respects a non-zero origin", () => {
    const current = layoutFor(6, 500, 100, 50);
    const size = unit(current);
    expect(hitTest(100 + 1.5 * size, 50 + 1.5 * size, current)).toEqual({ kind: "cell", row: 0, col: 0 });
    expect(hitTest(10, 10, current)).toEqual({ kind: "none" });
  });
});

describe("rects", () => {
  it("places cell (0,0) one unit in from the origin", () => {
    const current = layout(6);
    const size = unit(current);
    expect(cellRect(current, 0, 0)).toEqual({
      x: current.originX + size,
      y: current.originY + size,
      w: size,
      h: size,
    });
  });

  it("round-trips every slot rect back through hitTest", () => {
    const current = layout(6);
    for (let index = 0; index < 24; index++) {
      const rect = slotRect(current, index);
      expect(hitTest(rect.x + rect.w / 2, rect.y + rect.h / 2, current)).toEqual({ kind: "slot", index });
    }
  });
});
