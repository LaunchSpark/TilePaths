import { canPlace, offsetOf, placeTile, tracePath } from "@passtally/rules";
import type { Board, Pos, TracedPath, TypeId } from "@passtally/rules";
import type { Tentative } from "./tentative.js";
import type { GameView } from "./types.js";

export type GhostPlacement = {
  anchor: Pos;
  typeId: TypeId;
  orientation: number;
};

export type PathHighlightRequest = {
  hoveredSlot: number | null;
  ghost: GhostPlacement | null;
};

/** Compact signature of only the state that can change highlighted routes.
 * Scores, selection state, pile counts, and pointer pixels are deliberately
 * excluded. */
export function pathTopologyKey(view: GameView): string {
  const cells = view.cells.map((row) => row.map((cell) =>
    cell.conns === null
      ? "x"
      : cell.conns.map(([a, b]) => `${a}${b}`).join(""),
  ).join(",")).join(";");
  const occupiedSlots = view.ring.map((slot) => slot.occupant === null ? "0" : "1").join("");
  return `${view.n}|${cells}|${occupiedSlots}`;
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** The tentative board, optionally with a hypothetical tile placed on it.
 *
 *  Clones rather than mutating, and uses the rules package's own placeTile --
 *  the client models no placement of its own. */
export function hypotheticalBoard(
  tentative: Tentative, ghost: GhostPlacement | null,
): Board {
  const game = tentative.overlayGame();
  if (ghost !== null) {
    const [dr, dc] = offsetOf(ghost.orientation);
    const cellB: Pos = [ghost.anchor[0] + dr, ghost.anchor[1] + dc];
    if (canPlace(game.board, ghost.anchor, cellB)) {
      placeTile(game.board, ghost.anchor, cellB, ghost.typeId, ghost.orientation);
    }
  }
  return game.board;
}

function touchesGhost(path: TracedPath, ghost: GhostPlacement): boolean {
  const [dr, dc] = offsetOf(ghost.orientation);
  const cells = new Set([
    cellKey(ghost.anchor[0], ghost.anchor[1]),
    cellKey(ghost.anchor[0] + dr, ghost.anchor[1] + dc),
  ]);
  return path.steps.some(({ row, col }) => cells.has(cellKey(row, col)));
}

/** Resolve all path previews for the current interaction. A hovered token adds
 * its route. A ghost adds occupied-token routes changed by its two cells. */
export function highlightedPaths(
  tentative: Tentative,
  request: PathHighlightRequest,
): TracedPath[] {
  const board = hypotheticalBoard(tentative, request.ghost);
  const paths: TracedPath[] = [];
  const tracedSlots = new Set<number>();
  const add = (slot: number, requireGhost: boolean): void => {
    if (tracedSlots.has(slot)) return;
    const path = tracePath(board, slot);
    if (requireGhost && (request.ghost === null || !touchesGhost(path, request.ghost))) return;
    tracedSlots.add(slot);
    paths.push(path);
  };

  if (request.hoveredSlot !== null && board.ring[request.hoveredSlot]?.occupant !== null) {
    add(request.hoveredSlot, false);
  }
  if (request.ghost !== null) {
    board.ring.forEach((slot, index) => {
      if (slot.occupant !== null) add(index, true);
    });
  }
  return paths;
}

/** One-entry semantic cache. Pointer movement within the same cell/triangle
 * reuses the prior result instead of retracing every occupied token. */
export class PathHighlightCache {
  private key: string | null = null;
  private value: TracedPath[] = [];

  get(
    tentative: Tentative,
    request: PathHighlightRequest,
    boardRevision: number,
  ): readonly TracedPath[] {
    const ghost = request.ghost;
    const key = ghost === null
      ? `${boardRevision}:${request.hoveredSlot ?? "-"}:-`
      : `${boardRevision}:${request.hoveredSlot ?? "-"}:${ghost.anchor[0]},${ghost.anchor[1]},${ghost.typeId},${ghost.orientation}`;
    if (key !== this.key) {
      this.key = key;
      this.value = highlightedPaths(tentative, request);
    }
    return this.value;
  }
}
