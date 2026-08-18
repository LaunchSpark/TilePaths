"""Placement legality and commit.

Legality is support-only. Every cell in this tile set carries a line on all
four faces, so a connection-continuity check would compare True against True
on every shared face and could never fail. It is deliberately absent.
"""

from __future__ import annotations

from passtally.board import Board
from passtally.tile_types import resolve
from passtally.types import Pos, TypeId, orthogonally_adjacent


def can_place(board: Board, pos_a: Pos, pos_b: Pos) -> bool:
    """Pure. Depends only on the footprint -- if any tile fits, all of them do."""
    if not (board.in_bounds(pos_a) and board.in_bounds(pos_b)):
        return False
    if not orthogonally_adjacent(pos_a, pos_b):
        return False

    a, b = board.at(pos_a), board.at(pos_b)
    if a.height != b.height:
        return False  # differing heights
    if a.height > 0 and a.placement_id == b.placement_id:
        return False  # straddling both halves of one tile
    return True


def place_tile(
    board: Board, pos_a: Pos, pos_b: Pos, type_id: TypeId, orientation: int
) -> int:
    """Commit a placement. Returns the new placement id. Board state only --
    pile bookkeeping belongs to the caller."""
    pid = board.next_placement_id
    board.next_placement_id += 1
    conns_a, conns_b = resolve(type_id, orientation)
    for pos, conns in ((pos_a, conns_a), (pos_b, conns_b)):
        cell = board.at(pos)
        cell.placement_id = pid
        cell.height += 1
        cell.conns = conns
    return pid
