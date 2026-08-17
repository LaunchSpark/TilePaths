/** Marker movement around the border ring. */

import type { Board } from "./board.js";

/** Where a marker moving `distance` slots ends up, or null if nowhere.
 *
 *  The sign of `distance` is the direction around the ring. Occupied slots are
 *  jumped without consuming distance, so the destination is always empty. */
export function markerDestination(
  board: Board, startSlot: number, distance: number,
): number | null {
  if (distance === 0) return null;

  const stride = distance > 0 ? 1 : -1;
  let remaining = Math.abs(distance);
  let position = startSlot;

  // A full lap is the most that can ever be needed; if the ring is entirely
  // occupied there is nowhere to land.
  for (let i = 0; i < board.nav.size; i++) {
    position = board.nav.move(position, stride);
    // A marker must land somewhere other than where it started. After a full
    // lap, position returns to startSlot; this guard excludes it even if empty.
    if (board.ring[position]!.occupant === null && position !== startSlot) {
      remaining -= 1;
      if (remaining === 0) return position;
    }
  }
  return null;
}
