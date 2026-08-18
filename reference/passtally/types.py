"""Core value types and grid geometry.

Side ordering is load-bearing: N=0, E=1, S=2, W=3 clockwise, so a 90 degree
clockwise turn is (value + 1) % 4 and the opposite face is (value + 2) % 4.
Every rotation in the codebase depends on it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

Pos = tuple[int, int]
TypeId = int


class Side(Enum):
    N = 0
    E = 1
    S = 2
    W = 3

    @property
    def opposite(self) -> "Side":
        return Side((self.value + 2) % 4)

    def rotated(self, quarter_turns: int) -> "Side":
        """Rotate clockwise by `quarter_turns` 90-degree steps."""
        return Side((self.value + quarter_turns) % 4)


class Result(Enum):
    """Non-slot outcomes of a trace."""

    DEAD = "dead"
    LOOP = "loop"


DELTA: dict[Side, Pos] = {
    Side.N: (-1, 0),
    Side.E: (0, 1),
    Side.S: (1, 0),
    Side.W: (0, -1),
}


def step(pos: Pos, side: Side) -> Pos:
    dr, dc = DELTA[side]
    return (pos[0] + dr, pos[1] + dc)


def orthogonally_adjacent(a: Pos, b: Pos) -> bool:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1


@dataclass(frozen=True)
class PlaceTile:
    pile_index: int
    cell_a: Pos
    cell_b: Pos
    orientation: int


@dataclass(frozen=True)
class MoveMarker:
    marker_index: int
    distance: int  # signed; sign is direction around the ring


Move = PlaceTile | MoveMarker
