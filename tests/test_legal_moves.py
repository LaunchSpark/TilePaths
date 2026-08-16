from passtally.game import Game
from passtally.tile_types import distinct_orientations
from passtally.types import MoveMarker, PlaceTile


def _setup(n_players=2, seed=1, board_size=6) -> Game:
    game = Game.new(n_players, seed=seed, board_size=board_size)
    for player in range(n_players):
        for edge in range(4):
            game.setup_place_marker(player, edge * board_size + player)
    return game


def test_every_generated_move_is_accepted_by_apply():
    game = _setup()
    for move in game.legal_moves():
        game.clone().apply(move)


def test_place_move_count_on_an_empty_board():
    """Every orientation has exactly n*(n-1) footprints on an empty board.

    On 6x6 that is 30, so a 4-orientation tile yields 120 placements and a
    2-orientation tile yields 60. These are fixed numbers on purpose -- deriving
    the expected count by re-running legal_moves' own loop would pass even if
    that loop were wrong.
    """
    game = _setup(board_size=6)
    places = [m for m in game.legal_moves() if isinstance(m, PlaceTile)]

    for index, pile in enumerate(game.piles):
        for orientation in distinct_orientations(pile.face_up):
            matching = [
                m for m in places
                if m.pile_index == index and m.orientation == orientation
            ]
            assert len(matching) == 30

        count = sum(1 for m in places if m.pile_index == index)
        assert count == (120 if len(distinct_orientations(pile.face_up)) == 4 else 60)

    assert len(places) == sum(
        120 if len(distinct_orientations(p.face_up)) == 4 else 60 for p in game.piles
    )


def test_symmetric_tiles_generate_no_duplicate_placements():
    game = _setup()
    places = [m for m in game.legal_moves() if isinstance(m, PlaceTile)]
    footprints = [
        (m.pile_index, frozenset({m.cell_a, m.cell_b}), m.orientation) for m in places
    ]
    assert len(footprints) == len(set(footprints))

    # A tile whose halves share a shape must never emit both 0 and 2.
    for index, pile in enumerate(game.piles):
        if len(distinct_orientations(pile.face_up)) == 2:
            emitted = {m.orientation for m in places if m.pile_index == index}
            assert emitted == {0, 1}


def test_marker_moves_are_generated_for_every_marker():
    game = _setup()
    markers = [m for m in game.legal_moves() if isinstance(m, MoveMarker)]
    assert {m.marker_index for m in markers} == {0, 1, 2, 3}
    assert {m.distance for m in markers} <= {-2, -1, 1, 2}


def test_marker_moves_reaching_the_same_slot_are_deduped():
    game = _setup(board_size=6)
    marker = game.players[0].marker_slots[0]
    for offset in (1, 2, 3, 4):
        game.board.ring[(marker + offset) % 24].occupant = 90 + offset
    markers = [
        m
        for m in game.legal_moves()
        if isinstance(m, MoveMarker) and m.marker_index == 0
    ]
    from passtally.markers import marker_destination

    destinations = [marker_destination(game.board, marker, m.distance) for m in markers]
    assert len(destinations) == len(set(destinations))


def test_no_place_moves_when_every_pile_is_empty():
    game = _setup()
    for pile in game.piles:
        pile.ordered.clear()
        pile.face_up = None
    assert not any(isinstance(m, PlaceTile) for m in game.legal_moves())
