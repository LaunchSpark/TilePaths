# Passtally Client — Tier 1 Design

**Status:** approved, ready for planning
**Date:** 2026-08-17
**Companion to:** `2026-08-15-passtally-engine-design.md` (the Python rules engine)
**Source requirements:** the "Passtally Client — Features & Layout" brief

**Scope:** Tier 1 only — a playable hot-seat client. The bar is that two people can finish a
full game at one keyboard and the client never permits an illegal state.

**Non-goals for this pass:** everything in tiers 2 and 3 (hover preview, path highlighting,
scoring breakdowns, multiplayer, lobby, spectators, timers), plus the brief's own out-of-scope
list: AI, sound, animation, mobile, accounts, persistence, replay export, cross-turn undo.

Tier 3 is a separate subsystem and gets its own spec. Nothing here forecloses it.

**Legal note:** clean-room implementation from published rules. Do not copy tile artwork, the
name, or box/board trade dress into anything distributed.

---

## 1. The gaps in the brief

The brief specifies a Canvas-plus-DOM client but never names a language, and the engine it must
drive is Python. It also assumes the client can read game state, which the engine cannot
provide — its public surface is `new`, `setup_place_marker`, `legal_moves`, `apply`, `is_over`,
`winner`, `clone`, `key`, with no serialization anywhere. `key()` is a hash and deliberately
lossy.

A third conflict the brief does not anticipate: **the engine has no concept of a tentative
action.** `apply()` commits immediately — it mutates the board, pops the pile's replacement
into `face_up`, and at zero actions it scores, advances the player and evaluates end
conditions. There is no rollback.

All three are resolved below.

---

## 2. Architecture

**A local HTTP server. Python remains authoritative. The client owns exploration.**

| Server (Python, FastAPI) | Client (TypeScript) |
| ------------------------ | ------------------- |
| Source of truth | Hit-testing and rendering |
| Validation of every committed turn | Tentative exploration and undo |
| Committed history | Legality *preview* |
| Scoring of record | Ghost, snapping, rotation |
| End-of-game determination | Decision aids (tier 2 onward) |
| Serving the view model and rules data | Tie-break *for display* |

This is a **deliberate two-implementation design**, named here because it is the main risk. The
brief already anticipated it — tier 3 calls for a "client-side tracer for preview" and refers to
rules duplication explicitly. Tier 1 pulls a small part of that forward, because exploration
needs it.

Rejected alternatives, and why:

- **Server-side exploration** (each tentative action a round trip against a clone) keeps rules
  duplication at zero but makes the client incapable of answering any question not anticipated
  by an endpoint. The brief's tier-2 features are exactly such questions.
- **Precomputing the exploration tree** is cheaper than it first appears — legality is
  footprint-only, and a placement can only flip the legality of footprints touching its two
  cells, so a turn's full two-action plan delta-encodes to roughly 10KB computed in
  microseconds. It is a legitimate tier-1 answer. It was rejected because tier 2 needs *trace
  results* rather than booleans, which do not compress the same way, and because a precompute
  can only answer questions asked in advance.
- **A full TypeScript port** would abandon a Python engine with 182 tests that survived mutation
  testing, and tier 3 needs it back as server authority regardless.

**Frontend: TypeScript + Vite, no framework.** The view model is a cross-language contract and
TS makes it checkable. The DOM chrome is a tray, a rail and a log; a framework earns nothing at
that size, and the brief wants a single imperative canvas draw loop.

### Module layout

```text
passtally/            existing engine -- unchanged except one promotion
  board.py            + partner_offset() promoted from Game._partner_offset
  view.py             NEW -- builds the redacted view model
tools/
  gen_rules.py        NEW -- emits rules.json and the conformance fixtures
server/
  session.py          committed Game only -- no tentative state
  app.py              FastAPI: JSON API + serves the built client
client/src/
  types.ts            view-model types, mirroring view.py
  api.ts              typed fetch wrappers
  rules/              THE PORTED SUBSET -- see section 3
    canPlace.ts
    markers.ts
    tiles.ts          resolve / offsetOf / distinctOrientations, over rules.json
  geometry.ts         PURE: cursor -> unit index -> cell | ring slot | none
  tentative.ts        client-only turn state: <=2 moves, local board overlay
  state.ts            the six-state machine
  render/board.ts     canvas draw loop
  render/tiles.ts     line art from conns
  ui/tray.ts
  ui/rail.ts
  ui/log.ts
```

`Game._partner_offset` becomes a free function `partner_offset(board, row, col)` in `board.py`.
The client needs tile-boundary information both to draw 1×2 outlines and to implement
`canPlace`'s straddling check, so `view.py` needs what `key()` needs. One caller becoming two is
the moment to promote it. **This is the only change to existing engine code, and it is a move.**

