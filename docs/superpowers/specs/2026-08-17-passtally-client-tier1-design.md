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

Tier 3 is a separate subsystem — authority split, lobby, reconnect, spectators — and gets its
own spec. Nothing here forecloses it; see §3 on redaction.

**Legal note:** clean-room implementation from published rules. Do not copy tile artwork, the
name, or box/board trade dress into anything distributed.

---

## 1. The two gaps in the brief

The brief specifies a Canvas-plus-DOM client but never names a language, and the engine it
must drive is Python. It also assumes the client can read game state, which the engine cannot
currently provide — its public surface is `new`, `setup_place_marker`, `legal_moves`, `apply`,
`is_over`, `winner`, `clone`, `key`, with no serialization anywhere. `key()` is a hash and
deliberately lossy.

Both are resolved below. A third conflict — the engine has no concept of a tentative action —
is resolved in §4.

---

## 2. Architecture

**A local HTTP server, with Python remaining authoritative.** FastAPI wraps the engine and
serves the built client.

Chosen because it keeps one source of rules truth. The engine has 182 tests and survived
mutation testing; a TypeScript port would re-implement rules at exactly the point where a
silent divergence is most expensive, and tier 3 would then need the Python engine back as
server authority anyway — leaving two engines to keep in sync permanently. This *is* the
tier-3 architecture, so tier 3 becomes lobby and transport work rather than a rewrite.

**Tier 1 needs no per-frame engine calls**, which is what makes the round trip affordable.
Ghost snapping is pure geometry. Legal anchors are fetched once per state change, not per
pointer move. Only tier 2's hover preview wants tracing per frame, and that decision is
deferred to tier 2, where the brief already sanctions a client-side tracer.

**Frontend: TypeScript + Vite, no framework.** The view model is the contract between Python
and the client, and TS makes it checkable rather than hoped-for. The DOM chrome is a tray, a
rail and a log; a framework earns nothing at that size, and the brief explicitly wants a single
imperative canvas draw loop. Vite's dev server proxies to FastAPI.

### Module layout

```text
passtally/            existing engine -- unchanged except one promotion
  board.py            + partner_offset() promoted from Game._partner_offset
  view.py             NEW -- builds the redacted view model
server/
  session.py          committed Game + <=2 tentative moves; clone+replay
  app.py              FastAPI: JSON API + serves the built client
client/src/
  types.ts            view-model types, mirroring view.py
  api.ts              typed fetch wrappers
  geometry.ts         PURE: cursor -> unit index -> cell | ring slot | none
  state.ts            the six-state machine
  render/board.ts     canvas draw loop
  render/tiles.ts     line art from conns
  ui/tray.ts
  ui/rail.ts
  ui/log.ts
```

`Game._partner_offset` becomes a free function `partner_offset(board, row, col)` in `board.py`.
The client must draw 1x2 tile outlines, not merely per-cell line art, so `view.py` needs the
same tile-boundary information `key()` does. One caller becoming two is the moment to promote
it; `Game.key()` then calls the free function.

This is the **only** change to the engine's existing code, and it is a move, not a rewrite.

---

## 3. The view model

This is the contract. It is **redacted from day one** — pile counts, never pile contents —
which costs nothing now and makes tier 3's "never pile contents" requirement free rather than
a retrofit.

```ts
type Side = 0 | 1 | 2 | 3          // N, E, S, W -- matches the engine exactly
type TypeId = 1 | 2 | 3 | 4 | 5 | 6
type Pos = [row: number, col: number]

type Move =
  | { kind: "place";  pileIndex: number; cellA: Pos; cellB: Pos; orientation: number }
  | { kind: "marker"; markerIndex: number; distance: -2 | -1 | 1 | 2 }

type CellView = {
  height: number                    // 0 == empty
  conns: [Side, Side][] | null      // null when empty
  partner: [number, number] | null  // offset of the cell sharing this tile
}

type SlotView = { row: number; col: number; side: Side; occupant: number | null }

type PileView = {
  faceUp: TypeId | null
  count: number                     // count only -- never the ordered contents
  spent: boolean                    // consumed by a tentative placement this turn
  distinctOrientations: number[]    // see the normalization trap, section 7
}

type GameView = {
  n: number
  cells: CellView[][]
  ring: SlotView[]
  piles: PileView[]
  players: { markerSlots: number[]; score: number }[]
  currentPlayer: number
  actionsLeft: number
  phase: "setup" | "play" | "over"
  setupNext: number | null          // whose turn to place a setup marker
  winner: number | null
  legalMoves: Move[]
}
```

**`legalMoves` is bundled into the view rather than served from its own endpoint.** It is
derived from exactly the state being returned, so bundling makes desync structurally
impossible — which is the failure mode that made "client pre-filters only" unattractive. Cost
is roughly 300 entries (~20KB) per response over a local socket.

**A redaction test is part of tier 1**, asserting that no pile's ordered contents appear in
serialized output. It guards tier 3 before tier 3 exists.

---

## 4. Tentative turns

