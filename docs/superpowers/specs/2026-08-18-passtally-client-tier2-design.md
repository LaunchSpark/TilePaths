# Passtally Client Tier 2 — Legibility Design

**Status:** approved, ready for planning
**Date:** 2026-08-18
**Builds on:** `2026-08-17-passtally-client-tier1-design.md` (tier 1, implemented)
**Rules authority:** `2026-08-15-passtally-engine-design.md` — language-agnostic

**The bar, from the brief:** a player who has never seen the physical game can tell what is
happening and why they scored what they scored.

**Scope:** the nine tier 2 features, plus one prerequisite that touches `packages/rules`.

**Non-goals:** everything in tier 3 — server, lobby, reconnect, spectators, per-turn timers —
and everything tier 1 already excluded: AI, sound, mobile, accounts, persistence, replay export,
cross-turn undo.

---

## 1. Why this starts in `packages/rules`

Tier 1 shipped with a **second tracer**. `traceViewPath` in `packages/client/src/path-highlight.ts`
re-implements the engine's walk — same `(row, col, entry)` visited key, same `step`/`opposite`,
same off-board termination through `slotIndexOf` — because the engine's `trace` returns
`[endpoint, passes]` and **never reports which cells the line crosses**. Highlighting needs that
geometry.

Both tracers are correct today and agree on the uncovered-cell rule. But the client's is not
covered by the differential oracle, it has no pass counting at all, and a future rule change
would need applying in three places: the Python reference, the engine, and the client.

That missing pass count is not incidental — it is exactly why tier 1 shipped hover *paths*
without hover *counts*, leaving the headline feature half-built.

**So tier 2 begins by moving path tracing into the rules package**, then deleting the client's
copy. One change removes the duplication, brings path geometry under the oracle, and supplies
the pass counts the rest of tier 2 needs.

### One walk, two views

`tracePath` becomes *the* implementation; `trace` and `traceFrom` become thin wrappers over it.
They cannot then diverge, which is the entire point.

```ts
export type PathStep = {
  row: number; col: number;
  entry: Side; exit: Side;
  placementId: number | null;   // null on an uncovered cross path
  height: number;               // 0 on an uncovered cell
};

export type TracedPath = {
  endpoint: Result | number;    // ring slot index, or DEAD / LOOP
  passes: number;
  steps: PathStep[];
};

export function tracePath(board: Board, startSlot: number): TracedPath;
export function tracePathFrom(board: Board, row: number, col: number, entry: Side): TracedPath;
```

`traceFrom(board, row, col, entry)` keeps its `[endpoint, passes]` signature by delegating to
`tracePathFrom` and discarding `steps`. Every existing caller is unaffected.

**The oracle is unaffected.** Its digest covers board state, not path geometry, so all 25
fixtures and their 2,003 per-action comparisons carry over untouched. The existing 236 tests
keep guarding the pass arithmetic.

`PathStep` carries `placementId` and `height` because two features need them: the pass badge
needs the count, and the scoring breakdown needs *which tiles at which levels*. Both fall out of
the same walk.

### Ghost previews need no new rules

The client already clones a `Game` for its tentative overlay. A hypothetical placement clones
again and calls the exported `placeTile` directly:

```ts
const hypothetical = tentative.overlayGame();
placeTile(hypothetical.board, cellA, cellB, typeId, orientation);
tracePath(hypothetical.board, slot);
```

`traceViewPath`, `exitFor` and `ghostConnections` are **deleted** — roughly 90 of
`path-highlight.ts`'s 178 lines. What survives is the part that was always client work:
`PathHighlightCache` and its topology key.

---

## 2. The line model

```ts
type LineView = {
  owner: number;               // player index, for colour
  slots: [number, number];     // the two endpoint markers, ascending
  passes: number;
  steps: PathStep[];           // for offset-aware drawing
};
```

A line exists when a trace from one of a player's markers ends on **another of that same
player's** markers. Deduped by the unordered slot pair, exactly as `scoreLines` does.

Computed in two situations, and only these:

| When | Whose lines |
| ---- | ----------- |
| Always, during play | the **active player's** completed lines |
| While a ghost hovers a legal anchor | **every** player's completed lines |

Quiet by default, informative on demand. Overlaps therefore only appear during preview, when
the player is actively looking for them.

---

## 3. The nine features

### Hover preview — all players, passes only

While the ghost sits on a legal anchor, trace every player's lines against the hypothetical
board and draw them with their pass counts.

**Passes, not victory points.** A turn has two actions, so a VP figure shown mid-turn would
imply a total the second action can still change. Passes are the honest unit at this moment;
the conversion is exposed separately by the curve (below).

