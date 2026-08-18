from passtally import config
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
    """+1 and -1 land on the same slot only when the ring is saturated.

    For a fixed direction, |distance| 2 always needs strictly more empty slots
    than |distance| 1 along the same forward scan, so same-direction landings
    can never coincide -- a collision needs the forward and backward scans to
    converge, which requires leaving exactly one slot empty besides the
    marker's own. With more room than that, the two scans just find different
    slots and this test would pass whether or not the dedupe worked. Do not
    "simplify" this back to a lightly-occupied ring.
    """
    game = _setup(board_size=6)
    marker = game.players[0].marker_slots[0]

    # Occupy every other empty slot on the ring, leaving exactly one (target)
    # free. Both the forward (+1) and backward (-1) scans must then land on
    # that single free slot, while +-2 find no second free slot and are None.
    empty_slots = [
        slot
        for slot in range(len(game.board.ring))
        if slot != marker and game.board.ring[slot].occupant is None
    ]
    target, *fill = empty_slots
    for index, slot in enumerate(fill):
        game.board.ring[slot].occupant = 900 + index

    markers = [
        m
        for m in game.legal_moves()
        if isinstance(m, MoveMarker) and m.marker_index == 0
    ]
    from passtally.markers import marker_destination

    destinations = [marker_destination(game.board, marker, m.distance) for m in markers]
    assert len(destinations) == len(set(destinations))
    # The point of the exercise: without the dedupe, +1 and -1 would both
    # reach `target` and appear as two separate moves.
    assert len(markers) == 1
    assert len(markers) < len(config.MARKER_DISTANCES)


def test_no_place_moves_when_every_pile_is_empty():
    game = _setup()
    for pile in game.piles:
        pile.ordered.clear()
        pile.face_up = None
    assert not any(isinstance(m, PlaceTile) for m in game.legal_moves())
