import { offsetOf, opposite, resolve, slotIndexOf, step } from "@passtally/rules";
import type { Pos, Side, TypeId } from "@passtally/rules";
import type { GameView } from "./types.js";

export type PathSegment = {
  row: number;
  col: number;
  entry: Side;
  exit: Side;
};

export type HighlightedPath = {
  startSlot: number;
  endSlot: number | null;
  segments: PathSegment[];
};

export type GhostPlacement = {
  anchor: Pos;
  typeId: TypeId;
  orientation: number;
};

export type PathHighlightRequest = {
  hoveredSlot: number | null;
  ghost: GhostPlacement | null;
};

type ConnectionMap = Map<string, [Side, Side][]>;

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

function inBounds(view: GameView, [row, col]: Pos): boolean {
  return row >= 0 && col >= 0 && row < view.n && col < view.n;
}

function ghostConnections(view: GameView, ghost: GhostPlacement | null): ConnectionMap | null {
  if (ghost === null) return null;
  const [dr, dc] = offsetOf(ghost.orientation);
  const cellB: Pos = [ghost.anchor[0] + dr, ghost.anchor[1] + dc];
  if (!inBounds(view, ghost.anchor) || !inBounds(view, cellB)) return null;

  const [a, b] = resolve(ghost.typeId, ghost.orientation);
  return new Map([
    [cellKey(ghost.anchor[0], ghost.anchor[1]), a],
    [cellKey(cellB[0], cellB[1]), b],
  ]);
}

function exitFor(
  view: GameView,
  row: number,
  col: number,
  entry: Side,
  ghost: ConnectionMap | null,
): Side | null {
  const conns = ghost?.get(cellKey(row, col)) ?? view.cells[row]![col]!.conns;
  if (conns === null) return opposite(entry);
  for (const [a, b] of conns) {
    if (a === entry) return b;
    if (b === entry) return a;
  }
  return null;
}

/** Trace renderable path segments from a ring slot through a view. Supplying
 * a ghost swaps its two cells into the trace without mutating game state. */
export function traceViewPath(
  view: GameView,
  startSlot: number,
  ghostPlacement: GhostPlacement | null = null,
): HighlightedPath {
  const slot = view.ring[startSlot];
  if (slot === undefined) return { startSlot, endSlot: null, segments: [] };

  const ghost = ghostConnections(view, ghostPlacement);
  let row = slot.row;
  let col = slot.col;
  let entry = slot.side;
  const segments: PathSegment[] = [];
  const seen = new Set<string>();

  for (;;) {
    const stateKey = `${row},${col},${entry}`;
    if (seen.has(stateKey)) return { startSlot, endSlot: null, segments };
    seen.add(stateKey);

    const exit = exitFor(view, row, col, entry, ghost);
    if (exit === null) return { startSlot, endSlot: null, segments };
    segments.push({ row, col, entry, exit });

    const [nextRow, nextCol] = step([row, col], exit);
    if (!inBounds(view, [nextRow, nextCol])) {
      return {
        startSlot,
        endSlot: slotIndexOf(view.n, row, col, exit),
        segments,
      };
    }
    row = nextRow;
    col = nextCol;
    entry = opposite(exit);
  }
}

function touchesGhost(path: HighlightedPath, ghost: GhostPlacement): boolean {
  const [dr, dc] = offsetOf(ghost.orientation);
  const cells = new Set([
    cellKey(ghost.anchor[0], ghost.anchor[1]),
    cellKey(ghost.anchor[0] + dr, ghost.anchor[1] + dc),
  ]);
  return path.segments.some(({ row, col }) => cells.has(cellKey(row, col)));
}

/** Resolve all path previews for the current interaction. A hovered token adds
 * its route. A ghost adds occupied-token routes changed by its two cells. */
export function highlightedPaths(
  view: GameView,
  request: PathHighlightRequest,
): HighlightedPath[] {
  const paths: HighlightedPath[] = [];
  const tracedSlots = new Set<number>();
  const add = (slot: number, requireGhost: boolean): void => {
    if (tracedSlots.has(slot)) return;
    const path = traceViewPath(view, slot, request.ghost);
    if (requireGhost && (request.ghost === null || !touchesGhost(path, request.ghost))) return;
    tracedSlots.add(slot);
    paths.push(path);
  };

  if (request.hoveredSlot !== null && view.ring[request.hoveredSlot]?.occupant !== null) {
    add(request.hoveredSlot, false);
  }
  if (request.ghost !== null && ghostConnections(view, request.ghost) !== null) {
    view.ring.forEach((slot, index) => {
      if (slot.occupant !== null) add(index, true);
    });
  }
  return paths;
}

/** One-entry semantic cache. Pointer movement within the same cell/triangle
 * reuses the prior result instead of retracing every occupied token. */
export class PathHighlightCache {
  private key: string | null = null;
  private value: HighlightedPath[] = [];

  get(
    view: GameView,
    request: PathHighlightRequest,
    boardRevision: number,
  ): readonly HighlightedPath[] {
    const ghost = request.ghost;
    const key = ghost === null
      ? `${boardRevision}:${request.hoveredSlot ?? "-"}:-`
      : `${boardRevision}:${request.hoveredSlot ?? "-"}:${ghost.anchor[0]},${ghost.anchor[1]},${ghost.typeId},${ghost.orientation}`;
    if (key !== this.key) {
      this.key = key;
      this.value = highlightedPaths(view, request);
    }
    return this.value;
  }
}
