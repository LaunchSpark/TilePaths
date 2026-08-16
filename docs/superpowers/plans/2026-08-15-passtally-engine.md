# Passtally Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a headless Python rules engine for Passtally — a `Game` that can be constructed, queried for legal moves, advanced by a move, and scored.

**Architecture:** Cell-indexed board state with a flat 1D border ring, so marker movement is index arithmetic and the tracer has no special case for board edges. Tile rotations are resolved into per-cell connection pairs at import time; the tracer never does orientation math. Placement legality is support-only — the tile set makes connection continuity vacuous.

**Tech Stack:** Python 3.11+, stdlib only, pytest. No third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-passtally-engine-design.md`

## Global Constraints

- Python **3.11+** (required for `X | Y` unions in runtime annotations).
- **No third-party runtime dependencies.** pytest is dev-only.
- **Every rule constant lives in `config.py`**, each with a `# TODO: verify against rulebook` comment. Nothing is hardcoded elsewhere — in particular, no module may assume board size 6.
- **`can_place` must be pure** — it must not mutate the board.
- **Type hints throughout.** Every function signature annotated.
- **`Side` values are `N=0, E=1, S=2, W=3`** — clockwise. `opposite` is `(v+2)%4`, a 90° clockwise turn is `(v+1)%4`. Every rotation in the codebase depends on this ordering.
- **Rows increase downward.** `Side.N` is `(-1, 0)`.
- Package lives in `passtally/`, tests in `tests/`.
- Commit after every task.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `pyproject.toml` | packaging + pytest config |
| `passtally/config.py` | every rule constant, nothing else |
| `passtally/types.py` | `Side`, `Result`, `Pos`, `TypeId`, `Move` union, grid geometry helpers |
| `passtally/ring.py` | `Ring` — the single swappable seam for the corner rule |
| `passtally/board.py` | `Cell`, `Slot`, `Board`, ring construction, slot index round-trip |
| `passtally/tile_types.py` | the 6 designs, shape validator, rotation cache, orientation dedupe |
| `passtally/placement.py` | `can_place` (pure), `place_tile` |
| `passtally/trace.py` | `trace_from`, `trace`, `passes_to_vp`, `score_lines`, `score_for` |
| `passtally/markers.py` | `marker_destination` — occupied-slot jumping |
| `passtally/game.py` | `Pile`, `Player`, `Game` — turn structure, end conditions, public API |

**Two deviations from the spec's module layout, both deliberate:**

1. `place_tile` mutates the *board* only; pile bookkeeping lives in `game.py`. This keeps `placement.py` free of game-level state and makes it trivially testable.
2. Scoring functions take `(board, marker_slots)` and *return* VP rather than mutating a `Player`. This keeps `trace.py` free of a `Player` import and avoids a circular dependency with `game.py`.

---

### Task 1: Project scaffold, constants, and geometry primitives

**Files:**
- Create: `pyproject.toml`, `passtally/__init__.py`, `passtally/config.py`, `passtally/types.py`
- Test: `tests/test_types.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Side` (with `.opposite` property and `.rotated(k)` method), `Result`, `Pos = tuple[int, int]`, `TypeId = int`, `DELTA: dict[Side, Pos]`, `step(pos, side) -> Pos`, `orthogonally_adjacent(a, b) -> bool`, `PlaceTile`, `MoveMarker`, `Move`. All config constants.

- [ ] **Step 1: Create the package scaffold**

`pyproject.toml`:

```toml
[project]
name = "passtally"
version = "0.1.0"
description = "Headless rules engine for a Passtally-like tile game"
requires-python = ">=3.11"
dependencies = []

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["passtally*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Create empty `passtally/__init__.py` and `tests/__init__.py`.

- [ ] **Step 2: Write `passtally/config.py`**

```python
"""Every rule constant for the engine. Nothing else belongs here."""

from __future__ import annotations

# Board dimension. Parameterised everywhere; nothing may assume this value.
N = 6  # TODO: verify against rulebook

# Whether markers may travel around a corner onto the adjacent edge.
# Only True is implemented; see ring.Ring.
RING_CONTINUOUS = True  # TODO: verify against rulebook

# The rules give two contradictory end-of-game timings. We implement the
# round-completion path; this flag marks the unimplemented alternative.
END_IMMEDIATELY_ON_EMPTY = False  # TODO: verify against rulebook

N_PILES = 3
COPIES_PER_TYPE = 7
TILES_PER_PILE = 14
ACTIONS_PER_TURN = 2
MARKERS_PER_PLAYER = 4
MARKER_DISTANCES = (-2, -1, 1, 2)

# (min_passes, victory_points), ascending. Look up by taking the last entry
# whose min_passes <= total. Band widths are the natural numbers, so every
# threshold is 1 + n(n-1)/2 -- but the top band breaks the pattern by jumping
# to 15 VP, so this stays a literal table rather than a formula.
PASSES_TO_VP: list[tuple[int, int]] = [
    (0, 0),
    (1, 1),
    (2, 2),
    (4, 3),
    (7, 4),
    (11, 5),
    (16, 6),
    (22, 7),
    (29, 8),
    (37, 9),  # TODO: source table read "31-45", which overlapped "29-36"
    (46, 10),
    (56, 15),
]
```

- [ ] **Step 3: Write the failing test**

`tests/test_types.py`:

```python
import pytest

from passtally.types import (
    DELTA,
    MoveMarker,
    PlaceTile,
    Side,
    orthogonally_adjacent,
    step,
)


def test_side_values_are_clockwise():
    assert [s.value for s in (Side.N, Side.E, Side.S, Side.W)] == [0, 1, 2, 3]


@pytest.mark.parametrize("side", list(Side))
def test_opposite_is_an_involution(side):
    assert side.opposite.opposite is side


@pytest.mark.parametrize("side", list(Side))
def test_opposite_is_never_self(side):
    assert side.opposite is not side


@pytest.mark.parametrize("side", list(Side))
def test_four_quarter_turns_is_identity(side):
    assert side.rotated(4) is side


