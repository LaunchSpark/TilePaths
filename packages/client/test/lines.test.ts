import { describe, expect, it } from "vitest";
import { emptyPlay, scoringBoard } from "./fixtures.js";
import { linesFor } from "../src/lines.js";
import { buildView } from "../src/view.js";

describe("linesFor", () => {
  it("finds a completed line between two of one player's markers", () => {
    const g = scoringBoard();
    const lines = linesFor(g.board, buildView(g), [0]);
    expect(lines.length).toBe(1);
    expect(lines[0]!.owner).toBe(0);
    expect([...lines[0]!.slots]).toEqual([3, 11]);
    expect(lines[0]!.passes).toBe(3);
    expect(lines[0]!.steps.length).toBeGreaterThan(0);
  });

  it("dedupes a line found from both ends", () => {
    const g = scoringBoard();
    expect(linesFor(g.board, buildView(g), [0]).length).toBe(1);
  });

  it("returns nothing when no markers connect", () => {
    const g = emptyPlay();
    expect(linesFor(g.board, buildView(g), [0, 1])).toEqual([]);
  });

  it("attributes each line to its owner when asked for several players", () => {
    const g = scoringBoard();
    const lines = linesFor(g.board, buildView(g), [0, 1]);
    expect(lines.length).toBe(2);
    expect(new Set(lines.map((l) => l.owner))).toEqual(new Set([0, 1]));
    expect(lines.every((l) => l.passes === 3)).toBe(true);
  });

  it("asks only for the players requested", () => {
    const g = scoringBoard();
    expect(linesFor(g.board, buildView(g), [1]).map((l) => l.owner)).toEqual([1]);
  });
});
