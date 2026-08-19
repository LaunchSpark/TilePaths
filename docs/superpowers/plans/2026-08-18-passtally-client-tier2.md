# Passtally Client Tier 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the board legible — a player who has never seen the physical game can tell what is happening and why they scored what they scored.

**Architecture:** Path tracing moves into `@passtally/rules` as `tracePath`, with `trace`/`traceFrom` becoming wrappers so they cannot diverge; the client's duplicate tracer is deleted. Everything else is client rendering and DOM built on the pass counts that move unlocks.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-passtally-client-tier2-design.md`
**Tier 1 spec (still binding):** `docs/superpowers/specs/2026-08-17-passtally-client-tier1-design.md`

## Global Constraints

- TypeScript strict with `"noUncheckedIndexedAccess": true`. Imports use `.js` extensions.
- **`packages/client` holds no game rules.** Legality and tracing questions go to `@passtally/rules`. Tier 1's gate still applies: `grep -rnE "\.height (===|!==|>|<)|placementId|orthogonallyAdjacent" packages/client/src --include=*.ts | grep -v "render/"` must stay empty.
- **`reference/` must not be modified.** It is the differential oracle's reference implementation.
- **The oracle must keep passing.** Task 1 changes `packages/rules`; every later task must leave the 25 fixtures reproducing byte-identically.
- No module may assume board size 6 — `n` comes from the view.
- Commit after every task. Commit locally only; do not push.

---

## File Structure

| File | Change |
| ---- | ------ |
| `packages/rules/src/trace.ts` | **modify** — `PathStep`, `TracedPath`, `tracePath`, `tracePathFrom`; `trace`/`traceFrom` delegate |
| `packages/rules/test/trace.test.ts` | **modify** — add path-geometry tests |
| `packages/client/src/path-highlight.ts` | **modify** — delete `traceViewPath`/`exitFor`/`ghostConnections`; keep the cache |
| `packages/client/src/lines.ts` | **create** — `LineView`, `linesFor`, `previewLines` |
| `packages/client/src/render/offset.ts` | **create** — lane assignment and perpendicular offset |
| `packages/client/src/render/highlights.ts` | **modify** — offset-aware drawing, badges |
| `packages/client/src/render/board.ts` | **modify** — legal-anchor tint, level readout |
| `packages/client/src/ui/breakdown.ts` | **create** — score popover with the VP curve |
| `packages/client/src/ui/rail.ts` | **modify** — hover target, animated score |
| `packages/client/src/state.ts` | **modify** — legal anchors, hovered cell/score |
| `packages/client/src/main.ts` | **modify** — wiring |
| `packages/client/test/lines.test.ts` | **create** |
| `packages/client/test/offset.test.ts` | **create** |

---

### Task 1: `tracePath` in the rules package

**Files:**
- Modify: `packages/rules/src/trace.ts`
- Test: `packages/rules/test/trace.test.ts`

**Interfaces:**
- Produces: `type PathStep`, `type TracedPath`, `tracePathFrom(board, row, col, entry): TracedPath`, `tracePath(board, startSlot): TracedPath`. `trace` and `traceFrom` keep their existing `[Result | number, number]` signatures.

**This is the prerequisite for everything else.** Read `packages/rules/src/trace.ts` first — the existing `traceFrom` is the walk you are refactoring, not replacing. Its three load-bearing rules must survive unchanged:

1. The visited set is keyed on `(row, col, entry)`, never on the cell.
2. `placementId` is compared against the **previous step only**, never a set.
3. An uncovered cell routes `opposite(entry)` for **zero passes** and resets `lastId` to `null`, because an uncovered cell separates tile visits.

- [ ] **Step 1: Write the failing tests**

Append to `packages/rules/test/trace.test.ts`:

