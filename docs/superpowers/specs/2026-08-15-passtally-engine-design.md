# Passtally Engine — Design

**Status:** approved, ready for planning
**Date:** 2026-08-15
**Scope:** headless Python rules engine. No UI, no rendering, no AI.

The deliverable is a `GameState` that can be constructed, queried for legal moves, advanced by
a move, and scored.

**Non-goals:** graphics, networking, bot players, save/load format, performance tuning. Design
for these; do not build them.

**Legal note:** clean-room implementation from published rules. Do not copy tile artwork, the
name, or box/board trade dress into anything distributed.

---

## 1. Game summary

Two to three players. A square grid board with a ring of marker slots around its border.
Players place 1x2 domino tiles printed with line segments, stacking them upward. Each player
has four markers on the border ring. A line running between two of your own markers scores;
the score depends on how many tiles it passes through and how high those tiles are stacked.

Mechanics the engine models:

- A turn is **two actions**. Each action is either *place a tile* or *move a marker up to two
  spaces*. The same action may be taken twice.
- Tiles stack. A tile above level 1 must rest on **two** tiles of the **same height** — never
  on a single tile, never straddling two different heights.
- Only the **topmost** tile at a cell matters. Buried tiles are dead state.
- Scoring happens at the **end of the turn**, once, after both actions.
- Each tile a line passes through contributes passes equal to its **level**. A tile crossed
  twice by the same line counts twice.

---

## 2. Tile data (resolved)

The handoff spec listed 42 unknown designs. The actual set is **6 designs, 7 copies each**.
Canonical orientation is **vertical**: cell 2 lies to the SOUTH of cell 1, and the shared seam
is cell 1's S face against cell 2's N face.

```text
Tile 1   cell1 (W,N) (S,E)     cell2 (N,E) (W,S)
Tile 2   cell1 (N,S) (E,W)     cell2 (N,S) (E,W)
Tile 3   cell1 (N,S) (E,W)     cell2 (N,E) (S,W)
Tile 4   cell1 (N,S) (E,W)     cell2 (S,E) (N,W)
Tile 5   cell1 (S,E) (N,W)     cell2 (S,E) (N,W)
Tile 6   cell1 (N,E) (S,W)     cell2 (N,E) (S,W)
```

### The invariant

Every cell pairs up all four faces, exactly once each. A cell is therefore one of only **three**
shapes:

| shape | matching  | under 90° rotation |
| ----- | --------- | ------------------ |
| **X** | N–S, E–W  | → X                |
| **A** | N–E, S–W  | → B                |
| **B** | N–W, S–E  | → A                |

The six tiles are exactly the six unordered pairs of those three shapes — the set is complete
and minimal, no duplicates and no gaps:

| Tile | cell 1 | cell 2 | | Tile | cell 1 | cell 2 |
| ---- | ------ | ------ |-| ---- | ------ | ------ |
| 1    | B      | A      | | 4    | X      | B      |
| 2    | X      | X      | | 5    | B      | B      |
| 3    | X      | A      | | 6    | A      | A      |

180° rotation swaps the two cells and leaves each shape unchanged. So a tile whose two cells
share a shape has only **2** distinct orientations, not 4:

| Tile | 1 | 2 | 3 | 4 | 5 | 6 |
| ---- | - | - | - | - | - | - |
| distinct orientations | 4 | 2 | 4 | 4 | 2 | 2 |

`legal_moves` must dedupe on this or it emits identical moves.

### Two consequences

1. **Connection continuity is vacuous.** Every occupied cell carries a line on all four faces,
   so the handoff spec's bidirectional check compares `True != True` on every shared face and
   can never fail. It is **removed**. `can_place` is support rules only. The physical "may not
   cut off an existing line" rule guards against straddling in a game where tiles slide; that
   case is already covered by the support checks.

2. **Uncovered cells contain printed cross paths.** They route N–S and E–W for zero passes;
   only placed tiles contribute passes. A line can never dead-end on a valid board. `DEAD`
   remains as a defensive result for malformed placed-cell connection data.

### Representation choice

