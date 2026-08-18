import { Game } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { Controller } from "../src/state.js";
import { setupOrder } from "../src/view.js";

function controller(nPlayers = 2, seed = 1, boardSize = 6): Controller {
  return new Controller(new LocalSession(Game.newGame(nPlayers, seed, boardSize)));
}

function driveSetup(current: Controller, nPlayers = 2, boardSize = 6): void {
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const index = current.view().ring.findIndex((slot, slotIndex) =>
      slot.occupant === null && !edges.has(Math.floor(slotIndex / boardSize)));
    current.handle({ kind: "click", hit: { kind: "slot", index } });
    edges.add(Math.floor(index / boardSize));
    used.set(player, edges);
  }
}

describe("setup phase", () => {
  it("starts in setup and places markers by clicking ring slots", () => {
    const current = controller();
    expect(current.state).toBe("setup");
    current.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    expect(current.view().ring[0]!.occupant).not.toBeNull();
    expect(current.state).toBe("setup");
  });

  it("moves to idle once every marker is placed", () => {
    const current = controller();
    driveSetup(current);
    expect(current.state).toBe("idle");
    expect(current.view().phase).toBe("play");
  });

  it("records a rejection instead of throwing on an occupied slot", () => {
    const current = controller();
    current.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    current.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    expect(current.lastRejection).not.toBeNull();
    expect(current.state).toBe("setup");
  });
});

describe("placing a tile", () => {
  it("selects a pile and enters tileSelected", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    expect(current.state).toBe("tileSelected");
    expect(current.selectedPile).toBe(0);
  });

  it("rotates the ghost through all four orientations", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    expect(current.ghostOrientation).toBe(0);
    for (const expected of [1, 2, 3, 0]) {
      current.handle({ kind: "rotate" });
      expect(current.ghostOrientation).toBe(expected);
    }
  });

  it("places on a legal anchor and returns to idle", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    expect(current.state).toBe("idle");
    expect(current.view().cells[2]![2]!.height).toBe(1);
    expect(current.view().actionsLeft).toBe(1);
  });

  it("records a rejection on an illegal anchor and stays selected", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 5, col: 2 } });
    expect(current.lastRejection).not.toBeNull();
    expect(current.state).toBe("tileSelected");
    expect(current.view().actionsLeft).toBe(2);
  });

  it("refuses a pile already spent this turn", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    current.handle({ kind: "selectPile", pileIndex: 0 });
    expect(current.lastRejection).not.toBeNull();
    expect(current.state).toBe("idle");
  });
});

describe("moving a marker", () => {
  it("selects an own marker and enters markerSelected", () => {
    const current = controller();
    driveSetup(current);
    const own = current.view().players[current.view().currentPlayer]!.markerSlots[0]!;
    current.handle({ kind: "click", hit: { kind: "slot", index: own } });
    expect(current.state).toBe("markerSelected");
  });

  it("ignores a marker belonging to another player", () => {
    const current = controller();
    driveSetup(current);
    const other = current.view().players[1]!.markerSlots[0]!;
    current.handle({ kind: "click", hit: { kind: "slot", index: other } });
    expect(current.state).toBe("idle");
  });

  it("moves to a reachable destination and returns to idle", () => {
    const current = controller();
    driveSetup(current);
    const own = current.view().players[0]!.markerSlots[0]!;
    current.handle({ kind: "click", hit: { kind: "slot", index: own } });
    const destination = current.markerDestinations[0]!;
    current.handle({ kind: "click", hit: { kind: "slot", index: destination.slot } });
    expect(current.state).toBe("idle");
    expect(current.view().actionsLeft).toBe(1);
    expect(current.view().ring[destination.slot]!.occupant).not.toBeNull();
  });
});

describe("undo, escape and commit", () => {
  it("escape clears a selection", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "escape" });
    expect(current.state).toBe("idle");
    expect(current.selectedPile).toBeNull();
  });

  it("undo removes the last tentative action", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    expect(current.view().actionsLeft).toBe(1);
    current.handle({ kind: "undo" });
    expect(current.view().actionsLeft).toBe(2);
    expect(current.view().cells[2]![2]!.height).toBe(0);
  });

  it("refuses to commit before both actions are spent", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "commit" });
    expect(current.lastRejection).not.toBeNull();
    expect(current.view().currentPlayer).toBe(0);
  });

  it("commits a full turn, logs it and advances the player", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    current.handle({ kind: "selectPile", pileIndex: 1 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 4 } });
    current.handle({ kind: "commit" });
    expect(current.state).toBe("idle");
    expect(current.view().currentPlayer).toBe(1);
    expect(current.view().actionsLeft).toBe(2);
    expect(current.log.length).toBe(1);
    expect(current.log[0]!.player).toBe(0);
  });

  it("un-spends a pile after undo", () => {
    const current = controller();
    driveSetup(current);
    current.handle({ kind: "selectPile", pileIndex: 0 });
    current.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    current.handle({ kind: "undo" });
    current.handle({ kind: "selectPile", pileIndex: 0 });
    expect(current.state).toBe("tileSelected");
  });
});
