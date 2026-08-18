# Passtally Client — Tier 1 Design

**Status:** approved, ready for planning
**Date:** 2026-08-17
**Companion to:** `2026-08-15-passtally-engine-design.md` (the rules design, language-agnostic)
**Source requirements:** the "Passtally Client — Features & Layout" brief

**Scope:** Tier 1 only — a playable hot-seat client. The bar is that two people can finish a
full game at one keyboard and the client never permits an illegal state.

**Non-goals for this pass:** everything in tiers 2 and 3 (hover preview, path highlighting,
scoring breakdowns, multiplayer, lobby, spectators, timers), plus the brief's own out-of-scope
list: AI, sound, animation, mobile, accounts, persistence, replay export, cross-turn undo.

**Legal note:** clean-room implementation from published rules. Do not copy tile artwork, the
name, or box/board trade dress into anything distributed.

---

## 1. The gaps in the brief, and how they resolved

The brief specifies a Canvas-plus-DOM client but never names a language, and the engine it must
drive was Python. It also assumes the client can read game state, which the engine could not
provide — no serialization anywhere, and `key()` is a deliberately lossy hash. A third conflict
it does not anticipate: **the engine has no concept of a tentative action**; `apply()` commits
immediately, drawing the replacement and, at zero actions, scoring and advancing the player.

The resolution to the first gap collapsed the other two.

**The engine is ported to TypeScript and shared.** At 833 lines with stdlib-only imports, it is
small enough that porting costs less than living with two implementations. One `rules` package
is imported by everything that needs rules, so there is no duplication to keep in sync — not
now, and not when tier 2's tracer arrives.

Two consequences follow, and both remove work:

- **Tier 1 ships no server.** The bar is hot-seat: two people, one keyboard, one tab. There is
  no second client to sync with and no adversary to validate against. `Game.apply()` still
  raises on any illegal move, so "the client never permits an illegal state" holds identically,
  enforced directly rather than over HTTP.
- **Tentative turns need no rollback machinery.** The client owns exploration; the committed
  `Game` is only ever advanced by a whole turn.

---

## 2. Architecture

```text
packages/
  rules/              @passtally/rules -- the ported engine, THE single rules source
    src/
      types.ts        Side, Result, Move, Pos, TypeId
      config.ts       N, PASSES_TO_VP, MARKER_DISTANCES, MARKERS_PER_PLAYER, ...
      rng.ts          NEW -- seeded PRNG (see section 3)
      tileTypes.ts    the 6 designs, import-time validator, rotation cache
      ring.ts         Ring
      board.ts        Cell, Slot, Board, buildRing, slotIndexOf, partnerOffset
      placement.ts    canPlace, placeTile
      trace.ts        traceFrom, trace, passesToVp, scoreLines, scoreFor
      markers.ts      markerDestination
      game.ts         Game
    test/             ported suite + differential oracle fixtures
  client/
    src/
      session.ts      Session interface + LocalSession
      view.ts         Game -> GameView (redacted)
      geometry.ts     PURE: cursor -> unit index -> cell | ring slot | none
      tentative.ts    client-only turn state: <=2 moves, local board overlay
      state.ts        the six-state machine
      render/board.ts canvas draw loop
      render/tiles.ts line art from conns
      ui/{tray,rail,log}.ts
reference/            Python engine -- RETAINED as oracle, never shipped
  passtally/          the engine, unchanged
  tests/              its 182 tests
  gen_oracle.py       emits differential fixtures from the Python engine
```

Tooling: npm workspaces, Vite, Vitest, TypeScript in strict mode. No runtime dependencies in
`rules`.

**`packages/rules` and `packages/client` are separate deliverables and warrant separate
implementation plans.** The rules package is fully testable on its own — the ported suite plus
the differential oracle gate it without a single pixel being drawn — and the client is far
easier to build against a package that is already proven. Plan one ends when the oracle passes.

### The Session seam

The committed `Game` sits behind an interface, so the rendering layer never touches it directly:

```ts
interface Session {
  getView(): GameView                                    // redacted
  placeSetupMarker(player: number, slot: number): void
  commit(moves: Move[]): TurnResult
}
```

Tier 1 ships `LocalSession`, owning a `Game` in-process. Tier 3 adds `RemoteSession` over HTTP
implementing the same interface, and the rendering layer does not change.

This matters even without a network. The deck lives in the same process as the renderer in tier
1, so redaction is not yet a *trust* boundary — but making it a **code** boundary now means it
becomes a trust boundary at tier 3 for free, rather than being retrofitted through rendering
code that assumed synchronous access to everything.

---

## 3. The port

