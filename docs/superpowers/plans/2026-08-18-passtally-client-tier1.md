# Passtally Client Tier 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/client` — a playable hot-seat Passtally UI where two people can finish a full game at one keyboard and the client never permits an illegal state.

**Architecture:** A static TypeScript + Vite app with no server. The committed `Game` sits behind a `Session` interface so the tier-3 network boundary exists as code without being built. Tentative turns live entirely in the client and are computed by **cloning the committed `Game` and applying moves to the clone** — reusing proven `apply()` rather than hand-rolling board mutation, so the client duplicates no rules. Canvas draws the board; DOM handles tray, rail and log.

**Tech Stack:** TypeScript (strict), Vite, Vitest, `@passtally/rules` (workspace dependency). No other runtime dependencies.

**This is plan 2 of 2.** Plan 1 delivered `packages/rules` — 235 tests, verified against the Python reference by a differential oracle with zero divergence.

**Spec:** `docs/superpowers/specs/2026-08-17-passtally-client-tier1-design.md`
**Rules authority:** `docs/superpowers/specs/2026-08-15-passtally-engine-design.md`

## Global Constraints

- **Node 20+.** TypeScript strict mode with `"noUncheckedIndexedAccess": true`.
- **`packages/client` depends only on `@passtally/rules`** at runtime. Vite and Vitest are dev dependencies.
- **The client holds no game rules.** Every rule question goes to `@passtally/rules`. If you find yourself writing legality logic, stop and report — that is a plan defect.
- **`packages/rules` must not be modified.** If the client needs something it does not export, report it rather than editing the package; a change there invalidates plan 1's oracle guarantees.
- **`reference/` must not be modified.** It is the differential oracle's reference implementation.
- Imports use `.js` extensions (ESM, bundler resolution).
- `Side` is `N=0, E=1, S=2, W=3` clockwise; rows increase downward so `Side.N` is `[-1, 0]`.
- No module may assume board size 6 — `n` comes from the view.
- Commit after every task. **Commit locally only; do not push.**

---

## What `@passtally/rules` provides

Everything below is already built, tested and exported. The client consumes it; it reimplements none of it.

| Export | Signature |
| ------ | --------- |
| `Game.newGame` | `(nPlayers, seed?, boardSize?) => Game` |
| `Game` fields | `board`, `piles`, `players`, `currentPlayer`, `actionsLeft`, `firstPlayer`, `finalRound`, `over` |
| `Game` methods | `isSetupComplete()`, `setupPlaceMarker(player, slot)`, `apply(move)`, `legalMoves()`, `triggerFired()`, `isOver()`, `winner()`, `clone()`, `key()` |
| `Board` | `{ n, cells: Cell[][], ring: Slot[], nav, nextPlacementId }` |
| `Cell` | `{ placementId: number \| null; height: number; conns: [Side, Side][] }` |
| `Slot` | `{ row, col, side, occupant: number \| null }` |
| `partnerOffset` | `(board, row, col) => Pos \| null` |
| `buildRing` / `slotIndexOf` | `(n) => Slot[]` / `(n, row, col, side) => number` |
| `canPlace` / `placeTile` | `(board, posA, posB) => boolean` / `(board, posA, posB, typeId, orientation) => number` |
| `markerDestination` | `(board, startSlot, distance) => number \| null` |
| `resolve` / `offsetOf` / `distinctOrientations` | `(typeId, orientation)` / `(orientation) => Pos` / `(typeId) => number[]` |
| `scoreLines` / `scoreFor` / `passesToVp` | `(board, markerSlots) => Map<string, number>` / `=> number` / `(total) => number` |
| `Move` | `{ kind: "place"; pileIndex; cellA; cellB; orientation } \| { kind: "marker"; markerIndex; distance }` |
| `config` | `N`, `N_PILES`, `MARKERS_PER_PLAYER`, `ACTIONS_PER_TURN`, `MARKER_DISTANCES`, `PASSES_TO_VP` |

`scoreLines` returns a `Map` keyed by a canonical `"lo-hi"` slot-pair string. Task 2 parses that into the structured `TurnResult.lines` the spec calls for. Plan 1's final review flagged the string key as an API wart; changing it is deferred, so parse it here.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `packages/client/package.json` | manifest, workspace dep, scripts |
| `packages/client/tsconfig.json` | strict, `lib: ["ES2022", "DOM"]`, reference to rules |
| `packages/client/vite.config.ts` | dev server and build |
| `packages/client/index.html` | the three-region shell |
| `packages/client/src/types.ts` | `GameView`, `CellView`, `TurnResult` |
| `packages/client/src/view.ts` | `buildView`, `setupOrder`, `nextSetupPlayer`, `displayRanking` |
| `packages/client/src/session.ts` | `Session` interface, `LocalSession` |
| `packages/client/src/geometry.ts` | PURE: `layoutFor`, `unit`, `hitTest`, `cellRect`, `slotRect` |
| `packages/client/src/orient.ts` | PURE: `normalizePlacement` |
| `packages/client/src/tentative.ts` | pending moves, overlay clone, spent piles, undo |
| `packages/client/src/state.ts` | the six-state machine |
| `packages/client/src/render/tiles.ts` | line art for one cell |
| `packages/client/src/render/board.ts` | canvas draw loop |
| `packages/client/src/ui/{tray,rail,log}.ts` | DOM chrome |
| `packages/client/src/main.ts` | input → state → session → render |
| `packages/client/src/styles.css` | layout and palette |
| `packages/client/test/*.test.ts` | view, session, geometry, orient, tentative, state |

**Rendering is not unit tested.** `render/` and `ui/` are verified by running the app (Task 7). Everything else is pure and tested. The spec's bar is "two people can finish a game hot-seat", and Tasks 1–5 cover every mechanism that bar depends on.

---

### Task 1: Client scaffold and the redacted view model

**Files:**
- Create: `packages/client/package.json`, `tsconfig.json`, `vite.config.ts`, `src/types.ts`, `src/view.ts`
- Modify: root `tsconfig.json`
- Test: `packages/client/test/view.test.ts`

**Interfaces:**
- Consumes: `Game`, `Board`, `partnerOffset`, `distinctOrientations`, `config` from `@passtally/rules`.
- Produces: `GameView`, `CellView`, `SlotView`, `PileView`, `PlayerView`, `TurnResult`; `buildView(game, overlay?)`, `setupOrder(nPlayers)`, `nextSetupPlayer(game)`, `displayRanking(view)`.

- [ ] **Step 1: Create the scaffold**

`packages/client/package.json`:

```json
{
  "name": "@passtally/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": { "@passtally/rules": "*" },
  "devDependencies": { "vite": "^5.4.0" }
}
```

`packages/client/tsconfig.json` — `lib` adds `DOM`, which `packages/rules` deliberately lacks:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "dist",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "test", "vite.config.ts"],
  "references": [{ "path": "../rules" }]
}
```

`packages/client/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist", emptyOutDir: true },
});
```

Root `tsconfig.json` gains the client reference:

```json
{
  "files": [],
  "references": [{ "path": "packages/rules" }, { "path": "packages/client" }]
}
```

Run `npm install` from the repo root.

- [ ] **Step 2: Write the failing test**

`packages/client/test/view.test.ts`:

```ts
import { Game, config } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { buildView, displayRanking } from "../src/view.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

describe("buildView", () => {
  it("reports board size, phase and turn state", () => {
    const v = buildView(setup());
    expect(v.n).toBe(6);
    expect(v.phase).toBe("play");
    expect(v.currentPlayer).toBe(0);
    expect(v.actionsLeft).toBe(config.ACTIONS_PER_TURN);
    expect(v.setupNext).toBeNull();
  });

  it("reports setup phase until every marker is placed", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    const v = buildView(g);
    expect(v.phase).toBe("setup");
    expect(v.setupNext).not.toBeNull();
  });

  it("mirrors cells with height, conns and partner offset", () => {
    const g = setup();
    g.apply({ kind: "place", pileIndex: 0, cellA: [2, 2], cellB: [3, 2], orientation: 0 });
    const v = buildView(g);
    expect(v.cells[2]![2]!.height).toBe(1);
    expect(v.cells[2]![2]!.conns).not.toBeNull();
    expect(v.cells[2]![2]!.partner).toEqual([1, 0]);
    expect(v.cells[3]![2]!.partner).toEqual([-1, 0]);
    expect(v.cells[0]![0]!.height).toBe(0);
    expect(v.cells[0]![0]!.conns).toBeNull();
    expect(v.cells[0]![0]!.partner).toBeNull();
  });

  it("mirrors the ring with occupants", () => {
    const v = buildView(setup());
    expect(v.ring.length).toBe(4 * 6);
    expect(v.ring[0]!.occupant).toBe(0);
    expect(v.ring[2]!.occupant).toBeNull();
  });

  it("reports marker slots and scores per player", () => {
    const v = buildView(setup());
    expect(v.players.length).toBe(2);
    expect(v.players[0]!.markerSlots.length).toBe(config.MARKERS_PER_PLAYER);
    expect(v.players[0]!.score).toBe(0);
  });

  // THE redaction test. It guards tier 3 before tier 3 exists: the view must
  // never expose ordered pile contents, only the revealed tile and a count.
  it("never exposes pile contents", () => {
    const g = setup();
    const v = buildView(g);
    expect(v.piles.length).toBe(config.N_PILES);
    for (const p of v.piles) {
      expect(Object.keys(p).sort()).toEqual(["count", "distinctOrientations", "faceUp"]);
    }
    const serialized = JSON.stringify(v);
    for (const pile of g.piles) {
      expect(pile.ordered.length).toBeGreaterThan(0);
      expect(serialized).not.toContain(JSON.stringify(pile.ordered));
    }
  });

  it("reports pile counts including the face-up tile", () => {
    const g = setup();
    expect(buildView(g).piles[0]!.count).toBe(g.piles[0]!.ordered.length + 1);
  });

  it("reports an empty pile as count zero with a null face", () => {
    const g = setup();
    g.piles[0]!.ordered.length = 0;
    g.piles[0]!.faceUp = null;
    const v = buildView(g);
    expect(v.piles[0]!.faceUp).toBeNull();
    expect(v.piles[0]!.count).toBe(0);
  });

  it("carries distinct orientations per pile", () => {
    for (const p of buildView(setup()).piles) {
      expect([2, 4]).toContain(p.distinctOrientations.length);
    }
  });
});

