"""Board state: cells, the border ring, and the mapping between them."""

from __future__ import annotations

from dataclasses import dataclass

from passtally.ring import Ring
from passtally.types import Pos, Side


@dataclass
class Cell:
    placement_id: int | None = None  # instance id of the TOP tile
    height: int = 0  # 0 == empty; otherwise the level of the top tile
    conns: tuple[tuple[Side, Side], ...] = ()

    def follow(self, entry: Side) -> Side | None:
        """The face a line entering through `entry` leaves by, or None."""
        for a, b in self.conns:
            if a is entry:
                return b
            if b is entry:
                return a
        return None


@dataclass
class Slot:
    row: int
    col: int
    side: Side  # the board edge this slot faces
    occupant: int | None = None  # marker id


def build_ring(n: int) -> list[Slot]:
    """Clockwise from the top-left corner. Corner cells appear twice."""
    slots: list[Slot] = []
    for c in range(n):
        slots.append(Slot(0, c, Side.N))
    for r in range(n):
        slots.append(Slot(r, n - 1, Side.E))
    for c in range(n - 1, -1, -1):
        slots.append(Slot(n - 1, c, Side.S))
    for r in range(n - 1, -1, -1):
        slots.append(Slot(r, 0, Side.W))
    return slots


def slot_index_of(n: int, row: int, col: int, side: Side) -> int:
    """Inverse of build_ring. Caller must guarantee the cell is on that edge."""
    if side is Side.N:
        return col
    if side is Side.E:
        return n + row
    if side is Side.S:
        return 2 * n + (n - 1 - col)
    return 3 * n + (n - 1 - row)


@dataclass
class Board:
    n: int
    cells: list[list[Cell]]
    ring: list[Slot]
    nav: Ring
    next_placement_id: int = 1

    @classmethod
    def empty(cls, n: int) -> "Board":
        return cls(
            n=n,
            cells=[[Cell() for _ in range(n)] for _ in range(n)],
            ring=build_ring(n),
            nav=Ring(n),
        )

    def in_bounds(self, pos: Pos) -> bool:
        r, c = pos
        return 0 <= r < self.n and 0 <= c < self.n

    def at(self, pos: Pos) -> Cell:
        return self.cells[pos[0]][pos[1]]