833 lines of engine and 1,138 lines of tests, both ported. The design spec
(`2026-08-15-passtally-engine-design.md`) is language-agnostic and remains the authority on
rules; only the implementation language changes.

Four constructs need real decisions:

| Python | TypeScript | Note |
| ------ | ---------- | ---- |
| `@dataclass` | interface + factory function | mechanical |
| `Enum` | numeric union, `Side` stays `N=0, E=1, S=2, W=3` | the clockwise ordering is load-bearing for `(v+1)%4` rotation |
| `frozenset` in `canon()` | sorted canonical string key | used for order-independent conns comparison and in `key()` |
| `copy.deepcopy` in `clone()` | hand-written structural clone | the engine's final review measured `deepcopy` at ~507µs and named a hand-written clone as the first optimisation — the port is where that comes for free |

**Seeded RNG does not port.** TypeScript has no stdlib seeded PRNG, so `rng.ts` implements
mulberry32 plus Fisher–Yates. **Python seeds will not reproduce the same deal in TypeScript**,
which is why the oracle fixtures below record dealt piles explicitly rather than seeds.

### The differential oracle

The Python engine is retained — not shipped, not maintained as a parallel implementation, but
kept as a **reference to test against**. This gives the TypeScript port something the Python
engine never had for itself: an independent implementation to disagree with.

`reference/gen_oracle.py` runs random playouts through the Python engine and records, per fixture:

- the explicit dealt piles (not a seed)
- the setup marker placements in order
- the full move sequence
- a **portable state digest after every single action**

The digest is canonical JSON over the complete state — cell heights, conns, partner offsets,
ring occupants, pile contents, scores, current player, actions left, end-of-game flags — with
sorted keys. Not a hash: when it diverges you want to read the diff. Deliberately *not* `key()`,
whose canonical form is language-specific and which is lossy by design.

The TS test suite replays each fixture and asserts the digest matches at every step. A
divergence anywhere in a playout is caught at the action that caused it.

---

## 4. The view model

Redacted from the start — pile counts, never contents.

```ts
type Side = 0 | 1 | 2 | 3          // N, E, S, W
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

type TurnResult = {
  lines: { slots: [number, number]; passes: number }[]
  totalPasses: number
  vpAwarded: number
}
```

`GameView` carries no legal-move list: the client has the rules and computes legality itself.

**This is also what closes an information leak.** An earlier draft bundled a `legalMoves` field,
which turned out to leak: `legalMoves` iterates `distinctOrientations(faceUp)`, and those counts
split the six designs into `{1,3,4}` with four orientations and `{2,5,6}` with two — so the
orientation set for a pile whose replacement had been drawn revealed which half of the deck the
next tile came from. Verified empirically before removal. With no derived field and no hidden
data crossing the `Session` boundary, the channel cannot be expressed.

**A redaction test is part of tier 1**, asserting no pile's ordered contents are reachable
through `GameView`. It guards tier 3 before tier 3 exists.

`TurnResult` exists because the turn log needs passes and lines, not just a VP total.
`scoreFor` returns VP only, but `scoreLines(board, markerSlots)` already returns the per-line
dict — `commit` calls it directly.

---

## 5. Tentative turns

**The committed `Game` has no tentative state.** The client owns exploration entirely and the
session only ever receives completed turns.

This follows from what the commitment rules are *for*: a player may try combinations of the
available tiles and put them back, so long as **no new information is revealed**. Turning over a
replacement is the irreversible act — once seen it cannot be unseen, so the placement that
caused it is locked in. Replacements are therefore turned over at commit, not at placement.

The consequence: **a pile you have tentatively placed from shows nothing**, so there is nothing
to place from it a second time. "A spent pile is done for the turn" is not a restriction anyone
imposes — it falls out of the reveal timing.

The client holds:

- an ordered list of at most two tentative moves
- a local board overlay derived by applying them to the committed `cells`
- a per-pile `spent` flag, marking piles consumed this turn

Undo drops the last move and recomputes the overlay.

`Game.apply()` still pops the replacement when it applies a placement. That is a detail *inside*
the session: it happens at commit, and the UI learns the new face-up tiles from the returned
view — exactly when a player would turn them over.

**Setup placements are not tentative.** Each commits immediately via `placeSetupMarker`. Nothing
is revealed by placing one, so there is nothing to explore. `LocalSession` enforces the snake
order (§9) and rejects an out-of-turn placement; the engine's own per-edge and occupied-slot
validation still runs beneath it. The `setup` state has no undo and no commit button.

---

## 6. Interaction