**All players, not just the mover.** Learning that your placement completes an opponent's line
is real strategic information and the board already shows everything needed to work it out by
hand. Cost is up to 12 traces and two clones per pointer move; see §5.

### Pass badges on endpoint markers

Each completed line puts its count on the two ring slots anchoring it, in the owner's colour.
The number sits on the thing that owns it, never covers board art, and stays readable when six
lines are live. Reading a line means following it between two matching badges.

### Persistent highlight for the active player

The current player's completed lines stay lit all turn with their badges. You always see your
own position without hovering anything.

### Parallel offset for overlaps

Overlapping runs are drawn offset perpendicular to their direction, like transit lines.

**The offset must be deterministic, or two lines can land on each other.** Each drawn run gets
a lane index from a stable ordering — owner index first, then the line's ascending slot pair,
then the step's position along the path for a self-crossing line's second visit. Lane `k` is
drawn at `(k - (lanes - 1) / 2) * gap` perpendicular to that step's direction, so lanes stay
centred on the true path and the same line always occupies the same lane between redraws. Two
lines sharing a tile therefore never collide, and a line crossing itself always separates.

This is the only treatment that solves **both** cases. Two players sharing a tile could be
separated by colour or stroke pattern — but a line crossing itself through different faces is
one player and one pattern, so offset is the sole thing that can show two crossings rather than
one. Since a self-crossing tile scores twice, drawing it once is not a cosmetic problem: it
contradicts the count on the badge.

### Legal-anchor highlighting

When a tile is selected or dragged, tint the cells where it could legally land. The client asks
`canPlace` — that *is* asking the rules, so no duplication.

Recomputed on selection, rotation or board change. **Not** per pointer move: legality does not
depend on cursor position, and tier 1's grep gate stays satisfied because the answer comes from
the rules package.

### Scoring breakdown on hover

Hovering a player's score in the rail opens a popover showing **their current lines**, each
line's tiles grouped by `placementId` with level and contribution, then the total and its VP
conversion.

The brief asks for "which tiles, at which levels." A *cumulative* score cannot be decomposed
without replaying history, and past turns already live in the log — so the breakdown reports the
present position rather than reconstructing the past.

### The passes-to-VP curve, inside that breakdown

The rail is 190px wide and already carries players and log. The curve lives in the breakdown
popover with the player's current total marked on it, so it appears exactly when someone is
asking *why did that score what it did* — which is the question the curve answers. As an
always-visible strip it would be decoration nobody reads.

This is the only place `passesToVp` enters the client.

### Level readout on hover

Tier 1 already badges level ≥ 2, so a bare level number would be largely redundant. The readout
reports the cell's level **and**, when it sits on a highlighted line, how many passes it
contributes and to whose lines. Driven by the same hover that drives path highlighting, so it
costs no extra tracing.

### Animated score changes

Tween the rail score over roughly 400ms on commit. The only animation in scope, no dependency.

---

## 4. What stays out

Tier 1's architecture is unchanged. No server. The `Session` seam stays as the tier 3 boundary.
The client still holds no game rules: every legality and tracing question goes to
`@passtally/rules`, and tier 1's verification grep continues to gate that.

---

## 5. Cost, stated honestly

Three players hovering a ghost means up to 12 traces plus two `clone()` calls per pointer move.

`PathHighlightCache` already exists and already keys on a topology signature that deliberately
excludes scores, selection state and pointer pixels. It is rekeyed to include the ghost and
keeps doing its job — a pointer move within the same cell recomputes nothing.

If that proves insufficient, the fallback is tracing only from markers whose lines the ghost's
tile actually touches, which is what tier 1's code already does. That is a narrowing, not a
redesign.

---

## 6. Testing

Follows tier 1's split exactly.

| Layer | How it is verified |
| ----- | ------------------ |
| `tracePath` | the existing 236 rules tests plus the differential oracle |
| `LineView` computation | pure, real unit tests |
| Parallel-offset geometry | pure, real unit tests |
| Rendering and DOM | by running the app |

**One mutation check is mandatory**, given this project's history of eleven tests that passed
while testing nothing: draw a self-crossing line without the offset and confirm a test fails.
An offset that does not separate the two crossings is exactly the defect that would otherwise
ship looking correct — the badge would say 2 while the board showed one line.

---

## 7. Sequencing

The prerequisite touches `packages/rules`, which every prior plan treated as frozen. The oracle
survives it, but this is not purely client work and the first task changes a package two other
things depend on. It therefore lands first, on its own, verified before any feature is built on
it.
