"""Line tracing.

Because every cell pairs its four faces bijectively, `Cell.follow` is an
involution and the whole step relation is reversible. A trace starting from a
border slot therefore cannot loop: revisiting a state would require two
predecessors, and the reverse trajectory would have to exit off-board. The
LOOP guard is kept regardless -- it is three lines, and it is the difference
between a bug and a hang if the tile data is ever revised.
"""

from __future__ import annotations

from passtally import config
from passtally.board import Board, slot_index_of
from passtally.types import Result, Side, step


def trace_from(
    board: Board, row: int, col: int, entry: Side
) -> tuple[Result | int, int]:
    """Follow a line from a cell and entry face. Returns (endpoint, passes),
    where endpoint is a Result member or a ring-slot index."""
    passes = 0
    last_id: int | None = None
    seen: set[tuple[int, int, Side]] = set()

    while True:
        # Keyed by (cell, ENTRY FACE) -- not by cell. Re-entering the same cell
        # through a different face is legal and must keep counting.
        key = (row, col, entry)
        if key in seen:
            return (Result.LOOP, passes)
        seen.add(key)

        cell = board.cells[row][col]
        if cell.placement_id is None:
            return (Result.DEAD, passes)

        exit_face = cell.follow(entry)
        if exit_face is None:
            return (Result.DEAD, passes)

        # Compare against the PREVIOUS STEP ONLY, never a visited-set. A line
        # may cross the same tile more than once and each crossing scores; a
        # set would silently eat the second pass. A seam crossing leaves
        # placement_id unchanged and correctly adds nothing.
        if cell.placement_id != last_id:
            passes += cell.height
            last_id = cell.placement_id

        next_row, next_col = step((row, col), exit_face)
        if not board.in_bounds((next_row, next_col)):
            return (slot_index_of(board.n, row, col, exit_face), passes)
        row, col, entry = next_row, next_col, exit_face.opposite


def trace(board: Board, start_slot: int) -> tuple[Result | int, int]:
    """Follow the line entering the board at a ring slot."""
    slot = board.ring[start_slot]
    return trace_from(board, slot.row, slot.col, slot.side)


def passes_to_vp(total: int) -> int:
    """Convert a pass total to victory points via the nonlinear band table."""
    victory_points = 0
    for min_passes, value in config.PASSES_TO_VP:
        if total < min_passes:
            break
        victory_points = value
    return victory_points


def score_lines(board: Board, marker_slots: list[int]) -> dict[frozenset[int], int]:
    """Passes for each line running between two of these markers.

    Keyed by the unordered slot pair, so a line found from both ends is
    recorded once.
    """
    owned = set(marker_slots)
    lines: dict[frozenset[int], int] = {}
    for slot in marker_slots:
        endpoint, passes = trace(board, slot)
        # A line can re-enter its start cell through another face and leave by
        # the original border face. That is not a pair, so exclude it.
        if isinstance(endpoint, int) and endpoint != slot and endpoint in owned:
            lines[frozenset((slot, endpoint))] = passes
    return lines


def score_for(board: Board, marker_slots: list[int]) -> int:
    """Victory points earned. Sums all lines BEFORE converting -- the table is
    nonlinear, so converting each line separately gives the wrong answer."""
    return passes_to_vp(sum(score_lines(board, marker_slots).values()))