The X/A/B invariant permits a much tighter encoding: a cell as an enum, `follow` as a table
lookup, rotation as a 3-element permutation. **Rejected.** It hard-codes "every cell connects
all four faces", which is exactly the assumption that already changed once during design, and
the speed win over scanning two pairs is nil.

Instead: the engine stores the general `conns` form and stays data-agnostic. The shape enum
lives **only** in `tile_types.py`, where it earns its keep twice — as a load-time validator
(assert every cell is a perfect matching of all four sides) and as the basis for orientation
dedupe.

---

## 3. Resolved constants

Every one of these is a named constant in `config.py` with a `# TODO: verify against rulebook`
comment. Nothing is scattered through the code.

| Constant | Value | Note |
| -------- | ----- | ---- |
| `N` | 6 | board dimension, parameterized; ring is 4N = 24 slots |
| `RING_CONTINUOUS` | `True` | markers may travel around corners (`mod 4N`) |
| `PASSES_TO_VP` | see below | nonlinear; **resolved**, real table |
| `END_IMMEDIATELY_ON_EMPTY` | `False` | round-completion path is implemented |
| tiles per pile | 14 | shuffle all 42, deal three ordered piles of 14 |

Ring continuity sits behind a `Ring` class exposing a single `move(slot, distance) -> slot`
method, so the corner rule is swappable without touching anything else.

**`PASSES_TO_VP`.** An ordered list of `(min_passes, vp)` thresholds, looked up by finding the
last entry whose `min_passes <= total`. These are the real values:

| passes | 0 | 1 | 2–3 | 4–6 | 7–10 | 11–15 | 16–21 | 22–28 | 29–36 | 37–45 | 46–55 | 56+ |
| ------ | - | - | --- | --- | ---- | ----- | ----- | ----- | ----- | ----- | ----- | --- |
| VP     | 0 | 1 | 2   | 3   | 4    | 5     | 6     | 7     | 8     | 9     | 10    | 15  |

```python
PASSES_TO_VP = [
    (0, 0), (1, 1), (2, 2), (4, 3), (7, 4), (11, 5), (16, 6),
    (22, 7), (29, 8), (37, 9), (46, 10), (56, 15),
]
```

**Band widths are the natural numbers** — 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 — so every threshold is
`1 + n(n-1)/2`. Implement it as the literal table above rather than the formula: the top band
breaks the pattern by jumping to 15 VP, so the formula would be a trap.

> The source table read `(29-36):8` followed by `(31-45):9`, which overlap on 31–36. Corrected
> to `37-45` on the strength of the width sequence. **TODO: confirm against rulebook.**

Zero passes scores zero. The nonlinearity is exactly why `score_turn` sums before converting:
two lines of 2 passes each convert separately to 2 + 2 = **4**, but summed first give 4 passes
→ **3**. That pair is the divergence test in §10.

`TypeId = int`, indexing the six entries of `TILE_TYPES`.

**End-of-game timing.** The rules state both that the game finishes out the round when a
trigger fires *and* that it ends immediately if all three piles empty or no tile can be placed.
The round-completion path is implemented; the immediate case is flagged by the constant above.

`_trigger_fired` has two clauses — all piles exhausted, or no legal `PlaceTile` anywhere. **The
first is provably subsumed by the second.** `legal_moves` skips any pile whose `face_up` is
`None`, so when every pile is exhausted it emits no `PlaceTile` at all and the second clause
already returns `True`. The first clause is kept purely as a fast path: it answers a yes/no
question without materialising the full move list, including the marker moves the trigger never
inspects. No behavioural test can distinguish its deletion — this was established by proof and
confirmed by mutation, and is recorded here so it is not re-derived a third time.

**Setup.** Shuffle all 42 tiles from a seed, deal 14 to each of three ordered piles, flip the
top of each face-up. Markers are placed by player choice: `setup_place_marker` validates that
the slot is empty and that the player has no marker on that edge yet. Setup turn order is left
to the caller.