---

## 3. Shared data, duplicated logic

The rules **data** is generated from Python, never hand-transcribed. Only the **logic** exists
twice.

`tools/gen_rules.py` emits `rules.json`, served at boot and consumed by the client's tests:

- the six tile designs and their resolved conns for all four orientations
- the orientation offset table (`0 → (1,0)`, `1 → (0,-1)`, `2 → (-1,0)`, `3 → (0,1)`)
- `distinctOrientations` per tile (4, 2, 4, 4, 2, 2)
- the ring scheme and relevant `config.py` constants

Hand-copying `TILE_TYPES` into TypeScript would be a silent, awful class of bug. This removes it.

### What is ported for tier 1

| In the client | Notes |
| ------------- | ----- |
| `canPlace(cells, a, b)` | footprint-only: in bounds, orthogonally adjacent, equal height, not the two halves of one tile (via `partner`). ~10 lines |
| `markerDestination(ring, start, distance)` | signed distance, occupied slots jumped without consuming it |
| `applyPlaceLocal` / `applyMarkerLocal` | tentative board overlay for rendering only |
| `resolve` / `offsetOf` / `distinctOrientations` | lookups over `rules.json`, not reimplementations |
| ring index round-trip | also needed by hit-testing |

### What stays server-only

`trace` and scoring · pile draws and ordering · end-of-game conditions · turn advancement ·
setup-order enforcement · winner determination.

The tracer arrives client-side at tier 2 and will roughly double the duplicated surface. That is
expected, and it sits on this foundation.

### The safety net

Commit sends the full move list and the server replays it **atomically** against the committed
game. Any divergence between the two implementations surfaces as a **rejected turn** — visible
and loud — never as corrupted state. `apply()` already raises `ValueError` on anything illegal,
and the engine's final review added guards for negative indices and incomplete setup.

---

## 4. The view model

Redacted from day one — pile counts, never contents — which costs nothing now and makes tier 3's
requirement free rather than a retrofit.

```ts
type Side = 0 | 1 | 2 | 3          // N, E, S, W -- matches the engine exactly
type TypeId = 1 | 2 | 3 | 4 | 5 | 6
type Pos = [row: number, col: number]

type Move =
  | { kind: "place";  pileIndex: number; cellA: Pos; cellB: Pos; orientation: number }
  | { kind: "marker"; markerIndex: number; distance: -2 | -1 | 1 | 2 }
  // markerIndex is the index within the current player's own markerSlots (0..3),
  // matching the engine's MoveMarker -- not a global marker id.

type CellView = {
  height: number                    // 0 == empty
  conns: [Side, Side][] | null      // null when empty
  partner: [number, number] | null  // offset of the cell sharing this tile
}

type GameView = {
  n: number
  cells: CellView[][]
  ring: { row: number; col: number; side: Side; occupant: number | null }[]
  piles: { faceUp: TypeId | null; count: number }[]   // count only -- never contents
  players: { markerSlots: number[]; score: number }[]
  currentPlayer: number
  actionsLeft: number
  phase: "setup" | "play" | "over"
  setupNext: number | null
  winner: number | null
}
```

**There is no `legalMoves` field.** The client computes legality itself. An earlier draft
bundled it and that turned out to leak: `legal_moves` iterates `distinct_orientations(face_up)`,
and those counts split the six designs into `{1,3,4}` with four orientations and `{2,5,6}` with
two — so the orientation set for a pile whose replacement had been drawn revealed which half of
the deck the next tile came from. Verified empirically before removal.

The leak is now **impossible to express**: the client is never sent hidden pile contents, and
there is no derived field computed from them.

**A redaction test is part of tier 1**, asserting no pile's ordered contents appear in
serialized output. It guards tier 3 before tier 3 exists.

---

## 5. Tentative turns

**The server has no tentative state.** A session holds the committed `Game` and nothing else.
The client owns exploration entirely; the server only ever receives completed turns.

This follows from what the commitment rules are *for*: a player may try combinations of the
available tiles and put them back, so long as **no new information is revealed**. Turning over a
replacement is the irreversible act — once you have seen it, you cannot un-see it, so the
placement that caused it is locked in. Replacements are therefore turned over at commit, not at
placement.

The consequence: **a pile you have tentatively placed from shows nothing**, so there is nothing
to place from it a second time. "A spent pile is done for the turn" is not a restriction anyone
imposes — it falls out of the reveal timing.

The client therefore holds:

- an ordered list of at most two tentative moves
- a local board overlay derived by applying them to the committed `cells`
- a per-pile `spent` flag, marking piles consumed this turn

Undo drops the last move and recomputes the overlay. **Zero network traffic during exploration.**

