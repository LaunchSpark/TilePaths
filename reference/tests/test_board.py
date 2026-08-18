import pytest

from passtally.board import Board, Cell, build_ring, slot_index_of
from passtally.types import Side


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_slot_index_round_trip_is_exhaustive(n):
    ring = build_ring(n)
    assert len(ring) == 4 * n
    for i, slot in enumerate(ring):
        assert slot_index_of(n, slot.row, slot.col, slot.side) == i


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_every_ring_slot_is_on_the_border(n):
    for slot in build_ring(n):
        assert slot.row in (0, n - 1) or slot.col in (0, n - 1)


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_ring_entries_are_unique(n):
    seen = {(s.row, s.col, s.side) for s in build_ring(n)}
    assert len(seen) == 4 * n


def test_corner_cell_appears_under_two_sides():
    ring = build_ring(6)
    corner = [(s.side) for s in ring if (s.row, s.col) == (0, 0)]
    assert set(corner) == {Side.N, Side.W}


def test_ring_starts_at_top_left_going_clockwise():
    ring = build_ring(6)
    assert (ring[0].row, ring[0].col, ring[0].side) == (0, 0, Side.N)
    assert (ring[6].row, ring[6].col, ring[6].side) == (0, 5, Side.E)
    assert (ring[12].row, ring[12].col, ring[12].side) == (5, 5, Side.S)
    assert (ring[18].row, ring[18].col, ring[18].side) == (5, 0, Side.W)


def test_empty_board_is_empty():
    board = Board.empty(6)
    assert board.n == 6
    assert all(c.height == 0 and c.placement_id is None for row in board.cells for c in row)
    assert all(s.occupant is None for s in board.ring)


def test_in_bounds():
    board = Board.empty(6)
    assert board.in_bounds((0, 0))
    assert board.in_bounds((5, 5))
    assert not board.in_bounds((-1, 0))
    assert not board.in_bounds((6, 0))
    assert not board.in_bounds((0, 6))


def test_cell_follow_matches_either_end_of_a_pair():
    cell = Cell(placement_id=1, height=1, conns=((Side.N, Side.W), (Side.S, Side.E)))
    assert cell.follow(Side.N) is Side.W
    assert cell.follow(Side.W) is Side.N
    assert cell.follow(Side.S) is Side.E
    assert cell.follow(Side.E) is Side.S


def test_cell_follow_returns_none_when_face_is_absent():
    assert Cell(placement_id=1, height=1, conns=((Side.N, Side.S),)).follow(Side.E) is None
    assert Cell().follow(Side.N) is None