Setup is **complete** when every player holds `MARKERS_PER_PLAYER` markers. `is_setup_complete`
exposes this; `apply` refuses to run before it, and `setup_place_marker` refuses after it.
Without that contract a caller could play an entire legal game in which no marker exists and
nobody ever scores.

---

## 4. Module layout

```text
config.py        N, PASSES_TO_VP, RING_CONTINUOUS, END_IMMEDIATELY_ON_EMPTY
types.py         Side, Result, Move union (PlaceTile | MoveMarker)
tile_types.py    the 6 designs, canonical vertical; rotation cache;
                 shape validator; per-tile distinct-orientation count
ring.py          Ring class, single move(slot, distance) seam
board.py         Cell, Slot, Board, slot_index_of <-> ring[i] round-trip
placement.py     can_place (pure, support-only), place
trace.py         trace, score_turn
game.py          Game: new, setup_place_marker, legal_moves, apply,
                 is_over, winner, clone, key
```

---

## 5. Core data model

Cell-indexed, so board state memoizes cleanly. The critical property: **a placement's history
is irrelevant once buried.** Canonical state is the set of top-tiles plus marker positions plus
pile state. Hash on that and move-order permutations collapse into transposition hits.

```python
Side = Enum("Side", "N E S W")

@dataclass
class Cell:
    placement_id: int | None = None   # instance id, increments per placement
    height: int = 0                   # 0 == empty; == level of the top tile
    conns: list[tuple[Side, Side]] = field(default_factory=list)
    # conns are RESOLVED at placement time — rotation is baked in.
    # The tracer never does orientation math.

@dataclass
class Slot:                           # one border marker position
    row: int
    col: int
    side: Side                        # which board edge it faces
    occupant: int | None = None       # marker id

@dataclass
class Pile:
    ordered: list[TypeId]             # ordered stack, NOT a multiset
    face_up: TypeId | None            # the one revealed tile

@dataclass
class Player:
    marker_slots: list[int]           # 4 slot indices
    score: int = 0

@dataclass
class Board:
    cells: list[list[Cell]]           # N x N
    ring: list[Slot]                  # length 4*N, cyclic
    next_placement_id: int = 1

@dataclass
class GameState:
    board: Board
    piles: list[Pile]                 # exactly 3
    players: list[Player]
    current_player: int
    actions_left: int                 # 2 at the start of each turn
    first_player: int
```

### Why these choices

- **`placement_id` is load-bearing, not decorative.** It distinguishes "two separate tiles at
  the same height" (legal support) from "the two halves of one tile" (illegal). It also drives
  the pass tally. Do not drop it.
- **`type_id` lives in the piles, not in cells.** Piles deal designs; placement resolves a
  design plus an orientation into per-cell `conns`, and the design is then irrelevant to the
  rules. `type_id` rides on the placement record for later rendering; nothing in the engine
  reads it.
- **Piles are ordered lists, not counters.** A multiset cannot reproduce a game or a replay.
  Derive counts later if a bot needs them.
- **The ring is flat and 1D, not embedded in the grid.** Movement becomes index arithmetic, and
  a marker at slot `i` is just a line entering `cells[row][col]` through `side` — no special
  case in the tracer.

---

## 6. Placement legality

Support only. Height gates support; it plays no part in connection.

```python
def can_place(state, cell_a_pos, cell_b_pos) -> bool:
    a, b = state.board.at(cell_a_pos), state.board.at(cell_b_pos)

    if not orthogonally_adjacent(cell_a_pos, cell_b_pos):
        return False
    if a.height != b.height:
        return False                                  # differing heights
    if a.height > 0 and a.placement_id == b.placement_id:
        return False                                  # straddling one tile
    return True
```

`can_place` is pure and must not mutate. Note it takes **no `type_id` or `orientation`** — with
connection continuity retired, legality depends only on the footprint, never on which tile goes
there. That is a genuine simplification, not an oversight: if any tile fits a footprint, all of
them do, which `legal_moves` exploits by testing each footprint once and then attaching every
deduped orientation of the available face-up tiles.

### Commit