def test_one_quarter_turn_is_clockwise():
    assert Side.N.rotated(1) is Side.E
    assert Side.E.rotated(1) is Side.S
    assert Side.S.rotated(1) is Side.W
    assert Side.W.rotated(1) is Side.N


def test_two_quarter_turns_equals_opposite():
    for side in Side:
        assert side.rotated(2) is side.opposite


def test_deltas_treat_north_as_decreasing_row():
    assert DELTA[Side.N] == (-1, 0)
    assert DELTA[Side.E] == (0, 1)
    assert DELTA[Side.S] == (1, 0)
    assert DELTA[Side.W] == (0, -1)


def test_step_applies_the_delta():
    assert step((3, 3), Side.N) == (2, 3)
    assert step((3, 3), Side.W) == (3, 2)


def test_orthogonally_adjacent():
    assert orthogonally_adjacent((1, 1), (1, 2))
    assert orthogonally_adjacent((1, 1), (0, 1))
    assert not orthogonally_adjacent((1, 1), (1, 1))
    assert not orthogonally_adjacent((1, 1), (2, 2))
    assert not orthogonally_adjacent((1, 1), (1, 3))


def test_moves_are_hashable_value_objects():
    assert PlaceTile(0, (1, 1), (1, 2), 3) == PlaceTile(0, (1, 1), (1, 2), 3)
    assert len({MoveMarker(0, 2), MoveMarker(0, 2)}) == 1
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python -m pytest tests/test_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.types'`

- [ ] **Step 5: Write `passtally/types.py`**

```python
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python -m pytest tests/test_types.py -v`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml passtally tests
git commit -m "feat: package scaffold, rule constants, and grid geometry"
```

---

### Task 2: Ring and Board

**Files:**
- Create: `passtally/ring.py`, `passtally/board.py`
- Test: `tests/test_ring.py`, `tests/test_board.py`

**Interfaces:**
- Consumes: `Side`, `Pos` from `passtally.types`; `RING_CONTINUOUS` from `passtally.config`.
- Produces: `Ring(n, continuous=RING_CONTINUOUS)` with `.n`, `.size`, `.move(slot, distance) -> int`; `Cell(placement_id, height, conns)` with `.follow(entry) -> Side | None`; `Slot(row, col, side, occupant)`; `build_ring(n) -> list[Slot]`; `slot_index_of(n, row, col, side) -> int`; `Board.empty(n)` with `.n`, `.cells`, `.ring`, `.nav`, `.next_placement_id`, `.in_bounds(pos)`, `.at(pos)`.

**Ring layout** (clockwise from the top-left, `4n` slots):

| slots | edge | cells | side |
| ----- | ---- | ----- | ---- |
| `0 .. n-1` | north | `(0, 0)` → `(0, n-1)` | `N` |
| `n .. 2n-1` | east | `(0, n-1)` → `(n-1, n-1)` | `E` |
| `2n .. 3n-1` | south | `(n-1, n-1)` → `(n-1, 0)` | `S` |
| `3n .. 4n-1` | west | `(n-1, 0)` → `(0, 0)` | `W` |

Corner cells legitimately appear twice, under two different sides.

- [ ] **Step 1: Write the failing tests**

`tests/test_ring.py`:

```python
import pytest

from passtally.ring import Ring


def test_size_is_four_n():
    assert Ring(6).size == 24


def test_move_wraps_forward():
    ring = Ring(6)
    assert ring.move(23, 1) == 0
    assert ring.move(22, 3) == 1


def test_move_wraps_backward():
    ring = Ring(6)
    assert ring.move(0, -1) == 23
    assert ring.move(1, -3) == 22


def test_move_by_zero_is_identity():
    assert Ring(6).move(7, 0) == 7


def test_discontinuous_ring_is_not_implemented():
    with pytest.raises(NotImplementedError):
        Ring(6, continuous=False)
```

`tests/test_board.py`:

```python
import pytest

from passtally.board import Board, Cell, build_ring, slot_index_of
from passtally.types import Side


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_slot_index_round_trip_is_exhaustive(n):
    ring = build_ring(n)
    assert len(ring) == 4 * n
    for i, slot in enumerate(ring):
        assert slot_index_of(n, slot.row, slot.col, slot.side) == i


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_every_ring_slot_is_on_the_border(n):
    for slot in build_ring(n):
        assert slot.row in (0, n - 1) or slot.col in (0, n - 1)


@pytest.mark.parametrize("n", [4, 5, 6, 7, 8])
def test_ring_entries_are_unique(n):
    seen = {(s.row, s.col, s.side) for s in build_ring(n)}
    assert len(seen) == 4 * n


def test_corner_cell_appears_under_two_sides():
    ring = build_ring(6)
    corner = [(s.side) for s in ring if (s.row, s.col) == (0, 0)]
    assert set(corner) == {Side.N, Side.W}


def test_ring_starts_at_top_left_going_clockwise():
    ring = build_ring(6)
    assert (ring[0].row, ring[0].col, ring[0].side) == (0, 0, Side.N)
    assert (ring[6].row, ring[6].col, ring[6].side) == (0, 5, Side.E)
    assert (ring[12].row, ring[12].col, ring[12].side) == (5, 5, Side.S)
    assert (ring[18].row, ring[18].col, ring[18].side) == (5, 0, Side.W)


def test_empty_board_is_empty():
    board = Board.empty(6)
    assert board.n == 6
    assert all(c.height == 0 and c.placement_id is None for row in board.cells for c in row)
    assert all(s.occupant is None for s in board.ring)


def test_in_bounds():
    board = Board.empty(6)
    assert board.in_bounds((0, 0))
    assert board.in_bounds((5, 5))
    assert not board.in_bounds((-1, 0))
    assert not board.in_bounds((6, 0))
    assert not board.in_bounds((0, 6))


def test_cell_follow_matches_either_end_of_a_pair():
    cell = Cell(placement_id=1, height=1, conns=((Side.N, Side.W), (Side.S, Side.E)))
    assert cell.follow(Side.N) is Side.W
    assert cell.follow(Side.W) is Side.N
    assert cell.follow(Side.S) is Side.E
    assert cell.follow(Side.E) is Side.S


