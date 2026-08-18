import pytest

from passtally.board import Board, slot_index_of
from passtally.placement import place_tile
from passtally.trace import passes_to_vp, score_for, score_lines
from passtally.types import Side


@pytest.mark.parametrize(
    "total,expected",
    [
        (0, 0), (1, 1), (2, 2), (3, 2), (4, 3), (6, 3), (7, 4), (10, 4),
        (11, 5), (15, 5), (16, 6), (21, 6), (22, 7), (28, 7), (29, 8),
        (36, 8), (37, 9), (45, 9), (46, 10), (55, 10), (56, 15), (500, 15),
    ],
)
def test_passes_to_vp_band_boundaries(total, expected):
    assert passes_to_vp(total) == expected


def _two_parallel_lines() -> Board:
    """A 4x4 board with a 2-pass line along row 0 and another along row 3."""
    board = Board.empty(4)
    for row in (0, 3):
        place_tile(board, (row, 0), (row, 1), 2, 3)
        place_tile(board, (row, 2), (row, 3), 2, 3)
    return board


def test_one_connected_pair_scores_a_single_line():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 0, 3, Side.E)]
    lines = score_lines(board, slots)
    assert lines == {frozenset(slots): 2}


def test_a_pair_connected_both_ways_is_deduped():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 0, 3, Side.E)]
    assert len(score_lines(board, slots)) == 1


def test_unconnected_markers_score_nothing():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 2, 0, Side.W)]
    assert score_lines(board, slots) == {}
    assert score_for(board, slots) == 0


def test_two_lines_are_summed_before_conversion():
    board = _two_parallel_lines()
    slots = [
        slot_index_of(4, 0, 0, Side.W),
        slot_index_of(4, 0, 3, Side.E),
        slot_index_of(4, 3, 0, Side.W),
        slot_index_of(4, 3, 3, Side.E),
    ]
    lines = score_lines(board, slots)
    assert sorted(lines.values()) == [2, 2]

    # Summed first: 4 passes -> 3 VP. Converted separately: 2 + 2 = 4 VP.
    assert passes_to_vp(2) + passes_to_vp(2) == 4
    assert score_for(board, slots) == 3
