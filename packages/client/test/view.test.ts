import { Game, config } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { buildView, displayRanking } from "../src/view.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

describe("buildView", () => {
  it("reports board size, phase and turn state", () => {
    const v = buildView(setup());
    expect(v.n).toBe(6);
    expect(v.phase).toBe("play");
    expect(v.currentPlayer).toBe(0);
    expect(v.actionsLeft).toBe(config.ACTIONS_PER_TURN);
    expect(v.setupNext).toBeNull();
  });

  it("reports setup phase until every marker is placed", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    const v = buildView(g);
    expect(v.phase).toBe("setup");
    expect(v.setupNext).not.toBeNull();
  });

  it("reports setup slots accepted by the rules engine", () => {
    const game = Game.newGame(2, 1, 6);
    expect(buildView(game).setupLegalSlots).toHaveLength(24);

    game.setupPlaceMarker(0, 0);
    game.setupPlaceMarker(1, 1);
    const view = buildView(game);
    expect(view.setupNext).toBe(1);
    expect(view.setupLegalSlots).toEqual([...Array(18).keys()].map((index) => index + 6));
  });

  it("mirrors cells with height, conns and partner offset", () => {
    const g = setup();
    g.apply({ kind: "place", pileIndex: 0, cellA: [2, 2], cellB: [3, 2], orientation: 0 });
    const v = buildView(g);
    expect(v.cells[2]![2]!.height).toBe(1);
    expect(v.cells[2]![2]!.conns).not.toBeNull();
    expect(v.cells[2]![2]!.partner).toEqual([1, 0]);
    expect(v.cells[3]![2]!.partner).toEqual([-1, 0]);
    expect(v.cells[0]![0]!.height).toBe(0);
    expect(v.cells[0]![0]!.conns).toBeNull();
    expect(v.cells[0]![0]!.partner).toBeNull();
  });

  it("mirrors the ring with occupants", () => {
    const v = buildView(setup());
    expect(v.ring.length).toBe(4 * 6);
    expect(v.ring[0]!.occupant).toBe(0);
    expect(v.ring[2]!.occupant).toBeNull();
  });

  it("reports marker slots and scores per player", () => {
    const v = buildView(setup());
    expect(v.players.length).toBe(2);
    expect(v.players[0]!.markerSlots.length).toBe(config.MARKERS_PER_PLAYER);
    expect(v.players[0]!.score).toBe(0);
  });

  it("never exposes pile contents", () => {
    const g = setup();
    const v = buildView(g);
    expect(v.piles.length).toBe(config.N_PILES);
    for (const p of v.piles) {
      expect(Object.keys(p).sort()).toEqual(["count", "distinctOrientations", "faceUp"]);
    }
    const serialized = JSON.stringify(v);
    for (const pile of g.piles) {
      expect(pile.ordered.length).toBeGreaterThan(0);
      expect(serialized).not.toContain(JSON.stringify(pile.ordered));
    }
  });

  it("reports pile counts including the face-up tile", () => {
    const g = setup();
    expect(buildView(g).piles[0]!.count).toBe(g.piles[0]!.ordered.length + 1);
  });

  it("reports an empty pile as count zero with a null face", () => {
    const g = setup();
    g.piles[0]!.ordered.length = 0;
    g.piles[0]!.faceUp = null;
    const v = buildView(g);
    expect(v.piles[0]!.faceUp).toBeNull();
    expect(v.piles[0]!.count).toBe(0);
  });

  it("carries distinct orientations per pile", () => {
    for (const p of buildView(setup()).piles) {
      expect([2, 4]).toContain(p.distinctOrientations.length);
    }
  });
});

describe("displayRanking", () => {
  it("orders by score then by turn order", () => {
    const g = setup(3, 1, 6);
    g.players[0]!.score = 4;
    g.players[1]!.score = 9;
    g.players[2]!.score = 4;
    expect(displayRanking(buildView(g))).toEqual([1, 0, 2]);
  });

  it("breaks a tie for the lead by turn order", () => {
    const g = setup(2, 1, 6);
    g.players[0]!.score = 5;
    g.players[1]!.score = 5;
    expect(displayRanking(buildView(g))[0]).toBe(0);
  });
});