def test_cell_follow_returns_none_when_face_is_absent():
    assert Cell(placement_id=1, height=1, conns=((Side.N, Side.S),)).follow(Side.E) is None
    assert Cell().follow(Side.N) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_ring.py tests/test_board.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.ring'`

- [ ] **Step 3: Write `passtally/ring.py`**

```python
"""The border ring.

This class is the single seam for the corner-continuity rule. If markers turn
out to be blocked at corners, only `move` changes -- nothing else in the engine
knows how ring indices relate to board edges.
"""

from __future__ import annotations

from passtally import config


class Ring:
    def __init__(self, n: int, continuous: bool = config.RING_CONTINUOUS) -> None:
        if not continuous:
            raise NotImplementedError(
                "Only the continuous ring is implemented. To block markers at "
                "corners, reimplement Ring.move -- no other module needs to change."
            )
        self.n = n
        self.size = 4 * n
        self.continuous = continuous

    def move(self, slot: int, distance: int) -> int:
        """Raw ring arithmetic. Ignores occupancy -- see markers.marker_destination."""
        return (slot + distance) % self.size
```

- [ ] **Step 4: Write `passtally/board.py`**

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_ring.py tests/test_board.py -v`
Expected: PASS — including the round-trip across N in 4..8.

- [ ] **Step 6: Commit**

```bash
git add passtally/ring.py passtally/board.py tests/test_ring.py tests/test_board.py
git commit -m "feat: ring construction, slot index round-trip, and board state"
```

---

### Task 3: Tile types, validator, and rotation cache

**Files:**
- Create: `passtally/tile_types.py`
- Test: `tests/test_tile_types.py`

**Interfaces:**
- Consumes: `Side`, `TypeId`, `DELTA` from `passtally.types`.
- Produces: `TILE_TYPES: dict[TypeId, tuple[CellConns, CellConns]]`, `ORIENTATIONS = (0,1,2,3)`, `canon(conns) -> frozenset`, `shape_of(conns) -> str`, `resolve(type_id, orientation) -> tuple[CellConns, CellConns]`, `offset_of(orientation) -> Pos`, `distinct_orientations(type_id) -> tuple[int, ...]`.

**Orientation convention.** Orientation `k` is `k` quarter-turns clockwise from canonical. Canonical (`k=0`) is vertical with `cell_b` to the SOUTH of `cell_a`. Rotating the tile rotates the a→b direction the same way, so the direction is `Side((Side.S.value + k) % 4)`:

| orientation | a→b direction | offset |
| ----------- | ------------- | ------ |
| 0 | S | `(1, 0)` |
| 1 | W | `(0, -1)` |
| 2 | N | `(-1, 0)` |
| 3 | E | `(0, 1)` |

**Dedupe.** Two orientations are equivalent when they produce the same board content over the same footprint. Normalise by anchoring the pair at its topmost-then-leftmost cell and comparing the resulting `(relative_position, canonical_conns)` sequence. Orientations 0 and 2 collapse exactly when the tile's two cells have the same shape — which is tiles 2, 5 and 6.

- [ ] **Step 1: Write the failing test**

`tests/test_tile_types.py`:

```python
import pytest

from passtally.tile_types import (
    ORIENTATIONS,
    TILE_TYPES,
    canon,
    distinct_orientations,
    offset_of,
    resolve,
    shape_of,
)
from passtally.types import Side


def test_there_are_six_designs():
    assert sorted(TILE_TYPES) == [1, 2, 3, 4, 5, 6]


def test_shapes_match_the_spec_table():
    expected = {
        1: ("B", "A"),
        2: ("X", "X"),
        3: ("X", "A"),
        4: ("X", "B"),
        5: ("B", "B"),
        6: ("A", "A"),
    }
    actual = {tid: (shape_of(a), shape_of(b)) for tid, (a, b) in TILE_TYPES.items()}
    assert actual == expected


def test_the_six_designs_cover_every_unordered_shape_pair():
    pairs = {
        tuple(sorted((shape_of(a), shape_of(b)))) for a, b in TILE_TYPES.values()
    }
    assert len(pairs) == 6


def test_shape_of_rejects_a_non_matching_cell():
    with pytest.raises(ValueError):
        shape_of(((Side.N, Side.E),))


@pytest.mark.parametrize("type_id", [1, 2, 3, 4, 5, 6])
@pytest.mark.parametrize("orientation", ORIENTATIONS)
def test_every_resolved_cell_is_a_perfect_matching(type_id, orientation):
    for conns in resolve(type_id, orientation):
        assert shape_of(conns) in {"X", "A", "B"}
        faces = [face for pair in conns for face in pair]
        assert sorted(f.value for f in faces) == [0, 1, 2, 3]


@pytest.mark.parametrize("type_id", [1, 2, 3, 4, 5, 6])
def test_four_rotations_return_to_canonical(type_id):
    original = tuple(canon(c) for c in resolve(type_id, 0))
    for turns in (0, 4, 8):
        assert tuple(canon(c) for c in resolve(type_id, turns % 4)) == original


def test_offsets_follow_the_orientation_convention():
    assert offset_of(0) == (1, 0)
    assert offset_of(1) == (0, -1)
    assert offset_of(2) == (-1, 0)
    assert offset_of(3) == (0, 1)


def test_distinct_orientation_counts():
    counts = {tid: len(distinct_orientations(tid)) for tid in TILE_TYPES}
    assert counts == {1: 4, 2: 2, 3: 4, 4: 4, 5: 2, 6: 2}


def test_symmetric_tiles_keep_the_first_of_each_equivalent_pair():
    assert distinct_orientations(2) == (0, 1)
    assert distinct_orientations(5) == (0, 1)
    assert distinct_orientations(6) == (0, 1)
    assert distinct_orientations(1) == (0, 1, 2, 3)