**Setup placements are not tentative.** Each setup marker commits immediately via its own
endpoint. Nothing is revealed by placing one, so there is nothing to explore, and the snake order
needs server arbitration anyway. The `setup` state has no undo and no commit button.

The engine still pops the replacement inside `_apply_place`. That is now a private implementation
detail: it happens on the server at commit, and the client learns the new face-up tiles from the
commit response — which is exactly when a player would turn them over.

### What commit reports

The turn log needs passes and lines, not just a VP total. `score_for` returns VP only, but
`score_lines(board, marker_slots)` already returns the per-line dict. Commit calls it directly.
No engine change — a call the engine already supports.

---

## 6. API

Sessions are in-memory, keyed by game id. No persistence — an explicit non-goal.

| Route | Purpose |
| ----- | ------- |
| `GET /api/rules` | generated `rules.json` — tile data, offsets, ring scheme, constants |
| `POST /api/game` | new game (`n_players`, `seed`, `board_size`) → id + view |
| `GET /api/game/{id}` | current view |
| `POST /api/game/{id}/setup` | place one setup marker; snake order enforced server-side |
| `POST /api/game/{id}/commit` | `{ moves: Move[] }` → view + turn result |

There are no tentative endpoints. Commit is atomic: all moves apply, or none do and the turn is
rejected with a reason. Per the brief, the client renders a rejection visibly — a shake or
flash, never a silent no-op.

---

## 7. Interaction

```text
setup ──(all markers placed)──> idle
idle ──1/2/3──────────────────> tile_selected
idle ──click own marker───────> marker_selected
tile_selected   ──click legal anchor──> idle    (actionsLeft - 1, pile marked spent)
marker_selected ──click destination───> idle    (actionsLeft - 1)
idle ──Enter, actionsLeft == 0──> committing ──> idle | game_over
any  ──Esc──> idle
idle ──Backspace──> idle        (undo last tentative, local)
```

`committing` is the only state that touches the network during a turn.

### Input map

Mouse for position, keyboard for everything else — so the ghost needs no on-board rotation
handles.

| Input | Action |
| ----- | ------ |
| `1` `2` `3` | Select the face-up tile from that pile |
| Mouse move | Position ghost |
| `R` / scroll | Rotate ghost |
| Left click | Place tile / select marker / choose ring slot |
| `Esc` | Deselect, clear ghost |
| `Backspace` | Undo tentative action |
| `Enter` | Commit turn |
| `Tab` | Cycle own markers |

---

## 8. Hit-testing and the cross-boundary traps

Hit-testing is one pure function, tested independently of rendering:

```ts
type Hit = { kind: "cell"; row: number; col: number }
         | { kind: "slot"; index: number }
         | { kind: "none" }

hitTest(px: number, py: number, layout: Layout): Hit
```

With the ring one cell deep on each side the board region is `N + 2` units across, so
`unit = size / (N + 2)`. Corners of the ring band are dead space and return `none`.

### Trap 1: ring indexing across the language boundary

The client's slot indexing must match `build_ring` **exactly**, in another language, with no
compiler to catch drift. The engine's ring runs clockwise from the top-left: north edge
`0..n-1`; east `n..2n-1`; south `2n..3n-1` with columns reversed; west `3n..4n-1` with rows
reversed. Get a reversal wrong and markers land on the wrong slot, silently.

Guarded by the conformance fixtures in §10.

### Trap 2: rotation offers placements `distinctOrientations` omits

The brief says `R` cycles four orientations. But only *distinct* orientations produce distinct
board states — for the symmetric tiles 2, 5 and 6 that is two, because 180° rotation swaps the
two cells while leaving each cell's shape unchanged.

Rotating such a tile to orientation 2 produces a placement that is genuinely legal (`can_place`
is footprint-only and would accept it) but that is not in the tile's distinct set — so naive
matching would wrongly reject it.

**Resolution:** keep `R` cycling all four, because predictable rotation matters more than
internal tidiness, and **normalize before sending**. Orientations `o` and `o + 2` cover the same
footprint with the cells swapped, so `(anchor, o + 2)` is rewritten to
`(anchor + offset(o + 2), o)`. `distinctOrientations` comes from `rules.json`.

---

## 9. Layout

Three regions, fixed proportions, scaling as a unit. Reference sizing from the brief: board
region 500×500, tray strip 500×150, rail 190 wide and full height, ~16px gutters, total
≈ 716×656.

```text
┌────────────────────────────────┬──────────┐
│         BOARD REGION           │   RAIL   │
│      (square, dominant)        │          │
├────────────────────────────────┤          │
│         TRAY STRIP             │          │
└────────────────────────────────┴──────────┘
```

**Board region — two nested surfaces.** A `grid` (the N×N playing area, tiles only) and a `ring`
band around it holding marker slots, not part of the grid array. Ring slots are the same size as
grid cells so the two read as one object. At N = 6 in a 500px region a unit is 62.5px.

