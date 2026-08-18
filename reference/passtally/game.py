"""Game state and the public API."""

from __future__ import annotations

import copy
import random
from dataclasses import dataclass, field
from typing import Hashable

from passtally import config
from passtally.board import Board
from passtally.markers import marker_destination
from passtally.placement import can_place, place_tile
from passtally.tile_types import (
    ORIENTATIONS,
    TILE_TYPES,
    canon,
    distinct_orientations,
    offset_of,
)
from passtally.trace import score_for
from passtally.types import Move, MoveMarker, PlaceTile, Pos, TypeId


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
        if self.is_setup_complete():
            raise ValueError("setup is already complete; play has begun")
        if not 0 <= player < len(self.players):
            raise ValueError(f"player {player} does not exist")

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
        if not self.is_setup_complete():
            raise ValueError("setup is not complete: not every player has all their markers")
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
        if not 0 <= move.pile_index < len(self.piles):
            raise ValueError(f"pile_index {move.pile_index} is out of range")
        pile = self.piles[move.pile_index]
        if pile.face_up is None:
            raise ValueError(f"pile {move.pile_index} is empty")
        if move.orientation not in ORIENTATIONS:
            raise ValueError(f"orientation {move.orientation} is out of range")

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
        if all(pile.face_up is None for pile in self.piles):
            return True
        return not any(isinstance(m, PlaceTile) for m in self.legal_moves())

    # -- queries ---------------------------------------------------------

    def legal_moves(self) -> list[Move]:
        """Every distinct-outcome action for the current player, both types.

        Not every action `apply` would accept: marker moves are deduped by
        landing slot, so a distance that lands on a slot another distance
        already reaches is omitted here even though `apply` would accept it.

        Correctness matters even before there is a bot: the "no tile can be
        placed anywhere" end-of-game trigger depends on it.
        """
        moves: list[Move] = []

        for pile_index, pile in enumerate(self.piles):
            if pile.face_up is None:
                continue
            # Legality is footprint-only, so the tile identity affects nothing
            # here except which orientations are distinct.
            for orientation in distinct_orientations(pile.face_up):
                dr, dc = offset_of(orientation)
                for row in range(self.board.n):
                    for col in range(self.board.n):
                        cell_a = (row, col)
                        cell_b = (row + dr, col + dc)
                        if can_place(self.board, cell_a, cell_b):
                            moves.append(
                                PlaceTile(pile_index, cell_a, cell_b, orientation)
                            )

        entry = self.players[self.current_player]
        for marker_index, slot in enumerate(entry.marker_slots):
            reached: set[int] = set()
            for distance in config.MARKER_DISTANCES:
                destination = marker_destination(self.board, slot, distance)
                if destination is not None and destination not in reached:
                    reached.add(destination)
                    moves.append(MoveMarker(marker_index, distance))

        return moves

    def is_over(self) -> bool:
        return self._over

    def is_setup_complete(self) -> bool:
        """True once every player holds config.MARKERS_PER_PLAYER markers.

        Neither the design spec nor the plan defined when setup ends, so
        without this a caller could `apply` a full legal game with zero
        markers placed. `apply` requires this before any in-game move, and
        `setup_place_marker` refuses once it holds (play has begun).
        """
        return all(
            len(player.marker_slots) == config.MARKERS_PER_PLAYER
            for player in self.players
        )

    def winner(self) -> int | None:
        """The single highest scorer, or None if the game is unfinished or tied."""
        if not self._over:
            return None
        best = max(player.score for player in self.players)
        leaders = [i for i, player in enumerate(self.players) if player.score == best]
        return leaders[0] if len(leaders) == 1 else None

    def clone(self) -> "Game":
        """Deep copy, for future search. No closures or back-references to trip on."""
        return copy.deepcopy(self)

    def _partner_offset(self, row: int, col: int) -> Pos | None:
        """Offset of the neighbour sharing this cell's top placement id.

        Raw placement ids depend on move order, so they cannot go in the key.
        The offset carries the same information canonically.
        """
        cell = self.board.cells[row][col]
        if cell.placement_id is None:
            return None
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            neighbour = (row + dr, col + dc)
            if (
                self.board.in_bounds(neighbour)
                and self.board.at(neighbour).placement_id == cell.placement_id
            ):
                return (dr, dc)
        return None

    def key(self) -> Hashable:
        """Canonical hash: top tiles, markers, piles, scores, and turn state
        (current_player, actions_left, _final_round, _over).

        A placement's history is irrelevant once buried, so only the top tile
        at each cell contributes. Move-order permutations collapse into the
        same key, which is what makes this useful as a transposition key.
        """
        cells = tuple(
            (
                self.board.cells[row][col].height,
                canon(self.board.cells[row][col].conns)
                if self.board.cells[row][col].height
                else None,
                self._partner_offset(row, col),
            )
            for row in range(self.board.n)
            for col in range(self.board.n)
        )
        markers = tuple(tuple(sorted(p.marker_slots)) for p in self.players)
        piles = tuple((tuple(p.ordered), p.face_up) for p in self.piles)
        scores = tuple(p.score for p in self.players)
        return (
            cells,
            markers,
            piles,
            scores,
            self.current_player,
            self.actions_left,
            self._final_round,
            self._over,
        )
