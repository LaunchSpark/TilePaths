import { Side } from "@passtally/rules";
import type { PathStep } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import type { LineView } from "../src/lines.js";
import { assignLanes, offsetFor } from "../src/render/offset.js";

function lineThrough(
  cells: [number, number][],
  owner: number,
  slots: [number, number],
): LineView {
  return {
    owner,
    slots,
    passes: cells.length,
    steps: cells.map(([row, col]) => ({
      row,
      col,
      entry: Side.W,
      exit: Side.E,
      placementId: null,
      height: 0,
    })),
  };
}

function stepGoing(entry: Side, exit: Side): PathStep {
  return { row: 0, col: 0, entry, exit, placementId: null, height: 0 };
}

describe("assignLanes", () => {
  it("gives a lone line through a cell the centre lane", () => {
    const lanes = assignLanes([lineThrough([[1, 1]], 0, [0, 5])]);
    expect([...lanes.values()]).toEqual([0]);
  });

  it("gives two players sharing a cell different lanes", () => {
    const lanes = assignLanes([
      lineThrough([[1, 1]], 0, [0, 5]),
      lineThrough([[1, 1]], 1, [2, 7]),
    ]);
    expect(new Set(lanes.values()).size).toBe(2);
  });

  // THE case colour cannot solve: one owner, one colour, two crossings.
  it("gives a self-crossing line two lanes through the same cell", () => {
    const selfCrossing = lineThrough([[1, 1], [1, 2], [1, 1]], 0, [0, 5]);
    const lanes = assignLanes([selfCrossing]);
    const atCell = [...lanes.entries()].filter(([k]) => k.includes("1,1"));
    expect(atCell.length).toBe(2);
    expect(atCell[0]![1]).not.toBe(atCell[1]![1]);
  });

  it("is stable across calls", () => {
    const lines = [lineThrough([[1, 1]], 0, [0, 5]), lineThrough([[1, 1]], 1, [2, 7])];
    expect([...assignLanes(lines).entries()]).toEqual([...assignLanes(lines).entries()]);
  });
});

describe("offsetFor", () => {
  it("centres a single lane on the true path", () => {
    expect(offsetFor(stepGoing(Side.W, Side.E), 0, 1, 6)).toEqual([0, 0]);
  });

  it("offsets perpendicular to travel", () => {
    // Travelling east, lanes separate vertically.
    const [dx, dy] = offsetFor(stepGoing(Side.W, Side.E), 1, 2, 6);
    expect(dx).toBe(0);
    expect(Math.abs(dy)).toBeGreaterThan(0);
  });

  it("puts two lanes on opposite sides of centre", () => {
    const a = offsetFor(stepGoing(Side.W, Side.E), 0, 2, 6);
    const b = offsetFor(stepGoing(Side.W, Side.E), 1, 2, 6);
    expect(Math.sign(a[1])).toBe(-Math.sign(b[1]));
  });
});