```ts
describe("tracePath", () => {
  it("reports the same endpoint and passes as trace", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const start = slotIndexOf(3, 0, 0, Side.W);
    const [endpoint, passes] = trace(b, start);
    const path = tracePath(b, start);
    expect(path.endpoint).toBe(endpoint);
    expect(path.passes).toBe(passes);
  });

  it("reports one step per cell entered", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const path = tracePath(b, slotIndexOf(3, 0, 0, Side.W));
    expect(path.steps.map((s) => [s.row, s.col])).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(path.steps.every((s) => s.entry === Side.W && s.exit === Side.E)).toBe(true);
  });

  it("carries placementId and height on every step", () => {
    const b = emptyBoard(3);
    const pid = placeTile(b, [0, 0], [1, 0], 2, 0);
    const path = tracePath(b, slotIndexOf(3, 0, 0, Side.W));
    const first = path.steps[0]!;
    expect(first.placementId).toBe(pid);
    expect(first.height).toBe(1);
  });

  // An uncovered cell is a printed cross path: it routes straight through and
  // contributes nothing, which is what distinguishes it from a placed tile.
  it("marks uncovered cells with a null placementId and zero height", () => {
    const b = emptyBoard(3);
    const path = tracePath(b, slotIndexOf(3, 1, 0, Side.W));
    expect(path.steps.length).toBe(3);
    expect(path.steps.every((s) => s.placementId === null && s.height === 0)).toBe(true);
    expect(path.passes).toBe(0);
  });

  it("records both visits when a line crosses one tile twice", () => {
    const b = emptyBoard(3);
    placeTile(b, [1, 1], [1, 0], 1, 1);
    placeTile(b, [0, 1], [0, 0], 1, 1);
    const path = tracePath(b, slotIndexOf(3, 1, 0, Side.W));
    const visits = path.steps.filter((s) => s.row === 1 && s.col === 0);
    expect(path.passes).toBe(3);
    // The same physical tile appears on more than one step.
    const ids = path.steps.map((s) => s.placementId).filter((id) => id !== null);
    expect(new Set(ids).size).toBeLessThan(ids.length);
    expect(visits.length).toBeGreaterThan(0);
  });

  it("returns the steps walked before a loop is detected", () => {
    const b = emptyBoard(4);
    placeTile(b, [1, 2], [1, 1], 1, 1);
    placeTile(b, [2, 1], [2, 2], 1, 3);
    const path = tracePathFrom(b, 1, 1, Side.E);
    expect(path.endpoint).toBe(Result.LOOP);
    expect(path.steps.length).toBeGreaterThan(0);
  });
});
```

Add `tracePath`, `tracePathFrom` and `Result` to that file's imports as needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/rules`
Expected: FAIL — `tracePath` is not exported.

- [ ] **Step 3: Refactor `trace.ts`**

Rewrite the walk as `tracePathFrom`, collecting steps, and make the existing entry points delegate. Keep every comment explaining the three rules — they are the reason this code is correct.

```ts
export type PathStep = {
  row: number;
  col: number;
  entry: Side;
  exit: Side;
  placementId: number | null;   // null on an uncovered cross path
  height: number;               // 0 on an uncovered cell
};

export type TracedPath = {
  endpoint: Result | number;
  passes: number;
  steps: PathStep[];
};

/** The single walk. trace and traceFrom are views onto this, so they cannot
 *  diverge from it. */
export function tracePathFrom(
  board: Board, row: number, col: number, entry: Side,
): TracedPath {
  let passes = 0;
  let lastId: number | null = null;
  const steps: PathStep[] = [];
  const seen = new Set<string>();

  for (;;) {
    // Keyed by (cell, ENTRY FACE) -- not by cell. Re-entering the same cell
    // through a different face is legal and must keep counting.
    const key = `${row},${col},${entry}`;
    if (seen.has(key)) return { endpoint: Result.LOOP, passes, steps };
    seen.add(key);

    const cell = board.cells[row]![col]!;
    // The board's printed + is an X path: it connects N-S and E-W but is not
    // a tile, so crossing it contributes no passes.
    const exitFace = cell.placementId === null ? opposite(entry) : follow(cell, entry);
    if (exitFace === null) return { endpoint: Result.DEAD, passes, steps };

    // Compare against the PREVIOUS STEP ONLY, never a visited-set. A line may
    // cross the same tile more than once and each crossing scores.
    if (cell.placementId === null) {
      // An uncovered cell separates tile visits. If a later bend returns to
      // the same physical tile, that is a new pass through it.
      lastId = null;
    } else if (cell.placementId !== lastId) {
      passes += cell.height;
      lastId = cell.placementId;
    }

    steps.push({
      row, col, entry, exit: exitFace,
      placementId: cell.placementId,
      height: cell.height,
    });

    const [nextRow, nextCol] = step([row, col], exitFace);
    if (!inBounds(board, [nextRow, nextCol])) {
      return { endpoint: slotIndexOf(board.n, row, col, exitFace), passes, steps };
    }
    row = nextRow; col = nextCol; entry = opposite(exitFace);
  }
}

export function tracePath(board: Board, startSlot: number): TracedPath {
  const slot = board.ring[startSlot]!;
  return tracePathFrom(board, slot.row, slot.col, slot.side);
}

export function traceFrom(
  board: Board, row: number, col: number, entry: Side,
): [Result | number, number] {
  const path = tracePathFrom(board, row, col, entry);
  return [path.endpoint, path.passes];
}

export function trace(board: Board, startSlot: number): [Result | number, number] {
  const path = tracePath(board, startSlot);
  return [path.endpoint, path.passes];
}
```