def test_rotating_a_turn_shape_swaps_a_and_b():
    a_cell = ((Side.N, Side.E), (Side.S, Side.W))
    assert shape_of(a_cell) == "A"
    from passtally.tile_types import rot_conns

    assert shape_of(rot_conns(a_cell, 1)) == "B"
    assert shape_of(rot_conns(a_cell, 2)) == "A"


def test_rotating_the_cross_shape_is_a_no_op():
    from passtally.tile_types import rot_conns

    x_cell = ((Side.N, Side.S), (Side.E, Side.W))
    for turns in ORIENTATIONS:
        assert shape_of(rot_conns(x_cell, turns)) == "X"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_tile_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.tile_types'`

- [ ] **Step 3: Write `passtally/tile_types.py`**

```python
"""The six tile designs, and everything derived from them at import time.

Canonical orientation is vertical: cell_b lies to the SOUTH of cell_a, and the
shared seam is cell_a's S face against cell_b's N face.

Every cell pairs all four faces exactly once, so a cell is one of only three
shapes: X (N-S, E-W), A (N-E, S-W), B (N-W, S-E). The shape vocabulary exists
here and nowhere else -- it validates the data and drives orientation dedupe,
but the engine itself reads the general `conns` form and stays data-agnostic.
"""

from __future__ import annotations

from passtally.types import DELTA, Pos, Side, TypeId

Pair = tuple[Side, Side]
CellConns = tuple[Pair, ...]

_N, _E, _S, _W = Side.N, Side.E, Side.S, Side.W

TILE_TYPES: dict[TypeId, tuple[CellConns, CellConns]] = {
    1: (((_W, _N), (_S, _E)), ((_N, _E), (_W, _S))),
    2: (((_N, _S), (_E, _W)), ((_N, _S), (_E, _W))),
    3: (((_N, _S), (_E, _W)), ((_N, _E), (_S, _W))),
    4: (((_N, _S), (_E, _W)), ((_S, _E), (_N, _W))),
    5: (((_S, _E), (_N, _W)), ((_S, _E), (_N, _W))),
    6: (((_N, _E), (_S, _W)), ((_N, _E), (_S, _W))),
}

ORIENTATIONS: tuple[int, ...] = (0, 1, 2, 3)

# Orientation k is k quarter-turns clockwise from canonical, so the a->b
# direction rotates with it: canonical S, then W, N, E.
_DIRECTION: dict[int, Side] = {k: Side((Side.S.value + k) % 4) for k in ORIENTATIONS}
_OFFSET: dict[int, Pos] = {k: DELTA[_DIRECTION[k]] for k in ORIENTATIONS}

_SHAPES: dict[frozenset[frozenset[Side]], str] = {
    frozenset({frozenset({_N, _S}), frozenset({_E, _W})}): "X",
    frozenset({frozenset({_N, _E}), frozenset({_S, _W})}): "A",
    frozenset({frozenset({_N, _W}), frozenset({_S, _E})}): "B",
}


def canon(conns: CellConns) -> frozenset[frozenset[Side]]:
    """Order-independent form, for comparison and hashing."""
    return frozenset(frozenset(pair) for pair in conns)


def shape_of(conns: CellConns) -> str:
    """X, A or B. Raises if the cell is not a perfect matching of all four faces."""
    try:
        return _SHAPES[canon(conns)]
    except KeyError:
        raise ValueError(
            f"cell {conns} is not a perfect matching of N/E/S/W -- "
            "every cell must pair up all four faces exactly once"
        ) from None


def rot_conns(conns: CellConns, quarter_turns: int) -> CellConns:
    """Rotate a cell's connections clockwise. Each pair is sorted for canonicity."""
    return tuple(
        tuple(sorted((a.rotated(quarter_turns), b.rotated(quarter_turns)), key=lambda s: s.value))
        for a, b in conns
    )


def _validate() -> None:
    """Fail loudly at import if the tile data violates its invariants."""
    seen: set[tuple[str, str]] = set()
    for type_id, (cell_a, cell_b) in TILE_TYPES.items():
        key = tuple(sorted((shape_of(cell_a), shape_of(cell_b))))
        if key in seen:
            raise ValueError(f"tile {type_id} duplicates the shape pair {key}")
        seen.add(key)
    if len(seen) != 6:
        raise ValueError(
            f"expected all 6 unordered shape pairs, got {len(seen)}: {sorted(seen)}"
        )


_validate()

_RESOLVED: dict[tuple[TypeId, int], tuple[CellConns, CellConns]] = {
    (type_id, k): (rot_conns(cell_a, k), rot_conns(cell_b, k))
    for type_id, (cell_a, cell_b) in TILE_TYPES.items()
    for k in ORIENTATIONS
}


def resolve(type_id: TypeId, orientation: int) -> tuple[CellConns, CellConns]:
    """Precomputed. The hot loop never rotates anything."""
    return _RESOLVED[(type_id, orientation)]


def offset_of(orientation: int) -> Pos:
    """Offset from cell_a to cell_b. Needed before a tile is chosen."""
    return _OFFSET[orientation]


def _signature(type_id: TypeId, orientation: int):
    """Board content this orientation produces, anchored top-left."""
    conns_a, conns_b = resolve(type_id, orientation)
    dr, dc = offset_of(orientation)
    cells = sorted(
        [((0, 0), canon(conns_a)), ((dr, dc), canon(conns_b))],
        key=lambda entry: entry[0],
    )
    base_r, base_c = cells[0][0]
    return tuple(
        ((pos[0] - base_r, pos[1] - base_c), conns) for pos, conns in cells
    )


def _distinct(type_id: TypeId) -> tuple[int, ...]:
    kept: list[int] = []
    seen = set()
    for k in ORIENTATIONS:
        signature = _signature(type_id, k)
        if signature not in seen:
            seen.add(signature)
            kept.append(k)
    return tuple(kept)


DISTINCT_ORIENTATIONS: dict[TypeId, tuple[int, ...]] = {
    type_id: _distinct(type_id) for type_id in TILE_TYPES
}


def distinct_orientations(type_id: TypeId) -> tuple[int, ...]:
    """Orientations producing distinct board states. Tiles 2, 5 and 6 have only 2."""
    return DISTINCT_ORIENTATIONS[type_id]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_tile_types.py -v`