describe("displayRanking", () => {
  it("orders by score then by turn order", () => {
    const g = setup(3, 1, 6);
    g.players[0]!.score = 4;
    g.players[1]!.score = 9;
    g.players[2]!.score = 4;
    expect(displayRanking(buildView(g))).toEqual([1, 0, 2]);
  });

  it("breaks a tie for the lead by turn order", () => {
    const g = setup(2, 1, 6);
    g.players[0]!.score = 5;
    g.players[1]!.score = 5;
    // The engine reports no winner on a tie; the rail still needs an order.
    expect(displayRanking(buildView(g))[0]).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/view.js`.

- [ ] **Step 4: Write `packages/client/src/types.ts`**

```ts
import type { Move, Pos, Side, TypeId } from "@passtally/rules";

export type CellView = {
  height: number;                     // 0 == empty
  conns: [Side, Side][] | null;       // null when empty
  partner: Pos | null;                // offset of the cell sharing this tile
};

export type SlotView = {
  row: number;
  col: number;
  side: Side;
  occupant: number | null;
};

export type PileView = {
  faceUp: TypeId | null;
  count: number;                      // count only -- NEVER the ordered contents
  distinctOrientations: number[];
};

export type PlayerView = { markerSlots: number[]; score: number };

export type GameView = {
  n: number;
  cells: CellView[][];
  ring: SlotView[];
  piles: PileView[];
  players: PlayerView[];
  currentPlayer: number;
  actionsLeft: number;
  phase: "setup" | "play" | "over";
  setupNext: number | null;
  winner: number | null;
};

export type TurnResult = {
  player: number;
  lines: { slots: [number, number]; passes: number }[];
  totalPasses: number;
  vpAwarded: number;
};

export type { Move };
```

- [ ] **Step 5: Write `packages/client/src/view.ts`**

```ts
import { config, distinctOrientations, partnerOffset } from "@passtally/rules";
import type { Board, Game } from "@passtally/rules";
import type { CellView, GameView } from "./types.js";

/** Board and turn state may come from a tentative clone while piles come from
 *  the committed game -- see tentative.ts for why the two halves differ. */
export type Overlay = { board: Board; actionsLeft: number };

/** Snake draft: four passes alternating direction. Two players go
 *  P1 P2 / P2 P1 / P1 P2 / P2 P1. */
export function setupOrder(nPlayers: number): number[] {
  const order: number[] = [];
  for (let pass = 0; pass < config.MARKERS_PER_PLAYER; pass++) {
    const seq = [...Array(nPlayers).keys()];
    order.push(...(pass % 2 === 0 ? seq : seq.reverse()));
  }
  return order;
}

/** Whose turn it is to place a setup marker, or null once setup is complete. */
export function nextSetupPlayer(game: Game): number | null {
  if (game.isSetupComplete()) return null;
  const placed = game.players.reduce((sum, p) => sum + p.markerSlots.length, 0);
  return setupOrder(game.players.length)[placed] ?? null;
}

function cellViews(board: Board): CellView[][] {
  const rows: CellView[][] = [];
  for (let row = 0; row < board.n; row++) {
    const out: CellView[] = [];
    for (let col = 0; col < board.n; col++) {
      const cell = board.cells[row]![col]!;
      out.push({
        height: cell.height,
        conns: cell.height === 0 ? null : cell.conns.map(([a, b]) => [a, b]),
        partner: partnerOffset(board, row, col),
      });
    }
    rows.push(out);
  }
  return rows;
}

/** Build the redacted view. Pile CONTENTS never cross this boundary -- only the
 *  revealed tile and a count. That costs nothing now and makes tier 3's trust
 *  boundary free rather than a retrofit. */
export function buildView(game: Game, overlay?: Overlay): GameView {
  const board = overlay?.board ?? game.board;
  const setupNext = nextSetupPlayer(game);
  return {
    n: board.n,
    cells: cellViews(board),
    ring: board.ring.map((s) => ({
      row: s.row, col: s.col, side: s.side, occupant: s.occupant,
    })),
    // Piles ALWAYS come from the committed game: a replacement drawn on a
    // tentative clone must not be revealed until commit.
    piles: game.piles.map((p) => ({
      faceUp: p.faceUp,
      count: p.ordered.length + (p.faceUp === null ? 0 : 1),
      distinctOrientations: p.faceUp === null ? [] : [...distinctOrientations(p.faceUp)],
    })),
    players: game.players.map((p) => ({
      markerSlots: [...p.markerSlots], score: p.score,
    })),
    currentPlayer: game.currentPlayer,
    actionsLeft: overlay?.actionsLeft ?? game.actionsLeft,
    phase: game.isOver() ? "over" : setupNext === null ? "play" : "setup",
    setupNext,
    winner: game.winner(),
  };
}

/** Player indices ordered for display: score descending, ties by turn order.
 *
 *  The engine's winner() returns null on a tie and that is correct -- there is
 *  no single winner. But the rail still has to put someone at the top, so the
 *  presentation rule lives in the presentation layer. */
export function displayRanking(view: GameView): number[] {
  return view.players
    .map((p, index) => ({ index, score: p.score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((e) => e.index);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @passtally/client` then `npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Verify the redaction test can fail**

Temporarily add `ordered: [...p.ordered]` to the pile mapping in `buildView`. Confirm `never exposes pile contents` **fails** on both the key-set assertion and the serialization check. Remove it, confirm green, and report both outcomes.

A redaction test that cannot fail is worth nothing, and this one guards a property that only becomes security-relevant at tier 3 — long after anyone remembers why it exists.

- [ ] **Step 8: Commit**

```bash
git add packages/client tsconfig.json package.json package-lock.json
git commit -m "feat(client): scaffold and redacted view model"
```

---

### Task 2: Session, snake-draft setup, and atomic commit

**Files:**
- Create: `packages/client/src/session.ts`
- Test: `packages/client/test/session.test.ts`

**Interfaces:**
- Consumes: `buildView`, `nextSetupPlayer`, `setupOrder` from `./view.js`; `Game`, `Move`, `placeTile`, `scoreLines`, `config` from `@passtally/rules`.
- Produces: `interface Session { getView(): GameView; placeSetupMarker(player, slot): void; commit(moves: Move[]): TurnResult }`; `class LocalSession implements Session` with `get game(): Game`, `legalTurns(): Move[] | null`, `dropCrossTileForTest(col: number): void`.

**Two behaviours that need care:**

1. **Commit is atomic.** Apply the moves to a **clone** first; only if every move succeeds does the clone replace the committed game. A rejected move must leave the session exactly as it was, so the client can render a rejection without any state having shifted.
2. **`TurnResult` is recomputed, not intercepted.** `Game.apply` scores internally at end of turn and does not report what it scored. After applying to the trial clone, recompute `scoreLines(trial.board, actorSlots)` — `endTurn` touches neither the board nor the marker slots, so the recomputation returns the same lines. `vpAwarded` is the actor's score delta.

- [ ] **Step 1: Write the failing test**

`packages/client/test/session.test.ts`:

```ts
import { Game, config } from "@passtally/rules";
import type { Move } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { setupOrder } from "../src/view.js";

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

/** Drive setup to completion through the session, honouring snake order. */
function completeSetup(s: LocalSession, nPlayers: number, boardSize: number): void {
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const slot = s.getView().ring.findIndex((r, i) =>
      r.occupant === null && !edges.has(Math.floor(i / boardSize)));
    s.placeSetupMarker(player, slot);
    edges.add(Math.floor(slot / boardSize));
    used.set(player, edges);
  }
}

function playing(nPlayers = 2, seed = 1, boardSize = 6): LocalSession {
  const s = new LocalSession(Game.newGame(nPlayers, seed, boardSize));
  completeSetup(s, nPlayers, boardSize);
  return s;
}

describe("setup", () => {
  it("reports whose turn it is and enforces snake order", () => {
    const s = new LocalSession(Game.newGame(2, 1, 6));
    expect(s.getView().setupNext).toBe(0);
    s.placeSetupMarker(0, 0);
    expect(s.getView().setupNext).toBe(1);
    s.placeSetupMarker(1, 1);
    expect(s.getView().setupNext).toBe(1);   // the snake turns
  });

  it("rejects a placement out of snake order", () => {
    const s = new LocalSession(Game.newGame(2, 1, 6));
    expect(() => s.placeSetupMarker(1, 0)).toThrow(/turn/i);
  });

  it("leaves phase as setup until every marker is placed", () => {
    const s = new LocalSession(Game.newGame(2, 1, 6));
    expect(s.getView().phase).toBe("setup");
    completeSetup(s, 2, 6);
    expect(s.getView().phase).toBe("play");
    expect(s.getView().setupNext).toBeNull();
  });

  it("rejects any setup placement once play has begun", () => {
    expect(() => playing().placeSetupMarker(0, 30)).toThrow();
  });
});

describe("commit", () => {
  it("requires exactly the remaining actions", () => {
    const s = playing();
    expect(() => s.commit([place(0, [2, 2], [3, 2], 0)])).toThrow(/2 moves/);
    expect(() => s.commit([])).toThrow(/2 moves/);
  });

  it("advances the game and the pile", () => {
    const s = playing();
    const countBefore = s.getView().piles[0]!.count;
    s.commit([place(0, [2, 2], [3, 2], 0), place(1, [2, 4], [3, 4], 0)]);
    const after = s.getView();
    expect(after.cells[2]![2]!.height).toBe(1);
    expect(after.currentPlayer).toBe(1);
    expect(after.actionsLeft).toBe(config.ACTIONS_PER_TURN);
    expect(after.piles[0]!.count).toBe(countBefore - 1);
  });

  // Atomicity is the point: a rejected turn must leave NOTHING changed, so the
  // client can shake-and-continue without resyncing.
  it("is atomic -- a bad second move rolls back the first", () => {
    const s = playing();
    const before = s.getView();
    expect(() =>
      s.commit([place(0, [2, 2], [3, 2], 0), place(0, [2, 2], [3, 2], 0)]),
    ).toThrow();
    expect(s.getView()).toEqual(before);
  });

  it("reports the lines that scored", () => {
    // A 3x3 board with three vertical cross tiles gives player 0 a 3-pass line
    // between slots 11 and 3, which converts to 2 VP.
    const g = Game.newGame(2, 1, 3);
    for (const slot of [11, 3, 1, 6]) g.setupPlaceMarker(0, slot);
    for (const slot of [0, 4, 7, 10]) g.setupPlaceMarker(1, slot);
    const s = new LocalSession(g);
    for (let col = 0; col < 3; col++) s.dropCrossTileForTest(col);

    const result = s.commit([marker(0, 1), marker(0, -1)]);
    expect(result.player).toBe(0);
    expect(result.totalPasses).toBe(3);
    expect(result.vpAwarded).toBe(2);
    expect(result.lines.length).toBe(1);
    expect([...result.lines[0]!.slots].sort((a, b) => a - b)).toEqual([3, 11]);
    expect(result.lines[0]!.passes).toBe(3);
  });

  it("reports no lines when nothing scores", () => {
    const result = playing().commit([marker(0, 1), marker(0, -1)]);
    expect(result.lines).toEqual([]);
    expect(result.totalPasses).toBe(0);
    expect(result.vpAwarded).toBe(0);
  });
});

describe("full game", () => {
  it.each([2, 3])("plays a %i-player game to completion", (nPlayers) => {
    const s = playing(nPlayers, 99, 6);
    let guard = 0;
    while (s.getView().phase !== "over" && guard++ < 2000) {
      const moves = s.legalTurns();
      if (moves === null) break;
      s.commit(moves);
    }
    expect(s.getView().phase).toBe("over");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/session.js`.

- [ ] **Step 3: Write `packages/client/src/session.ts`**

```ts
import { config, placeTile, scoreLines } from "@passtally/rules";
import type { Game, Move } from "@passtally/rules";
import type { GameView, TurnResult } from "./types.js";
import { buildView, nextSetupPlayer } from "./view.js";

/** The tier-3 seam. Tier 1 ships LocalSession, which owns a Game in-process;
 *  tier 3 adds RemoteSession over HTTP implementing the same interface, and
 *  the rendering layer does not change. */
export interface Session {
  getView(): GameView;
  placeSetupMarker(player: number, slot: number): void;
  commit(moves: Move[]): TurnResult;
}

export class LocalSession implements Session {
  private committed: Game;

  constructor(game: Game) {
    this.committed = game;
  }

  /** The tentative layer clones this to build its overlay. Read-only by
   *  convention: never mutate the returned game. */
  get game(): Game {
    return this.committed;
  }

  getView(): GameView {
    return buildView(this.committed);
  }

  placeSetupMarker(player: number, slot: number): void {
    const expected = nextSetupPlayer(this.committed);
    if (expected === null) throw new Error("setup is already complete");
    if (player !== expected) {
      throw new Error(`it is not player ${player}'s turn to place -- expected ${expected}`);
    }
    this.committed.setupPlaceMarker(player, slot);
  }

  /** Apply a whole turn atomically: every move applies, or none do and the
   *  session is untouched, so a rejection needs no resync. */
  commit(moves: Move[]): TurnResult {
    const need = this.committed.actionsLeft;
    if (moves.length !== need) {
      throw new Error(`a turn needs exactly ${need} moves, got ${moves.length}`);
    }
    const actor = this.committed.currentPlayer;
    const before = this.committed.players[actor]!.score;

    const trial = this.committed.clone();
    for (const move of moves) trial.apply(move);   // throws => nothing committed

    // Recompute rather than intercept: apply() scores internally and does not
    // report what it scored, but endTurn touches neither the board nor the
    // marker slots, so this returns the same lines it used.
    const lines = [...scoreLines(trial.board, trial.players[actor]!.markerSlots)]
      .map(([key, passes]) => {
        const [lo, hi] = key.split("-").map(Number);
        return { slots: [lo!, hi!] as [number, number], passes };
      });

    this.committed = trial;
    return {
      player: actor,
      lines,
      totalPasses: lines.reduce((sum, l) => sum + l.passes, 0),
      vpAwarded: trial.players[actor]!.score - before,
    };
  }

  /** A complete turn's worth of legal moves, or null if none exists.
   *  Used by the smoke test to drive a game to completion. */
  legalTurns(): Move[] | null {
    const trial = this.committed.clone();
    const picked: Move[] = [];
    for (let i = 0; i < config.ACTIONS_PER_TURN; i++) {
      const move = trial.legalMoves()[0];
      if (move === undefined) return null;
      trial.apply(move);
      picked.push(move);
    }
    return picked;
  }

  /** Test-only: drop a vertical cross tile in a column, bypassing the turn
   *  structure, so a scoring board can be built without spending turns. */
  dropCrossTileForTest(col: number): void {
    placeTile(this.committed.board, [0, col], [1, col], 2, 0);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/client` then `npm run typecheck`
Expected: PASS.

If `reports the lines that scored` produces something other than 3 passes and 2 VP, **stop and report** — those values were hand-derived and independently confirmed during plan 1.

- [ ] **Step 5: Verify atomicity is real**

Temporarily change `commit` to apply moves directly to `this.committed` rather than a clone. Confirm `is atomic -- a bad second move rolls back the first` **fails**. Restore and confirm green. Report both outcomes.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): Session seam with snake-draft setup and atomic commit"
```

---

### Task 3: Geometry and hit-testing

**Files:**
- Create: `packages/client/src/geometry.ts`
- Test: `packages/client/test/geometry.test.ts`

**Interfaces:**
- Consumes: `Side`, `slotIndexOf` from `@passtally/rules`.
- Produces: `type Layout = { originX, originY, size, n }`, `type Hit`, `type Rect`; `layoutFor(n, size, originX?, originY?)`, `unit(layout)`, `hitTest(px, py, layout)`, `cellRect(layout, row, col)`, `slotRect(layout, slotIndex)`.

With the ring one cell deep on each side, the board region is `n + 2` units across, so `unit = size / (n + 2)`. Grid cell `(row, col)` occupies unit square `(col + 1, row + 1)`. **Corners of the ring band are dead space** and return `{ kind: "none" }`.

Ring indexing is no longer a cross-language risk — `hitTest` calls the same `slotIndexOf` the rules use, in the same process. What remains is the pixel-to-unit mapping, tested directly against `buildRing`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/geometry.test.ts`:

```ts
import { buildRing, slotIndexOf } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { cellRect, hitTest, layoutFor, slotRect, unit } from "../src/geometry.js";

const SIZES = [4, 5, 6, 7, 8];
const L = (n: number) => layoutFor(n, 500);

/** Centre of unit square (u, v) in the (n + 2) grid. */
function centre(n: number, u: number, v: number): [number, number] {
  const l = L(n);
  const s = unit(l);
  return [l.originX + (u + 0.5) * s, l.originY + (v + 0.5) * s];
}

describe("layout", () => {
  it("makes the board region n + 2 units across", () => {
    expect(unit(layoutFor(6, 500))).toBeCloseTo(500 / 8);
    expect(unit(layoutFor(4, 500))).toBeCloseTo(500 / 6);
  });
});

describe("hitTest", () => {
  it.each(SIZES)("finds every grid cell (n=%i)", (n) => {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const [x, y] = centre(n, col + 1, row + 1);
        expect(hitTest(x, y, L(n))).toEqual({ kind: "cell", row, col });
      }
    }
  });

  // Must agree with buildRing exactly. Same process and same function, but the
  // pixel-to-unit step is new code and is what this checks.
  it.each(SIZES)("finds every ring slot (n=%i)", (n) => {
    buildRing(n).forEach((slot, index) => {
      const u = slot.side === 3 ? 0 : slot.side === 1 ? n + 1 : slot.col + 1;
      const v = slot.side === 0 ? 0 : slot.side === 2 ? n + 1 : slot.row + 1;
      const [x, y] = centre(n, u, v);
      expect(hitTest(x, y, L(n))).toEqual({ kind: "slot", index });
      expect(slotIndexOf(n, slot.row, slot.col, slot.side)).toBe(index);
    });
  });

  it.each(SIZES)("treats ring corners as dead space (n=%i)", (n) => {
    for (const [u, v] of [[0, 0], [n + 1, 0], [0, n + 1], [n + 1, n + 1]]) {
      const [x, y] = centre(n, u!, v!);
      expect(hitTest(x, y, L(n))).toEqual({ kind: "none" });
    }
  });

  it("returns none outside the board region", () => {
    const l = L(6);
    expect(hitTest(l.originX - 1, l.originY + 10, l)).toEqual({ kind: "none" });
    expect(hitTest(l.originX + 10, l.originY - 1, l)).toEqual({ kind: "none" });
    expect(hitTest(l.originX + 501, l.originY + 10, l)).toEqual({ kind: "none" });
    expect(hitTest(l.originX + 10, l.originY + 501, l)).toEqual({ kind: "none" });
  });

  it("respects a non-zero origin", () => {
    const l = layoutFor(6, 500, 100, 50);
    const s = unit(l);
    expect(hitTest(100 + 1.5 * s, 50 + 1.5 * s, l)).toEqual({ kind: "cell", row: 0, col: 0 });
    expect(hitTest(10, 10, l)).toEqual({ kind: "none" });
  });
});

describe("rects", () => {
  it("places cell (0,0) one unit in from the origin", () => {
    const l = L(6);
    const s = unit(l);
    expect(cellRect(l, 0, 0)).toEqual({ x: l.originX + s, y: l.originY + s, w: s, h: s });
  });

  it("round-trips every slot rect back through hitTest", () => {
    const l = L(6);
    for (let index = 0; index < 24; index++) {
      const r = slotRect(l, index);
      expect(hitTest(r.x + r.w / 2, r.y + r.h / 2, l)).toEqual({ kind: "slot", index });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/geometry.js`.

- [ ] **Step 3: Write `packages/client/src/geometry.ts`**

```ts
import { Side, slotIndexOf } from "@passtally/rules";

export type Layout = {
  originX: number;
  originY: number;
  size: number;   // the square board region, ring included
  n: number;      // grid dimension
};

export type Hit =
  | { kind: "cell"; row: number; col: number }
  | { kind: "slot"; index: number }
  | { kind: "none" };

export type Rect = { x: number; y: number; w: number; h: number };

export function layoutFor(n: number, size: number, originX = 0, originY = 0): Layout {
  return { originX, originY, size, n };
}

/** The ring is one cell deep on each side, so the region is n + 2 units. */
export function unit(layout: Layout): number {
  return layout.size / (layout.n + 2);
}

/** Cursor -> cell, ring slot, or nothing. Pure: no rendering, no state. */
export function hitTest(px: number, py: number, layout: Layout): Hit {
  const s = unit(layout);
  const u = Math.floor((px - layout.originX) / s);
  const v = Math.floor((py - layout.originY) / s);
  const last = layout.n + 1;

  if (u < 0 || v < 0 || u > last || v > last) return { kind: "none" };

  const onVerticalEdge = u === 0 || u === last;
  const onHorizontalEdge = v === 0 || v === last;

  // Corners of the ring band are dead space -- they belong to no slot.
  if (onVerticalEdge && onHorizontalEdge) return { kind: "none" };

  if (!onVerticalEdge && !onHorizontalEdge) {
    return { kind: "cell", row: v - 1, col: u - 1 };
  }

  if (v === 0) return { kind: "slot", index: slotIndexOf(layout.n, 0, u - 1, Side.N) };
  if (v === last) {
    return { kind: "slot", index: slotIndexOf(layout.n, layout.n - 1, u - 1, Side.S) };
  }
  if (u === 0) return { kind: "slot", index: slotIndexOf(layout.n, v - 1, 0, Side.W) };
  return { kind: "slot", index: slotIndexOf(layout.n, v - 1, layout.n - 1, Side.E) };
}

export function cellRect(layout: Layout, row: number, col: number): Rect {
  const s = unit(layout);
  return { x: layout.originX + (col + 1) * s, y: layout.originY + (row + 1) * s, w: s, h: s };
}

/** Where a ring slot sits on screen, mirroring hitTest's mapping. */
export function slotRect(layout: Layout, slotIndex: number): Rect {
  const s = unit(layout);
  const n = layout.n;
  const last = n + 1;
  let u: number, v: number;
  if (slotIndex < n) { u = slotIndex + 1; v = 0; }
  else if (slotIndex < 2 * n) { u = last; v = slotIndex - n + 1; }
  else if (slotIndex < 3 * n) { u = n - (slotIndex - 2 * n); v = last; }
  else { u = 0; v = n - (slotIndex - 3 * n); }
  return { x: layout.originX + u * s, y: layout.originY + v * s, w: s, h: s };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/client` then `npm run typecheck`
Expected: PASS, including the exhaustive sweeps for n in 4..8.

- [ ] **Step 5: Verify the corner rule and the slot mapping bite**

Two separate mutations, each restored after. Report both outcomes.

1. Delete `if (onVerticalEdge && onHorizontalEdge) return { kind: "none" };`. Confirm `treats ring corners as dead space` **fails**.
2. Swap the final `Side.W` and `Side.E` branches. Confirm `finds every ring slot` **fails**.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): pure hit-testing over the grid and ring"
```

---

### Task 4: Orientation normalization and tentative turns

**Files:**
- Create: `packages/client/src/orient.ts`, `packages/client/src/tentative.ts`
- Test: `packages/client/test/orient.test.ts`, `packages/client/test/tentative.test.ts`

**Interfaces:**
- Consumes: `offsetOf`, `distinctOrientations`, `TILE_TYPES`, `Game`, `Move`, `Pos`, `TypeId`, `config` from `@passtally/rules`; `LocalSession` from `./session.js`; `buildView` from `./view.js`.
- Produces: `normalizePlacement(typeId, anchor, orientation): { anchor: Pos; orientation: number }`; `class Tentative` with `moves`, `actionsLeft()`, `isSpent(pileIndex)`, `add(move)`, `undo()`, `clear()`, `overlayGame()`, `view()`, `isComplete()`.

No `legalPlacements()` helper: legal-anchor highlighting is a tier 2 feature, and an untested-by-a-caller method is dead API. The spent-pile rule is enforced in `add` and surfaced by `isSpent`.

**Why normalization exists.** `R` cycles all four orientations because predictable rotation matters more than internal tidiness. But only *distinct* orientations produce distinct board states — for the symmetric tiles 2, 5 and 6 that is two, since 180° rotation swaps the two cells while leaving each cell's shape unchanged. Rotating such a tile to orientation 2 is a genuinely legal placement that is not in the tile's distinct set. Orientations `o` and `o + 2` cover the same footprint with the cells swapped, so `(anchor, o + 2)` rewrites to `(anchor + offsetOf(o + 2), o)`.

**Why the overlay clones.** The tentative board is produced by cloning the committed `Game` and applying the pending moves — reusing proven `apply()` so the client duplicates no rules. Two consequences:

- Applying the final action makes the clone **end its turn**: it scores, advances the player and may set `over`. Ignore all of that for display. `currentPlayer` and `actionsLeft` come from the committed game minus the pending count.
- The clone **draws replacement tiles**. Piles therefore always come from the committed game (`buildView` already does this), and a pile consumed by a pending placement reports `isSpent`.

**A spent pile is done for the turn.** Not a rule anyone imposes — the replacement is not turned over until commit, so there is physically nothing to place from it a second time.

- [ ] **Step 1: Write the failing tests**

`packages/client/test/orient.test.ts`:

```ts
import { TILE_TYPES, distinctOrientations, offsetOf } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { normalizePlacement } from "../src/orient.js";

const IDS = [1, 2, 3, 4, 5, 6] as TypeId[];

describe("normalizePlacement", () => {
  it.each(IDS)("always lands in the tile's distinct set (tile %i)", (t) => {
    for (const o of [0, 1, 2, 3]) {
      expect(distinctOrientations(t)).toContain(normalizePlacement(t, [3, 3], o).orientation);
    }
  });

  it.each(IDS)("preserves the footprint (tile %i)", (t) => {
    for (const o of [0, 1, 2, 3]) {
      const raw = new Set(["3,3", `${3 + offsetOf(o)[0]},${3 + offsetOf(o)[1]}`]);
      const r = normalizePlacement(t, [3, 3], o);
      const norm = new Set([
        `${r.anchor[0]},${r.anchor[1]}`,
        `${r.anchor[0] + offsetOf(r.orientation)[0]},${r.anchor[1] + offsetOf(r.orientation)[1]}`,
      ]);
      expect(norm).toEqual(raw);
    }
  });

  it("leaves an already-distinct orientation untouched", () => {
    // Tile 1 has all four orientations distinct, so nothing should move.
    for (const o of [0, 1, 2, 3]) {
      expect(normalizePlacement(1, [2, 2], o)).toEqual({ anchor: [2, 2], orientation: o });
    }
  });

  it("rewrites a collapsed orientation for a symmetric tile", () => {
    // Tile 2's distinct set is [0, 1], so 2 and 3 must be rewritten.
    // offsetOf(2) is [-1, 0] and offsetOf(3) is [0, 1].
    expect(distinctOrientations(2)).toEqual([0, 1]);
    expect(normalizePlacement(2, [3, 3], 2)).toEqual({ anchor: [2, 3], orientation: 0 });
    expect(normalizePlacement(2, [3, 3], 3)).toEqual({ anchor: [3, 4], orientation: 1 });
  });

  it("covers every tile in the data", () => {
    expect(Object.keys(TILE_TYPES).length).toBe(6);
  });
});
```

`packages/client/test/tentative.test.ts`:

```ts
import { Game, config } from "@passtally/rules";
import type { Move } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { Tentative } from "../src/tentative.js";
import { setupOrder } from "../src/view.js";

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

function playing(nPlayers = 2, seed = 1, boardSize = 6): LocalSession {
  const s = new LocalSession(Game.newGame(nPlayers, seed, boardSize));
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const slot = s.getView().ring.findIndex((r, i) =>
      r.occupant === null && !edges.has(Math.floor(i / boardSize)));
    s.placeSetupMarker(player, slot);
    edges.add(Math.floor(slot / boardSize));
    used.set(player, edges);
  }
  return s;
}

describe("Tentative", () => {
  it("starts empty with a full action count", () => {
    const t = new Tentative(playing());
    expect(t.moves).toEqual([]);
    expect(t.actionsLeft()).toBe(config.ACTIONS_PER_TURN);
  });

  it("shows a pending placement on the board", () => {
    const t = new Tentative(playing());
    t.add(place(0, [2, 2], [3, 2], 0));
    expect(t.view().cells[2]![2]!.height).toBe(1);
    expect(t.actionsLeft()).toBe(1);
  });

  // Undo must restore EXACTLY the committed board -- the overlay is recomputed
  // from the committed game, never patched backwards.
  it("undo restores the committed board exactly", () => {
    const s = playing();
    const before = JSON.stringify(s.getView());
    const t = new Tentative(s);
    t.add(place(0, [2, 2], [3, 2], 0));
    t.add(marker(0, 1));
    expect(JSON.stringify(t.view())).not.toBe(before);
    t.undo();
    t.undo();
    expect(JSON.stringify(t.view())).toBe(before);
    expect(t.actionsLeft()).toBe(config.ACTIONS_PER_TURN);
  });

  it("undo on an empty list is a no-op", () => {
    const t = new Tentative(playing());
    t.undo();
    expect(t.moves).toEqual([]);
  });

  it("marks a pile spent and keeps it spent until undo", () => {
    const t = new Tentative(playing());
    expect(t.isSpent(0)).toBe(false);
    t.add(place(0, [2, 2], [3, 2], 0));
    expect(t.isSpent(0)).toBe(true);
    expect(t.isSpent(1)).toBe(false);
    t.undo();
    expect(t.isSpent(0)).toBe(false);
  });

  // The replacement is not turned over until commit, so there is nothing to
  // place from a spent pile -- this falls out of the reveal timing.
  it("refuses a second placement from a spent pile", () => {
    const t = new Tentative(playing());
    t.add(place(0, [2, 2], [3, 2], 0));
    expect(() => t.add(place(0, [2, 4], [3, 4], 0))).toThrow(/spent/i);
    t.add(place(1, [2, 4], [3, 4], 0));   // a different pile is still available
    expect(t.actionsLeft()).toBe(0);
  });

  // The overlay clone ends its turn on the second action -- scoring, advancing
  // the player, possibly setting over. None of that may reach the display.
  it("does not advance the player after the final pending action", () => {
    const t = new Tentative(playing());
    t.add(place(0, [2, 2], [3, 2], 0));
    t.add(place(1, [2, 4], [3, 4], 0));
    expect(t.actionsLeft()).toBe(0);
    expect(t.view().currentPlayer).toBe(0);
    expect(t.view().phase).toBe("play");
  });

  it("does not reveal a replacement tile before commit", () => {
    const s = playing();
    const faceUpBefore = s.getView().piles[0]!.faceUp;
    const countBefore = s.getView().piles[0]!.count;
    const t = new Tentative(s);
    t.add(place(0, [2, 2], [3, 2], 0));
    expect(t.view().piles[0]!.faceUp).toBe(faceUpBefore);
    expect(t.view().piles[0]!.count).toBe(countBefore);
  });

  it("rejects a move beyond the action budget", () => {
    const t = new Tentative(playing());
    t.add(place(0, [2, 2], [3, 2], 0));
    t.add(place(1, [2, 4], [3, 4], 0));
    expect(() => t.add(marker(0, 1))).toThrow(/no actions/i);
  });

  it("rejects an illegal move without changing state", () => {
    const t = new Tentative(playing());
    t.add(place(0, [2, 2], [3, 2], 0));
    expect(() => t.add(place(1, [2, 2], [3, 2], 0))).toThrow();
    expect(t.moves.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/orient.js` / `../src/tentative.js`.

- [ ] **Step 3: Write `packages/client/src/orient.ts`**

```ts
import { distinctOrientations, offsetOf } from "@passtally/rules";
import type { Pos, TypeId } from "@passtally/rules";

/** Rewrite a raw rotation into the tile's distinct set, preserving the footprint.
 *
 *  R cycles all four orientations because predictable rotation matters more
 *  than internal tidiness. But symmetric tiles (2, 5, 6) have only two distinct
 *  orientations: 180 degrees swaps the two cells while leaving each cell's
 *  shape unchanged. Orientations o and o + 2 cover the same footprint with the
 *  cells swapped, so (anchor, o + 2) becomes (anchor + offsetOf(o + 2), o). */
export function normalizePlacement(
  typeId: TypeId, anchor: Pos, orientation: number,
): { anchor: Pos; orientation: number } {
  if (distinctOrientations(typeId).includes(orientation)) return { anchor, orientation };
  const [dr, dc] = offsetOf(orientation);
  return { anchor: [anchor[0] + dr, anchor[1] + dc], orientation: (orientation + 2) % 4 };
}
```

- [ ] **Step 4: Write `packages/client/src/tentative.ts`**

```ts
import { config } from "@passtally/rules";
import type { Game, Move } from "@passtally/rules";
import type { LocalSession } from "./session.js";
import type { GameView } from "./types.js";
import { buildView } from "./view.js";

/** Client-only turn state. The session never sees these moves until commit.
 *
 *  The overlay is produced by cloning the committed Game and applying the
 *  pending moves -- reusing proven apply() so the client duplicates no rules. */
export class Tentative {
  private readonly session: LocalSession;
  private pending: Move[] = [];

  constructor(session: LocalSession) {
    this.session = session;
  }

  get moves(): readonly Move[] {
    return this.pending;
  }

  actionsLeft(): number {
    return this.session.game.actionsLeft - this.pending.length;
  }

  isSpent(pileIndex: number): boolean {
    return this.pending.some((m) => m.kind === "place" && m.pileIndex === pileIndex);
  }

  /** Append a move. Throws without changing state if it is illegal or over
   *  budget, so a rejection needs no rollback. */
  add(move: Move): void {
    if (this.actionsLeft() <= 0) throw new Error("no actions left this turn");
    if (move.kind === "place" && this.isSpent(move.pileIndex)) {
      throw new Error(`pile ${move.pileIndex} is already spent this turn`);
    }
    this.overlayGame().apply(move);   // throws => pending unchanged
    this.pending.push(move);
  }

  undo(): void {
    this.pending.pop();
  }

  clear(): void {
    this.pending = [];
  }

  /** The committed game plus the pending moves. Its turn-end side effects --
   *  scoring, player advance, the over flag -- are ignored for display. */
  overlayGame(): Game {
    const clone = this.session.game.clone();
    for (const move of this.pending) clone.apply(move);
    return clone;
  }

  /** Board from the overlay; piles and turn state from the committed game, so
   *  a replacement drawn on the clone is not revealed before commit and the
   *  player does not appear to advance on the final pending action. */
  view(): GameView {
    return buildView(this.session.game, {
      board: this.overlayGame().board,
      actionsLeft: this.actionsLeft(),
    });
  }

  /** True when the turn is fully spent and ready to commit. */
  isComplete(): boolean {
    return this.actionsLeft() === 0 && this.pending.length === config.ACTIONS_PER_TURN;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @passtally/client` then `npm run typecheck`
Expected: PASS.

If `rewrites a collapsed orientation for a symmetric tile` produces different anchors, **stop and report** — do not adjust the expectation. `offsetOf(2)` is `[-1, 0]` and `offsetOf(3)` is `[0, 1]`, so the expected rewrites follow directly.

- [ ] **Step 6: Verify three behaviours actually bite**

Three separate mutations, each restored after. Report each with real counts.

1. Make `normalizePlacement` return its input unchanged. Confirm `always lands in the tile's distinct set` and `rewrites a collapsed orientation` **fail**.
2. In `Tentative.view()`, pass `this.overlayGame()` to `buildView` as the first argument instead of `this.session.game`. Confirm `does not reveal a replacement tile before commit` and `does not advance the player after the final pending action` **fail**. This is the most important behaviour in the task — the whole reveal rule rests on it.
3. Remove the `isSpent` guard from `add`. Confirm `refuses a second placement from a spent pile` **fails**.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): orientation normalization and tentative turns"
```

---

### Task 5: The interaction state machine

**Files:**
- Create: `packages/client/src/state.ts`
- Test: `packages/client/test/state.test.ts`

**Interfaces:**
- Consumes: `Tentative`, `LocalSession`, `normalizePlacement`, `Hit`; `config`, `markerDestination`, `offsetOf`, `Move`, `Pos`, `TypeId` from `@passtally/rules`.
- Produces: `type UiState`, `type UiInput`, `type Destination`; `class Controller` with `state`, `selectedPile`, `selectedMarker`, `ghostOrientation`, `markerDestinations`, `lastRejection`, `log`, `onChange`, `view()`, `isSpent(pileIndex)`, `handle(input)`, `handleAndRender(input)`.

The six states:

```text
setup ──(all markers placed)──> idle
idle ──selectPile──────────────> tileSelected
idle ──click own marker────────> markerSelected
tileSelected   ──click legal anchor──> idle   (action spent, pile spent)
markerSelected ──click destination───> idle   (action spent)
idle ──commit, actionsLeft == 0──> committing ──> idle | gameOver
any  ──escape──> idle          idle ──undo──> idle
```

`committing` is the only state that touches the session during a turn. `handle` never throws — it records `lastRejection` so the UI can shake and continue.

- [ ] **Step 1: Write the failing test**

`packages/client/test/state.test.ts`:

```ts
import { Game } from "@passtally/rules";
import { describe, expect, it } from "vitest";
import { LocalSession } from "../src/session.js";
import { Controller } from "../src/state.js";
import { setupOrder } from "../src/view.js";

function controller(nPlayers = 2, seed = 1, boardSize = 6): Controller {
  return new Controller(new LocalSession(Game.newGame(nPlayers, seed, boardSize)));
}

function driveSetup(c: Controller, nPlayers = 2, boardSize = 6): void {
  const used = new Map<number, Set<number>>();
  for (const player of setupOrder(nPlayers)) {
    const edges = used.get(player) ?? new Set<number>();
    const index = c.view().ring.findIndex((r, i) =>
      r.occupant === null && !edges.has(Math.floor(i / boardSize)));
    c.handle({ kind: "click", hit: { kind: "slot", index } });
    edges.add(Math.floor(index / boardSize));
    used.set(player, edges);
  }
}

describe("setup phase", () => {
  it("starts in setup and places markers by clicking ring slots", () => {
    const c = controller();
    expect(c.state).toBe("setup");
    c.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    expect(c.view().ring[0]!.occupant).not.toBeNull();
    expect(c.state).toBe("setup");
  });

  it("moves to idle once every marker is placed", () => {
    const c = controller();
    driveSetup(c);
    expect(c.state).toBe("idle");
    expect(c.view().phase).toBe("play");
  });

  it("records a rejection instead of throwing on an occupied slot", () => {
    const c = controller();
    c.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    c.handle({ kind: "click", hit: { kind: "slot", index: 0 } });
    expect(c.lastRejection).not.toBeNull();
    expect(c.state).toBe("setup");
  });
});

describe("placing a tile", () => {
  it("selects a pile and enters tileSelected", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    expect(c.state).toBe("tileSelected");
    expect(c.selectedPile).toBe(0);
  });

  it("rotates the ghost through all four orientations", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    expect(c.ghostOrientation).toBe(0);
    for (const expected of [1, 2, 3, 0]) {
      c.handle({ kind: "rotate" });
      expect(c.ghostOrientation).toBe(expected);
    }
  });

  it("places on a legal anchor and returns to idle", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    expect(c.state).toBe("idle");
    expect(c.view().cells[2]![2]!.height).toBe(1);
    expect(c.view().actionsLeft).toBe(1);
  });

  it("records a rejection on an illegal anchor and stays selected", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    // Orientation 0 puts cell B south of the anchor, so the bottom row is off-board.
    c.handle({ kind: "click", hit: { kind: "cell", row: 5, col: 2 } });
    expect(c.lastRejection).not.toBeNull();
    expect(c.state).toBe("tileSelected");
    expect(c.view().actionsLeft).toBe(2);
  });

  it("refuses a pile already spent this turn", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    c.handle({ kind: "selectPile", pileIndex: 0 });
    expect(c.lastRejection).not.toBeNull();
    expect(c.state).toBe("idle");
  });
});

describe("moving a marker", () => {
  it("selects an own marker and enters markerSelected", () => {
    const c = controller();
    driveSetup(c);
    const own = c.view().players[c.view().currentPlayer]!.markerSlots[0]!;
    c.handle({ kind: "click", hit: { kind: "slot", index: own } });
    expect(c.state).toBe("markerSelected");
  });

  it("ignores a marker belonging to another player", () => {
    const c = controller();
    driveSetup(c);
    const other = c.view().players[1]!.markerSlots[0]!;
    c.handle({ kind: "click", hit: { kind: "slot", index: other } });
    expect(c.state).toBe("idle");
  });

  it("moves to a reachable destination and returns to idle", () => {
    const c = controller();
    driveSetup(c);
    const own = c.view().players[0]!.markerSlots[0]!;
    c.handle({ kind: "click", hit: { kind: "slot", index: own } });
    const dest = c.markerDestinations[0]!;
    c.handle({ kind: "click", hit: { kind: "slot", index: dest.slot } });
    expect(c.state).toBe("idle");
    expect(c.view().actionsLeft).toBe(1);
    expect(c.view().ring[dest.slot]!.occupant).not.toBeNull();
  });
});

describe("undo, escape and commit", () => {
  it("escape clears a selection", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "escape" });
    expect(c.state).toBe("idle");
    expect(c.selectedPile).toBeNull();
  });

  it("undo removes the last tentative action", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    expect(c.view().actionsLeft).toBe(1);
    c.handle({ kind: "undo" });
    expect(c.view().actionsLeft).toBe(2);
    expect(c.view().cells[2]![2]!.height).toBe(0);
  });

  it("refuses to commit before both actions are spent", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "commit" });
    expect(c.lastRejection).not.toBeNull();
    expect(c.view().currentPlayer).toBe(0);
  });

  it("commits a full turn, logs it and advances the player", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    c.handle({ kind: "selectPile", pileIndex: 1 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 4 } });
    c.handle({ kind: "commit" });
    expect(c.state).toBe("idle");
    expect(c.view().currentPlayer).toBe(1);
    expect(c.view().actionsLeft).toBe(2);
    expect(c.log.length).toBe(1);
    expect(c.log[0]!.player).toBe(0);
  });

  it("un-spends a pile after undo", () => {
    const c = controller();
    driveSetup(c);
    c.handle({ kind: "selectPile", pileIndex: 0 });
    c.handle({ kind: "click", hit: { kind: "cell", row: 2, col: 2 } });
    c.handle({ kind: "undo" });
    c.handle({ kind: "selectPile", pileIndex: 0 });
    expect(c.state).toBe("tileSelected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/client`
Expected: FAIL — cannot resolve `../src/state.js`.

- [ ] **Step 3: Write `packages/client/src/state.ts`**

```ts
import { config, markerDestination, offsetOf } from "@passtally/rules";
import type { Move, Pos, TypeId } from "@passtally/rules";
import type { Hit } from "./geometry.js";
import { normalizePlacement } from "./orient.js";
import type { LocalSession } from "./session.js";
import { Tentative } from "./tentative.js";
import type { GameView, TurnResult } from "./types.js";

export type UiState =
  | "setup" | "idle" | "tileSelected" | "markerSelected" | "committing" | "gameOver";

export type UiInput =
  | { kind: "click"; hit: Hit }
  | { kind: "selectPile"; pileIndex: number }
  | { kind: "selectMarker"; markerIndex: number }
  | { kind: "rotate" }
  | { kind: "undo" }
  | { kind: "escape" }
  | { kind: "commit" };

export type Destination = { slot: number; distance: number };

/** Drives the six-state machine. Holds no rules -- every legality question
 *  goes to Tentative, which asks @passtally/rules. */
export class Controller {
  readonly session: LocalSession;
  private tentative: Tentative;

  state: UiState = "setup";
  selectedPile: number | null = null;
  selectedMarker: number | null = null;
  ghostOrientation = 0;
  markerDestinations: Destination[] = [];
  lastRejection: string | null = null;
  log: TurnResult[] = [];

  /** Set by main.ts so UI handlers can trigger a redraw after dispatching. */
  onChange: (() => void) | null = null;

  constructor(session: LocalSession) {
    this.session = session;
    this.tentative = new Tentative(session);
    this.state = session.getView().phase === "setup" ? "setup" : "idle";
  }

  view(): GameView {
    return this.state === "setup" ? this.session.getView() : this.tentative.view();
  }

  /** True when a pending placement has consumed this pile this turn. */
  isSpent(pileIndex: number): boolean {
    return this.tentative.isSpent(pileIndex);
  }

  /** Never throws: records lastRejection so the UI can shake and continue. */
  handle(input: UiInput): void {
    this.lastRejection = null;
    try {
      this.dispatch(input);
    } catch (error) {
      this.lastRejection = error instanceof Error ? error.message : String(error);
    }
  }

  handleAndRender(input: UiInput): void {
    this.handle(input);
    this.onChange?.();
  }

  private clearSelection(): void {
    this.selectedPile = null;
    this.selectedMarker = null;
    this.markerDestinations = [];
    this.ghostOrientation = 0;
  }

  private dispatch(input: UiInput): void {
    if (this.state === "gameOver") return;

    if (input.kind === "escape") {
      this.clearSelection();
      if (this.state !== "setup") this.state = "idle";
      return;
    }

    if (this.state === "setup") {
      if (input.kind !== "click" || input.hit.kind !== "slot") return;
      const player = this.session.getView().setupNext;
      if (player === null) return;
      this.session.placeSetupMarker(player, input.hit.index);
      if (this.session.getView().phase === "play") this.state = "idle";
      return;
    }

    switch (input.kind) {
      case "selectPile":   return this.onSelectPile(input.pileIndex);
      case "selectMarker": return this.onSelectMarker(input.markerIndex);
      case "rotate":       return this.onRotate();
      case "undo":         return this.onUndo();
      case "commit":       return this.onCommit();
      case "click":        return this.onClick(input.hit);
    }
  }

  private onSelectPile(pileIndex: number): void {
    if (this.tentative.actionsLeft() <= 0) throw new Error("no actions left this turn");
    if (this.tentative.isSpent(pileIndex)) {
      throw new Error(`pile ${pileIndex} is already spent this turn`);
    }
    if (this.view().piles[pileIndex]?.faceUp == null) {
      throw new Error(`pile ${pileIndex} is empty`);
    }
    this.clearSelection();
    this.selectedPile = pileIndex;
    this.state = "tileSelected";
  }

  private onSelectMarker(markerIndex: number): void {
    if (this.tentative.actionsLeft() <= 0) throw new Error("no actions left this turn");
    const view = this.view();
    if (view.players[view.currentPlayer]?.markerSlots[markerIndex] === undefined) {
      throw new Error(`no marker with index ${markerIndex}`);
    }
    this.clearSelection();
    this.selectedMarker = markerIndex;
    this.markerDestinations = this.destinationsFor(markerIndex);
    this.state = "markerSelected";
  }

  private destinationsFor(markerIndex: number): Destination[] {
    const board = this.tentative.overlayGame().board;
    const view = this.view();
    const from = view.players[view.currentPlayer]!.markerSlots[markerIndex]!;
    const seen = new Set<number>();
    const out: Destination[] = [];
    for (const distance of config.MARKER_DISTANCES) {
      const slot = markerDestination(board, from, distance);
      if (slot !== null && !seen.has(slot)) {
        seen.add(slot);
        out.push({ slot, distance });
      }
    }
    return out;
  }

  private onRotate(): void {
    if (this.state !== "tileSelected") return;
    this.ghostOrientation = (this.ghostOrientation + 1) % 4;
  }

  private onUndo(): void {
    this.tentative.undo();
    this.clearSelection();
    this.state = "idle";
  }

  private onCommit(): void {
    if (!this.tentative.isComplete()) {
      throw new Error(`a turn needs ${config.ACTIONS_PER_TURN} actions before committing`);
    }
    this.state = "committing";
    try {
      this.log.push(this.session.commit([...this.tentative.moves]));
      this.tentative.clear();
      this.clearSelection();
      this.state = this.session.getView().phase === "over" ? "gameOver" : "idle";
    } catch (error) {
      this.state = "idle";
      throw error;
    }
  }

  private onClick(hit: Hit): void {
    if (hit.kind === "none") return;

    if (this.state === "tileSelected" && hit.kind === "cell") {
      return this.placeAt([hit.row, hit.col]);
    }
    if (this.state === "markerSelected" && hit.kind === "slot") {
      return this.moveMarkerTo(hit.index);
    }
    if (hit.kind === "slot") {
      const view = this.view();
      const own = view.players[view.currentPlayer]!.markerSlots.indexOf(hit.index);
      if (own >= 0) this.onSelectMarker(own);
    }
  }

  private placeAt(anchor: Pos): void {
    const pileIndex = this.selectedPile;
    if (pileIndex === null) return;
    const faceUp = this.view().piles[pileIndex]!.faceUp;
    if (faceUp === null) throw new Error(`pile ${pileIndex} is empty`);

    const norm = normalizePlacement(faceUp as TypeId, anchor, this.ghostOrientation);
    const [dr, dc] = offsetOf(norm.orientation);
    const move: Move = {
      kind: "place",
      pileIndex,
      cellA: norm.anchor,
      cellB: [norm.anchor[0] + dr, norm.anchor[1] + dc],
      orientation: norm.orientation,
    };
    this.tentative.add(move);   // throws => selection preserved, nothing spent
    this.clearSelection();
    this.state = "idle";
  }

  private moveMarkerTo(slot: number): void {
    const markerIndex = this.selectedMarker;
    if (markerIndex === null) return;
    const target = this.markerDestinations.find((d) => d.slot === slot);
    if (target === undefined) throw new Error(`slot ${slot} is not reachable`);
    this.tentative.add({ kind: "marker", markerIndex, distance: target.distance });
    this.clearSelection();
    this.state = "idle";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/client` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verify two behaviours bite**

1. In `placeAt`, drop the `normalizePlacement` call and use `anchor` / `this.ghostOrientation` directly. Confirm at least one test fails. **If nothing fails, say so** — it means the state tests never exercise a symmetric tile at a collapsed orientation, which is a real gap worth reporting rather than papering over.
2. In `handle`, remove the `try`/`catch` so exceptions propagate. Confirm `records a rejection instead of throwing on an occupied slot` **fails**.

Report both outcomes.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): six-state interaction controller"
```

---

### Task 6: Canvas rendering

**Files:**
- Create: `packages/client/src/render/tiles.ts`, `packages/client/src/render/board.ts`
- Test: none — see below

**Interfaces:**
- Consumes: `Rect`, `Layout`, `cellRect`, `slotRect`, `unit` from `../geometry.js`; `Controller` from `../state.js`; `Side`, `offsetOf`, `TypeId` from `@passtally/rules`.
- Produces: `levelFill(level): string`, `drawCellArt(ctx, rect, conns, level): void`, `drawBoard(ctx, layout, controller, hoverCell): void`.

**Rendering is deliberately not unit tested.** Asserting on canvas pixels is brittle and tests the wrong thing. Task 7 verifies it by running the app. What this task must guarantee is that it **compiles under strict mode** and draws from the view model only.

**Elevation uses two channels**, because level drives both the support rule and the pass multiplier: a lightness ramp keyed to level for "where are the tall stacks" at a glance, plus a numeric badge for exact counting. Not drop shadows alone — in dense areas every tile shadows its neighbour and the depth cue collapses.

- [ ] **Step 1: Write `packages/client/src/render/tiles.ts`**

```ts
import { Side } from "@passtally/rules";
import type { Rect } from "../geometry.js";

/** Midpoint of a cell face, where a line meets the edge. */
function facePoint(rect: Rect, side: Side): [number, number] {
  const { x, y, w, h } = rect;
  if (side === Side.N) return [x + w / 2, y];
  if (side === Side.E) return [x + w, y + h / 2];
  if (side === Side.S) return [x + w / 2, y + h];
  return [x, y + h / 2];
}

/** Lightness ramp keyed to stack level -- the gestalt channel. */
export function levelFill(level: number): string {
  return `hsl(38 42% ${Math.max(28, 82 - (level - 1) * 16)}%)`;
}

/** One cell's line art. Opposite faces draw straight; adjacent faces curve
 *  through the cell centre, which reads as a turn. */
export function drawCellArt(
  ctx: CanvasRenderingContext2D, rect: Rect, conns: [Side, Side][], level: number,
): void {
  ctx.fillStyle = levelFill(level);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = Math.max(2, rect.w * 0.09);
  ctx.lineCap = "round";

  for (const [a, b] of conns) {
    const [ax, ay] = facePoint(rect, a);
    const [bx, by] = facePoint(rect, b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    if ((a + 2) % 4 === b) {
      ctx.lineTo(bx, by);                                   // straight through
    } else {
      ctx.quadraticCurveTo(rect.x + rect.w / 2, rect.y + rect.h / 2, bx, by);
    }
    ctx.stroke();
  }

  if (level > 1) {
    ctx.fillStyle = "#111";
    ctx.font = `${Math.round(rect.w * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(level), rect.x + rect.w - 3, rect.y + rect.h - 2);
  }
}
```

- [ ] **Step 2: Write `packages/client/src/render/board.ts`**

```ts
import { offsetOf } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { cellRect, slotRect, unit } from "../geometry.js";
import type { Layout, Rect } from "../geometry.js";
import type { Controller } from "../state.js";
import { drawCellArt, levelFill } from "./tiles.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

function strokeRect(ctx: CanvasRenderingContext2D, r: Rect, colour: string, width: number): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.strokeRect(r.x + width / 2, r.y + width / 2, r.w - width, r.h - width);
}

/** One imperative draw pass, called on state change and on pointer move. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  controller: Controller,
  hoverCell: [number, number] | null,
): void {
  const view = controller.view();
  const s = unit(layout);

  // Ring band, then the grid inset by one unit, so the two read as one object.
  ctx.fillStyle = "#e7e2d8";
  ctx.fillRect(layout.originX, layout.originY, layout.size, layout.size);
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(layout.originX + s, layout.originY + s, layout.size - 2 * s, layout.size - 2 * s);

  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      const rect = cellRect(layout, row, col);
      const cell = view.cells[row]![col]!;
      if (cell.conns === null) strokeRect(ctx, rect, "#ddd7cb", 1);
      else drawCellArt(ctx, rect, cell.conns, cell.height);
    }
  }

  // Tile outlines, from the partner offset the view already carries.
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 1.5;
  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      if (view.cells[row]![col]!.partner === null) continue;
      const r = cellRect(layout, row, col);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }

  view.ring.forEach((slot, index) => {
    if (slot.occupant === null) return;
    const r = slotRect(layout, index);
    ctx.fillStyle = PLAYER_COLOURS[Math.floor(slot.occupant / 4) % PLAYER_COLOURS.length]!;
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  if (controller.state === "markerSelected") {
    for (const d of controller.markerDestinations) {
      strokeRect(ctx, slotRect(layout, d.slot), "#2f6fd0", 3);
    }
  }

  if (controller.state === "tileSelected" && hoverCell !== null) {
    const faceUp = view.piles[controller.selectedPile!]!.faceUp as TypeId | null;
    if (faceUp !== null) {
      const [dr, dc] = offsetOf(controller.ghostOrientation);
      ctx.globalAlpha = 0.55;
      for (const [row, col] of [hoverCell, [hoverCell[0] + dr, hoverCell[1] + dc]]) {
        if (row! < 0 || col! < 0 || row! >= view.n || col! >= view.n) continue;
        const r = cellRect(layout, row!, col!);
        ctx.fillStyle = levelFill(view.cells[row!]![col!]!.height + 1);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        strokeRect(ctx, r, "#2f6fd0", 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: exit 0. Strict mode with `noUncheckedIndexedAccess` is the real gate — a rendering module that compiles clean under it is unlikely to be reading the view model wrongly.

- [ ] **Step 4: Commit**

```bash
git add packages/client
git commit -m "feat(client): canvas rendering for board, tiles, markers and ghost"
```

---

### Task 7: DOM chrome, wiring, and a running app

**Files:**
- Create: `packages/client/index.html`, `src/styles.css`, `src/ui/tray.ts`, `src/ui/rail.ts`, `src/ui/log.ts`, `src/main.ts`
- Test: none new — verified by running the app

**Layout** — three regions, fixed proportions, scaling as a unit. Board region 500×500, tray strip 500×150, rail 190 wide and full height, ~16px gutters, total ≈ 716×656.

**Input map** — mouse for position, keyboard for everything else, so the ghost needs no on-board rotation handles.

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

- [ ] **Step 1: Write `packages/client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Passtally</title>
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <main id="app">
      <section id="board-region"><canvas id="board" width="500" height="500"></canvas></section>
      <aside id="rail">
        <div id="players"></div>
        <div id="log"></div>
      </aside>
      <section id="tray">
        <div id="piles"></div>
        <div id="tray-right">
          <span id="actions">actions left: 2</span>
          <button id="commit" disabled>commit</button>
        </div>
      </section>
      <p id="status" role="status"></p>
    </main>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `packages/client/src/styles.css`**

```css
:root { --gutter: 16px; --ink: #1b1b1b; --paper: #faf8f4; --edge: #d8d2c6; }

* { box-sizing: border-box; }

body {
  margin: 0; padding: var(--gutter);
  background: #efece5; color: var(--ink);
  font: 14px/1.4 system-ui, sans-serif;
}

#app {
  display: grid;
  grid-template-columns: 500px 190px;
  grid-template-rows: 500px 150px auto;
  gap: var(--gutter);
  width: max-content;
}

#board-region { grid-column: 1; grid-row: 1; }
#rail { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-direction: column; overflow: hidden; }
#tray { grid-column: 1; grid-row: 2; display: flex; align-items: center; justify-content: space-between; }
#status { grid-column: 1 / span 2; grid-row: 3; margin: 0; min-height: 1.4em; color: #a1341f; }

#board { display: block; background: var(--paper); border: 1px solid var(--edge); }

#rail > div { background: var(--paper); border: 1px solid var(--edge); padding: 8px; }
#players { margin-bottom: var(--gutter); }
#log { flex: 1; overflow-y: auto; font-size: 12px; }
#log ol { margin: 0; padding-left: 1.4em; }

#piles { display: flex; gap: 12px; }
.pile { width: 64px; text-align: center; }
.pile canvas { border: 2px solid transparent; background: var(--paper); display: block; }
.pile.selected canvas { border-color: #2f6fd0; }
.pile.spent canvas { opacity: 0.35; }
.pile.empty canvas { opacity: 0.25; }
.pile-count { font-size: 12px; color: #665f52; }

#tray-right { display: flex; align-items: center; gap: 12px; }
#commit { font: inherit; padding: 10px 20px; background: #2f6fd0; color: #fff; border: 0; cursor: pointer; }
#commit:disabled { background: #c3bdb1; cursor: default; }

.player { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.player.active { font-weight: 700; }
.swatch { width: 12px; height: 12px; border-radius: 50%; }

.shake { animation: shake 220ms; }
@keyframes shake { 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
```

- [ ] **Step 3: Write the three DOM modules**

`packages/client/src/ui/tray.ts`:

```ts
import { resolve } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { drawCellArt } from "../render/tiles.js";
import type { Controller } from "../state.js";

const PILE_PX = 64;

/** Draw a pile's face-up tile at the same aspect and line style as the board,
 *  so connections can be judged before picking it up. */
function drawPileTile(canvas: HTMLCanvasElement, typeId: TypeId): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [connsA, connsB] = resolve(typeId, 0);   // canonical vertical
  const half = PILE_PX / 2;
  drawCellArt(ctx, { x: 0, y: 0, w: PILE_PX, h: half }, connsA, 1);
  drawCellArt(ctx, { x: 0, y: half, w: PILE_PX, h: half }, connsB, 1);
}

export function renderTray(root: HTMLElement, controller: Controller): void {
  const view = controller.view();
  root.replaceChildren();

  view.piles.forEach((pile, index) => {
    const wrap = document.createElement("div");
    wrap.className = "pile";
    if (controller.selectedPile === index) wrap.classList.add("selected");
    if (controller.isSpent(index)) wrap.classList.add("spent");
    if (pile.faceUp === null) wrap.classList.add("empty");

    const canvas = document.createElement("canvas");
    canvas.width = PILE_PX;
    canvas.height = PILE_PX;
    // A spent pile shows nothing: the replacement is not turned over until
    // commit, so there is nothing to draw and nothing to place from it.
    if (pile.faceUp !== null && !controller.isSpent(index)) drawPileTile(canvas, pile.faceUp);
    canvas.addEventListener("click", () =>
      controller.handleAndRender({ kind: "selectPile", pileIndex: index }));

    const count = document.createElement("div");
    count.className = "pile-count";
    // An empty pile stays in place showing 0 -- it is an end-game trigger and
    // hiding it hides that.
    count.textContent = String(pile.count);

    wrap.append(canvas, count);
    root.append(wrap);
  });
}
```

`packages/client/src/ui/rail.ts`:

```ts
import type { Controller } from "../state.js";
import { displayRanking } from "../view.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

export function renderPlayers(root: HTMLElement, controller: Controller): void {
  const view = controller.view();
  root.replaceChildren();
  for (const index of displayRanking(view)) {
    const row = document.createElement("div");
    row.className = "player";
    if (index === view.currentPlayer) row.classList.add("active");

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = PLAYER_COLOURS[index % PLAYER_COLOURS.length]!;

    const name = document.createElement("span");
    name.textContent = `Player ${index + 1}`;
    name.style.flex = "1";

    const score = document.createElement("strong");
    score.textContent = String(view.players[index]!.score);

    row.append(swatch, name, score);
    root.append(row);
  }
}
```

`packages/client/src/ui/log.ts`:

```ts
import type { Controller } from "../state.js";

/** One entry per committed turn. Not optional: scoring happens once at end of
 *  turn and is otherwise invisible, so an opponent's five-point jump would be
 *  unexplained. It doubles as the development trace. */
export function renderLog(root: HTMLElement, controller: Controller): void {
  root.replaceChildren();
  const list = document.createElement("ol");
  for (const entry of controller.log) {
    const li = document.createElement("li");
    const lines = entry.lines.length === 0
      ? "no lines"
      : entry.lines.map((l) => `${l.slots[0]}–${l.slots[1]} (${l.passes})`).join(", ");
    li.textContent =
      `P${entry.player + 1}: ${lines} → ${entry.totalPasses} passes, +${entry.vpAwarded} VP`;
    list.append(li);
  }
  root.append(list);
}
```

- [ ] **Step 4: Write `packages/client/src/main.ts`**

```ts
import { Game, config } from "@passtally/rules";
import { hitTest, layoutFor } from "./geometry.js";
import { drawBoard } from "./render/board.js";
import { LocalSession } from "./session.js";
import { Controller } from "./state.js";
import { renderLog } from "./ui/log.js";
import { renderPlayers } from "./ui/rail.js";
import { renderTray } from "./ui/tray.js";

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const ctx = canvas.getContext("2d")!;
const trayRoot = document.querySelector<HTMLElement>("#piles")!;
const playersRoot = document.querySelector<HTMLElement>("#players")!;
const logRoot = document.querySelector<HTMLElement>("#log")!;
const actionsLabel = document.querySelector<HTMLElement>("#actions")!;
const commitButton = document.querySelector<HTMLButtonElement>("#commit")!;
const status = document.querySelector<HTMLElement>("#status")!;

const controller = new Controller(new LocalSession(Game.newGame(2, Date.now() & 0xffff)));
const layout = layoutFor(controller.view().n, canvas.width);
let hoverCell: [number, number] | null = null;

function render(): void {
  const view = controller.view();
  drawBoard(ctx, layout, controller, hoverCell);
  renderTray(trayRoot, controller);
  renderPlayers(playersRoot, controller);
  renderLog(logRoot, controller);

  actionsLabel.textContent =
    view.phase === "setup"
      ? `setup: player ${(view.setupNext ?? 0) + 1} places a marker`
      : `actions left: ${view.actionsLeft}`;
  // Commit is the only high-emphasis control, disabled until both actions
  // are spent.
  commitButton.disabled = view.phase !== "play" || view.actionsLeft !== 0;

  if (controller.lastRejection !== null) {
    status.textContent = controller.lastRejection;
    canvas.classList.remove("shake");
    void canvas.offsetWidth;                 // restart the animation
    canvas.classList.add("shake");
  } else if (view.phase === "over") {
    status.textContent =
      view.winner === null ? "Game over — a tie." : `Game over — player ${view.winner + 1} wins.`;
  } else {
    status.textContent = "";
  }
}

controller.onChange = render;

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = hitTest(e.clientX - r.left, e.clientY - r.top, layout);
  const next: [number, number] | null = hit.kind === "cell" ? [hit.row, hit.col] : null;
  const changed = JSON.stringify(next) !== JSON.stringify(hoverCell);
  hoverCell = next;
  if (changed) render();
});

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  controller.handleAndRender({
    kind: "click",
    hit: hitTest(e.clientX - r.left, e.clientY - r.top, layout),
  });
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  controller.handleAndRender({ kind: "rotate" });
}, { passive: false });

commitButton.addEventListener("click", () => controller.handleAndRender({ kind: "commit" }));

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key >= "1" && key <= String(config.N_PILES)) {
    controller.handleAndRender({ kind: "selectPile", pileIndex: Number(key) - 1 });
  } else if (key === "r") {
    controller.handleAndRender({ kind: "rotate" });
  } else if (key === "escape") {
    controller.handleAndRender({ kind: "escape" });
  } else if (key === "backspace") {
    e.preventDefault();
    controller.handleAndRender({ kind: "undo" });
  } else if (key === "enter") {
    controller.handleAndRender({ kind: "commit" });
  } else if (key === "tab") {
    e.preventDefault();
    const view = controller.view();
    const count = view.players[view.currentPlayer]!.markerSlots.length;
    controller.handleAndRender({
      kind: "selectMarker",
      markerIndex: ((controller.selectedMarker ?? -1) + 1) % count,
    });
  }
});

render();
```

- [ ] **Step 5: Run the app and play a full turn**

Run: `npm run dev -w @passtally/client`

Open the printed URL and verify by hand:

1. Setup: clicking ring slots places markers, and the label names the right player each time — snake order is P1 P2, P2 P1, P1 P2, P2 P1.
2. After 8 markers the label reads "actions left: 2".
3. Pressing `1` selects pile 1 and the ghost follows the cursor.
4. `R` and scroll both rotate the ghost through four orientations.
5. Clicking a legal anchor places the tile; the pile greys out as spent and its face-up tile does **not** change.
6. `Backspace` undoes it — the tile disappears and the pile un-greys.
7. Clicking an illegal anchor shakes the board and shows a message; nothing is spent.
8. Clicking your own marker highlights reachable ring slots; clicking one moves it.
9. With both actions spent, commit enables. `Enter` commits, the log gains a line, and play passes to player 2.
10. Stack a tile onto two level-1 tiles and confirm the numeric badge reads 2 and the fill is darker.

**Report anything that does not behave as listed.** If a step fails, that is the finding — do not adjust the list.

- [ ] **Step 6: Verify the build**

Run: `npm run build -w @passtally/client && npm test && npm run typecheck`
Expected: a clean Vite build, the full monorepo suite green, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): DOM chrome, input wiring, and a playable hot-seat app"
```

---

## Verification

- [ ] **Full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: `@passtally/rules` 235 tests plus the client suite, all green, no type errors.

- [ ] **The client holds no rules**

Run: `grep -rnE "\.height (===|!==|>|<)|placementId|orthogonallyAdjacent" packages/client/src --include=*.ts | grep -v "render/"`
Expected: no hits outside `render/`. Height comparisons in rendering are presentational; anywhere else they would mean legality logic has leaked into the client.

- [ ] **The rules package and the reference are untouched**

Run: `git diff --stat <BASE>..HEAD -- packages/rules reference/`
Expected: no output.

- [ ] **The oracle still passes**

Run: `npm test -w @passtally/rules 2>&1 | grep -ci oracle`
Expected: non-zero — the oracle tests are still present and passing. The client must not have disturbed plan 1's guarantee.

---

## Self-Review Notes

Checked against the spec section by section:

- §2 architecture, no server, module layout → Tasks 1–7
- §2 Session seam → Task 2
- §3 client holds no rules → enforced by the Verification grep; the tentative overlay clones `Game` rather than reimplementing anything
- §4 view model and redaction → Task 1, with a mutation check on the redaction test
- §5 tentative turns, spent piles, reveal timing, setup not tentative → Tasks 2 and 4
- §6 six-state machine and input map → Tasks 5 and 7
- §7 hit-testing and the orientation trap → Tasks 3 and 4
- §8 layout, tray, elevation encoding, rail, rendering split → Tasks 6 and 7
- §9 snake draft, tie-break, board size from the view → Tasks 1 and 2
- §10 testing, in the spec's stated order → Tasks 1–5, plus the manual pass in Task 7

Deliberately out of scope, per the spec's non-goals: hover preview, path highlighting, scoring breakdowns, the passes-to-VP curve display, animation beyond the rejection shake, and everything in tier 3.
