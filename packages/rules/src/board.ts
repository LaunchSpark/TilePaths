import { Ring } from "./ring.js";
import type { Pos, Side } from "./types.js";

export type Cell = {
  placementId: number | null;   // instance id of the TOP tile
  height: number;               // 0 == empty; otherwise the level of the top tile
  conns: [Side, Side][];
};

export function makeCell(init: Partial<Cell> = {}): Cell {
  return { placementId: null, height: 0, conns: [], ...init };
}

/** The face a line entering through `entry` leaves by, or null. */
export function follow(cell: Cell, entry: Side): Side | null {
  for (const [a, b] of cell.conns) {
    if (a === entry) return b;
    if (b === entry) return a;
  }
  return null;
}

export type Slot = {
  row: number;
  col: number;
  side: Side;            // the board edge this slot faces
  occupant: number | null;  // marker id
};

/** Clockwise from the top-left corner. Corner cells appear twice. */
export function buildRing(n: number): Slot[] {
  const slots: Slot[] = [];
  for (let c = 0; c < n; c++) slots.push({ row: 0, col: c, side: 0, occupant: null });
  for (let r = 0; r < n; r++) slots.push({ row: r, col: n - 1, side: 1, occupant: null });
  for (let c = n - 1; c >= 0; c--) slots.push({ row: n - 1, col: c, side: 2, occupant: null });
  for (let r = n - 1; r >= 0; r--) slots.push({ row: r, col: 0, side: 3, occupant: null });
  return slots;
}

/** Inverse of buildRing. Caller must guarantee the cell is on that edge. */
export function slotIndexOf(n: number, row: number, col: number, side: Side): number {
  if (side === 0) return col;
  if (side === 1) return n + row;
  if (side === 2) return 2 * n + (n - 1 - col);
  return 3 * n + (n - 1 - row);
}

export type Board = {
  n: number;
  cells: Cell[][];
  ring: Slot[];
  nav: Ring;
  nextPlacementId: number;
};

export function emptyBoard(n: number): Board {
  return {
    n,
    cells: Array.from({ length: n }, () => Array.from({ length: n }, () => makeCell())),
    ring: buildRing(n),
    nav: new Ring(n),
    nextPlacementId: 1,
  };
}

export function inBounds(board: Board, pos: Pos): boolean {
  const [r, c] = pos;
  return r >= 0 && r < board.n && c >= 0 && c < board.n;
}

export function at(board: Board, pos: Pos): Cell {
  return board.cells[pos[0]]![pos[1]]!;
}

/** Offset of the neighbour sharing this cell's top placement id.
 *
 *  Raw placement ids depend on move order, so they cannot go in a canonical
 *  key -- the offset carries the same information canonically. Moved here from
 *  Game so the client can also draw 1x2 tile outlines. */
export function partnerOffset(board: Board, row: number, col: number): Pos | null {
  const cell = board.cells[row]![col]!;
  if (cell.placementId === null) return null;
  const deltas: Pos[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nb: Pos = [row + dr, col + dc];
    if (inBounds(board, nb) && at(board, nb).placementId === cell.placementId) {
      return [dr, dc];
    }
  }
  return null;
}
