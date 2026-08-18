import pytest

from passtally.board import slot_index_of
from passtally.game import Game
from passtally.placement import place_tile
from passtally.types import MoveMarker, PlaceTile, Side


def _setup(n_players=2, seed=1, board_size=6) -> Game:
    """A game with every marker placed, one per edge per player."""
    game = Game.new(n_players, seed=seed, board_size=board_size)
    for player in range(n_players):
        for edge in range(4):
            game.setup_place_marker(player, edge * board_size + player)
    return game


def test_new_deals_three_piles_of_fourteen():
    game = Game.new(2, seed=7)
    assert len(game.piles) == 3
    for pile in game.piles:
        assert len(pile.ordered) == 13
        assert pile.face_up is not None


def test_new_uses_every_tile_exactly_seven_times():
    game = Game.new(2, seed=7)
    dealt = [t for pile in game.piles for t in [*pile.ordered, pile.face_up]]
    assert len(dealt) == 42
    assert {tile: dealt.count(tile) for tile in set(dealt)} == {t: 7 for t in range(1, 7)}


def test_same_seed_deals_the_same_game():
    a, b = Game.new(2, seed=42), Game.new(2, seed=42)
    assert [p.ordered for p in a.piles] == [p.ordered for p in b.piles]


def test_different_seeds_deal_differently():
    a, b = Game.new(2, seed=1), Game.new(2, seed=2)
    assert [p.ordered for p in a.piles] != [p.ordered for p in b.piles]


def test_rejects_bad_player_counts():
    for count in (0, 1, 4):
        with pytest.raises(ValueError):
            Game.new(count)


def test_setup_places_markers_and_records_occupants():
    game = Game.new(2, seed=1, board_size=6)
    game.setup_place_marker(0, 0)
    assert game.players[0].marker_slots == [0]
    assert game.board.ring[0].occupant == 0


def test_setup_rejects_an_occupied_slot():
    game = Game.new(2, seed=1, board_size=6)
    game.setup_place_marker(0, 0)
    with pytest.raises(ValueError):
        game.setup_place_marker(1, 0)


def test_setup_rejects_a_second_marker_on_the_same_edge():
    game = Game.new(2, seed=1, board_size=6)
    game.setup_place_marker(0, 0)
    with pytest.raises(ValueError):
        game.setup_place_marker(0, 1)  # still the north edge


def test_setup_rejects_a_fifth_marker():
    game = _setup()
    with pytest.raises(ValueError):
        game.setup_place_marker(0, 30)


def test_setup_rejects_a_negative_player():
    game = Game.new(2, seed=1, board_size=6)
    with pytest.raises(ValueError):
        game.setup_place_marker(-1, 0)


def test_is_setup_complete_is_false_until_every_player_has_all_markers():
    game = Game.new(2, seed=1, board_size=6)
    assert not game.is_setup_complete()
    for edge in range(4):
        game.setup_place_marker(0, edge * 6)
    assert not game.is_setup_complete()  # player 1 still has none
    for edge in range(4):
        game.setup_place_marker(1, edge * 6 + 1)
    assert game.is_setup_complete()


def test_apply_rejects_a_move_before_setup_is_complete():
    game = Game.new(2, seed=1, board_size=6)
    game.setup_place_marker(0, 0)  # only 1 of 8 markers placed
    with pytest.raises(ValueError):
        game.apply(MoveMarker(0, 1))


def test_setup_place_marker_rejects_once_play_has_begun():
    game = _setup()  # completes setup for every player
    assert game.is_setup_complete()
    with pytest.raises(ValueError):
        game.setup_place_marker(0, 12)  # slot is even free, but too late


def test_a_turn_is_two_actions():
    game = _setup()
    assert game.actions_left == 2
    game.apply(PlaceTile(0, (2, 2), (3, 2), 0))
    assert game.actions_left == 1
    assert game.current_player == 0
    game.apply(PlaceTile(0, (2, 3), (3, 3), 0))
    assert game.actions_left == 2
    assert game.current_player == 1


def test_placing_advances_the_pile():
    game = _setup()
    pile = game.piles[0]
    was_face_up, next_up = pile.face_up, pile.ordered[-1]
    game.apply(PlaceTile(0, (2, 2), (3, 2), 0))
    assert game.board.at((2, 2)).height == 1
    assert pile.face_up == next_up
    assert len(pile.ordered) == 12
    assert was_face_up is not None


