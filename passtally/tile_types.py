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
