import { describe, expect, it } from "vitest";
import { slotIndexOf } from "../src/board.js";
import { COPIES_PER_TYPE } from "../src/config.js";
import { Game } from "../src/game.js";
import { placeTile } from "../src/placement.js";
import { Side } from "../src/types.js";
import type { Move } from "../src/types.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

describe("construction", () => {
  it("deals three piles of fourteen", () => {
    const g = Game.newGame(2, 7);
    expect(g.piles.length).toBe(3);
    for (const p of g.piles) {
      expect(p.ordered.length).toBe(13);
      expect(p.faceUp).not.toBeNull();
    }
  });

  it("uses every tile exactly seven times", () => {
    const g = Game.newGame(2, 7);
    const dealt = g.piles.flatMap((p) => [...p.ordered, p.faceUp!]);
    expect(dealt.length).toBe(42);
    for (const t of [1, 2, 3, 4, 5, 6]) {
      expect(dealt.filter((x) => x === t).length).toBe(COPIES_PER_TYPE);
    }
  });

  it("deals the same game for the same seed", () => {
    expect(Game.newGame(2, 42).piles.map((p) => p.ordered))
      .toEqual(Game.newGame(2, 42).piles.map((p) => p.ordered));
  });

  it("deals differently for different seeds", () => {
    expect(Game.newGame(2, 1).piles.map((p) => p.ordered))
      .not.toEqual(Game.newGame(2, 2).piles.map((p) => p.ordered));
  });

  it("rejects bad player counts", () => {
    for (const n of [0, 1, 4]) expect(() => Game.newGame(n)).toThrow();
  });

  it("rejects a non-integer player count", () => {
    expect(() => Game.newGame(2.5)).toThrow();
  });

  it("rejects NaN as a player count", () => {
    expect(() => Game.newGame(NaN)).toThrow();
  });
});

describe("setup", () => {
  it("records markers and occupants", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(g.players[0]!.markerSlots).toEqual([0]);
    expect(g.board.ring[0]!.occupant).toBe(0);
  });

  it("rejects an occupied slot", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.setupPlaceMarker(1, 0)).toThrow();
  });

  it("rejects a second marker on the same edge", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.setupPlaceMarker(0, 1)).toThrow();
  });

  it("rejects a fifth marker", () => {
    expect(() => setup().setupPlaceMarker(0, 30)).toThrow();
  });

  it("rejects a negative player index", () => {
    expect(() => Game.newGame(2, 1, 6).setupPlaceMarker(-1, 3)).toThrow();
  });

  it("reports completeness", () => {
    const g = Game.newGame(2, 1, 6);
    expect(g.isSetupComplete()).toBe(false);
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(0, edge * 6);
    expect(g.isSetupComplete()).toBe(false);   // player 1 still has none
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(1, edge * 6 + 1);
    expect(g.isSetupComplete()).toBe(true);
  });

  it("refuses play before setup is complete", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.apply(marker(0, 1))).toThrow();
  });

  it("refuses setup once play has begun", () => {
    expect(() => setup().setupPlaceMarker(0, 30)).toThrow();
  });
});

describe("turns", () => {
  it("is two actions", () => {
    const g = setup();
    expect(g.actionsLeft).toBe(2);
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(g.actionsLeft).toBe(1);
    expect(g.currentPlayer).toBe(0);
    g.apply(place(0, [2, 3], [3, 3], 0));
    expect(g.actionsLeft).toBe(2);
    expect(g.currentPlayer).toBe(1);
  });

  it("advances the pile on a placement", () => {
    const g = setup();
    const pile = g.piles[0]!;
    const nextUp = pile.ordered[pile.ordered.length - 1]!;
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(pile.faceUp).toBe(nextUp);
    expect(pile.ordered.length).toBe(12);
  });

  it("rejects an illegal placement", () => {
    const g = setup();
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(() => g.apply(place(0, [2, 2], [3, 2], 0))).toThrow();
  });

  it("rejects a cell pair contradicting the orientation", () => {
    expect(() => setup().apply(place(0, [2, 2], [2, 3], 0))).toThrow();
  });

  it("rejects a negative pile index", () => {
    expect(() => setup().apply(place(-1, [2, 2], [3, 2], 0))).toThrow();
  });

  it("rejects an out-of-range pile index", () => {
    const g = setup();
    expect(() => g.apply(place(g.piles.length, [2, 2], [3, 2], 0))).toThrow();
  });

  it("rejects an out-of-range orientation", () => {
    expect(() => setup().apply(place(0, [2, 2], [3, 2], 7))).toThrow();
  });

  it("rejects an illegal marker distance", () => {
    expect(() => setup().apply(marker(0, 3))).toThrow();
  });

  it("rejects a non-integer marker index", () => {
    expect(() => setup().apply(marker(1.5, 1))).toThrow();
  });

  it("moves a marker and preserves its id", () => {
    const g = setup(2, 1, 6);
    const start = g.players[0]!.markerSlots[0]!;
    const id = g.board.ring[start]!.occupant;
    g.apply(marker(0, 1));
    const moved = g.players[0]!.markerSlots[0]!;
    expect(moved).not.toBe(start);
    expect(g.board.ring[start]!.occupant).toBeNull();
    expect(g.board.ring[moved]!.occupant).toBe(id);
  });
});