**The engine has no rollback.** `apply()` commits immediately: it mutates the board, pops the
pile's replacement into `face_up`, and when `actions_left` reaches 0 it scores, advances the
player, and evaluates end conditions. There is no "turn finished but uncommitted" state.

Tier 1 requires one, for both "placement is tentative until turn commit" and "undo a tentative
action before commit."

**Resolution, requiring no engine change:** a session holds the **committed `Game` plus a list
of at most two tentative moves**. The tentative view is derived by `clone()` then replaying
those moves. Undo drops the last move and recomputes. Commit promotes the clone to committed.

`clone()` costs ~507 microseconds and runs on click, not per frame — irrelevant at this scale.
The verified engine stays untouched.

### The tray reveal rule

Because `apply()` draws the replacement immediately, the clone's `face_up` is already the
*next* tile the moment a tentative placement lands. The brief requires replacements stay hidden
until commit.

So the two halves of the view come from different places during a tentative turn:

| View component | Source |
| -------------- | ------ |
| cells, ring, markers, actionsLeft | the **tentative clone** |
| piles' `faceUp` | the **last committed** game |
| piles' `spent` | true where a tentative placement consumed that pile |

A spent pile renders as visibly used with its contents unrevealed. Undo makes it visibly
un-spend, which is the clearest available signal that the undo landed.

### What commit reports

The turn log needs passes and lines, not just a VP total. `score_for` returns VP only, but
`score_lines(board, marker_slots)` already returns the per-line dict. Commit calls it directly.
No engine change — just a call the engine already supports.

---

## 5. API

Sessions are in-memory, keyed by game id. No persistence — an explicit non-goal.

| Route | Purpose |
| ----- | ------- |
| `POST /api/game` | new game (`n_players`, `seed`, `board_size`) → id + view |
| `GET /api/game/{id}` | current view |
| `POST /api/game/{id}/setup` | place one setup marker; snake order enforced server-side |
| `POST /api/game/{id}/tentative` | append a tentative move → tentative view |
| `DELETE /api/game/{id}/tentative` | undo the last tentative move → view |
| `POST /api/game/{id}/commit` | promote the clone → view + turn result |

**Legality is enforced on both sides.** The server validates every move — `apply()` already
raises `ValueError` on anything illegal, and the setup guards added during the engine's final
review cover negative indices and incomplete setup. The client additionally pre-filters using
`legalMoves` so illegal placements are visibly impossible. The server stays the authority; the
client is being helpful, not trusted.

Rejected moves return a 4xx with a reason. Per the brief, the client renders a rejection
visibly — a shake or flash, never a silent no-op.

---

## 6. Interaction

### States

```text
setup ──(all markers placed)──> idle
idle ──1/2/3──────────────────> tile_selected
idle ──click own marker───────> marker_selected
tile_selected   ──click legal anchor──> idle    (actionsLeft - 1)
marker_selected ──click destination───> idle    (actionsLeft - 1)
idle ──Enter, actionsLeft == 0──> committing ──> idle | game_over
any  ──Esc──> idle
idle ──Backspace──> idle        (undo last tentative)
```

The client holds no rules. Every tentative action is a round trip returning a fresh view.

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

## 7. Hit-testing, and the two cross-boundary traps

Hit-testing is one pure function, tested independently of rendering:

```ts
type Hit = { kind: "cell"; row: number; col: number }
         | { kind: "slot"; index: number }
         | { kind: "none" }

hitTest(px: number, py: number, layout: Layout): Hit
```

With the ring one cell deep on each side, the board region is `N + 2` units across, so
`unit = size / (N + 2)`. Corners of the ring band are dead space and return `none`.

### Trap 1: ring indexing across the language boundary

The client's slot indexing must match `build_ring` **exactly**, in another language, with no
compiler to catch drift. The engine's ring runs clockwise from the top-left: north edge
`0..n-1`; east `n..2n-1`; south `2n..3n-1` with columns reversed; west `3n..4n-1` with rows
reversed. Get a reversal wrong and markers land on the wrong slot, silently.

**Mitigation:** generate a conformance fixture from Python — every `(row, col, side) → index`
triple for N in 4..8, dumped to JSON — and assert the TypeScript implementation reproduces it.
The engine already tests that round-trip exhaustively; this makes the client prove it agrees.

The same fixture carries the **orientation offset table**, which is the other constant the
client must duplicate: `0 → (1, 0)`, `1 → (0, -1)`, `2 → (-1, 0)`, `3 → (0, 1)`. The client
needs it for ghost footprints and for the normalization in trap 2, so it is a second silent
drift risk and belongs under the same guard. The fixture is generated by a script committed
alongside it, so it can be regenerated rather than hand-maintained.

### Trap 2: rotation offers placements `legalMoves` omits

The brief says `R` cycles four orientations. But `legal_moves` emits only *distinct*
orientations — for the symmetric tiles 2, 5 and 6 that is two, not four, because 180° rotation
swaps the two cells while leaving each cell's shape unchanged.

So rotating such a tile to orientation 2 produces a placement the server would happily
**accept** (`can_place` passes; it is footprint-only) but which appears nowhere in
`legalMoves` — and the client's pre-filter would wrongly grey it out.

