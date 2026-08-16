"""Marker movement around the border ring."""

from __future__ import annotations

from passtally.board import Board


def marker_destination(board: Board, start_slot: int, distance: int) -> int | None:
    """Where a marker moving `distance` slots ends up, or None if nowhere.

    The sign of `distance` is the direction around the ring. Occupied slots are
    jumped without consuming distance, so the destination is always empty.
    """
    if distance == 0:
        return None

    stride = 1 if distance > 0 else -1
    remaining = abs(distance)
    position = start_slot

    # A full lap is the most that can ever be needed; if the ring is entirely
    # occupied there is nowhere to land.
    for _ in range(board.nav.size):
        position = board.nav.move(position, stride)
        if board.ring[position].occupant is None and position != start_slot:
            remaining -= 1
            if remaining == 0:
                return position
    return None
