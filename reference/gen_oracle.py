"""Generate differential oracle fixtures from the Python engine.

The Python engine is the reference implementation. Each fixture records a
complete random playout -- the explicit deal, the setup placements, every move,
and a portable state digest AFTER EVERY ACTION -- so the TypeScript port can
replay it and be checked step by step.

Run from anywhere: python reference/gen_oracle.py
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

# Resolved from this file, not the cwd, so the generator runs from anywhere.
_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from passtally import config  # noqa: E402  (needs sys.path above)
from passtally.game import Game  # noqa: E402
from passtally.types import PlaceTile  # noqa: E402

OUT = _REPO / "packages" / "rules" / "test" / "fixtures" / "oracle"
N_FIXTURES = 25
MAX_ACTIONS = 400


def digest(game: Game) -> str:
    """Portable canonical state. Key order is fixed and nothing is sorted --
    the TypeScript side builds the same object in the same order."""
    cells = []
    for row in range(game.board.n):
        out_row = []
        for col in range(game.board.n):
            cell = game.board.cells[row][col]
            if cell.height == 0:
                conns = None
            else:
                # Side is a plain Enum (not IntEnum), so int(a) raises -- use
                # .value to get the ordinal.
                pairs = sorted(sorted((a.value, b.value)) for a, b in cell.conns)
                conns = pairs
            # partner_offset is not a free function in passtally.board -- it is
            # a private method on Game (game.py:_partner_offset). Reading a
            # private member from a fixture generator is not a modification of
            # the reference; see the brief's note on _final_round / _over.
            p = game._partner_offset(row, col)
            out_row.append([cell.height, conns, list(p) if p else None])
        cells.append(out_row)

    obj = {
        "n": game.board.n,
        "cells": cells,
        "ring": [s.occupant for s in game.board.ring],
        "piles": [[p.face_up, list(p.ordered)] for p in game.piles],
        "players": [[list(p.marker_slots), p.score] for p in game.players],
        "cur": game.current_player,
        "act": game.actions_left,
        "first": game.first_player,
        "final": game._final_round,
        "over": game._over,
    }
    return json.dumps(obj, separators=(",", ":"))


def encode(move) -> dict:
    if isinstance(move, PlaceTile):
        return {
            "kind": "place", "pileIndex": move.pile_index,
            "cellA": list(move.cell_a), "cellB": list(move.cell_b),
            "orientation": move.orientation,
        }
    return {"kind": "marker", "markerIndex": move.marker_index, "distance": move.distance}


def snake_order(n_players: int) -> list[int]:
    order: list[int] = []
    for pass_index in range(config.MARKERS_PER_PLAYER):
        seq = range(n_players) if pass_index % 2 == 0 else reversed(range(n_players))
        order.extend(seq)
    return order


def playout(rng: random.Random, n_players: int, board_size: int) -> dict:
    game = Game.new(n_players, seed=rng.randrange(1 << 30), board_size=board_size)
    deal = [[p.face_up, list(p.ordered)] for p in game.piles]

    setup: list[list[int]] = []
    for player in snake_order(n_players):
        free = [
            i for i, s in enumerate(game.board.ring)
            if s.occupant is None
            and all(e // board_size != i // board_size for e in game.players[player].marker_slots)
        ]
        slot = rng.choice(free)
        game.setup_place_marker(player, slot)
        setup.append([player, slot])

    steps = [{"move": None, "digest": digest(game)}]
    for _ in range(MAX_ACTIONS):
        if game.is_over():
            break
        moves = game.legal_moves()
        if not moves:
            break
        move = rng.choice(moves)
        game.apply(move)
        steps.append({"move": encode(move), "digest": digest(game)})

    return {
        "nPlayers": n_players, "boardSize": board_size,
        "deal": deal, "setup": setup, "steps": steps,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    rng = random.Random(20260817)
    for i in range(N_FIXTURES):
        n_players = 2 if i % 3 else 3
        board_size = 6 if i % 4 else 4
        fixture = playout(rng, n_players, board_size)
        (OUT / f"playout-{i:02d}.json").write_text(
            json.dumps(fixture, separators=(",", ":")), encoding="utf-8"
        )
    print(f"wrote {N_FIXTURES} fixtures to {OUT}")


if __name__ == "__main__":
    main()