**Resolution:** keep `R` cycling all four, because predictable rotation matters more than
internal tidiness, and **normalize in the client** before matching and before sending.
Orientations `o` and `o + 2` cover the same footprint with the cells swapped, so
`(anchor, o + 2)` is rewritten to `(anchor + offset(o + 2), o)`. This is why `PileView`
carries `distinctOrientations`.

---

## 8. Layout

Three regions, fixed proportions, scaling as a unit. Reference sizing from the brief: board
region 500x500, tray strip 500x150, rail 190 wide and full height, ~16px gutters, total
≈ 716x656.

```text
┌────────────────────────────────┬──────────┐
│         BOARD REGION           │   RAIL   │
│      (square, dominant)        │          │
├────────────────────────────────┤          │
│         TRAY STRIP             │          │
└────────────────────────────────┴──────────┘
```

**Board region — two nested surfaces.** A `grid` (the N×N playing area, tiles only) and a
`ring` band around it holding marker slots, not part of the grid array. Ring slots are the same
size as grid cells so the two read as one object. At N = 6 in a 500px region a unit is 62.5px.

The ring is separate because it matches the data model (`ring` is a flat 4N array, `cells` is
N×N), and because hit-testing then never has to disambiguate a marker click from a cell click.

**Tray strip** — one horizontal strip, because committing a turn is a single decision:

```text
[pile 1] [pile 2] [pile 3]  ·····  actions left: 2  ·  [ commit ]
```

Each pile shows its face-up tile at the same aspect and line style as the board, so connections
can be judged before picking it up. An empty pile stays in place, greyed, showing 0 — it is an
end-game trigger and hiding it hides that. Commit is the only high-emphasis control and is
disabled until both actions are spent.

**Elevation encoding — two channels, because level drives both the support rule and the pass
multiplier.** A lightness ramp keyed to level for "where are the tall stacks" at a glance, plus
a numeric badge per tile for exact counting. Not drop shadows alone: in dense areas every tile
shadows its neighbour and the depth cue collapses.

**Rail**, top to bottom: players (colour swatch, name, VP, active marked), then the turn log —
one entry per committed turn with actions taken, passes, and VP gained. The log is not
optional: scoring happens once at end of turn and is otherwise invisible, so an opponent's
five-point jump would be unexplained. It doubles as the development trace.

**Rendering split.** Canvas for grid, ring, tiles, markers, ghost — one imperative draw loop,
redrawn on state change or pointer move. DOM for tray, rail, counters, buttons, log, because
hover states and layout come free.

---

## 9. Resolved constants

Each is a named constant with a `# TODO: verify against rulebook` comment where the rulebook is
unconfirmed, following the engine's convention.

| Constant | Value | Note |
| -------- | ----- | ---- |
| setup order | **snake draft** | see below. TODO: verify against rulebook |
| tie-break | **turn order** | see below |
| board size | from the engine's `config.N` | never hardcoded client-side; `n` arrives in the view |

**Snake draft, stated explicitly.** Each player places `MARKERS_PER_PLAYER` (4) markers, so the
sequence is 4 passes alternating direction — forward, reverse, forward, reverse. For 2 players:
`P1 P2 · P2 P1 · P1 P2 · P2 P1`. For 3 players: `P1 P2 P3 · P3 P2 P1 · P1 P2 P3 · P3 P2 P1`.
Total placements are `n_players * 4`, and `setupNext` reports whose turn it is. The engine's
existing per-edge and occupied-slot validation still applies to every placement; the snake order
governs only *who* places next, never *where*.

**Tie-break.** The brief says "break ties by turn order," but the engine's `winner()`
deliberately returns `None` on a tie. Rather than change verified engine behaviour, **the
client breaks the tie for display**: on `winner() is None` with the game over, the client ranks
by score then by turn order. The engine's notion of "no single winner" stays intact, and the
presentation layer owns the presentation rule.

---

## 10. Testing

Ordered by where the risk actually sits.

1. **`geometry.ts` hit-testing** — pure unit tests for cells, ring slots, corners and
   out-of-bounds, plus the Python-generated ring conformance fixture for N in 4..8 (§7, trap 1).
2. **Orientation normalization** — every tile at every orientation normalizes to a member of
   `distinctOrientations`, and the normalized move is present in `legalMoves` whenever the raw
   placement is legal (§7, trap 2).
3. **Session layer** — tentative apply, undo, and commit. Assert the committed `Game` is
   unchanged until commit, and that the tray reports committed `faceUp` while `spent`.
4. **View model redaction** — pile *contents* never appear in serialized output.
5. **API smoke test** — play a full two-player game to `game_over` without a browser, reusing
   the random-playout approach the engine's final review used.

Browser-level end-to-end testing is out of scope for tier 1. The bar is "two people can finish
a game hot-seat," and items 1–5 cover every mechanism that bar depends on.

---

## 11. Style

Type hints throughout the Python; strict mode in TypeScript. Pure functions where possible —
`hitTest` and the normalization helper must both be free of rendering and network concerns.
The client holds no game rules. Every rule constant stays in the engine's `config.py` or, where
purely presentational, in a single client-side constants module.
