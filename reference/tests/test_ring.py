import pytest

from passtally.ring import Ring


def test_size_is_four_n():
    assert Ring(6).size == 24


def test_move_wraps_forward():
    ring = Ring(6)
    assert ring.move(23, 1) == 0
    assert ring.move(22, 3) == 1


def test_move_wraps_backward():
    ring = Ring(6)
    assert ring.move(0, -1) == 23
    assert ring.move(1, -3) == 22


def test_move_by_zero_is_identity():
    assert Ring(6).move(7, 0) == 7


def test_discontinuous_ring_is_not_implemented():
    with pytest.raises(NotImplementedError):
        Ring(6, continuous=False)