def test_illegal_placement_is_rejected():
    game = _setup()
    game.apply(PlaceTile(0, (2, 2), (3, 2), 0))
    with pytest.raises(ValueError):
        game.apply(PlaceTile(0, (2, 2), (3, 2), 0))  # straddles one tile


def test_placement_rejects_a_cell_pair_that_contradicts_the_orientation():
    game = _setup()
    with pytest.raises(ValueError):
        game.apply(PlaceTile(0, (2, 2), (2, 3), 0))  # orientation 0 means south


def test_placement_rejects_a_negative_pile_index():
    game = _setup()
    with pytest.raises(ValueError):
        game.apply(PlaceTile(-1, (2, 2), (3, 2), 0))  # must not silently draw piles[2]


def test_placement_rejects_an_out_of_range_pile_index():
    game = _setup()
    with pytest.raises(ValueError):
        game.apply(PlaceTile(len(game.piles), (2, 2), (3, 2), 0))


def test_placement_rejects_an_out_of_range_orientation():
    game = _setup()
    with pytest.raises(ValueError):
        game.apply(PlaceTile(0, (2, 2), (3, 2), 7))  # must raise ValueError, not KeyError


def test_moving_a_marker_updates_slot_and_occupant():
    game = _setup(board_size=6)
    start = game.players[0].marker_slots[0]
    game.apply(MoveMarker(0, 1))
    moved = game.players[0].marker_slots[0]
    assert moved != start
    assert game.board.ring[start].occupant is None
    assert game.board.ring[moved].occupant == 0


def test_marker_move_rejects_an_illegal_distance():
    game = _setup()
    with pytest.raises(ValueError):
        game.apply(MoveMarker(0, 3))


def test_score_is_awarded_once_at_end_of_turn():
    game = Game.new(2, seed=1, board_size=3)
    game.setup_place_marker(0, slot_index_of(3, 0, 0, Side.W))
    game.setup_place_marker(0, slot_index_of(3, 0, 2, Side.E))
    # Complete setup with markers on different columns so the printed starting
    # crosses do not create a second line for player 0.
    game.setup_place_marker(0, slot_index_of(3, 0, 1, Side.N))
    game.setup_place_marker(0, slot_index_of(3, 2, 2, Side.S))
    game.setup_place_marker(1, slot_index_of(3, 0, 0, Side.N))
    game.setup_place_marker(1, slot_index_of(3, 1, 2, Side.E))
    game.setup_place_marker(1, slot_index_of(3, 2, 1, Side.S))
    game.setup_place_marker(1, slot_index_of(3, 1, 0, Side.W))

    # Force a known board rather than relying on the shuffle.
    for col in range(3):
        place_tile(game.board, (0, col), (1, col), 2, 0)

    assert game.players[0].score == 0
    game.apply(MoveMarker(0, 1))
    assert game.players[0].score == 0  # mid-turn, not scored yet
    game.apply(MoveMarker(0, -1))  # back where it started
    assert game.players[0].score == 2  # 3 passes falls in the 2-3 band -> 2 VP


def test_only_the_current_player_is_scored_at_end_of_turn():
    """Player 1 holds a genuinely connected, scoring line the whole time.

    Player 0 takes a full turn first -- only player 0 may be scored by it,
    even though player 1's line sits on the board the entire time. Then
    player 1 takes their own turn and is scored for that same line.
    """
    game = Game.new(2, seed=1, board_size=3)
    # Player 1 owns the connected line across row 0 (3 passes -> 2 VP).
    game.setup_place_marker(1, slot_index_of(3, 0, 0, Side.W))
    game.setup_place_marker(1, slot_index_of(3, 0, 2, Side.E))
    game.setup_place_marker(1, slot_index_of(3, 0, 1, Side.N))
    game.setup_place_marker(1, slot_index_of(3, 2, 2, Side.S))
    # Player 0 owns the other horizontal line, across row 1.
    game.setup_place_marker(0, slot_index_of(3, 0, 0, Side.N))
    game.setup_place_marker(0, slot_index_of(3, 1, 2, Side.E))
    game.setup_place_marker(0, slot_index_of(3, 2, 1, Side.S))
    game.setup_place_marker(0, slot_index_of(3, 1, 0, Side.W))

    for col in range(3):
        place_tile(game.board, (0, col), (1, col), 2, 0)

    assert game.current_player == 0
    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))  # ends player 0's turn -- scores player 0 ONLY
    assert game.players[1].score == 0  # player 1's line must not be scored yet
    assert game.current_player == 1

    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))  # ends player 1's turn -- now player 1 scores
    assert game.players[1].score == 2  # the same 3-pass line, scored on their turn


