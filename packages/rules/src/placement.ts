/** Placement legality and commit.
 *
 *  Legality is support-only. Every cell in this tile set carries a line on all
 *  four faces, so a connection-continuity check would compare true against true
 *  on every shared face and could never fail. It is deliberately absent. */

import { at, inBounds } from "./board.js";
import type { Board } from "./board.js";
import { resolve } from "./tileTypes.js";
import { orthogonallyAdjacent } from "./types.js";
import type { Pos, TypeId } from "./types.js";

/** Pure. Depends only on the footprint -- if any tile fits, all of them do. */
export function canPlace(board: Board, posA: Pos, posB: Pos): boolean {
  if (!inBounds(board, posA) || !inBounds(board, posB)) return false;
  if (!orthogonallyAdjacent(posA, posB)) return false;

  const a = at(board, posA), b = at(board, posB);
  if (a.height !== b.height) return false;                       // differing heights
  if (a.height > 0 && a.placementId === b.placementId) return false; // straddling one tile
  return true;
}

/** Commit a placement. Returns the new placement id. Board state only --
 *  pile bookkeeping belongs to the caller. */
export function placeTile(
  board: Board, posA: Pos, posB: Pos, typeId: TypeId, orientation: number,
): number {
  const pid = board.nextPlacementId;
  board.nextPlacementId += 1;
  const [connsA, connsB] = resolve(typeId, orientation);
  const pairs: [Pos, typeof connsA][] = [[posA, connsA], [posB, connsB]];
  for (const [pos, conns] of pairs) {
    const cell = at(board, pos);
    cell.placementId = pid;
    cell.height += 1;
    cell.conns = conns.map(([x, y]) => [x, y]);
  }
  return pid;
}