Export the new names from `packages/rules/src/index.ts` — it already re-exports `./trace.js` wholesale, so nothing to add.

- [ ] **Step 4: Run the full rules suite**

Run: `npm test -w @passtally/rules && npm run typecheck`
Expected: PASS — all 236 previous tests plus the new ones. **The oracle must be among them.** If any oracle fixture diverges, the refactor changed behaviour; fix the refactor, do not regenerate fixtures.

- [ ] **Step 5: Verify the oracle is genuinely unaffected**

Run: `python reference/gen_oracle.py && git status --short packages/rules/test/fixtures/`
Expected: no output from `git status` — the fixtures reproduce byte-identically, confirming the refactor did not change traced behaviour.

- [ ] **Step 6: Verify the step data can fail**

Temporarily drop `placementId` from the pushed `PathStep` (hardcode `null`). Confirm `carries placementId and height on every step` **fails**. Restore, confirm green. Report both outcomes.

- [ ] **Step 7: Commit**

```bash
git add packages/rules
git commit -m "feat(rules): tracePath reports path geometry alongside passes"
```

---

### Task 2: Delete the client's duplicate tracer

**Files:**
- Modify: `packages/client/src/path-highlight.ts`
- Test: `packages/client/test/path-highlight.test.ts`

**Interfaces:**
- Consumes: `tracePath`, `placeTile`, `TracedPath`, `PathStep` from `@passtally/rules`; `Tentative` from `./tentative.js`.
- Produces: `hypotheticalBoard(tentative, ghost): Board`, `PathHighlightCache` (kept), `pathTopologyKey` (kept, rekeyed).

Read `packages/client/src/path-highlight.ts` first. `traceViewPath`, `exitFor` and `ghostConnections` are the duplicate tracer — **delete them**. `PathHighlightCache` and `pathTopologyKey` were always client work and stay.

The existing 5 tests in `path-highlight.test.ts` were written against `traceViewPath`. Rewrite them against the new path, keeping what they assert: a starting path traces straight across an empty board; a ring slot only highlights when it holds a token; ghost connections are traced as though placed; the cache memoises on semantic state, not pointer pixels.

- [ ] **Step 1: Rewrite the tests against the rules tracer**

Replace the tracing tests in `packages/client/test/path-highlight.test.ts` so they call the new `hypotheticalBoard` + `tracePath` path. Keep the two cache tests as they are — they test client logic that has not changed.

```ts
it("traces straight across an empty board through printed cross paths", () => {
  const t = new Tentative(playing());
  const board = hypotheticalBoard(t, null);
  const path = tracePath(board, slotIndexOf(6, 2, 0, Side.W));
  expect(path.passes).toBe(0);
  expect(path.steps.length).toBe(6);
  expect(path.endpoint).toBe(slotIndexOf(6, 2, 5, Side.E));
});

it("traces through a ghost as though the tile were placed", () => {
  const t = new Tentative(playing());
  const faceUp = t.view().piles[0]!.faceUp!;
  const withGhost = hypotheticalBoard(t, {
    anchor: [2, 2], typeId: faceUp, orientation: 0,
  });
  const without = hypotheticalBoard(t, null);
  expect(withGhost.cells[2]![2]!.placementId).not.toBeNull();
  expect(without.cells[2]![2]!.placementId).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/client`
Expected: FAIL — `hypotheticalBoard` is not exported.

- [ ] **Step 3: Replace the tracer with a board builder**

In `packages/client/src/path-highlight.ts`, delete `traceViewPath`, `exitFor`, `ghostConnections` and the now-unused `ConnectionMap`/`PathSegment`/`HighlightedPath` types, and add:

