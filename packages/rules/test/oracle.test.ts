import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKERS_PER_PLAYER, N_PILES } from "../src/config.js";
import { digest } from "../src/digest.js";
import { Game } from "../src/game.js";
import type { Move, TypeId } from "../src/types.js";

type Fixture = {
  nPlayers: number;
  boardSize: number;
  deal: [TypeId | null, TypeId[]][];
  setup: [number, number][];
  steps: { move: Move | null; digest: string }[];
};

// The package is ESM, so there is no __dirname.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oracle");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("differential oracle", () => {
  it("has fixtures", () => expect(FILES.length).toBeGreaterThan(0));

  it.each(FILES)("%s replays identically", (file) => {
    const fx: Fixture = JSON.parse(readFileSync(join(DIR, file), "utf-8"));

    // Guard against a truncated/corrupted fixture passing vacuously: if
    // `steps` were ever [], the replay loop below would iterate zero times,
    // `expect` would never run, and vitest would report this test as passed
    // having verified nothing. Assert the fixture is substantive before the
    // replay so a hollow fixture fails loudly instead of passing silently.
    expect(fx.steps.length, `${file} has no steps`).toBeGreaterThan(0);
    expect(fx.setup.length, `${file} has a truncated setup`).toBe(fx.nPlayers * MARKERS_PER_PLAYER);
    expect(fx.deal.length, `${file} has a truncated deal`).toBe(N_PILES);

    // Seeds do not port (T5), so install the recorded deal directly.
    const game = Game.newGame(fx.nPlayers, 0, fx.boardSize);
    fx.deal.forEach(([faceUp, ordered], i) => {
      game.piles[i]!.faceUp = faceUp;
      game.piles[i]!.ordered = [...ordered];
    });

    for (const [player, slot] of fx.setup) game.setupPlaceMarker(player, slot);

    fx.steps.forEach((stepData, index) => {
      if (stepData.move !== null) game.apply(stepData.move);
      expect(digest(game), `${file} diverged at step ${index}`).toBe(stepData.digest);
    });
  });
});

describe("smoke", () => {
  it.each([2, 3])("plays a full %i-player game to completion", (nPlayers) => {
    const g = Game.newGame(nPlayers, 12345, 6);
    let order: number[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const seq = pass % 2 === 0
        ? [...Array(nPlayers).keys()]
        : [...Array(nPlayers).keys()].reverse();
      order = order.concat(seq);
    }
    for (const player of order) {
      const free = g.board.ring
        .map((s, i) => (s.occupant === null ? i : -1))
        .filter((i) => i >= 0)
        .filter((i) => !g.players[player]!.markerSlots
          .some((e) => Math.floor(e / g.board.n) === Math.floor(i / g.board.n)));
      g.setupPlaceMarker(player, free[0]!);
    }
    expect(g.isSetupComplete()).toBe(true);

    let guard = 0;
    while (!g.isOver() && guard++ < 2000) {
      const moves = g.legalMoves();
      if (moves.length === 0) break;
      g.apply(moves[guard % moves.length]!);
    }
    expect(g.isOver()).toBe(true);
    // The end-of-game trigger (mirrored from passtally/game.py's
    // _trigger_fired) is "all piles empty OR no legal place move remains" --
    // not "all piles empty". A full board can end the game with face-up
    // tiles still stranded on piles, so assert the actual invariant instead.
    const noPlacesLeft = g.piles.every((p) => p.faceUp === null)
      || !g.legalMoves().some((m) => m.kind === "place");
    expect(noPlacesLeft).toBe(true);
  });
});