Expected: PASS — in particular the `{1: 4, 2: 2, 3: 4, 4: 4, 5: 2, 6: 2}` dedupe counts.

- [ ] **Step 5: Commit**

```bash
git add passtally/tile_types.py tests/test_tile_types.py
git commit -m "feat: tile designs with shape validator and rotation cache"
```

---

### Task 4: Placement legality and commit

**Files:**
- Create: `passtally/placement.py`
- Test: `tests/test_placement.py`

**Interfaces:**
- Consumes: `Board` from `passtally.board`; `resolve` from `passtally.tile_types`; `Pos`, `orthogonally_adjacent` from `passtally.types`.
- Produces: `can_place(board, pos_a, pos_b) -> bool` (pure), `place_tile(board, pos_a, pos_b, type_id, orientation) -> int` returning the new `placement_id`.

**Note the signature.** `can_place` takes no `type_id` or `orientation`. With connection continuity retired, legality depends only on the footprint — if any tile fits a footprint, all of them do. `legal_moves` exploits this by testing each footprint once.

- [ ] **Step 1: Write the failing test**

`tests/test_placement.py`:

```python
import copy

from passtally.board import Board
from passtally.placement import can_place, place_tile


def test_empty_adjacent_cells_are_legal():
    board = Board.empty(6)
    assert can_place(board, (0, 0), (0, 1))
    assert can_place(board, (0, 0), (1, 0))


def test_non_adjacent_cells_are_illegal():
    board = Board.empty(6)
    assert not can_place(board, (0, 0), (0, 2))
    assert not can_place(board, (0, 0), (1, 1))
    assert not can_place(board, (0, 0), (0, 0))


def test_off_board_cells_are_illegal():
    board = Board.empty(6)
    assert not can_place(board, (0, 0), (-1, 0))
    assert not can_place(board, (5, 5), (6, 5))


def test_place_tile_sets_id_height_and_conns():
    board = Board.empty(6)
    pid = place_tile(board, (0, 0), (1, 0), 2, 0)
    assert pid == 1
    assert board.at((0, 0)).placement_id == pid
    assert board.at((1, 0)).placement_id == pid
    assert board.at((0, 0)).height == 1
    assert board.at((1, 0)).height == 1
    assert board.at((0, 0)).conns != ()
    assert board.next_placement_id == 2


def test_level_two_on_two_level_one_tiles_is_legal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    # (0,0) and (0,1) are both height 1 with different placement ids.
    assert can_place(board, (0, 0), (0, 1))


def test_straddling_both_halves_of_one_tile_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    assert not can_place(board, (0, 0), (1, 0))


def test_spanning_two_different_heights_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    place_tile(board, (0, 0), (0, 1), 2, 3)  # level 2 across the two towers
    # (0,0) is now height 2, (1,0) is still height 1.
    assert not can_place(board, (0, 0), (1, 0))


def test_half_on_a_tile_and_half_on_bare_board_is_illegal():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    assert not can_place(board, (0, 0), (0, 1))  # (0,1) is empty


def test_stacking_increments_height_and_replaces_the_top():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    place_tile(board, (0, 1), (1, 1), 2, 0)
    top = place_tile(board, (0, 0), (0, 1), 6, 3)
    assert board.at((0, 0)).height == 2
    assert board.at((0, 1)).height == 2
    assert board.at((0, 0)).placement_id == top
    assert board.at((1, 0)).height == 1  # untouched


def test_can_place_does_not_mutate():
    board = Board.empty(6)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    before = copy.deepcopy(board)
    for a, b in (((0, 0), (0, 1)), ((0, 0), (1, 0)), ((3, 3), (3, 4))):
        can_place(board, a, b)
    assert board == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_placement.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.placement'`

- [ ] **Step 3: Write `passtally/placement.py`**

```python
"""Placement legality and commit.

Legality is support-only. Every cell in this tile set carries a line on all
four faces, so a connection-continuity check would compare True against True
on every shared face and could never fail. It is deliberately absent.
"""

from __future__ import annotations

from passtally.board import Board
from passtally.tile_types import resolve
from passtally.types import Pos, TypeId, orthogonally_adjacent


def can_place(board: Board, pos_a: Pos, pos_b: Pos) -> bool:
    """Pure. Depends only on the footprint -- if any tile fits, all of them do."""
    if not (board.in_bounds(pos_a) and board.in_bounds(pos_b)):
        return False
    if not orthogonally_adjacent(pos_a, pos_b):
        return False

    a, b = board.at(pos_a), board.at(pos_b)
    if a.height != b.height:
        return False  # differing heights
    if a.height > 0 and a.placement_id == b.placement_id:
        return False  # straddling both halves of one tile
    return True


def place_tile(
    board: Board, pos_a: Pos, pos_b: Pos, type_id: TypeId, orientation: int
) -> int:
    """Commit a placement. Returns the new placement id. Board state only --
    pile bookkeeping belongs to the caller."""
    pid = board.next_placement_id
    board.next_placement_id += 1
    conns_a, conns_b = resolve(type_id, orientation)
    for pos, conns in ((pos_a, conns_a), (pos_b, conns_b)):
        cell = board.at(pos)
        cell.placement_id = pid
        cell.height += 1
        cell.conns = conns
    return pid
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_placement.py -v`
Expected: PASS — all four support cases from the spec.

- [ ] **Step 5: Commit**

```bash
git add passtally/placement.py tests/test_placement.py
git commit -m "feat: support-only placement legality and commit"
```

---

### Task 5: Line tracing

**Files:**
- Create: `passtally/trace.py`
- Test: `tests/test_trace.py`

**Interfaces:**
- Consumes: `Board`, `slot_index_of` from `passtally.board`; `Result`, `Side`, `step` from `passtally.types`.
- Produces: `trace_from(board, row, col, entry) -> tuple[Result | int, int]`, `trace(board, start_slot) -> tuple[Result | int, int]`. The first element is a `Result` member or an `int` ring-slot index; the second is the pass count.

