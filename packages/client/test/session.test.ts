import { Game, config, placeTile } from "@passtally/rules";
import type { Move } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { setupOrder } from "../src/view.js";

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

function completeSetup(s: LocalSession, nPlayers: number, boardSize: number): void {
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const slot = s.getView().ring.findIndex((ringSlot, index) =>
      ringSlot.occupant === null && !edges.has(Math.floor(index / boardSize)));
    s.placeSetupMarker(player, slot);
    edges.add(Math.floor(slot / boardSize));
    used.set(player, edges);
  }
}

function playing(nPlayers = 2, seed = 1, boardSize = 6): LocalSession {
  const session = new LocalSession(Game.newGame(nPlayers, seed, boardSize));
  completeSetup(session, nPlayers, boardSize);
  return session;
}

describe("setup", () => {
  it("reports whose turn it is and enforces snake order", () => {
    const session = new LocalSession(Game.newGame(2, 1, 6));
    expect(session.getView().setupNext).toBe(0);
    session.placeSetupMarker(0, 0);
    expect(session.getView().setupNext).toBe(1);
    session.placeSetupMarker(1, 1);
    expect(session.getView().setupNext).toBe(1);
  });

  it("rejects a placement out of snake order", () => {
    const session = new LocalSession(Game.newGame(2, 1, 6));
    expect(() => session.placeSetupMarker(1, 0)).toThrow(/turn/i);
  });

  it("leaves phase as setup until every marker is placed", () => {
    const session = new LocalSession(Game.newGame(2, 1, 6));
    expect(session.getView().phase).toBe("setup");
    completeSetup(session, 2, 6);
    expect(session.getView().phase).toBe("play");
    expect(session.getView().setupNext).toBeNull();
  });

  it("rejects any setup placement once play has begun", () => {
    expect(() => playing().placeSetupMarker(0, 30)).toThrow();
  });
});

describe("commit", () => {
  it("accepts a partial commit but rejects empty or oversized commits", () => {
    const session = playing();
    expect(session.commit([place(0, [2, 2], [3, 2], 0)])).toBeNull();
    expect(session.getView().currentPlayer).toBe(0);
    expect(session.getView().actionsLeft).toBe(1);
    expect(() => session.commit([])).toThrow(/between 1 and 1/i);
    expect(() => session.commit([
      place(1, [2, 4], [3, 4], 0),
      marker(0, 1),
    ])).toThrow(/between 1 and 1/i);
  });

  it("reveals a replacement when the first move is committed", () => {
    const session = playing();
    const before = session.getView().piles[0]!;
    const ordered = session.game.piles[0]!.ordered;
    const expectedReplacement = ordered[ordered.length - 1]!;

    const result = session.commit([place(0, [2, 2], [3, 2], 0)]);

    const after = session.getView().piles[0]!;
    expect(result).toBeNull();
    expect(after.count).toBe(before.count - 1);
    expect(after.faceUp).toBe(expectedReplacement);
    expect(session.getView().players[0]!.score).toBe(0);
  });

  it("advances the game and the pile", () => {
    const session = playing();
    const countBefore = session.getView().piles[0]!.count;
    session.commit([place(0, [2, 2], [3, 2], 0), place(1, [2, 4], [3, 4], 0)]);
    const after = session.getView();
    expect(after.cells[2]![2]!.height).toBe(1);
    expect(after.currentPlayer).toBe(1);
    expect(after.actionsLeft).toBe(config.ACTIONS_PER_TURN);
    expect(after.piles[0]!.count).toBe(countBefore - 1);
  });

  it("is atomic -- a bad second move rolls back the first", () => {
    const session = playing();
    const before = session.getView();
    expect(() =>
      session.commit([place(0, [2, 2], [3, 2], 0), place(0, [2, 2], [3, 2], 0)]),
    ).toThrow();
    expect(session.getView()).toEqual(before);
  });

  it("reports the lines that scored", () => {
    const game = Game.newGame(2, 1, 3);
    for (const slot of [11, 3, 1, 6]) game.setupPlaceMarker(0, slot);
    for (const slot of [0, 4, 7, 10]) game.setupPlaceMarker(1, slot);
    const session = new LocalSession(game);
    for (let col = 0; col < 3; col++) session.dropCrossTileForTest(col);

    const result = session.commit([marker(0, 1), marker(0, -1)]);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected the turn to end");
    expect(result.player).toBe(0);
    expect(result.totalPasses).toBe(3);
    expect(result.vpAwarded).toBe(2);
    expect(result.lines.length).toBe(1);
    expect([...result.lines[0]!.slots].sort((a, b) => a - b)).toEqual([3, 11]);
    expect(result.lines[0]!.passes).toBe(3);
  });

  it("updates the visible score for a route using starting cross paths", () => {
    const game = Game.newGame(2, 1, 4);
    for (const slot of [14, 5, 0, 8]) game.setupPlaceMarker(0, slot);
    for (const slot of [1, 4, 9, 15]) game.setupPlaceMarker(1, slot);
    placeTile(game.board, [1, 1], [1, 2], 2, 3);
    const session = new LocalSession(game);

    const result = session.commit([marker(0, 1), marker(0, -1)]);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected the turn to end");

    expect(result.totalPasses).toBe(1);
    expect(result.vpAwarded).toBe(1);
    expect(session.getView().players[0]!.score).toBe(1);
  });

  it("reports no lines when nothing scores", () => {
    const result = playing().commit([marker(0, 1), marker(0, -1)]);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected the turn to end");
    expect(result.lines).toEqual([]);
    expect(result.totalPasses).toBe(0);
    expect(result.vpAwarded).toBe(0);
  });
});

describe("full game", () => {
  it.each([2, 3])("plays a %i-player game to completion", (nPlayers) => {
    const session = playing(nPlayers, 99, 6);
    let guard = 0;
    while (session.getView().phase !== "over" && guard++ < 2000) {
      const moves = session.legalTurns();
      if (moves === null) break;
      session.commit(moves);
    }
    expect(session.getView().phase).toBe("over");
  });
});