```ts
import { placeTile } from "@passtally/rules";
import type { Board } from "@passtally/rules";
import type { Tentative } from "./tentative.js";

export type GhostPlacement = {
  anchor: Pos;
  typeId: TypeId;
  orientation: number;
};

/** The tentative board, optionally with a hypothetical tile placed on it.
 *
 *  Clones rather than mutating, and uses the rules package's own placeTile --
 *  the client models no placement of its own. */
export function hypotheticalBoard(
  tentative: Tentative, ghost: GhostPlacement | null,
): Board {
  const game = tentative.overlayGame();
  if (ghost !== null) {
    const [dr, dc] = offsetOf(ghost.orientation);
    const cellB: Pos = [ghost.anchor[0] + dr, ghost.anchor[1] + dc];
    if (canPlace(game.board, ghost.anchor, cellB)) {
      placeTile(game.board, ghost.anchor, cellB, ghost.typeId, ghost.orientation);
    }
  }
  return game.board;
}
```

`canPlace` guards the ghost because a hovering cursor is not always over a legal anchor, and `placeTile` does not validate.

Update `pathTopologyKey` to include the ghost's anchor, type and orientation. Keep it excluding scores, selection state and pointer pixels — that exclusion is what makes the cache effective.

- [ ] **Step 4: Run tests and the leak gate**

Run: `npm test -w @passtally/client && npm run typecheck`
Then: `grep -rnE "\.height (===|!==|>|<)|placementId|orthogonallyAdjacent" packages/client/src --include=*.ts | grep -v "render/"`
Expected: tests pass, typecheck clean, grep empty.

- [ ] **Step 5: Confirm the duplicate tracer is gone**

Run: `grep -n "traceViewPath\|exitFor\|ghostConnections" packages/client/src -r`
Expected: no output. Report the line count of `path-highlight.ts` before and after.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "refactor(client): delete the duplicate tracer, use tracePath"
```

---

### Task 3: The line model and pass badges

**Files:**
- Create: `packages/client/src/lines.ts`
- Modify: `packages/client/src/render/highlights.ts`
- Test: `packages/client/test/lines.test.ts`

**Interfaces:**
- Consumes: `tracePath`, `PathStep`, `Board` from `@passtally/rules`; `GameView` from `./types.js`.
- Produces: `type LineView = { owner: number; slots: [number, number]; passes: number; steps: PathStep[] }`; `linesFor(board, view, players: number[]): LineView[]`.

A line exists when a trace from one of a player's markers ends on **another marker of the same player**. Dedupe by the unordered slot pair, exactly as `scoreLines` does.

- [ ] **Step 1: Write the failing test**

`packages/client/test/lines.test.ts`:

First create the shared fixture, `packages/client/test/fixtures.ts`, because Tasks 5 and 7 use
the same board:

```ts
import { Game, placeTile } from "@passtally/rules";

/** A 3x3 board where BOTH players hold a scoring line.
 *
 *  Three vertical cross tiles fill rows 0-1. The X shape routes W<->E, so row 0
 *  carries a line from slot 11 to slot 3, and row 1 from slot 10 to slot 4 --
 *  three passes each. Player 0 takes slots 11, 3, 1, 6; player 1 takes
 *  0, 4, 7, 10. Every player holds one marker per edge and no slot is shared. */
export function scoringBoard(): Game {
  const g = Game.newGame(2, 1, 3);
  for (const slot of [11, 3, 1, 6]) g.setupPlaceMarker(0, slot);
  for (const slot of [0, 4, 7, 10]) g.setupPlaceMarker(1, slot);
  for (let col = 0; col < 3; col++) placeTile(g.board, [0, col], [1, col], 2, 0);
  return g;
}

/** A 6x6 board mid-setup-complete with no tiles placed, so nobody has a line. */
export function emptyPlay(nPlayers = 2, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, 1, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

/** A 3x3 board where one line crosses the SAME tile twice through different
 *  faces -- the case colour cannot distinguish, only offset can.
 *
 *  Tile 1 at orientation 1 lays out as (B west, A east). Row 1's tile routes
 *  W->N, row 0's turns the line around, and it re-enters row 1's tile through
 *  a different face. This is the engine suite's own double-crossing fixture;
 *  tracing from slot slotIndexOf(3, 1, 0, Side.W) gives 3 passes across two
 *  physical tiles. */
export function selfCrossingBoard(): Game {
  const g = Game.newGame(2, 1, 3);
  placeTile(g.board, [1, 1], [1, 0], 1, 1);
  placeTile(g.board, [0, 1], [0, 0], 1, 1);
  return g;
}

/** A Controller driving a LocalSession over the given game. */
export function controllerOn(game: Game): Controller {
  return new Controller(new LocalSession(game));
}
```

`fixtures.ts` also needs `import { Controller } from "../src/state.js";` and
`import { LocalSession } from "../src/session.js";`.

Then `packages/client/test/lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyPlay, scoringBoard } from "./fixtures.js";
import { linesFor } from "../src/lines.js";
import { buildView } from "../src/view.js";