**Two rules the implementation must not "simplify":**

1. The visited set is keyed on `(row, col, entry_face)`, **not** on the cell. Re-entering a cell through a different face is legal and must keep counting.
2. `placement_id` is compared against the **previous step only**, never against a set of everything seen. A line may cross the same tile more than once and each crossing scores. A seam crossing leaves `placement_id` unchanged and correctly adds nothing.

`trace_from` exists as a separate entry point because the public API cannot reach a closed circuit — those are only ever detached from the border — so the loop test calls it directly.

- [ ] **Step 1: Write the failing test**

`tests/test_trace.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_trace.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.trace'`

- [ ] **Step 3: Write `passtally/trace.py`**

```python
"""Line tracing.

Because every cell pairs its four faces bijectively, `Cell.follow` is an
involution and the whole step relation is reversible. A trace starting from a
border slot therefore cannot loop: revisiting a state would require two
predecessors, and the reverse trajectory would have to exit off-board. The
LOOP guard is kept regardless -- it is three lines, and it is the difference
between a bug and a hang if the tile data is ever revised.
"""

from __future__ import annotations

from passtally.board import Board, slot_index_of
from passtally.types import Result, Side, step


def trace_from(
    board: Board, row: int, col: int, entry: Side
) -> tuple[Result | int, int]:
    """Follow a line from a cell and entry face. Returns (endpoint, passes),
    where endpoint is a Result member or a ring-slot index."""
    passes = 0
    last_id: int | None = None
    seen: set[tuple[int, int, Side]] = set()

    while True:
        # Keyed by (cell, ENTRY FACE) -- not by cell. Re-entering the same cell
        # through a different face is legal and must keep counting.
        key = (row, col, entry)
        if key in seen:
            return (Result.LOOP, passes)
        seen.add(key)

        cell = board.cells[row][col]
        if cell.placement_id is None:
            return (Result.DEAD, passes)

        exit_face = cell.follow(entry)
        if exit_face is None:
            return (Result.DEAD, passes)

        # Compare against the PREVIOUS STEP ONLY, never a visited-set. A line
        # may cross the same tile more than once and each crossing scores; a
        # set would silently eat the second pass. A seam crossing leaves
        # placement_id unchanged and correctly adds nothing.
        if cell.placement_id != last_id:
            passes += cell.height
            last_id = cell.placement_id

        next_row, next_col = step((row, col), exit_face)
        if not board.in_bounds((next_row, next_col)):
            return (slot_index_of(board.n, row, col, exit_face), passes)
        row, col, entry = next_row, next_col, exit_face.opposite


def trace(board: Board, start_slot: int) -> tuple[Result | int, int]:
    """Follow the line entering the board at a ring slot."""
    slot = board.ring[start_slot]
    return trace_from(board, slot.row, slot.col, slot.side)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_trace.py -v`
Expected: PASS — especially `test_crossing_the_same_tile_twice_counts_twice` at 3, not 2.

- [ ] **Step 5: Commit**

```bash
git add passtally/trace.py tests/test_trace.py
git commit -m "feat: line tracing with per-crossing pass counting"
```

---

### Task 6: Scoring

**Files:**
- Modify: `passtally/trace.py` (append the scoring functions)
- Test: `tests/test_scoring.py`

**Interfaces:**
- Consumes: `PASSES_TO_VP` from `passtally.config`; `trace` from this module.
- Produces: `passes_to_vp(total) -> int`, `score_lines(board, marker_slots) -> dict[frozenset[int], int]`, `score_for(board, marker_slots) -> int`.

Scoring takes `marker_slots` and *returns* VP rather than mutating a `Player`, which keeps `trace.py` free of any `game.py` import.

- [ ] **Step 1: Write the failing test**

`tests/test_scoring.py`:

```python
import pytest

from passtally.board import Board, slot_index_of
from passtally.placement import place_tile
from passtally.trace import passes_to_vp, score_for, score_lines
from passtally.types import Side


@pytest.mark.parametrize(
    "total,expected",
    [
        (0, 0), (1, 1), (2, 2), (3, 2), (4, 3), (6, 3), (7, 4), (10, 4),
        (11, 5), (15, 5), (16, 6), (21, 6), (22, 7), (28, 7), (29, 8),
        (36, 8), (37, 9), (45, 9), (46, 10), (55, 10), (56, 15), (500, 15),
    ],
)
def test_passes_to_vp_band_boundaries(total, expected):
    assert passes_to_vp(total) == expected


def _two_parallel_lines() -> Board:
    """A 4x4 board with a 2-pass line along row 0 and another along row 3."""
    board = Board.empty(4)
    for row in (0, 3):
        place_tile(board, (row, 0), (row, 1), 2, 3)
        place_tile(board, (row, 2), (row, 3), 2, 3)
    return board


def test_one_connected_pair_scores_a_single_line():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 0, 3, Side.E)]
    lines = score_lines(board, slots)
    assert lines == {frozenset(slots): 2}


def test_a_pair_connected_both_ways_is_deduped():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 0, 3, Side.E)]
    assert len(score_lines(board, slots)) == 1


def test_unconnected_markers_score_nothing():
    board = _two_parallel_lines()
    slots = [slot_index_of(4, 0, 0, Side.W), slot_index_of(4, 2, 0, Side.W)]
    assert score_lines(board, slots) == {}
    assert score_for(board, slots) == 0


def test_two_lines_are_summed_before_conversion():
    board = _two_parallel_lines()
    slots = [
        slot_index_of(4, 0, 0, Side.W),
        slot_index_of(4, 0, 3, Side.E),
        slot_index_of(4, 3, 0, Side.W),
        slot_index_of(4, 3, 3, Side.E),
    ]
    lines = score_lines(board, slots)
    assert sorted(lines.values()) == [2, 2]

    # Summed first: 4 passes -> 3 VP. Converted separately: 2 + 2 = 4 VP.
    assert passes_to_vp(2) + passes_to_vp(2) == 4
    assert score_for(board, slots) == 3


def test_a_line_returning_to_its_own_slot_does_not_score():
    board = Board.empty(3)
    place_tile(board, (0, 0), (1, 0), 2, 0)
    solo = [slot_index_of(3, 0, 0, Side.N)]
    assert score_lines(board, solo) == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_scoring.py -v`
