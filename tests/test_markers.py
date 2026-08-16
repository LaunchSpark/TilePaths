from passtally.board import Board
from passtally.markers import marker_destination


def test_simple_forward_move():
    board = Board.empty(6)
    assert marker_destination(board, 0, 1) == 1
    assert marker_destination(board, 0, 2) == 2


def test_negative_distance_travels_the_other_way():
    board = Board.empty(6)
    assert marker_destination(board, 5, -1) == 4
    assert marker_destination(board, 5, -2) == 3


def test_movement_wraps_around_the_ring():
    board = Board.empty(6)
    assert marker_destination(board, 23, 1) == 0
    assert marker_destination(board, 0, -1) == 23


def test_distance_two_over_one_occupied_slot_lands_three_away():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    assert marker_destination(board, 0, 2) == 3


def test_jumping_does_not_consume_distance_for_several_occupants():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    board.ring[2].occupant = 98
    board.ring[4].occupant = 97
    # empties encountered going forward: 3 (first), 5 (second)
    assert marker_destination(board, 0, 2) == 5


def test_distance_one_skips_straight_past_an_occupant():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    assert marker_destination(board, 0, 1) == 2


def test_landing_slot_is_always_empty():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    for distance in (-2, -1, 1, 2):
        destination = marker_destination(board, 0, distance)
        assert board.ring[destination].occupant is None


def test_returns_none_when_every_other_slot_is_occupied():
    board = Board.empty(6)
    for index, slot in enumerate(board.ring):
        if index != 0:
            slot.occupant = index
    assert marker_destination(board, 0, 1) is None


def test_zero_distance_has_no_destination():
    assert marker_destination(Board.empty(6), 0, 0) is None