describe("linesFor", () => {
  it("finds a completed line between two of one player's markers", () => {
    const g = scoringBoard();
    const lines = linesFor(g.board, buildView(g), [0]);
    expect(lines.length).toBe(1);
    expect(lines[0]!.owner).toBe(0);
    expect([...lines[0]!.slots]).toEqual([3, 11]);
    expect(lines[0]!.passes).toBe(3);
    expect(lines[0]!.steps.length).toBeGreaterThan(0);
  });

  it("dedupes a line found from both ends", () => {
    const g = scoringBoard();
    expect(linesFor(g.board, buildView(g), [0]).length).toBe(1);
  });

  it("returns nothing when no markers connect", () => {
    const g = emptyPlay();
    expect(linesFor(g.board, buildView(g), [0, 1])).toEqual([]);
  });

  it("attributes each line to its owner when asked for several players", () => {
    const g = scoringBoard();
    const lines = linesFor(g.board, buildView(g), [0, 1]);
    expect(lines.length).toBe(2);
    expect(new Set(lines.map((l) => l.owner))).toEqual(new Set([0, 1]));
    expect(lines.every((l) => l.passes === 3)).toBe(true);
  });

  it("asks only for the players requested", () => {
    const g = scoringBoard();
    expect(linesFor(g.board, buildView(g), [1]).map((l) => l.owner)).toEqual([1]);
  });
});
```

If a pass count comes out other than 3, **stop and report** — that value is hand-derived and
confirmed by the engine's own suite.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/lines.js`.

- [ ] **Step 3: Write `lines.ts`**

```ts
import { tracePath } from "@passtally/rules";
import type { Board, PathStep } from "@passtally/rules";
import type { GameView } from "./types.js";

export type LineView = {
  owner: number;
  slots: [number, number];
  passes: number;
  steps: PathStep[];
};

/** Completed lines for the given players, deduped by unordered slot pair --
 *  the same rule scoreLines uses. */
export function linesFor(board: Board, view: GameView, players: number[]): LineView[] {
  const lines = new Map<string, LineView>();
  for (const owner of players) {
    const owned = new Set(view.players[owner]?.markerSlots ?? []);
    for (const slot of owned) {
      const path = tracePath(board, slot);
      if (typeof path.endpoint !== "number" || !owned.has(path.endpoint)) continue;
      const lo = Math.min(slot, path.endpoint);
      const hi = Math.max(slot, path.endpoint);
      const key = `${owner}:${lo}-${hi}`;
      if (!lines.has(key)) {
        lines.set(key, { owner, slots: [lo, hi], passes: path.passes, steps: path.steps });
      }
    }
  }
  return [...lines.values()];
}
```

- [ ] **Step 4: Render the badges**

In `packages/client/src/render/highlights.ts`, draw each line's `passes` on both endpoint slots using `slotRect`, filled in the owner's colour with a contrasting numeral. Reuse the `PLAYER_COLOURS` array already in `render/board.ts` — export it from there rather than duplicating it.

- [ ] **Step 5: Run tests, typecheck and the leak gate**

