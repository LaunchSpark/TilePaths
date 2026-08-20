import { Side, slotIndexOf, tracePath } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { emptyPlay, scoringBoard, selfCrossingBoard, stackedBoard } from "./fixtures.js";
import { linesFor } from "../src/lines.js";
import { tilesInLine } from "../src/render/breakdown.js";
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

describe("tilesInLine", () => {
  it("groups consecutive steps by placement and reports level", () => {
    const g = scoringBoard();
    const line = linesFor(g.board, buildView(g), [0])[0]!;
    const tiles = tilesInLine(line);
    expect(tiles.length).toBe(3);
    expect(tiles.every((t) => t.level === 1 && t.passes === 1)).toBe(true);
  });

  // Built from tracePath directly rather than from linesFor: tilesInLine takes
  // a LineView, and this board has no markers, so requiring a completed line
  // would mean inventing marker positions to make the fixture connect.
  it("counts a tile crossed twice as two entries", () => {
    const g = selfCrossingBoard();
    const path = tracePath(g.board, slotIndexOf(3, 1, 0, Side.W));
    const line = { owner: 0, slots: [0, 0] as [number, number],
                   passes: path.passes, steps: path.steps };
    const ids = tilesInLine(line).map((t) => t.placementId);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("omits uncovered cells, which contribute nothing", () => {
    const g = emptyPlay();
    const line = { owner: 0, slots: [0, 0] as [number, number], passes: 0,
                   steps: tracePath(g.board, 0).steps };
    expect(tilesInLine(line)).toEqual([]);
  });

  // selfCrossingBoard's middle tile (placementId 2) is entered and crossed
  // through both of its cells before the line moves on -- two PathSteps, one
  // physical tile. A per-step enumeration would report 5 entries here (one
  // per step); real grouping reports 3 (three runs: id 1, id 2, id 1 again).
  it("distinguishes real grouping from per-step enumeration", () => {
    const g = selfCrossingBoard();
    const path = tracePath(g.board, slotIndexOf(3, 1, 0, Side.W));
    const line = { owner: 0, slots: [0, 0] as [number, number],
                   passes: path.passes, steps: path.steps };
    expect(path.steps.length).toBe(5);
    expect(tilesInLine(line).length).toBeLessThan(path.steps.length);
  });

  it("keeps a returning crossing as its own run rather than merging by id", () => {
    const g = selfCrossingBoard();
    const path = tracePath(g.board, slotIndexOf(3, 1, 0, Side.W));
    const line = { owner: 0, slots: [0, 0] as [number, number],
                   passes: path.passes, steps: path.steps };
    const tiles = tilesInLine(line);
    // Naive group-by-id would merge the two runs sharing a placementId into
    // one entry; consecutive-run grouping keeps them separate.
    const total = tiles.reduce((sum, t) => sum + t.passes, 0);
    expect(total).toBe(line.passes);
    expect(tiles.length).toBeGreaterThan(new Set(tiles.map((t) => t.placementId)).size);
  });

  // Every fixture above places only level-1 tiles, so `level`/`passes` being
  // right could just mean the field is hardcoded to 1. stackedBoard() has a
  // real level-2 tile (two level-1 dominoes supporting a third stacked
  // across them); crossing it must report level 2 and 2 passes, not 1.
  it("reads the tile's real height rather than assuming level 1", () => {
    const g = stackedBoard();
    const path = tracePath(g.board, slotIndexOf(4, 0, 0, Side.W));
    const line = { owner: 0, slots: [0, 0] as [number, number],
                   passes: path.passes, steps: path.steps };
    const tiles = tilesInLine(line);
    expect(tiles.length).toBe(1);
    expect(tiles[0]!.level).toBe(2);
    expect(tiles[0]!.passes).toBe(2);
  });
});