Expected: FAIL — `ImportError: cannot import name 'passes_to_vp' from 'passtally.trace'`

- [ ] **Step 3: Append the scoring functions to `passtally/trace.py`**

Add this import at the top of the file:

```python
from passtally import config
```

Then append:

```python
def passes_to_vp(total: int) -> int:
    """Convert a pass total to victory points via the nonlinear band table."""
    victory_points = 0
    for min_passes, value in config.PASSES_TO_VP:
        if total < min_passes:
            break
        victory_points = value
    return victory_points


def score_lines(board: Board, marker_slots: list[int]) -> dict[frozenset[int], int]:
    """Passes for each line running between two of these markers.

    Keyed by the unordered slot pair, so a line found from both ends is
    recorded once.
    """
    owned = set(marker_slots)
    lines: dict[frozenset[int], int] = {}
    for slot in marker_slots:
        endpoint, passes = trace(board, slot)
        # A line can re-enter its start cell through another face and leave by
        # the original border face. That is not a pair, so exclude it.
        if isinstance(endpoint, int) and endpoint != slot and endpoint in owned:
            lines[frozenset((slot, endpoint))] = passes
    return lines


def score_for(board: Board, marker_slots: list[int]) -> int:
    """Victory points earned. Sums all lines BEFORE converting -- the table is
    nonlinear, so converting each line separately gives the wrong answer."""
    return passes_to_vp(sum(score_lines(board, marker_slots).values()))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_scoring.py -v`
Expected: PASS — including `test_two_lines_are_summed_before_conversion` at 3, not 4.

- [ ] **Step 5: Commit**

```bash
git add passtally/trace.py tests/test_scoring.py
git commit -m "feat: nonlinear scoring with sum-before-convert"
```

---

### Task 7: Marker movement

**Files:**
- Create: `passtally/markers.py`
- Test: `tests/test_markers.py`

**Interfaces:**
- Consumes: `Board` from `passtally.board`.
- Produces: `marker_destination(board, start_slot, distance) -> int | None`. Returns `None` when no destination exists.

Occupied slots are skipped **without consuming distance**, so the landing slot is found by stepping until `|distance|` *empty* slots have been passed. The landing slot is therefore always empty.

- [ ] **Step 1: Write the failing test**

`tests/test_markers.py`:

```python
from passtally.board import Board
from passtally.markers import marker_destination


def test_simple_forward_move():
    board = Board.empty(6)
    assert marker_destination(board, 0, 1) == 1
    assert marker_destination(board, 0, 2) == 2


def test_negative_distance_travels_the_other_way():
    board = Board.empty(6)
    assert marker_destination(board, 5, -1) == 4
    assert marker_destination(board, 5, -2) == 3


def test_movement_wraps_around_the_ring():
    board = Board.empty(6)
    assert marker_destination(board, 23, 1) == 0
    assert marker_destination(board, 0, -1) == 23


def test_distance_two_over_one_occupied_slot_lands_three_away():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    assert marker_destination(board, 0, 2) == 3


def test_jumping_does_not_consume_distance_for_several_occupants():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    board.ring[2].occupant = 98
    board.ring[4].occupant = 97
    # empties encountered going forward: 3 (first), 5 (second)
    assert marker_destination(board, 0, 2) == 5


def test_distance_one_skips_straight_past_an_occupant():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    assert marker_destination(board, 0, 1) == 2


def test_landing_slot_is_always_empty():
    board = Board.empty(6)
    board.ring[1].occupant = 99
    for distance in (-2, -1, 1, 2):
        destination = marker_destination(board, 0, distance)
        assert board.ring[destination].occupant is None


def test_returns_none_when_every_other_slot_is_occupied():
    board = Board.empty(6)
    for index, slot in enumerate(board.ring):
        if index != 0:
            slot.occupant = index
    assert marker_destination(board, 0, 1) is None


def test_zero_distance_has_no_destination():
    assert marker_destination(Board.empty(6), 0, 0) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_markers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.markers'`

- [ ] **Step 3: Write `passtally/markers.py`**

```python
"""Marker movement around the border ring."""

from __future__ import annotations

from passtally.board import Board


def marker_destination(board: Board, start_slot: int, distance: int) -> int | None:
    """Where a marker moving `distance` slots ends up, or None if nowhere.

    The sign of `distance` is the direction around the ring. Occupied slots are
    jumped without consuming distance, so the destination is always empty.
    """
    if distance == 0:
        return None

    stride = 1 if distance > 0 else -1
    remaining = abs(distance)
    position = start_slot

    # A full lap is the most that can ever be needed; if the ring is entirely
    # occupied there is nowhere to land.
    for _ in range(board.nav.size):
        position = board.nav.move(position, stride)
        if board.ring[position].occupant is None:
            remaining -= 1
            if remaining == 0:
                return position
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_markers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add passtally/markers.py tests/test_markers.py
git commit -m "feat: marker movement with free jumps over occupied slots"
```

---

### Task 8: Game construction, setup, and turn structure

**Files:**
- Create: `passtally/game.py`
- Test: `tests/test_game.py`

**Interfaces:**
- Consumes: everything built so far.
- Produces: `Pile(ordered, face_up)`, `Player(marker_slots, score)`, and `Game` with `new`, `setup_place_marker`, `apply`, `is_over`, `winner`. `legal_moves`, `key` and `clone` arrive in Task 9 — `apply`'s end-of-turn check calls `legal_moves`, so define it as a stub returning `[]` here and replace it in Task 9.

**Deck.** 6 designs × 7 copies = 42 tiles, shuffled from a seed, dealt as three ordered piles of 14. Each pile immediately pops its top tile into `face_up`, so a fresh pile holds 13 hidden plus 1 revealed.

