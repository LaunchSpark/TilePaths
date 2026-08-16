from passtally.game import Game
from passtally.placement import place_tile
from passtally.types import PlaceTile


def _setup(seed=1, board_size=6) -> Game:
    game = Game.new(2, seed=seed, board_size=board_size)
    for player in range(2):
        for edge in range(4):
            game.setup_place_marker(player, edge * board_size + player)
    return game


def test_key_is_hashable():
    hash(_setup().key())


def test_clone_has_an_identical_key():
    game = _setup()
    assert game.clone().key() == game.key()


def test_clone_is_independent():
    game = _setup()
    twin = game.clone()
    twin.apply(PlaceTile(0, (2, 2), (3, 2), 0))
    assert game.board.at((2, 2)).height == 0
    assert twin.board.at((2, 2)).height == 1
    assert twin.key() != game.key()


def test_move_order_permutations_collapse_to_one_key():
    first = _setup()
    first.apply(PlaceTile(0, (2, 2), (3, 2), 0))
    first.apply(PlaceTile(1, (2, 4), (3, 4), 0))

    second = _setup()
    second.apply(PlaceTile(1, (2, 4), (3, 4), 0))
    second.apply(PlaceTile(0, (2, 2), (3, 2), 0))

    assert first.key() == second.key()


def test_key_distinguishes_placement_grouping():
    """Identical heights and connections everywhere, different tile boundaries.

    Both boards fill the same 2x2 block with cross cells at height 1. One pairs
    them into horizontal tiles, the other into vertical tiles. Nothing visible
    cell-by-cell differs -- but the grouping changes what may be stacked, so the
    keys must differ.
    """
    from passtally.tile_types import canon

    horizontal = Game.new(2, seed=1, board_size=4)
    place_tile(horizontal.board, (0, 0), (0, 1), 2, 3)
    place_tile(horizontal.board, (1, 0), (1, 1), 2, 3)

    vertical = Game.new(2, seed=1, board_size=4)
    place_tile(vertical.board, (0, 0), (1, 0), 2, 0)
    place_tile(vertical.board, (0, 1), (1, 1), 2, 0)

    # The two boards are indistinguishable cell by cell. Note conns are compared
    # via canon(): rotation reorders the pair tuple without changing the matching.
    for row in (0, 1):
        for col in (0, 1):
            left = horizontal.board.at((row, col))
            right = vertical.board.at((row, col))
            assert left.height == right.height == 1
            assert canon(left.conns) == canon(right.conns)

    assert horizontal.key() != vertical.key()


def test_key_ignores_raw_placement_ids():
    """Two boards built in different orders hash the same."""
    forward = Game.new(2, seed=1, board_size=4)
    place_tile(forward.board, (0, 0), (1, 0), 2, 0)
    place_tile(forward.board, (0, 2), (1, 2), 2, 0)

    backward = Game.new(2, seed=1, board_size=4)
    place_tile(backward.board, (0, 2), (1, 2), 2, 0)
    place_tile(backward.board, (0, 0), (1, 0), 2, 0)

    assert forward.key() == backward.key()
