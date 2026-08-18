import { Game } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import {
  highlightedPaths,
  PathHighlightCache,
  pathTopologyKey,
  traceViewPath,
} from "../src/path-highlight.js";
import { buildView } from "../src/view.js";

function viewWithMarker(slot = 0) {
  const view = buildView(Game.newGame(2, 1, 4));
  view.ring[slot]!.occupant = 0;
  return view;
}

describe("path highlighting", () => {
  it("traces a starting path straight across the empty board", () => {
    const path = traceViewPath(viewWithMarker(), 0);
    expect(path.endSlot).toBe(11);
    expect(path.segments).toHaveLength(4);
    expect(path.segments.map(({ row, col }) => [row, col])).toEqual([
      [0, 0], [1, 0], [2, 0], [3, 0],
    ]);
  });

  it("only highlights a ring slot when it contains a token", () => {
    const view = viewWithMarker();
    expect(highlightedPaths(view, { hoveredSlot: 0, ghost: null })).toHaveLength(1);
    expect(highlightedPaths(view, { hoveredSlot: 1, ghost: null })).toHaveLength(0);
  });

  it("traces through ghost connections as though the tile were placed", () => {
    const view = viewWithMarker();
    const ghost = { anchor: [0, 0] as [number, number], typeId: 1 as const, orientation: 0 };
    const [path] = highlightedPaths(view, { hoveredSlot: null, ghost });
    expect(path).toBeDefined();
    expect(path!.endSlot).toBe(15);
    expect(path!.segments).toHaveLength(1);
    expect(path!.segments[0]).toMatchObject({ row: 0, col: 0, entry: 0, exit: 3 });
  });

  it("memoizes by board revision and semantic hover/ghost state", () => {
    const view = viewWithMarker();
    const cache = new PathHighlightCache();
    const request = { hoveredSlot: 0, ghost: null };
    const first = cache.get(view, request, 3);
    expect(cache.get(view, { ...request }, 3)).toBe(first);
    expect(cache.get(view, request, 4)).not.toBe(first);
  });

  it("only includes route-affecting state in the topology key", () => {
    const view = viewWithMarker();
    const before = pathTopologyKey(view);
    view.players[0]!.score += 10;
    view.piles[0]!.count -= 1;
    expect(pathTopologyKey(view)).toBe(before);
    view.ring[1]!.occupant = 1;
    expect(pathTopologyKey(view)).not.toBe(before);
  });
});
