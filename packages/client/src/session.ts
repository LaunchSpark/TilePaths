import { config, placeTile, scoreLines } from "@passtally/rules";
import type { Game, Move } from "@passtally/rules";
import type { GameView, TurnResult } from "./types.js";
import { buildView, nextSetupPlayer } from "./view.js";

export interface Session {
  getView(): GameView;
  placeSetupMarker(player: number, slot: number): void;
  commit(moves: Move[]): TurnResult;
}

export class LocalSession implements Session {
  private committed: Game;

  constructor(game: Game) {
    this.committed = game;
  }

  get game(): Game {
    return this.committed;
  }

  getView(): GameView {
    return buildView(this.committed);
  }

  placeSetupMarker(player: number, slot: number): void {
    const expected = nextSetupPlayer(this.committed);
    if (expected === null) throw new Error("setup is already complete");
    if (player !== expected) {
      throw new Error(`it is not player ${player}'s turn to place -- expected ${expected}`);
    }
    this.committed.setupPlaceMarker(player, slot);
  }

  commit(moves: Move[]): TurnResult {
    const need = this.committed.actionsLeft;
    if (moves.length !== need) {
      throw new Error(`a turn needs exactly ${need} moves, got ${moves.length}`);
    }
    const actor = this.committed.currentPlayer;
    const before = this.committed.players[actor]!.score;

    const trial = this.committed.clone();
    for (const move of moves) trial.apply(move);

    const lines = [...scoreLines(trial.board, trial.players[actor]!.markerSlots)]
      .map(([key, passes]) => {
        const [lo, hi] = key.split("-").map(Number);
        return { slots: [lo!, hi!] as [number, number], passes };
      });

    this.committed = trial;
    return {
      player: actor,
      lines,
      totalPasses: lines.reduce((sum, line) => sum + line.passes, 0),
      vpAwarded: trial.players[actor]!.score - before,
    };
  }

  legalTurns(): Move[] | null {
    const trial = this.committed.clone();
    const picked: Move[] = [];
    for (let i = 0; i < config.ACTIONS_PER_TURN; i++) {
      const move = trial.legalMoves()[0];
      if (move === undefined) return null;
      trial.apply(move);
      picked.push(move);
    }
    return picked;
  }

  dropCrossTileForTest(col: number): void {
    placeTile(this.committed.board, [0, col], [1, col], 2, 0);
  }
}