describe("scoring and end", () => {
  /** A 3x3 board (ring of 12) where BOTH players hold a scoring line.
   *
   *  Three vertical tile-2 (X/X) placements fill rows 0-1. X routes W<->E, so
   *  row 0 carries a line from slot 11 to slot 3, and row 1 from slot 10 to
   *  slot 4 -- both 3 passes, which falls in the 2-3 band for 2 VP.
   *
   *  Player 0 takes edges 3,1,0,2 as slots 11,3,1,6 (marker 0 is slot 11).
   *  Player 1 takes edges 0,1,2,3 as slots  0,4,7,10.
   *  Every player holds one marker per edge and no slot is shared. */
  function scoringBoard(): Game {
    const g = Game.newGame(2, 1, 3);
    for (const slot of [11, 3, 1, 6]) g.setupPlaceMarker(0, slot);
    for (const slot of [0, 4, 7, 10]) g.setupPlaceMarker(1, slot);
    for (let col = 0; col < 3; col++) placeTile(g.board, [0, col], [1, col], 2, 0);
    return g;
  }

  it("puts the expected lines on the scoring board", () => {
    const g = scoringBoard();
    expect(g.players[0]!.markerSlots[0]).toBe(slotIndexOf(3, 0, 0, Side.W));
    expect(g.players[0]!.markerSlots[1]).toBe(slotIndexOf(3, 0, 2, Side.E));
    expect(g.players[1]!.markerSlots[3]).toBe(slotIndexOf(3, 1, 0, Side.W));
    expect(g.players[1]!.markerSlots[1]).toBe(slotIndexOf(3, 1, 2, Side.E));
  });

  it("awards score once, at end of turn", () => {
    const g = scoringBoard();
    expect(g.players[0]!.score).toBe(0);
    g.apply(marker(0, 1));                 // 11 -> 2 (0 and 1 are occupied)
    expect(g.players[0]!.score).toBe(0);   // mid-turn, not scored yet
    g.apply(marker(0, -1));                // 2 -> 11, back where it started
    expect(g.players[0]!.score).toBe(2);   // 3 passes falls in the 2-3 band
  });

  /** Player 1 holds a genuine 2 VP line here, so a mutant awarding score to
   *  every player would give them 2 on player 0's turn. A board where player 1
   *  scores nothing would pass either way -- do not "simplify" this. */
  it("scores only the current player", () => {
    const g = scoringBoard();
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));
    expect(g.players[0]!.score).toBe(2);
    expect(g.players[1]!.score).toBe(0);
  });

  it("scores player 1 on player 1's own turn", () => {
    const g = scoringBoard();
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));   // player 0's turn ends
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));   // player 1's turn ends
    expect(g.players[1]!.score).toBe(2);
  });

  /** Unequal scores while `over` is still false: the tie branch cannot be
   *  what produces `null` here, so only the `!this.over` guard can. A fresh
   *  `setup()` has both players at score 0, which would tie regardless of
   *  the guard -- that version of this test passed without exercising it. */
  it("has no winner before the end", () => {
    const g = setup();
    g.players[0]!.score = 5;
    expect(g.isOver()).toBe(false);
    expect(g.winner()).toBeNull();
  });

  it("winner is the high scorer", () => {
    const g = setup();
    g.players[0]!.score = 10;
    g.players[1]!.score = 4;
    g.over = true;
    expect(g.winner()).toBe(0);
  });

  it("a tie has no winner", () => {
    const g = setup();
    g.players[0]!.score = 5;
    g.players[1]!.score = 5;
    g.over = true;
    expect(g.winner()).toBeNull();
  });

  /** Not in the Python suite, but the tie logic warrants it: two players tied
   *  for the lead above a third must still yield no winner -- distinguishing
   *  "exactly one leader" from ">= 2 leaders" rather than just "all equal". */
  it("three players, two tied for the lead, has no winner", () => {
    const g = setup(3);
    g.players[0]!.score = 10;
    g.players[1]!.score = 10;
    g.players[2]!.score = 3;
    g.over = true;
    expect(g.winner()).toBeNull();
  });

  it("triggers the final round when the piles empty", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(g.isOver()).toBe(false);   // player 1 still gets a turn
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(g.isOver()).toBe(true);
  });

  /** The two trigger clauses mask each other: the only test above empties the
   *  piles, which satisfies BOTH at once, so deleting either one leaves the
   *  suite green. These two cover them separately. Ported from the Python
   *  suite, where the engine's final review added them for this reason. */
  it("fires the trigger when piles are exhausted with board room to spare", () => {
    const g = setup(2, 1, 6);
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    expect(g.triggerFired()).toBe(true);
  });

  /** A 3x3 board tiled so every remaining orthogonal pair is either
   *  height-mismatched or shares a placement id, while a pile still holds a
   *  face-up tile. Only the "no legal placement" branch can fire here.
   *
   *      (0,0)=1/A  (0,1)=0/.   (0,2)=1/B
   *      (1,0)=2/D  (1,1)=2/D   (1,2)=1/B
   *      (2,0)=0/.  (2,1)=1/C   (2,2)=0/.
   *
   *  A and C support D's stack; B straddles its own two cells; the three
   *  empty cells are pairwise non-adjacent, so no empty pair opens up either. */
  it("fires the trigger when no footprint fits though a pile remains", () => {
    const g = Game.newGame(2, 1, 3);
    placeTile(g.board, [0, 0], [1, 0], 2, 0);   // A
    placeTile(g.board, [0, 2], [1, 2], 2, 0);   // B
    placeTile(g.board, [1, 1], [2, 1], 2, 0);   // C
    placeTile(g.board, [1, 0], [1, 1], 2, 3);   // D, stacked on A/C

    expect(g.legalMoves().some((m) => m.kind === "place")).toBe(false);
    expect(g.piles.some((p) => p.faceUp !== null)).toBe(true);
    expect(g.triggerFired()).toBe(true);
  });

  it("gives three players a two-turn tail", () => {
    const g = setup(3);
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P1
    expect(g.isOver()).toBe(false);
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P2
    expect(g.isOver()).toBe(false);
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P3
    expect(g.isOver()).toBe(true);
  });

  it("rejects a move after the game ends", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(() => g.apply(marker(0, 1))).toThrow();
  });
});