Run: `npm test -w @passtally/client && npm run typecheck`
Then the grep from Global Constraints. Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): line model with pass badges on endpoint markers"
```

---

### Task 4: Parallel offset for overlapping lines

**Files:**
- Create: `packages/client/src/render/offset.ts`
- Modify: `packages/client/src/render/highlights.ts`
- Test: `packages/client/test/offset.test.ts`

**Interfaces:**
- Produces: `type LaneAssignment = Map<string, number>`, `assignLanes(lines: LineView[]): LaneAssignment`, `offsetFor(step, lane, lanes, gap): [number, number]`.

**Why this exists.** Two players can share a tile, and one line can cross the same tile twice through different faces. Colour separates the first case; only offset separates the second, because a self-crossing line is one player and one colour. That is not cosmetic: a self-crossed tile **scores twice**, so drawing it once contradicts the badge.

**The lane rule must be deterministic** or two lines land on each other. Key each drawn run by owner, then the line's ascending slot pair, then the step's index along its path — so a self-crossing line's second visit gets its own lane. Lane `k` of `lanes` draws at `(k - (lanes - 1) / 2) * gap` perpendicular to that step's direction, keeping lanes centred on the true path and stable between redraws.

- [ ] **Step 1: Write the failing test**

`packages/client/test/offset.test.ts`:

```ts
describe("assignLanes", () => {
  it("gives a lone line through a cell the centre lane", () => {
    const lanes = assignLanes([lineThrough([[1, 1]], 0, [0, 5])]);
    expect([...lanes.values()]).toEqual([0]);
  });

  it("gives two players sharing a cell different lanes", () => {
    const lanes = assignLanes([
      lineThrough([[1, 1]], 0, [0, 5]),
      lineThrough([[1, 1]], 1, [2, 7]),
    ]);
    expect(new Set(lanes.values()).size).toBe(2);
  });

  // THE case colour cannot solve: one owner, one colour, two crossings.
  it("gives a self-crossing line two lanes through the same cell", () => {
    const selfCrossing = lineThrough([[1, 1], [1, 2], [1, 1]], 0, [0, 5]);
    const lanes = assignLanes([selfCrossing]);
    const atCell = [...lanes.entries()].filter(([k]) => k.includes("1,1"));
    expect(atCell.length).toBe(2);
    expect(atCell[0]![1]).not.toBe(atCell[1]![1]);
  });

  it("is stable across calls", () => {
    const lines = [lineThrough([[1, 1]], 0, [0, 5]), lineThrough([[1, 1]], 1, [2, 7])];
    expect([...assignLanes(lines).entries()]).toEqual([...assignLanes(lines).entries()]);
  });
});

describe("offsetFor", () => {
  it("centres a single lane on the true path", () => {
    expect(offsetFor(stepGoing(Side.W, Side.E), 0, 1, 6)).toEqual([0, 0]);
  });

  it("offsets perpendicular to travel", () => {
    // Travelling east, lanes separate vertically.
    const [dx, dy] = offsetFor(stepGoing(Side.W, Side.E), 1, 2, 6);
    expect(dx).toBe(0);
    expect(Math.abs(dy)).toBeGreaterThan(0);
  });

  it("puts two lanes on opposite sides of centre", () => {
    const a = offsetFor(stepGoing(Side.W, Side.E), 0, 2, 6);
    const b = offsetFor(stepGoing(Side.W, Side.E), 1, 2, 6);
    expect(Math.sign(a[1])).toBe(-Math.sign(b[1]));
  });
});
```

Write `lineThrough` and `stepGoing` as helpers in the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/render/offset.js`.

- [ ] **Step 3: Write `offset.ts`**

Implement `assignLanes` by grouping every `(line, stepIndex)` pair by the cell it occupies, sorting each group by `(owner, slots[0], slots[1], stepIndex)`, and numbering within the group. Implement `offsetFor` as a perpendicular displacement of `(lane - (lanes - 1) / 2) * gap` relative to the step's travel direction.

- [ ] **Step 4: Draw with offsets**

Update `render/highlights.ts` to draw each line segment displaced by its lane offset.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w @passtally/client && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: The mandatory mutation check**

Make `offsetFor` return `[0, 0]` unconditionally. Confirm `gives a self-crossing line two lanes` still passes (lane *assignment* is unchanged) but the `offsetFor` tests **fail**. Then make `assignLanes` return lane 0 for everything and confirm the self-crossing test **fails**.