The ring is separate because it matches the data model (`ring` is a flat 4N array, `cells` is
N×N), and because hit-testing then never has to disambiguate a marker click from a cell click.

**Tray strip** — one horizontal strip, because committing a turn is a single decision:

```text
[pile 1] [pile 2] [pile 3]  ·····  actions left: 2  ·  [ commit ]
```

Each pile shows its face-up tile at the same aspect and line style as the board, so connections
can be judged before picking it up. **A pile spent this turn renders as visibly used with
nothing revealed** — and un-spends visibly on undo, which is the clearest available signal that
the undo landed. An empty pile stays in place, greyed, showing 0 — it is an end-game trigger and
hiding it hides that. Commit is the only high-emphasis control and is disabled until both
actions are spent.

**Elevation encoding — two channels**, because level drives both the support rule and the pass
multiplier. A lightness ramp keyed to level for "where are the tall stacks" at a glance, plus a
numeric badge per tile for exact counting. Not drop shadows alone: in dense areas every tile
shadows its neighbour and the depth cue collapses.

**Rail**, top to bottom: players (colour swatch, name, VP, active marked), then the turn log —
one entry per committed turn with actions taken, passes and VP gained. The log is not optional:
scoring happens once at end of turn and is otherwise invisible, so an opponent's five-point jump
would be unexplained. It doubles as the development trace.

**Rendering split.** Canvas for grid, ring, tiles, markers and ghost — one imperative draw loop,
redrawn on state change or pointer move. DOM for tray, rail, counters, buttons and log, because
hover states and layout come free.

---

## 10. Resolved constants

| Constant | Value | Note |
| -------- | ----- | ---- |
| setup order | **snake draft** | see below. TODO: verify against rulebook |
| tie-break | **turn order**, client-side | see below |
| board size | from the engine's `config.N` | never hardcoded client-side; `n` arrives in the view |

**Snake draft, stated explicitly.** Each player places `MARKERS_PER_PLAYER` (4) markers, so the
sequence is four passes alternating direction. Two players:
`P1 P2 · P2 P1 · P1 P2 · P2 P1`. Three players: `P1 P2 P3 · P3 P2 P1 · P1 P2 P3 · P3 P2 P1`.
Total placements are `n_players × 4`, and `setupNext` reports whose turn it is. The engine's
existing per-edge and occupied-slot validation still applies; the snake order governs only *who*
places next, never *where*.

**Tie-break.** The brief says "break ties by turn order," but the engine's `winner()`
deliberately returns `None` on a tie. Rather than change verified engine behaviour, the client
breaks the tie **for display**: on `winner === null` with the game over, rank by score then by
turn order. The engine's notion of "no single winner" stays intact and the presentation layer
owns the presentation rule.

---

## 11. Testing

Ordered by where the risk actually sits. The first item is the one that matters most, because
it is what stands between a two-implementation design and silent divergence.

1. **Conformance fixtures**, generated by `tools/gen_rules.py` and committed alongside the
   generator so they are regenerated rather than hand-maintained:
   - ring `(row, col, side) → index` for N in 4..8
   - resolved conns for all 6 tiles × 4 orientations, plus the offset table
   - `canPlace` vectors: board states harvested from **random Python playouts** × candidate
     footprints → expected boolean
   - `markerDestination` vectors: ring occupancy patterns × signed distances → expected slot or
     null

   The last two are generated from real playouts rather than written by hand, so they cover
   states nobody thought to imagine. The engine's own final review used random playouts to the
   same end.

2. **`geometry.ts` hit-testing** — pure unit tests for cells, ring slots, corners and
   out-of-bounds, over the ring fixture.

3. **Orientation normalization** — every tile at every orientation normalizes into its distinct
   set, and the normalized move is one the server accepts (trap 2).

4. **Tentative state** — apply, undo and spent-pile bookkeeping are pure client logic with no
   network; assert the overlay after undo is identical to the committed board, and that a spent
   pile offers no placements.

5. **View model redaction** — pile *contents* never appear in serialized output.

6. **API smoke test** — play a full two-player game to `game_over` without a browser, reusing
   the random-playout approach the engine's final review used.

Browser-level end-to-end testing is out of scope for tier 1. The bar is "two people can finish a
game hot-seat," and items 1–6 cover every mechanism that bar depends on.

---

## 12. Style

Type hints throughout the Python; strict mode in TypeScript. Pure functions where possible —
`hitTest`, `canPlace`, `markerDestination` and the normalization helper must all be free of
rendering and network concerns. Rules data is generated, never hand-transcribed. Engine rule
constants stay in `config.py`; purely presentational constants live in one client module.
