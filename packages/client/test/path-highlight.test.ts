import { Game, Side, slotIndexOf, tracePath } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import {
  highlightedPaths,
  hypotheticalBoard,
  PathHighlightCache,
  pathTopologyKey,
} from "../src/path-highlight.js";
import { LocalSession } from "../src/session.js";
import { Tentative } from "../src/tentative.js";
import { buildView, setupOrder } from "../src/view.js";

function playing(nPlayers = 2, seed = 1, boardSize = 6): LocalSession {
  const session = new LocalSession(Game.newGame(nPlayers, seed, boardSize));
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const slot = session.getView().ring.findIndex((ringSlot, index) =>
      ringSlot.occupant === null && !edges.has(Math.floor(index / boardSize)));
    session.placeSetupMarker(player, slot);
    edges.add(Math.floor(slot / boardSize));
    used.set(player, edges);
  }
  return session;
}

// A 6x6 board with markers pinned to known slots, so a ghost's effect on a
// specific line can be asserted precisely instead of by luck of the deal.
// Player 0 holds the west edge at row 2 (slot 21) plus one marker per other
// edge; player 1 fills the remaining edges. Game.setupPlaceMarker enforces no
// per-player turn order, so these can be placed directly and out of sequence.
const WEST_ROW_2 = slotIndexOf(6, 2, 0, Side.W);
function playingWithMarkerAtWestRow2(): LocalSession {
  const session = new LocalSession(Game.newGame(2, 1, 6));
  const game = session.game;
  for (const [player, slot] of [
    [0, WEST_ROW_2], [0, 0], [0, 6], [0, 12],
    [1, 1], [1, 7], [1, 13], [1, 19],
  ] as [number, number][]) {
    game.setupPlaceMarker(player, slot);
  }
  return session;
}

function viewWithMarker(slot = 0) {
  const view = buildView(Game.newGame(2, 1, 4));
  view.ring[slot]!.occupant = 0;
  return view;
}

describe("path highlighting", () => {
  it("traces straight across an empty board through printed cross paths", () => {
    const t = new Tentative(playing());
    const board = hypotheticalBoard(t, null);
    const path = tracePath(board, slotIndexOf(6, 2, 0, Side.W));
    expect(path.passes).toBe(0);
    expect(path.steps.length).toBe(6);
    expect(path.endpoint).toBe(slotIndexOf(6, 2, 5, Side.E));
  });

  it("traces through a ghost as though the tile were placed", () => {
    const t = new Tentative(playing());
    const faceUp = t.view().piles[0]!.faceUp!;
    const withGhost = hypotheticalBoard(t, {
      anchor: [2, 2], typeId: faceUp, orientation: 0,
    });
    const without = hypotheticalBoard(t, null);
    expect(withGhost.cells[2]![2]!.placementId).not.toBeNull();
    expect(without.cells[2]![2]!.placementId).toBeNull();
  });

  it("only highlights a ring slot when it contains a token", () => {
    const t = new Tentative(playingWithMarkerAtWestRow2());
    expect(highlightedPaths(t, { hoveredSlot: WEST_ROW_2, ghost: null })).toHaveLength(1);
    // Slot 2 sits on the same north edge but was never given to a player.
    expect(highlightedPaths(t, { hoveredSlot: 2, ghost: null })).toHaveLength(0);
  });

  it("traces through ghost connections as though the tile were placed", () => {
    const t = new Tentative(playingWithMarkerAtWestRow2());
    const faceUp = t.view().piles[0]!.faceUp!;

    // This ghost sits on the row-2 marker's straight path (row 2, every
    // column) -- it should be pulled into the highlight set, carrying the
    // ghost tile's placementId at the crossed cell.
    const onPath = { anchor: [2, 2] as [number, number], typeId: faceUp, orientation: 0 };
    const touched = highlightedPaths(t, { hoveredSlot: null, ghost: onPath });
    const crossing = touched.find((path) => path.steps.some((s) => s.row === 2 && s.col === 2));
    expect(crossing).toBeDefined();
    expect(crossing!.steps.find((s) => s.row === 2 && s.col === 2)!.placementId).not.toBeNull();

    // This ghost sits in the one 2x2 pocket (rows 3, cols 2-3) that no
    // marker's straight-line path crosses -- it must NOT surface any path,
    // even though seven other markers are on the board.
    const offPath = { anchor: [3, 2] as [number, number], typeId: faceUp, orientation: 3 };
    expect(highlightedPaths(t, { hoveredSlot: null, ghost: offPath })).toEqual([]);
  });

  // PathHighlightCache.get can no longer take a bare GameView: it must reach
  // a real Board to trace through the engine, and GameView deliberately
  // omits placementId (the client holds no game rules). It now takes the
  // Tentative that can produce that board. The memoization behaviour under
  // test is otherwise unchanged from before this refactor.
  it("memoizes by board revision and semantic hover/ghost state", () => {
    const t = new Tentative(playingWithMarkerAtWestRow2());
    const cache = new PathHighlightCache();
    const request = { hoveredSlot: WEST_ROW_2, ghost: null };
    const first = cache.get(t, request, 3);
    expect(cache.get(t, { ...request }, 3)).toBe(first);
    expect(cache.get(t, request, 4)).not.toBe(first);
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
