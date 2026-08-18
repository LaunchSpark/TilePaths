import { Game, config } from "@passtally/rules";
import type { Move } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { Tentative } from "../src/tentative.js";
import { setupOrder } from "../src/view.js";

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

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

describe("Tentative", () => {
  it("starts empty with a full action count", () => {
    const tentative = new Tentative(playing());
    expect(tentative.moves).toEqual([]);
    expect(tentative.actionsLeft()).toBe(config.ACTIONS_PER_TURN);
  });

  it("shows a pending placement on the board", () => {
    const tentative = new Tentative(playing());
    tentative.add(place(0, [2, 2], [3, 2], 0));
    expect(tentative.view().cells[2]![2]!.height).toBe(1);
    expect(tentative.actionsLeft()).toBe(1);
  });

  it("undo restores the committed board exactly", () => {
    const session = playing();
    const before = JSON.stringify(session.getView());
    const tentative = new Tentative(session);
    tentative.add(place(0, [2, 2], [3, 2], 0));
    tentative.add(marker(0, 1));
    expect(JSON.stringify(tentative.view())).not.toBe(before);
    tentative.undo();
    tentative.undo();
    expect(JSON.stringify(tentative.view())).toBe(before);
    expect(tentative.actionsLeft()).toBe(config.ACTIONS_PER_TURN);
  });

  it("undo on an empty list is a no-op", () => {
    const tentative = new Tentative(playing());
    tentative.undo();
    expect(tentative.moves).toEqual([]);
  });

  it("marks a pile spent and keeps it spent until undo", () => {
    const tentative = new Tentative(playing());
    expect(tentative.isSpent(0)).toBe(false);
    tentative.add(place(0, [2, 2], [3, 2], 0));
    expect(tentative.isSpent(0)).toBe(true);
    expect(tentative.isSpent(1)).toBe(false);
    tentative.undo();
    expect(tentative.isSpent(0)).toBe(false);
  });

  it("refuses a second placement from a spent pile", () => {
    const tentative = new Tentative(playing());
    tentative.add(place(0, [2, 2], [3, 2], 0));
    expect(() => tentative.add(place(0, [2, 4], [3, 4], 0))).toThrow(/spent/i);
    tentative.add(place(1, [2, 4], [3, 4], 0));
    expect(tentative.actionsLeft()).toBe(0);
  });

  it("does not advance the player after the final pending action", () => {
    const tentative = new Tentative(playing());
    tentative.add(place(0, [2, 2], [3, 2], 0));
    tentative.add(place(1, [2, 4], [3, 4], 0));
    expect(tentative.actionsLeft()).toBe(0);
    expect(tentative.view().currentPlayer).toBe(0);
    expect(tentative.view().phase).toBe("play");
  });

  it("does not reveal a replacement tile before commit", () => {
    const session = playing();
    const faceUpBefore = session.getView().piles[0]!.faceUp;
    const countBefore = session.getView().piles[0]!.count;
    const tentative = new Tentative(session);
    tentative.add(place(0, [2, 2], [3, 2], 0));
    expect(tentative.view().piles[0]!.faceUp).toBe(faceUpBefore);
    expect(tentative.view().piles[0]!.count).toBe(countBefore);
  });

  it("rejects a move beyond the action budget", () => {
    const tentative = new Tentative(playing());
    tentative.add(place(0, [2, 2], [3, 2], 0));
    tentative.add(place(1, [2, 4], [3, 4], 0));
    expect(() => tentative.add(marker(0, 1))).toThrow(/no actions/i);
  });

  it("rejects an illegal move without changing state", () => {
    const tentative = new Tentative(playing());
    tentative.add(place(0, [2, 2], [3, 2], 0));
    expect(() => tentative.add(place(1, [2, 2], [3, 2], 0))).toThrow();
    expect(tentative.moves.length).toBe(1);
  });
});
