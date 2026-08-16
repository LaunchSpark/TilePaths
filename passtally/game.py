"""Game state and the public API."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from passtally import config
from passtally.board import Board
from passtally.markers import marker_destination
from passtally.placement import can_place, place_tile
from passtally.tile_types import TILE_TYPES, offset_of
from passtally.trace import score_for
from passtally.types import Move, MoveMarker, PlaceTile, TypeId


@dataclass
class Pile:
    ordered: list[TypeId]  # ordered stack, NOT a multiset
    face_up: TypeId | None  # the one revealed tile


@dataclass
class Player:
    marker_slots: list[int] = field(default_factory=list)
    score: int = 0


@dataclass
class Game:
    board: Board
    piles: list[Pile]
    players: list[Player]
    current_player: int = 0
    actions_left: int = config.ACTIONS_PER_TURN
    first_player: int = 0
    _final_round: bool = False
    _over: bool = False

    # -- construction ----------------------------------------------------

    @classmethod
    def new(
        cls,
        n_players: int,
        seed: int | None = None,
        board_size: int = config.N,
    ) -> "Game":
        if not 2 <= n_players <= 3:
            raise ValueError(f"n_players must be 2 or 3, got {n_players}")

        deck = [
            type_id
            for type_id in sorted(TILE_TYPES)
            for _ in range(config.COPIES_PER_TYPE)
        ]
        random.Random(seed).shuffle(deck)

        piles: list[Pile] = []
        for index in range(config.N_PILES):
            start = index * config.TILES_PER_PILE
            ordered = deck[start : start + config.TILES_PER_PILE]
            pile = Pile(ordered=ordered, face_up=None)
            pile.face_up = pile.ordered.pop()
            piles.append(pile)

        return cls(
            board=Board.empty(board_size),
            piles=piles,
            players=[Player() for _ in range(n_players)],
        )

    def setup_place_marker(self, player: int, slot: int) -> None:
        entry = self.players[player]
        if len(entry.marker_slots) >= config.MARKERS_PER_PLAYER:
            raise ValueError(f"player {player} has already placed all markers")
        if not 0 <= slot < len(self.board.ring):
            raise ValueError(f"slot {slot} is not on the ring")
        if self.board.ring[slot].occupant is not None:
            raise ValueError(f"slot {slot} is occupied")

        edge = slot // self.board.n
        if any(existing // self.board.n == edge for existing in entry.marker_slots):
            raise ValueError(f"player {player} already has a marker on edge {edge}")

        marker_id = player * config.MARKERS_PER_PLAYER + len(entry.marker_slots)
        self.board.ring[slot].occupant = marker_id
        entry.marker_slots.append(slot)

    # -- moves -----------------------------------------------------------

    def apply(self, move: Move) -> None:
        if self._over:
            raise ValueError("the game is over")
        if isinstance(move, PlaceTile):
            self._apply_place(move)
        elif isinstance(move, MoveMarker):
            self._apply_marker(move)
        else:
            raise TypeError(f"unknown move type: {type(move).__name__}")

        self.actions_left -= 1
        if self.actions_left == 0:
            self._end_turn()

    def _apply_place(self, move: PlaceTile) -> None:
        pile = self.piles[move.pile_index]
        if pile.face_up is None:
            raise ValueError(f"pile {move.pile_index} is empty")

        offset = offset_of(move.orientation)
        expected = (move.cell_a[0] + offset[0], move.cell_a[1] + offset[1])
        if move.cell_b != expected:
            raise ValueError(
                f"cell_b {move.cell_b} contradicts orientation "
                f"{move.orientation}, which requires {expected}"
            )
        if not can_place(self.board, move.cell_a, move.cell_b):
            raise ValueError(f"illegal placement at {move.cell_a}/{move.cell_b}")

        place_tile(self.board, move.cell_a, move.cell_b, pile.face_up, move.orientation)
        pile.face_up = pile.ordered.pop() if pile.ordered else None

    def _apply_marker(self, move: MoveMarker) -> None:
        entry = self.players[self.current_player]
        if not 0 <= move.marker_index < len(entry.marker_slots):
            raise ValueError(f"no marker with index {move.marker_index}")
        if move.distance not in config.MARKER_DISTANCES:
            raise ValueError(f"distance must be one of {config.MARKER_DISTANCES}")

        source = entry.marker_slots[move.marker_index]
        destination = marker_destination(self.board, source, move.distance)
        if destination is None:
            raise ValueError("no reachable destination")

        marker_id = self.board.ring[source].occupant
        self.board.ring[source].occupant = None
        self.board.ring[destination].occupant = marker_id
        entry.marker_slots[move.marker_index] = destination

    # -- turn structure --------------------------------------------------

    def _end_turn(self) -> None:
        entry = self.players[self.current_player]
        entry.score += score_for(self.board, entry.marker_slots)

        if not self._final_round and self._trigger_fired():
            self._final_round = True

        self.current_player = (self.current_player + 1) % len(self.players)
        self.actions_left = config.ACTIONS_PER_TURN

        if self._final_round and self.current_player == self.first_player:
            self._over = True

    def _trigger_fired(self) -> bool:
        # Task 9 adds the second trigger: no tile can be placed anywhere.
        return all(pile.face_up is None for pile in self.piles)

    # -- queries ---------------------------------------------------------

    def legal_moves(self) -> list[Move]:
        raise NotImplementedError("implemented in Task 9")

    def is_over(self) -> bool:
        return self._over

    def winner(self) -> int | None:
        """The single highest scorer, or None if the game is unfinished or tied."""
        if not self._over:
            return None
        best = max(player.score for player in self.players)
        leaders = [i for i, player in enumerate(self.players) if player.score == best]
        return leaders[0] if len(leaders) == 1 else None
