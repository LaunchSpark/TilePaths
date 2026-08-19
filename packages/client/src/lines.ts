import { tracePath } from "@passtally/rules";
import type { Board, PathStep } from "@passtally/rules";
import type { GameView } from "./types.js";

export type LineView = {
  owner: number;
  slots: [number, number];
  passes: number;
  steps: PathStep[];
};

/** Completed lines for the given players, deduped by unordered slot pair --
 *  the same rule scoreLines uses. */
export function linesFor(board: Board, view: GameView, players: number[]): LineView[] {
  const lines = new Map<string, LineView>();
  for (const owner of players) {
    const owned = new Set(view.players[owner]?.markerSlots ?? []);
    for (const slot of owned) {
      const path = tracePath(board, slot);
      if (typeof path.endpoint !== "number" || !owned.has(path.endpoint)) continue;
      const lo = Math.min(slot, path.endpoint);
      const hi = Math.max(slot, path.endpoint);
      const key = `${owner}:${lo}-${hi}`;
      if (!lines.has(key)) {
        lines.set(key, { owner, slots: [lo, hi], passes: path.passes, steps: path.steps });
      }
    }
  }
  return [...lines.values()];
}
