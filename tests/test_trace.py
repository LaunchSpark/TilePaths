from passtally.board import Board, slot_index_of
from passtally.placement import place_tile
from passtally.trace import trace, trace_from
from passtally.types import Result, Side


def test_straight_run_across_three_tiles_scores_three():
    board = Board.empty(3)
    for col in range(3):
        place_tile(board, (0, col), (1, col), 2, 0)  # vertical crosses
    start = slot_index_of(3, 0, 0, Side.W)
    end, passes = trace(board, start)
    assert end == slot_index_of(3, 0, 2, Side.E)
    assert passes == 3


def test_seam_crossing_counts_once():
    board = Board.empty(3)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    end, passes = trace(board, slot_index_of(3, 0, 0, Side.N))
    assert end is Result.DEAD  # runs off into the empty cell below
    assert passes == 1


def test_line_into_an_empty_cell_is_dead():
    board = Board.empty(3)
    place_tile(board, (0, 0), (0, 1), 2, 3)
    end, passes = trace(board, slot_index_of(3, 0, 0, Side.W))
    assert end is Result.DEAD
    assert passes == 1


def test_trace_from_an_empty_cell_is_dead_with_no_passes():
    board = Board.empty(3)
    end, passes = trace(board, 0)
    assert end is Result.DEAD
    assert passes == 0


def test_crossing_the_same_tile_twice_counts_twice():
    # Tile 1 at orientation 1 lays out as (B west, A east).
    # Row 1 tile: (1,0)=B routes W->N, (1,1)=A routes N->E.
    # Row 0 tile: (0,0)=B routes S->E, (0,1)=A routes W->S.
    # The line enters row 1, climbs to row 0, comes back down into row 1.
    board = Board.empty(3)
    place_tile(board, (1, 1), (1, 0), 1, 1)  # the tile crossed twice
    place_tile(board, (0, 1), (0, 0), 1, 1)  # the tile that turns it around
    end, passes = trace(board, slot_index_of(3, 1, 0, Side.W))
    assert end is Result.DEAD
    assert passes == 3  # 2 if the second crossing were wrongly suppressed


def test_path_through_levels_1_1_2_1_scores_five():
    board = Board.empty(4)
    place_tile(board, (0, 0), (1, 0), 2, 0)  # (0,0) height 1
    place_tile(board, (0, 1), (1, 1), 2, 0)  # (0,1) height 1
    place_tile(board, (0, 2), (0, 3), 2, 3)  # (0,2) and (0,3) height 1
    place_tile(board, (1, 2), (1, 3), 2, 3)  # support for the stack
    place_tile(board, (0, 2), (1, 2), 2, 0)  # (0,2) height 2
    assert [board.at((0, c)).height for c in range(4)] == [1, 1, 2, 1]

    end, passes = trace(board, slot_index_of(4, 0, 0, Side.W))
    assert end == slot_index_of(4, 0, 3, Side.E)
    assert passes == 5


def test_closed_loop_terminates():
    # A 2x2 circuit detached from the border: (1,1)->(2,1)->(2,2)->(1,2)->(1,1).
    board = Board.empty(4)
    place_tile(board, (1, 2), (1, 1), 1, 1)  # (1,1)=B, (1,2)=A
    place_tile(board, (2, 1), (2, 2), 1, 3)  # (2,1)=A, (2,2)=B
    end, passes = trace_from(board, 1, 1, Side.E)
    assert end is Result.LOOP
    assert passes == 3


def test_trace_is_symmetric_from_both_ends():
    board = Board.empty(3)
    for col in range(3):
        place_tile(board, (0, col), (1, col), 2, 0)
    west = slot_index_of(3, 0, 0, Side.W)
    east = slot_index_of(3, 0, 2, Side.E)
    assert trace(board, west) == (east, 3)
    assert trace(board, east) == (west, 3)
