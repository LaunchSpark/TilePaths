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
    original = tuple(canon(c) for c in resolve(type_id, 0))
    for turns in (0, 4, 8):
        assert tuple(canon(c) for c in resolve(type_id, turns % 4)) == original


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