```text
setup ──(all markers placed)──> idle
idle ──1/2/3──────────────────> tile_selected
idle ──click own marker───────> marker_selected
tile_selected   ──click legal anchor──> idle    (actionsLeft - 1, pile marked spent)
marker_selected ──click destination───> idle    (actionsLeft - 1)
idle ──Enter, actionsLeft == 0──> committing ──> idle | game_over
any  ──Esc──> idle
idle ──Backspace──> idle        (undo last tentative)
```

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

## 7. Hit-testing, and the one remaining trap

Hit-testing is one pure function, tested independently of rendering:

```ts
type Hit = { kind: "cell"; row: number; col: number }
         | { kind: "slot"; index: number }
         | { kind: "none" }

hitTest(px: number, py: number, layout: Layout): Hit
```

With the ring one cell deep on each side the board region is `N + 2` units across, so
`unit = size / (N + 2)`. Corners of the ring band are dead space and return `none`.

Ring indexing is **no longer a cross-language risk** — `hitTest` calls the same `slotIndexOf`
the rules use, in the same process. What remains is the pixel-to-unit mapping, which is ordinary
new code and is tested directly against `buildRing`.

### The trap that survives: rotation offers placements the distinct set omits

The brief says `R` cycles four orientations. But only *distinct* orientations produce distinct
board states — for the symmetric tiles 2, 5 and 6 that is two, because 180° rotation swaps the
two cells while leaving each cell's shape unchanged.

Rotating such a tile to orientation 2 produces a placement that is genuinely legal (`canPlace`
is footprint-only and accepts it) but that is not in the tile's distinct set — so naive matching
against `distinctOrientations` would wrongly reject it.

**Resolution:** keep `R` cycling all four, because predictable rotation matters more than
internal tidiness, and **normalize before committing**. Orientations `o` and `o + 2` cover the
same footprint with the cells swapped, so `(anchor, o + 2)` is rewritten to
`(anchor + offset(o + 2), o)`.

---

## 8. Layout

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

## 9. Resolved constants

| Constant | Value | Note |
| -------- | ----- | ---- |
| setup order | **snake draft** | see below. TODO: verify against rulebook |
| tie-break | **turn order**, in the view layer | see below |
| board size | `config.N` | never hardcoded in the client; `n` arrives in the view |

**Snake draft, stated explicitly.** Each player places `MARKERS_PER_PLAYER` (4) markers, so the
sequence is four passes alternating direction. Two players:
`P1 P2 · P2 P1 · P1 P2 · P2 P1`. Three players: `P1 P2 P3 · P3 P2 P1 · P1 P2 P3 · P3 P2 P1`.
Total placements are `n_players × 4`, and `setupNext` reports whose turn it is. The engine's
per-edge and occupied-slot validation still applies; the snake order governs only *who* places
next, never *where*.

**Tie-break.** The brief says "break ties by turn order," but `winner()` deliberately returns
`null` on a tie. Rather than change verified engine behaviour, the view layer breaks the tie
**for display**: on `winner === null` with the game over, rank by score then by turn order. The
engine's notion of "no single winner" stays intact and the presentation layer owns the
presentation rule.

---

## 10. Testing

Ordered by where the risk sits.

1. **The ported suite** — all 1,138 lines' worth of behaviour, translated. This includes the
   four regression guards the Python build earned the hard way: the trace visited-key must be
   `(row, col, entry)` not `(row, col)`; `placementId` compared against the previous step only;
   scoring summed before conversion; and `markerDestination`'s `position !== startSlot` clause.
2. **The differential oracle** (§3) — the gate on the port itself. Every fixture replayed, digest
   compared after every action.
3. **`geometry.ts` hit-testing** — pure unit tests for cells, ring slots, corners and
   out-of-bounds, checked against `buildRing` in-process.
4. **Orientation normalization** — every tile at every orientation normalizes into its distinct
   set, and the normalized move is one `Game.apply` accepts (§7).
5. **Tentative state** — apply, undo and spent-pile bookkeeping are pure functions; assert the
   overlay after undo equals the committed board, and that a spent pile offers no placements.
6. **View redaction** — pile contents unreachable through `GameView`.
7. **Full-game smoke test** — a random playout in TypeScript from `new` to `phase === "over"`.

**One discipline carried over from the engine build, because it cost real time there:** a test
that asserts an invariant must be checked for vacuity. Three of the Python engine's tests passed
while testing nothing, and each was found only by deliberately breaking the behaviour and
confirming the test failed. Every test added for items 1, 3, 4 and 5 gets that check.

---

## 11. Style

TypeScript strict mode throughout. Pure functions where possible — `hitTest`, `canPlace`,
`markerDestination` and the normalization helper must all be free of rendering and session
concerns. `packages/rules` has no runtime dependencies and no knowledge of rendering. Rule
constants live in `rules/config.ts`; purely presentational constants live in one client module.