**Marker ids** are `player * MARKERS_PER_PLAYER + index_within_player`, so a slot's occupant identifies its owner. The `marker_index` in a `MoveMarker` is the index within that player's own list, 0..3.

**End-of-game.** After each turn, if the trigger has fired the game enters its final round; it ends when play returns to `first_player`. The trigger is: every pile exhausted, or no `PlaceTile` is legal anywhere.

- [ ] **Step 1: Write the failing test**

`tests/test_game.py`:

```python
import pytest

from passtally.board import slot_index_of
from passtally.game import Game
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
    game.setup_place_marker(1, slot_index_of(3, 2, 0, Side.W))
    game.setup_place_marker(1, slot_index_of(3, 2, 2, Side.E))

    # Force a known board rather than relying on the shuffle.
    from passtally.placement import place_tile

    for col in range(3):
        place_tile(game.board, (0, col), (1, col), 2, 0)

    assert game.players[0].score == 0
    game.apply(MoveMarker(0, 1))
    assert game.players[0].score == 0  # mid-turn, not scored yet
    game.apply(MoveMarker(0, -1))  # back where it started
    assert game.players[0].score == 2  # 3 passes falls in the 2-3 band -> 2 VP


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


def test_applying_a_move_after_the_game_ends_is_rejected():
    game = _setup()
    game._over = True
    with pytest.raises(ValueError):
        game.apply(MoveMarker(0, 1))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_game.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'passtally.game'`

- [ ] **Step 3: Write `passtally/game.py`**

```python
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
```

Note that `_trigger_fired` deliberately checks **only** pile exhaustion at this stage. The second trigger — no legal placement anywhere — needs `legal_moves`, which arrives in Task 9. Keeping `legal_moves` as a raising stub and leaving it out of `_trigger_fired` means Task 8 is honestly complete rather than quietly wrong: a stub returning `[]` would make `_trigger_fired` report "no placements possible" on a full board and end every game after one round.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_game.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add passtally/game.py tests/test_game.py
git commit -m "feat: game construction, marker setup, and two-action turns"
```

---

### Task 9: Move generation, canonical key, and clone

**Files:**
- Modify: `passtally/game.py` (replace the `legal_moves` stub, add `clone` and `key`)
- Test: `tests/test_legal_moves.py`, `tests/test_key.py`

**Interfaces:**
- Consumes: `distinct_orientations`, `offset_of` from `passtally.tile_types`; `canon` from `passtally.tile_types`; `can_place` from `passtally.placement`; `marker_destination` from `passtally.markers`.
- Produces: `Game.legal_moves() -> list[Move]`, `Game.clone() -> Game`, `Game.key() -> Hashable`.

**Why `key` encodes a partner offset.** Heights and connections alone do not identify a position. Two boards can be identical cell-by-cell yet differ in whether an adjacent pair is one tile or two halves of different tiles — which changes what may legally be stacked on them. Raw `placement_id` values cannot go in the key because they depend on placement order, which would defeat transposition matching. Recording, for each cell, the *offset* of the neighbour sharing its `placement_id` is both canonical and sufficient.

- [ ] **Step 1: Write the failing tests**

`tests/test_legal_moves.py`:

```python
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
```

`tests/test_key.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_legal_moves.py tests/test_key.py -v`
Expected: FAIL — `AttributeError: 'Game' object has no attribute 'clone'`, and empty `legal_moves`.

- [ ] **Step 3: Replace `legal_moves`, complete `_trigger_fired`, and add `clone` / `key`**

Add these imports to `passtally/game.py`:

```python
import copy
from typing import Hashable

from passtally.tile_types import canon, distinct_orientations
from passtally.types import Pos
```

Replace `_trigger_fired` with the complete two-clause version:

```python
    def _trigger_fired(self) -> bool:
        if all(pile.face_up is None for pile in self.piles):
            return True
        return not any(isinstance(m, PlaceTile) for m in self.legal_moves())
```

Replace the `legal_moves` stub with:

```python
    def legal_moves(self) -> list[Move]:
        """Every legal action for the current player, both types.

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
```

Then append:

```python
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
        """Canonical hash: top tiles, markers and piles.

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
```

- [ ] **Step 4: Run the full suite**

Run: `python -m pytest -v`
Expected: PASS — every test from Tasks 1–9. Note that `_trigger_fired` now consults real move generation, so `test_exhausted_piles_trigger_the_final_round` still passes via the short-circuit and the no-legal-placement path is live.

- [ ] **Step 5: Commit**

```bash
git add passtally/game.py tests/test_legal_moves.py tests/test_key.py
git commit -m "feat: move generation, canonical transposition key, and clone"
```

---

## Verification

- [ ] **Full suite green**

Run: `python -m pytest -v`
Expected: all tests pass, no skips, no warnings about missing modules.

- [ ] **No module assumes board size 6**

Run: `grep -rn "\b6\b" passtally/ --include=*.py | grep -v config.py`
Expected: no hits that represent a board dimension. `TILE_TYPES` keys running 1–6 and the shape-pair count of 6 in `tile_types.py` are legitimate; anything indexing the grid is a bug.

- [ ] **The engine never reads `type_id` from a cell**

Run: `grep -rn "type_id" passtally/board.py passtally/trace.py`
Expected: no hits. Designs resolve to `conns` at placement time and are irrelevant thereafter.

---

## Self-Review Notes

Checked against the spec section by section:

- §2 tile data, invariant, dedupe → Task 3
- §2 connection check removed → Task 4 (absence is asserted by the support tests passing without any conns check)
- §3 constants, `PASSES_TO_VP`, setup, end timing → Tasks 1, 6, 8
- §5 data model → Tasks 2, 8
- §6 placement → Task 4
- §7 tracing, loop reasoning, scoring → Tasks 5, 6
- §8 public API → Tasks 8, 9
- §9 build order → task order matches, ring round-trip first
- §10 tests → all blocks covered; the retired Connection block is absent by design

Known deviations from the spec, each stated in the File Structure section above: `place_tile` does not touch piles, and scoring returns VP rather than mutating a `Player`.
