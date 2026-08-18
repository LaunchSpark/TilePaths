import pytest

from passtally.types import (
    DELTA,
    MoveMarker,
    PlaceTile,
    Side,
    orthogonally_adjacent,
    step,
)


def test_side_values_are_clockwise():
    assert [s.value for s in (Side.N, Side.E, Side.S, Side.W)] == [0, 1, 2, 3]


@pytest.mark.parametrize("side", list(Side))
def test_opposite_is_an_involution(side):
    assert side.opposite.opposite is side


@pytest.mark.parametrize("side", list(Side))
def test_opposite_is_never_self(side):
    assert side.opposite is not side


@pytest.mark.parametrize("side", list(Side))
def test_four_quarter_turns_is_identity(side):
    assert side.rotated(4) is side


def test_one_quarter_turn_is_clockwise():
    assert Side.N.rotated(1) is Side.E
    assert Side.E.rotated(1) is Side.S
    assert Side.S.rotated(1) is Side.W
    assert Side.W.rotated(1) is Side.N


def test_two_quarter_turns_equals_opposite():
    for side in Side:
        assert side.rotated(2) is side.opposite


def test_deltas_treat_north_as_decreasing_row():
    assert DELTA[Side.N] == (-1, 0)
    assert DELTA[Side.E] == (0, 1)
    assert DELTA[Side.S] == (1, 0)
    assert DELTA[Side.W] == (0, -1)


def test_step_applies_the_delta():
    assert step((3, 3), Side.N) == (2, 3)
    assert step((3, 3), Side.W) == (3, 2)


def test_orthogonally_adjacent():
    assert orthogonally_adjacent((1, 1), (1, 2))
    assert orthogonally_adjacent((1, 1), (0, 1))
    assert not orthogonally_adjacent((1, 1), (1, 1))
    assert not orthogonally_adjacent((1, 1), (2, 2))
    assert not orthogonally_adjacent((1, 1), (1, 3))


def test_moves_are_hashable_value_objects():
    assert PlaceTile(0, (1, 1), (1, 2), 3) == PlaceTile(0, (1, 1), (1, 2), 3)
    assert len({MoveMarker(0, 2), MoveMarker(0, 2)}) == 1
