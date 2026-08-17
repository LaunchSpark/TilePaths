import { describe, expect, it } from "vitest";
import { MARKER_DISTANCES } from "../src/config.js";
import { Game } from "../src/game.js";
import { markerDestination } from "../src/markers.js";
import { distinctOrientations } from "../src/tileTypes.js";
import type { Move } from "../src/types.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}
const places = (ms: Move[]) => ms.filter((m) => m.kind === "place");
const markers = (ms: Move[]) => ms.filter((m) => m.kind === "marker");

describe("legalMoves", () => {
  it("only emits moves apply accepts", () => {
    const g = setup();
    for (const m of g.legalMoves()) g.clone().apply(m);
  });

  it("counts 30 footprints per orientation on an empty 6x6", () => {
    const g = setup(2, 1, 6);
    const ps = places(g.legalMoves());
    g.piles.forEach((pile, index) => {
      for (const o of distinctOrientations(pile.faceUp!)) {
        expect(ps.filter((m) => m.pileIndex === index && m.orientation === o).length).toBe(30);
      }
      const count = ps.filter((m) => m.pileIndex === index).length;
      expect(count).toBe(distinctOrientations(pile.faceUp!).length === 4 ? 120 : 60);
    });
  });

  it("emits no duplicate placements for symmetric tiles", () => {
    const g = setup();
    const ps = places(g.legalMoves());
    const keys = ps.map((m) => `${m.pileIndex}|${[
      `${m.cellA[0]},${m.cellA[1]}`, `${m.cellB[0]},${m.cellB[1]}`,
    ].sort().join("/")}|${m.orientation}`);
    expect(new Set(keys).size).toBe(keys.length);

    g.piles.forEach((pile, index) => {
      if (distinctOrientations(pile.faceUp!).length === 2) {
        const emitted = new Set(ps.filter((m) => m.pileIndex === index).map((m) => m.orientation));
        expect(emitted).toEqual(new Set([0, 1]));
      }
    });
  });

  it("generates moves for every marker", () => {
    const ms = markers(setup().legalMoves());
    expect(new Set(ms.map((m) => m.markerIndex))).toEqual(new Set([0, 1, 2, 3]));
  });

  /** +1 and -1 land on the same slot only when the ring is saturated. For a
   *  fixed direction, |distance| 2 always needs strictly more empty slots than
   *  |distance| 1 along the same scan, so same-direction landings can never
   *  coincide -- a collision needs the forward and backward scans to converge,
   *  which requires leaving exactly one slot empty besides the marker's own.
   *  Do not "simplify" this back to a lightly-occupied ring. */
  it("dedupes marker moves reaching the same slot", () => {
    const g = setup(2, 1, 6);
    const start = g.players[0]!.markerSlots[0]!;
    const empties = g.board.ring
      .map((s, i) => (s.occupant === null && i !== start ? i : -1))
      .filter((i) => i >= 0);
    const [, ...fill] = empties;
    fill.forEach((slot, i) => { g.board.ring[slot]!.occupant = 900 + i; });

    const ms = markers(g.legalMoves()).filter((m) => m.markerIndex === 0);
    const dests = ms.map((m) => markerDestination(g.board, start, m.distance));
    expect(new Set(dests).size).toBe(dests.length);
    expect(ms.length).toBe(1);
    expect(ms.length).toBeLessThan(MARKER_DISTANCES.length);
  });

  it("emits no placements when every pile is empty", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    expect(places(g.legalMoves()).length).toBe(0);
  });
});