```python
def place(state, cell_a_pos, cell_b_pos, type_id, orientation, pile_index):
    pid = state.board.next_placement_id
    state.board.next_placement_id += 1
    conns_a, conns_b = resolve(type_id, orientation)
    for pos, conns in ((cell_a_pos, conns_a), (cell_b_pos, conns_b)):
        c = state.board.at(pos)
        c.placement_id = pid
        c.height += 1
        c.conns = conns
    pile = state.piles[pile_index]
    pile.face_up = pile.ordered.pop() if pile.ordered else None
```

`resolve(type_id, orientation) -> (conns_a, conns_b)` is precomputed into a lookup table at
import. The hot loop never rotates anything. The cell *offset* implied by an orientation
(south for vertical, east for horizontal) is a separate table, `offset_of(orientation)`, since
callers need it to derive `cell_b_pos` from `cell_a_pos` before they have a tile in hand.

---

## 7. Tracing and scoring

`trace` returns `(endpoint, passes)`, where `endpoint` is either a `Result` member (`DEAD`,
`LOOP`) or an `int` ring-slot index. `is_slot(end)` in `score_turn` is the discriminator.

```python
def trace(state, start_slot) -> tuple[Result | int, int]:
    slot = state.board.ring[start_slot]
    r, c, entry = slot.row, slot.col, slot.side
    passes = 0
    last_id = None
    seen = set()

    while True:
        # keyed by (cell, ENTRY FACE) — not by cell. Re-entering the same cell
        # through a different face is legal and must keep counting.
        key = (r, c, entry)
        if key in seen:
            return (Result.LOOP, passes)
        seen.add(key)

        cell = state.board.cells[r][c]
        # The board's printed + carries the line straight through for 0 passes.
        exit_face = (opposite(entry) if cell.placement_id is None
                     else cell.follow(entry))   # scan placed conns for `entry`
        if exit_face is None:
            return (Result.DEAD, passes)

        # Compare against the PREVIOUS STEP ONLY, never a visited-set.
        # A line may cross the same tile more than once and each crossing scores.
        # A set would silently eat the second pass. A seam crossing leaves
        # placement_id unchanged and correctly adds nothing.
        if cell.placement_id is None:
            last_id = None
        elif cell.placement_id != last_id:
            passes += cell.height
            last_id = cell.placement_id

        nr, nc = step(r, c, exit_face)
        if off_board(state.board, nr, nc):
            return (slot_index_of(r, c, exit_face), passes)
        r, c, entry = nr, nc, opposite(exit_face)
```

### Loops are unreachable from the border

Because placed cells pair their four faces bijectively and starting crosses do the same,
`follow` is an **involution** — re-entering a cell through the face you left returns you the way
you came. The whole step relation is therefore reversible. To revisit a state the trace would
need two predecessors, and the reverse trajectory would have to exit off-board. **A trace
starting from a border slot can never loop.** Every valid trace terminates at another ring slot.

### And a trace can never return to its own slot

The same structure gives a second, stronger result. Each cell contributes two disjoint *wires*,
and each wire-end links to exactly one neighbouring wire-end, so every connection point has
degree at most 2. The board therefore decomposes into **simple paths and cycles**. A border slot
cannot lie on a cycle — nothing exists beyond the board edge — so it is a path *endpoint*, and
tracing from one endpoint reaches the other. A path with at least one edge has two *distinct*
endpoints.

So a trace from slot `s` ends at a slot `t ≠ s` on every valid board. `score_lines` therefore
needs **no** `endpoint != slot` guard; an earlier draft carried one, and it was dead code. This
holds only while every placed cell is a perfect matching of all four faces and uncovered cells
remain printed crosses — if either gains blank faces, the degree-≤2 argument fails and the
guard must come back.

The `seen` guard and the `LOOP` result are kept regardless: three lines, and the difference
between a bug and an infinite loop if the tile data is ever revised. Closed circuits do exist,
but only detached from the border, so the loop test builds a board by hand and calls `trace`
directly rather than going through the public API.

### Scoring

