import copy

from passtally.board import Board
from passtally.placement import can_place, place_tile


def test_empty_adjacent_cells_are_legal():
    board = Board.empty(6)
    assert can_place(board, (0, 0), (0, 1))
    assert can_place(board, (0, 0), (1, 0))


def test_non_adjacent_cells_are_illegal():
    board = Board.empty(6)
    assert not can_place(board, (0, 0), (0, 2))
    assert not can_place(board, (0, 0), (1, 1))
    assert not can_place(board, (0, 0), (0, 0))


def test_off_board_cells_are_illegal():
    board = Board.empty(6)
    assert not can_place(board, (0, 0), (-1, 0))
    assert not can_place(board, (5, 5), (6, 5))


def test_place_tile_sets_id_height_and_conns():
    board = Board.empty(6)
    pid = place_tile(board, (0, 0), (1, 0), 2, 0)
    assert pid == 1
    assert board.at((0, 0)).placement_id == pid
    assert board.at((1, 0)).placement_id == pid
    assert board.at((0, 0)).height == 1
    assert board.at((1, 0)).height == 1
    assert board.at((0, 0)).conns != ()
    assert board.next_placement_id == 2


def test_level_two_on_two_level_one_tiles_is_legal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    # (0,0) and (0,1) are both height 1 with different placement ids.
    assert can_place(board, (0, 0), (0, 1))


def test_straddling_both_halves_of_one_tile_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    assert not can_place(board, (0, 0), (1, 0))


def test_spanning_two_different_heights_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    place_tile(board, (0, 0), (0, 1), 2, 3)  # level 2 across the two towers
    # (0,0) is now height 2, (1,0) is still height 1.
    assert not can_place(board, (0, 0), (1, 0))


def test_half_on_a_tile_and_half_on_bare_board_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    assert not can_place(board, (0, 0), (0, 1))  # (0,1) is empty


def test_stacking_increments_height_and_replaces_the_top():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    top = place_tile(board, (0, 0), (0, 1), 6, 3)
    assert board.at((0, 0)).height == 2
    assert board.at((0, 1)).height == 2
    assert board.at((0, 0)).placement_id == top
    assert board.at((1, 0)).height == 1  # untouched


def test_can_place_does_not_mutate():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    before = copy.deepcopy(board)
    for a, b in (((0, 0), (0, 1)), ((0, 0), (1, 0)), ((3, 3), (3, 4))):
        can_place(board, a, b)
    assert board == before
