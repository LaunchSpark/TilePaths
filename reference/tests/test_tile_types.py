import pytest

from passtally.tile_types import (
    ORIENTATIONS,
    TILE_TYPES,
    canon,
    distinct_orientations,
    offset_of,
    resolve,
    shape_of,
)
from passtally.types import Side


def test_there_are_six_designs():
    assert sorted(TILE_TYPES) == [1, 2, 3, 4, 5, 6]


def test_shapes_match_the_spec_table():
    expected = {
        1: ("B", "A"),
        2: ("X", "X"),
        3: ("X", "A"),
        4: ("X", "B"),
        5: ("B", "B"),
        6: ("A", "A"),
    }
    actual = {tid: (shape_of(a), shape_of(b)) for tid, (a, b) in TILE_TYPES.items()}
    assert actual == expected


def test_the_six_designs_cover_every_unordered_shape_pair():
    pairs = {
        tuple(sorted((shape_of(a), shape_of(b)))) for a, b in TILE_TYPES.values()
    }
    assert len(pairs) == 6


def test_shape_of_rejects_a_non_matching_cell():
    with pytest.raises(ValueError):
        shape_of(((Side.N, Side.E),))


@pytest.mark.parametrize("type_id", [1, 2, 3, 4, 5, 6])
@pytest.mark.parametrize("orientation", ORIENTATIONS)
def test_every_resolved_cell_is_a_perfect_matching(type_id, orientation):
    for conns in resolve(type_id, orientation):
        assert shape_of(conns) in {"X", "A", "B"}
        faces = [face for pair in conns for face in pair]
        assert sorted(f.value for f in faces) == [0, 1, 2, 3]


@pytest.mark.parametrize("type_id", [1, 2, 3, 4, 5, 6])
def test_four_rotations_return_to_canonical(type_id):
    """Rotating a cell's conns four quarter-turns must return the original.

    Rotate step-by-step (not by calling rot_conns(conns, 4) directly) so the
    test actually exercises repeated single-step rotation. A/B cells must
    visibly change after one turn -- without that check, a rot_conns that was
    accidentally made a no-op would still satisfy "four turns == original"
    vacuously, since doing nothing four times is still nothing.
    """
    from passtally.tile_types import rot_conns, shape_of

    for cell in resolve(type_id, 0):
        original = canon(cell)
        rotated = cell
        for turn in range(4):
            rotated = rot_conns(rotated, 1)
            if shape_of(cell) != "X":
                # A and B cells alternate under 90 degrees, so after 1 or 3
                # single-step turns the cell must differ from where it started.
                if turn % 2 == 0:
                    assert canon(rotated) != original
        assert canon(rotated) == original
        # And a single 4-quarter-turn call must agree with four 1-turn calls.
        assert canon(rot_conns(cell, 4)) == original


def test_offsets_follow_the_orientation_convention():
    assert offset_of(0) == (1, 0)
    assert offset_of(1) == (0, -1)
    assert offset_of(2) == (-1, 0)
    assert offset_of(3) == (0, 1)


def test_distinct_orientation_counts():
    counts = {tid: len(distinct_orientations(tid)) for tid in TILE_TYPES}
    assert counts == {1: 4, 2: 2, 3: 4, 4: 4, 5: 2, 6: 2}


def test_symmetric_tiles_keep_the_first_of_each_equivalent_pair():
    assert distinct_orientations(2) == (0, 1)
    assert distinct_orientations(5) == (0, 1)
    assert distinct_orientations(6) == (0, 1)
    assert distinct_orientations(1) == (0, 1, 2, 3)


def test_rotating_a_turn_shape_swaps_a_and_b():
    a_cell = ((Side.N, Side.E), (Side.S, Side.W))
    assert shape_of(a_cell) == "A"
    from passtally.tile_types import rot_conns

    assert shape_of(rot_conns(a_cell, 1)) == "B"
    assert shape_of(rot_conns(a_cell, 2)) == "A"


def test_rotating_the_cross_shape_is_a_no_op():
    from passtally.tile_types import rot_conns

    x_cell = ((Side.N, Side.S), (Side.E, Side.W))
    for turns in ORIENTATIONS:
        assert shape_of(rot_conns(x_cell, turns)) == "X"