```python
def score_turn(state, player_idx):
    p = state.players[player_idx]
    lines = {}
    for slot in p.marker_slots:
        end, passes = trace(state, slot)
        if is_slot(end) and end in p.marker_slots:
            lines[frozenset((slot, end))] = passes   # dedupe: found from both ends
    total = sum(lines.values())                       # sum FIRST
    p.score += PASSES_TO_VP[total]                    # convert ONCE (nonlinear table)
```

Sum before converting. The passes-to-VP mapping is nonlinear, so converting each line
separately and adding gives the wrong answer.

---

## 8. Public API

```python
class Game:
    @classmethod
    def new(cls, n_players: int, seed: int | None = None, board_size: int = 6) -> "Game"

    def setup_place_marker(self, player: int, slot: int) -> None
    def legal_moves(self) -> list[Move]        # both action types, current player
    def apply(self, move: Move) -> None        # decrements actions_left; scores at 0
    def is_over(self) -> bool
    def winner(self) -> int | None
    def clone(self) -> "Game"                  # deep copy, for future search
    def key(self) -> Hashable                  # canonical hash: top-tiles + markers + piles
```

`Move` is a tagged union:

- `PlaceTile(pile_index, cell_a, cell_b, orientation)`
- `MoveMarker(marker_index, distance)` where `distance` is **signed**, in `{-2, -1, +1, +2}`.

The sign encodes direction around the cyclic ring — the handoff spec's unsigned `{1, 2}` cannot
express direction, and both ways are legal. Occupied slots are skipped without consuming
distance, so the landing slot is found by stepping until the marker has passed `|distance|`
*empty* slots.

`legal_moves` must exist and be correct even before there is a bot — the "no tile can be placed
anywhere" end-of-game trigger depends on it. It dedupes tile orientations per the table in §2.

---

## 9. Build order

1. `Side`, `Cell`, `Board`, ring construction, `slot_index_of` / `ring[i] -> (r,c,side)`
   round-trip. Test the round-trip exhaustively for `N` in 4..8.
2. Tile type table + shape validator + `resolve` rotation cache.
3. `can_place` + `place`.
4. `trace` + `score_turn`.
5. Marker movement with occupied-slot jumping.
6. Turn structure, two actions, end-of-turn scoring, end conditions.
7. `legal_moves`, `key`, `clone`.

---

## 10. Tests that must exist

Port indexing and orientation are where this will break. Write the ring round-trip before the
data model is finished.

**Ring and tile data**
- `slot_index_of` ↔ `ring[i]` round-trip, exhaustive for N in 4..8.
- Validator: all 6 designs are perfect matchings of {N,E,S,W} on both cells.
- Orientation dedupe yields 4, 2, 4, 4, 2, 2 for tiles 1–6.

**Support**
- Level-2 tile on two level-1 tiles of the same height, different `placement_id` → legal.
- Level-2 tile straddling both halves of one level-1 tile → **illegal**.
- Tile spanning heights 1 and 2 → illegal.
- Tile with one half on a level-1 tile and one half on bare board → illegal.

**Tracing**
- Straight run across three tiles at level 1 → 3 passes.
- Line entering and exiting one tile through its two halves (seam crossing) → 1 pass.
- Line crossing the same tile twice through different faces → counts **twice**.
- Closed loop with no marker endpoint → terminates, returns `LOOP`. Built by hand; calls
  `trace` directly, since the public API cannot reach a detached circuit.
- Path through levels 1, 1, 2, 1 → 5 passes.

**Markers**
- Distance 2 over one occupied slot lands 3 slots away.
- Negative distance travels the opposite way around the ring.

**Scoring**
- One connected pair → single line scored.
- Both pairs connected → passes summed, then converted once.
- Pair connected in both directions → deduped, not double-counted.
- Two lines of 2 passes each → **3 VP**, not 4. Proves sum-then-convert, not convert-then-sum.

The handoff spec's **Connection** test block is retired along with the connection check itself.

---

## 11. Style

Plain dataclasses, no ORM, no framework. Type hints throughout. Pure functions where possible —
`can_place` must not mutate. `clone` must be cheap enough to call in a search loop later, so
avoid burying state in closures or back-references. Every rule constant lives in `config.py`.