describe("clone", () => {
  /** Two placements in, so board, piles and turn state have all moved past
   *  their initial values. */
  function midGame(): Game {
    const g = setup();
    g.apply(place(0, [2, 2], [3, 2], 0));
    g.apply(place(0, [2, 3], [3, 3], 0));
    return g;
  }

  it("gives every mutable component its own identity", () => {
    const g = midGame();
    const c = g.clone();

    expect(c.board.ring).not.toBe(g.board.ring);
    g.board.ring.forEach((_, i) => {
      expect(c.board.ring[i]).not.toBe(g.board.ring[i]);
    });

    expect(c.players).not.toBe(g.players);
    g.players.forEach((_, i) => {
      expect(c.players[i]).not.toBe(g.players[i]);
      expect(c.players[i]!.markerSlots).not.toBe(g.players[i]!.markerSlots);
    });

    g.piles.forEach((_, i) => {
      expect(c.piles[i]).not.toBe(g.piles[i]);
      expect(c.piles[i]!.ordered).not.toBe(g.piles[i]!.ordered);
    });

    for (let row = 0; row < g.board.n; row++) {
      for (let col = 0; col < g.board.n; col++) {
        expect(c.board.cells[row]![col]).not.toBe(g.board.cells[row]![col]);
        expect(c.board.cells[row]![col]!.conns).not.toBe(g.board.cells[row]![col]!.conns);
      }
    }

    // `Ring` is immutable, so clone() deliberately shares it instead of copying.
    expect(c.board.nav).toBe(g.board.nav);
  });

  it("leaves the origin untouched when a marker move is applied to the clone", () => {
    const g = midGame();
    const c = g.clone();

    const originKey = g.key();
    const ringSnapshot = g.board.ring.map((s) => s.occupant);
    const markerSnapshot = g.players.map((p) => [...p.markerSlots]);

    c.apply(marker(0, 1));

    expect(g.key()).toBe(originKey);
    expect(g.board.ring.map((s) => s.occupant)).toEqual(ringSnapshot);
    expect(g.players.map((p) => [...p.markerSlots])).toEqual(markerSnapshot);
  });

  it("round-trips turn state and per-player scores", () => {
    const g = midGame();
    g.currentPlayer = 1;
    g.actionsLeft = 1;
    g.firstPlayer = 1;
    g.finalRound = true;
    g.over = true;
    g.players[0]!.score = 7;
    g.players[1]!.score = 3;

    const c = g.clone();

    expect(c.currentPlayer).toBe(g.currentPlayer);
    expect(c.actionsLeft).toBe(g.actionsLeft);
    expect(c.firstPlayer).toBe(g.firstPlayer);
    expect(c.finalRound).toBe(g.finalRound);
    expect(c.over).toBe(g.over);
    expect(c.board.nextPlacementId).toBe(g.board.nextPlacementId);
    c.players.forEach((p, i) => expect(p.score).toBe(g.players[i]!.score));
  });
});
