/** Line tracing and scoring.
 *
 *  Printed starting crosses carry lines straight through uncovered cells for
 *  zero passes. Placed cells pair their four faces bijectively, so the whole
 *  step relation remains reversible. A trace starting from a border slot
 *  therefore cannot loop: revisiting a state would require two predecessors,
 *  and the reverse trajectory would have to exit off-board. The LOOP guard is
 *  kept regardless -- it is the difference between a bug and a hang if the
 *  tile data is ever revised. */

import { follow, inBounds, slotIndexOf } from "./board.js";
import type { Board } from "./board.js";
import { PASSES_TO_VP } from "./config.js";
import { opposite, Result, step } from "./types.js";
import type { Side } from "./types.js";

/** Follow a line from a cell and entry face. Returns [endpoint, passes], where
 *  endpoint is a Result member or a ring-slot index. */
export function traceFrom(
  board: Board, row: number, col: number, entry: Side,
): [Result | number, number] {
  let passes = 0;
  let lastId: number | null = null;
  const seen = new Set<string>();

  for (;;) {
    // Keyed by (cell, ENTRY FACE) -- not by cell. Re-entering the same cell
    // through a different face is legal and must keep counting.
    const key = `${row},${col},${entry}`;
    if (seen.has(key)) return [Result.LOOP, passes];
    seen.add(key);

    const cell = board.cells[row]![col]!;
    // The board's printed + is an X path: it connects N-S and E-W but is not
    // a tile, so crossing it contributes no passes.
    const exitFace = cell.placementId === null ? opposite(entry) : follow(cell, entry);
    if (exitFace === null) return [Result.DEAD, passes];

    // Compare against the PREVIOUS STEP ONLY, never a visited-set. A line may
    // cross the same tile more than once and each crossing scores; a set would
    // silently eat the second pass. A seam crossing leaves placementId
    // unchanged and correctly adds nothing.
    if (cell.placementId === null) {
      // An uncovered cell separates tile visits. If a later bend returns to
      // the same physical tile, that is a new pass through it.
      lastId = null;
    } else if (cell.placementId !== lastId) {
      passes += cell.height;
      lastId = cell.placementId;
    }

    const [nextRow, nextCol] = step([row, col], exitFace);
    if (!inBounds(board, [nextRow, nextCol])) {
      return [slotIndexOf(board.n, row, col, exitFace), passes];
    }
    row = nextRow; col = nextCol; entry = opposite(exitFace);
  }
}

/** Follow the line entering the board at a ring slot. */
export function trace(board: Board, startSlot: number): [Result | number, number] {
  const slot = board.ring[startSlot]!;
  return traceFrom(board, slot.row, slot.col, slot.side);
}

/** Convert a pass total to victory points via the nonlinear band table. */
export function passesToVp(total: number): number {
  let vp = 0;
  for (const [minPasses, value] of PASSES_TO_VP) {
    if (total < minPasses) break;
    vp = value;
  }
  return vp;
}

/** Passes for each line running between two of these markers, keyed by the
 *  canonical unordered slot pair so a line found from both ends is recorded
 *  once.
 *
 *  No endpoint-differs-from-start guard is needed: each cell contributes two
 *  disjoint wires and each wire-end links to exactly one neighbour, so every
 *  connection point has degree at most 2 and the board decomposes into simple
 *  paths and cycles. A border slot cannot lie on a cycle, so it is a path
 *  ENDPOINT -- and tracing from one endpoint reaches the other, which is
 *  necessarily a different slot. Same argument that makes LOOP unreachable. */
export function scoreLines(board: Board, markerSlots: number[]): Map<string, number> {
  const owned = new Set(markerSlots);
  const lines = new Map<string, number>();
  for (const slot of markerSlots) {
    const [endpoint, passes] = trace(board, slot);
    if (typeof endpoint === "number" && owned.has(endpoint)) {
      const key = slot < endpoint ? `${slot}-${endpoint}` : `${endpoint}-${slot}`;
      lines.set(key, passes);
    }
  }
  return lines;
}

/** Victory points earned. Sums all lines BEFORE converting -- the table is
 *  nonlinear, so converting each line separately gives the wrong answer. */
export function scoreFor(board: Board, markerSlots: number[]): number {
  let total = 0;
  for (const passes of scoreLines(board, markerSlots).values()) total += passes;
  return passesToVp(total);
}