def test_winner_is_none_before_the_game_ends():
    game = _setup()
    assert not game.is_over()
    assert game.winner() is None


def test_winner_is_the_high_scorer():
    game = _setup()
    game.players[0].score = 10
    game.players[1].score = 4
    game._over = True
    assert game.winner() == 0


def test_a_tie_has_no_winner():
    game = _setup()
    game.players[0].score = 5
    game.players[1].score = 5
    game._over = True
    assert game.winner() is None


def test_exhausted_piles_trigger_the_final_round():
    game = _setup()
    for pile in game.piles:
        pile.ordered.clear()
        pile.face_up = None
    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))
    assert game._final_round
    assert not game.is_over()  # player 1 still gets a turn
    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))
    assert game.is_over()


def test_trigger_fires_when_piles_are_exhausted_even_with_board_room_to_spare():
    """All piles out of tiles fires the trigger even though the board still
    has plenty of empty room -- the "no cards left" path, distinct from
    "board is full" (covered by the sibling test below).
    """
    game = _setup(board_size=6)
    for pile in game.piles:
        pile.ordered.clear()
        pile.face_up = None
    assert game._trigger_fired()


def test_trigger_fires_when_no_footprint_fits_anywhere_though_a_pile_remains():
    """A tiny 3x3 board tiled so every remaining orthogonal pair is either
    height-mismatched or shares a placement id -- no PlaceTile move exists
    anywhere -- while a pile still holds a face-up tile. Only the "no legal
    placement" branch can fire the trigger here.

    Built by 4 direct placements (letters are placement ids, heights shown):
        (0,0)=1/A  (0,1)=0/.   (0,2)=1/B
        (1,0)=2/D  (1,1)=2/D   (1,2)=1/B
        (2,0)=0/.  (2,1)=1/C   (2,2)=0/.
    A and C support D's stack; B straddles its own two cells; the three
    empty cells are pairwise non-adjacent, so no empty/empty pair opens up
    a placement either.
    """
    game = Game.new(2, seed=1, board_size=3)
    place_tile(game.board, (0, 0), (1, 0), 2, 0)  # A
    place_tile(game.board, (0, 2), (1, 2), 2, 0)  # B
    place_tile(game.board, (1, 1), (2, 1), 2, 0)  # C
    place_tile(game.board, (1, 0), (1, 1), 2, 3)  # D, stacked on A/C's support

    assert not any(isinstance(m, PlaceTile) for m in game.legal_moves())
    assert any(pile.face_up is not None for pile in game.piles)
    assert game._trigger_fired()


def test_three_player_final_round_gives_a_two_turn_tail():
    """3 players changes end-of-game timing: the trigger fires at the end of
    the current player's turn, but BOTH other players still get a full turn
    before the game ends -- a two-turn tail, not a one-turn tail as with 2
    players. The game must only end once play returns to first_player.
    """
    game = _setup(n_players=3)
    for pile in game.piles:
        pile.ordered.clear()
        pile.face_up = None

    assert game.current_player == game.first_player == 0

    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))  # player 0's turn ends -> trigger fires
    assert game._final_round
    assert not game.is_over()
    assert game.current_player == 1

    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))  # player 1's turn ends -> still not over
    assert not game.is_over()
    assert game.current_player == 2

    game.apply(MoveMarker(0, 1))
    game.apply(MoveMarker(0, -1))  # player 2's turn ends -> back to first_player
    assert game.current_player == game.first_player
    assert game.is_over()


def test_applying_a_move_after_the_game_ends_is_rejected():
    game = _setup()
    game._over = True
    with pytest.raises(ValueError):
        game.apply(MoveMarker(0, 1))
