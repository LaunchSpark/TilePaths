import { config } from "@passtally/rules";
import type { Game, Move } from "@passtally/rules";
import type { LocalSession } from "./session.js";
import type { GameView } from "./types.js";
import { buildView } from "./view.js";

export class Tentative {
  private readonly session: LocalSession;
  private pending: Move[] = [];

  constructor(session: LocalSession) {
    this.session = session;
  }

  get moves(): readonly Move[] {
    return this.pending;
  }

  actionsLeft(): number {
    return this.session.game.actionsLeft - this.pending.length;
  }

  isSpent(pileIndex: number): boolean {
    return this.pending.some((move) => move.kind === "place" && move.pileIndex === pileIndex);
  }

  add(move: Move): void {
    if (this.actionsLeft() <= 0) throw new Error("no actions left this turn");
    if (move.kind === "place" && this.isSpent(move.pileIndex)) {
      throw new Error(`pile ${move.pileIndex} is already spent this turn`);
    }
    this.overlayGame().apply(move);
    this.pending.push(move);
  }

  undo(): void {
    this.pending.pop();
  }

  clear(): void {
    this.pending = [];
  }

  overlayGame(): Game {
    const clone = this.session.game.clone();
    for (const move of this.pending) clone.apply(move);
    return clone;
  }

  view(): GameView {
    return buildView(this.session.game, {
      board: this.overlayGame().board,
      actionsLeft: this.actionsLeft(),
    });
  }

  isComplete(): boolean {
    return this.actionsLeft() === 0 && this.pending.length === config.ACTIONS_PER_TURN;
  }
}