Both halves matter: assignment without displacement draws two lanes in the same place, and displacement without assignment has nothing to separate. Report both outcomes.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): parallel offset so overlapping lines stay distinguishable"
```

---

### Task 5: All-players ghost preview

**Files:**
- Modify: `packages/client/src/state.ts`, `packages/client/src/main.ts`, `packages/client/src/render/highlights.ts`
- Test: `packages/client/test/state.test.ts`

**Interfaces:**
- Produces: `Controller.hoveredCell: Pos | null`, `Controller.visibleLines(): LineView[]`.

Per the spec: the **active player's** lines are drawn always; **every** player's lines are drawn while a ghost hovers a legal anchor.

- [ ] **Step 1: Write the failing test**

```ts
describe("visible lines", () => {
  it("shows only the active player's lines when nothing is hovered", () => {
    const c = controllerOn(scoringBoard());
    expect(new Set(c.visibleLines().map((l) => l.owner))).toEqual(new Set([0]));
  });

  it("shows every player's lines while a ghost hovers a legal anchor", () => {
    const c = controllerOn(scoringBoard());
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "hover", cell: [2, 2] });
    expect(new Set(c.visibleLines().map((l) => l.owner)).size).toBeGreaterThan(1);
  });

  it("returns to the active player's lines when the ghost leaves", () => {
    const c = controllerOn(scoringBoard());
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "hover", cell: [2, 2] });
    c.handle({ kind: "hover", cell: null });
    expect(new Set(c.visibleLines().map((l) => l.owner))).toEqual(new Set([0]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

Add a `{ kind: "hover"; cell: Pos | null }` input to `UiInput`, store it on the controller, and implement `visibleLines()` to call `linesFor` with either `[currentPlayer]` or every player index depending on whether a ghost is active over a legal anchor. Route `main.ts`'s existing `mousemove` handler through the new input rather than its local `hoverCell` variable.

- [ ] **Step 3: Run tests, typecheck, leak gate, and commit**

```bash
git add packages/client
git commit -m "feat(client): preview every player's lines under a ghost"
```

---

### Task 6: Legal-anchor highlighting

**Files:**
- Modify: `packages/client/src/state.ts`, `packages/client/src/render/board.ts`
- Test: `packages/client/test/state.test.ts`

**Interfaces:**
- Produces: `Controller.legalAnchors(): Pos[]`.

Computed on selection, rotation or board change — **not** per pointer move, since legality does not depend on the cursor. Ask `canPlace` for each candidate anchor against the tentative board.

- [ ] **Step 1: Write the failing test**

```ts
it("offers no anchors when no tile is selected", () => {
  expect(controllerInPlay().legalAnchors()).toEqual([]);
});

it("offers every legal anchor for the selected tile and orientation", () => {
  const c = controllerInPlay();
  c.handle({ kind: "selectPile", pileIndex: 0 });
  // Orientation 0 puts cell B south of the anchor, so the last row is excluded.
  expect(c.legalAnchors().length).toBe(6 * 5);
  expect(c.legalAnchors().some(([row]) => row === 5)).toBe(false);
});

it("changes with rotation", () => {
  const c = controllerInPlay();
  c.handle({ kind: "selectPile", pileIndex: 0 });
  const before = c.legalAnchors();
  c.handle({ kind: "rotate" });
  expect(c.legalAnchors()).not.toEqual(before);
});
```

- [ ] **Step 2: Implement, then tint the anchors in `render/board.ts`**

Draw a subtle tint on each legal anchor cell and its partner cell.

- [ ] **Step 3: Run tests, typecheck, leak gate, and commit**

```bash
git add packages/client
git commit -m "feat(client): highlight legal anchors for the selected tile"
```

---

### Task 7: Scoring breakdown popover with the VP curve

**Files:**
- Create: `packages/client/src/ui/breakdown.ts`
- Modify: `packages/client/src/ui/rail.ts`, `packages/client/src/main.ts`, `packages/client/src/styles.css`
- Test: `packages/client/test/lines.test.ts` (breakdown grouping only)

**Interfaces:**
- Produces: `tilesInLine(line: LineView): { placementId: number; level: number; passes: number }[]`, `renderBreakdown(root, controller, player): void`.

Hovering a player's score opens a popover listing **their current lines**, each grouped by `placementId` with level and contribution, then the total and its VP conversion — with the passes-to-VP curve alongside, the current total marked on it.

A cumulative score cannot be decomposed without replaying history; past turns already live in the log, so this reports the present position.

- [ ] **Step 1: Write the failing test for the grouping**

```ts
describe("tilesInLine", () => {
  it("groups consecutive steps by placement and reports level", () => {
    const g = scoringBoard();
    const line = linesFor(g.board, buildView(g), [0])[0]!;
    const tiles = tilesInLine(line);
    expect(tiles.length).toBe(3);
    expect(tiles.every((t) => t.level === 1 && t.passes === 1)).toBe(true);
  });

  // Built from tracePath directly rather than from linesFor: tilesInLine takes
  // a LineView, and this board has no markers, so requiring a completed line
  // would mean inventing marker positions to make the fixture connect.
  it("counts a tile crossed twice as two entries", () => {
    const g = selfCrossingBoard();
    const path = tracePath(g.board, slotIndexOf(3, 1, 0, Side.W));
    const line = { owner: 0, slots: [0, 0] as [number, number],
                   passes: path.passes, steps: path.steps };
    const ids = tilesInLine(line).map((t) => t.placementId);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("omits uncovered cells, which contribute nothing", () => {
    const g = emptyPlay();
    const line = { owner: 0, slots: [0, 0] as [number, number], passes: 0,
                   steps: tracePath(g.board, 0).steps };
    expect(tilesInLine(line)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `tilesInLine`, then the popover**

Group `line.steps` into runs of equal `placementId`, skipping `null`. Each run is one crossing contributing `height` passes.

Draw the VP curve as a small inline SVG or canvas from `config.PASSES_TO_VP`, marking the player's current total. This is the only place `passesToVp` enters the client.

- [ ] **Step 3: Run tests, typecheck, leak gate, and commit**

```bash
git add packages/client
git commit -m "feat(client): score breakdown popover with the passes-to-VP curve"
```

---

### Task 8: Level readout and animated scores

**Files:**
- Modify: `packages/client/src/render/board.ts`, `packages/client/src/ui/rail.ts`, `packages/client/src/styles.css`
- Test: none new — verified by running the app

Tier 1 already badges level ≥ 2, so a bare number would be redundant. The readout reports the hovered cell's level **and**, when it sits on a visible line, how many passes it contributes and to whose lines — driven by the hover state Task 5 added, so it costs no extra tracing.

Score changes tween over roughly 400ms on commit rather than snapping.

- [ ] **Step 1: Implement both**

- [ ] **Step 2: Run the app and verify by hand**

Run: `npm run dev -w @passtally/client`

1. Your own completed lines stay lit with pass badges on both endpoint markers.
2. Selecting a tile tints the legal anchors; rotating changes them.
3. Hovering a ghost over a legal anchor lights every player's lines, in their colours.
4. A tile crossed twice by one line shows two visibly separate strokes, and the badge count matches the number of crossings you can see.
5. Two players' lines through one tile run side by side.
6. Hovering any cell reports its level and its contribution to any line crossing it.
7. Hovering a score opens the breakdown with the VP curve and the current total marked.
8. Committing a scoring turn tweens the rail score rather than snapping.

**Report anything that does not behave as listed.** A step failing is the finding — do not adjust the list.

- [ ] **Step 3: Full verification and commit**

```bash
npm test && npm run typecheck && npm run build -w @passtally/client
git add packages/client
git commit -m "feat(client): level readout on hover and animated score changes"
```

---

## Verification

- [ ] **All suites and typecheck**

Run: `npm test && npm run typecheck`
Expected: rules, client and reference suites green, no type errors.

- [ ] **The oracle survived the rules change**

Run: `python reference/gen_oracle.py && git status --short packages/rules/test/fixtures/`
Expected: empty — fixtures reproduce byte-identically.

- [ ] **No second tracer**

Run: `grep -rn "traceViewPath\|exitFor\|ghostConnections" packages/client/src`
Expected: no output.

- [ ] **The client still holds no rules**

Run: `grep -rnE "\.height (===|!==|>|<)|placementId|orthogonallyAdjacent" packages/client/src --include=*.ts | grep -v "render/"`
Expected: empty.

- [ ] **The reference is untouched**

Run: `git diff --stat <BASE>..HEAD -- reference/`
Expected: no output.

---

## Self-Review Notes

Spec coverage: §1 tracer consolidation → Tasks 1–2 · §2 line model → Task 3 · §3's nine features → Tasks 3–8 · §5 caching → Task 2 · §6 testing split and the mandatory offset mutation → Task 4 · §7 sequencing → Task 1 lands alone and is verified before anything builds on it.

Self-review caught placeholder fixtures in Tasks 3, 5 and 7 written as `/* same fixture */`
comments, with a note excusing them as "the implementer builds it once". That was a
rationalisation — the plan's own rules forbid steps that describe what to do without showing
how. Replaced with a real `packages/client/test/fixtures.ts` exporting `scoringBoard`,
`emptyPlay` and `selfCrossingBoard`, which every later task imports by name.

A second pass caught that `controllerOn` and `selfCrossingBoard` were referenced but defined
nowhere, with a note asserting they lived in other tasks. Both are now written out in the
`fixtures.ts` block in Task 3, where the file is created. Task 7's self-crossing test was also
rebuilt to construct its `LineView` from `tracePath` directly, because `selfCrossingBoard` has no
markers and requiring a completed line would have meant inventing marker positions whose expected
values nothing verifies.
