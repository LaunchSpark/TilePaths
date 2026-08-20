import { offsetOf } from "@passtally/rules";
import type { Game, Move, Pos } from "@passtally/rules";
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

  get placements(): readonly Extract<Move, { kind: "place" }>[] {
    return this.pending.filter(
      (move): move is Extract<Move, { kind: "place" }> => move.kind === "place",
    );
  }

  placementsExcept(index: number | null): readonly Extract<Move, { kind: "place" }>[] {
    return this.pending.filter(
      (move, moveIndex): move is Extract<Move, { kind: "place" }> =>
        move.kind === "place" && moveIndex !== index,
    );
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

  placementAt(pos: Pos): { index: number; move: Extract<Move, { kind: "place" }> } | null {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const move = this.pending[index]!;
      if (move.kind !== "place") continue;
      const [dr, dc] = offsetOf(move.orientation);
      const onA = move.cellA[0] === pos[0] && move.cellA[1] === pos[1];
      const onB = move.cellA[0] + dr === pos[0] && move.cellA[1] + dc === pos[1];
      if (onA || onB) return { index, move };
    }
    return null;
  }

  replace(index: number, move: Move): void {
    if (index < 0 || index >= this.pending.length) throw new Error("no pending move to replace");
    const next = [...this.pending];
    next[index] = move;
    const trial = this.session.game.clone();
    for (const pending of next) trial.apply(pending);
    this.pending = next;
  }

  /** Remove one tentative action while preserving the validity of everything
   * else in the turn. Used when a pending tile is returned to its pile. */
  remove(index: number): void {
    if (index < 0 || index >= this.pending.length) throw new Error("no pending move to remove");
    const next = this.pending.filter((_, moveIndex) => moveIndex !== index);
    const trial = this.session.game.clone();
    for (const pending of next) trial.apply(pending);
    this.pending = next;
  }

  undo(): void {
    this.pending.pop();
  }

  clear(): void {
    this.pending = [];
  }

  overlayGame(excludeIndex: number | null = null): Game {
    const clone = this.session.game.clone();
    for (let index = 0; index < this.pending.length; index++) {
      if (index === excludeIndex) continue;
      try {
        clone.apply(this.pending[index]!);
      } catch (error) {
        // A later tentative move may depend on the placement currently being
        // dragged. Hide that dependent move until the edited sequence is
        // validated as a whole on drop.
        if (excludeIndex === null) throw error;
      }
    }
    return clone;
  }

  view(excludeIndex: number | null = null): GameView {
    return buildView(this.session.game, {
      board: this.overlayGame(excludeIndex).board,
      actionsLeft: this.actionsLeft(),
    });
  }
}
