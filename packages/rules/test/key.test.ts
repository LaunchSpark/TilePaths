import { describe, expect, it } from "vitest";
import { at } from "../src/board.js";
import { Game } from "../src/game.js";
import { placeTile } from "../src/placement.js";
import { canon } from "../src/tileTypes.js";
import type { Move } from "../src/types.js";

function setup(seed = 1, boardSize = 6): Game {
  const g = Game.newGame(2, seed, boardSize);
  for (let p = 0; p < 2; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}
const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });

describe("key", () => {
  it("matches for a clone", () => {
    const g = setup();
    expect(g.clone().key()).toBe(g.key());
  });

  it("is independent after cloning", () => {
    const g = setup();
    const twin = g.clone();
    twin.apply(place(0, [2, 2], [3, 2], 0));
    expect(at(g.board, [2, 2]).height).toBe(0);
    expect(at(twin.board, [2, 2]).height).toBe(1);
    expect(twin.key()).not.toBe(g.key());
  });

  it("collapses move-order permutations", () => {
    const a = setup();
    a.apply(place(0, [2, 2], [3, 2], 0));
    a.apply(place(1, [2, 4], [3, 4], 0));
    const b = setup();
    b.apply(place(1, [2, 4], [3, 4], 0));
    b.apply(place(0, [2, 2], [3, 2], 0));
    expect(a.key()).toBe(b.key());
  });

  it("distinguishes placement grouping", () => {
    const horizontal = Game.newGame(2, 1, 4);
    placeTile(horizontal.board, [0, 0], [0, 1], 2, 3);
    placeTile(horizontal.board, [1, 0], [1, 1], 2, 3);

    const vertical = Game.newGame(2, 1, 4);
    placeTile(vertical.board, [0, 0], [1, 0], 2, 0);
    placeTile(vertical.board, [0, 1], [1, 1], 2, 0);

    for (const row of [0, 1]) {
      for (const col of [0, 1]) {
        const l = at(horizontal.board, [row, col]), r = at(vertical.board, [row, col]);
        expect(l.height).toBe(1);
        expect(r.height).toBe(1);
        expect(canon(l.conns)).toBe(canon(r.conns));
      }
    }
    expect(horizontal.key()).not.toBe(vertical.key());
  });

  it("ignores raw placement ids", () => {
    const forward = Game.newGame(2, 1, 4);
    placeTile(forward.board, [0, 0], [1, 0], 2, 0);
    placeTile(forward.board, [0, 2], [1, 2], 2, 0);

    const backward = Game.newGame(2, 1, 4);
    placeTile(backward.board, [0, 2], [1, 2], 2, 0);
    placeTile(backward.board, [0, 0], [1, 0], 2, 0);

    expect(forward.key()).toBe(backward.key());
  });
});

describe("key encodes every component", () => {
  /** Two placements in, so the board isn't the trivially-empty starting
   *  position while we probe what the key does and doesn't capture. */
  function midGame(): Game {
    const g = setup();
    g.apply(place(0, [2, 2], [3, 2], 0));
    g.apply(place(0, [2, 3], [3, 3], 0));
    return g;
  }

  const cases: Array<[string, (g: Game) => void]> = [
    ["a marker moved to a different slot", (g) => {
      const entry = g.players[0]!;
      const current = entry.markerSlots[0]!;
      const empty = g.board.ring.findIndex((s, i) => i !== current && s.occupant === null);
      entry.markerSlots[0] = empty;
    }],
    ["a player's score bumped", (g) => {
      g.players[0]!.score += 1;
    }],
    ["currentPlayer advanced", (g) => {
      g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
    }],
    ["actionsLeft decremented", (g) => {
      g.actionsLeft -= 1;
    }],
    ["finalRound set true", (g) => {
      g.finalRound = true;
    }],
    ["over set true", (g) => {
      g.over = true;
    }],
    ["a pile's faceUp changed", (g) => {
      const pile = g.piles[0]!;
      pile.faceUp = pile.faceUp === 1 ? 2 : 1;
    }],
    ["a cell's height changed", (g) => {
      const cell = g.board.cells[0]![0]!;
      cell.height += 1;
    }],
  ];

  it.each(cases)("distinguishes: %s", (_label, mutate) => {
    const g = midGame();
    const baseline = g.key();
    const clone = g.clone();
    mutate(clone);
    expect(clone.key()).not.toBe(baseline);
  });
});
