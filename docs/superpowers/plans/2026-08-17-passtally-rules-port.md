# Passtally Rules Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 833-line Python Passtally engine to `packages/rules` in TypeScript, verified against the Python engine as a differential oracle.

**Architecture:** An npm workspaces monorepo. `packages/rules` is a dependency-free TypeScript port of the existing engine, module for module. The Python engine stays in `passtally/` as a reference implementation and generates oracle fixtures — random playouts with a portable per-action state digest — which the TS suite replays and must match exactly.

**Tech Stack:** TypeScript (strict), Vitest, npm workspaces. No runtime dependencies in `packages/rules`. Python 3.12 for the oracle generator only.

**This is plan 1 of 2.** Plan 2 builds `packages/client` against this package. This plan is complete when the oracle passes.

**Spec:** `docs/superpowers/specs/2026-08-17-passtally-client-tier1-design.md`
**Rules authority:** `docs/superpowers/specs/2026-08-15-passtally-engine-design.md` — language-agnostic, still the authority on behaviour.
**Source to port:** `passtally/*.py` (833 lines), `tests/*.py` (1,138 lines).

## Global Constraints

- **Node 20+ and npm 10+ required.** Verify with `node --version` before Task 1; if absent, stop and report — this plan cannot proceed without it.
- **TypeScript strict mode.** `"strict": true`, `"noUncheckedIndexedAccess": true`.
- **`packages/rules` has zero runtime dependencies** and no knowledge of rendering, DOM, or network.
- **`Side` values are exactly `N=0, E=1, S=2, W=3`** — clockwise. `opposite` is `(v+2)%4`, a 90° clockwise turn is `(v+1)%4`. Every rotation depends on this ordering.
- **Rows increase downward**, so `Side.N` is `(-1, 0)`.
- **Every rule constant lives in `config.ts`.** No module may assume board size 6.
- **Do not modify `passtally/*.py` or `tests/*.py`.** The Python engine is the oracle; changing it invalidates the comparison.
- Commit after every task.

---

## Translation Rules

These apply to every task. They are the only non-mechanical decisions in the port.

**T1 — `@dataclass` → interface plus factory.** A Python dataclass becomes a TS `interface` and a `makeX()` factory that supplies defaults. Mutable dataclasses stay mutable objects; do not reach for classes except where the Python used one (`Ring`, `Game`).

**T2 — `Enum` → numeric union plus const object.**

```ts
export const Side = { N: 0, E: 1, S: 2, W: 3 } as const;
export type Side = 0 | 1 | 2 | 3;
```

`Side.opposite` and `.rotated()` were methods in Python; they become free functions `opposite(s)` and `rotated(s, quarterTurns)` because a numeric union cannot carry methods.

**T3 — `frozenset` → sorted canonical string.** Python's `canon()` returns `frozenset[frozenset[Side]]` for order-independent comparison. TS has no value-equality set, so `canon()` returns a **string**: each pair sorted ascending, the pairs sorted lexicographically, joined. `"0,2|1,3"` for the X shape. Strings compare and hash by value in JS, which is exactly what was needed.

**T4 — `copy.deepcopy` → hand-written structural clone.** The engine's final review measured `deepcopy` at ~507µs and named a hand-written clone as the first optimisation. Write it properly here; do not reach for `structuredClone`, which would copy the same way and hide the cost.

**T5 — `random.Random(seed)` → mulberry32.** No stdlib seeded PRNG exists in TS. **Python seeds will NOT reproduce the same deal** — this is expected and is why oracle fixtures record dealt piles explicitly rather than seeds.

**T6 — Python `_privateMethod` → TS `private` or module-private.** `Game._partner_offset` becomes an exported free function `partnerOffset(board, row, col)` in `board.ts`, per the spec: the client needs it for tile outlines, so it is not private any more.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `package.json` (root) | npm workspaces declaration |
| `tsconfig.base.json` | shared strict compiler options |
| `packages/rules/package.json` | package manifest, Vitest script |
| `packages/rules/src/types.ts` | `Side`, `Result`, `Pos`, `TypeId`, `Move`, `DELTA`, `step`, `orthogonallyAdjacent`, `opposite`, `rotated` |
| `packages/rules/src/config.ts` | every rule constant |
| `packages/rules/src/rng.ts` | mulberry32 + seeded Fisher–Yates shuffle |
| `packages/rules/src/ring.ts` | `Ring` |
| `packages/rules/src/board.ts` | `Cell`, `Slot`, `Board`, `buildRing`, `slotIndexOf`, `partnerOffset`, `follow` |
| `packages/rules/src/tileTypes.ts` | 6 designs, validator, `canon`, `shapeOf`, `rotConns`, `resolve`, `offsetOf`, `distinctOrientations` |
| `packages/rules/src/placement.ts` | `canPlace`, `placeTile` |
| `packages/rules/src/trace.ts` | `traceFrom`, `trace`, `passesToVp`, `scoreLines`, `scoreFor` |
| `packages/rules/src/markers.ts` | `markerDestination` |
| `packages/rules/src/game.ts` | `Pile`, `Player`, `Game` |
| `packages/rules/src/digest.ts` | portable state digest for the oracle |
| `packages/rules/src/index.ts` | public exports |
| `tools/gen_oracle.py` | Python side of the oracle: playouts → fixtures |
| `packages/rules/test/*.test.ts` | ported suite + oracle replay |

---

### Task 1: Monorepo scaffold, types, config, and seeded RNG

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore` additions
- Create: `packages/rules/package.json`, `packages/rules/tsconfig.json`
- Create: `packages/rules/src/types.ts`, `packages/rules/src/config.ts`, `packages/rules/src/rng.ts`
- Test: `packages/rules/test/types.test.ts`, `packages/rules/test/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Side` (const + type), `opposite(s)`, `rotated(s, k)`, `Result`, `Pos`, `TypeId`, `PlaceTile`, `MoveMarker`, `Move`, `DELTA`, `step(pos, side)`, `orthogonallyAdjacent(a, b)`; all config constants; `makeRng(seed)` returning `{ next(): number; shuffle<T>(arr: T[]): void }`.

- [ ] **Step 1: Verify the toolchain**

Run: `node --version && npm --version`
Expected: Node 20+ and npm 10+. If either is missing or older, **stop and report BLOCKED** — do not attempt to install anything.

- [ ] **Step 2: Create the workspace scaffold**

`package.json`:

```json
{
  "name": "passtally-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true
  }
}
```

Root `tsconfig.json` — **required**, because `tsc -b` with no arguments looks for
`tsconfig.json` in the cwd and fails with TS5083 if only `tsconfig.base.json` exists. Project
references are used rather than a path argument because plan 2 adds a second package:

```json
{
  "files": [],
  "references": [{ "path": "packages/rules" }]
}
```

`packages/rules/package.json`:

```json
{
  "name": "@passtally/rules",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": { "test": "vitest run" }
}
```

`packages/rules/tsconfig.json` — `composite` is required by project references. **Do not set
`"rootDir": "src"`**: `include` covers `test` too, and files outside `rootDir` fail with TS6059.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": ".", "outDir": "dist" },
  "include": ["src", "test"]
}
```

Append to `.gitignore` — `dist/` is already there from the Python packaging block, so add only:

```text
node_modules/
```

Run `npm install`, then **verify with the actual script**: `npm run typecheck`. Checking an
equivalent command with an explicit path does not prove the script works.

- [ ] **Step 3: Write the failing tests**

`packages/rules/test/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DELTA, Side, opposite, orthogonallyAdjacent, rotated, step,
} from "../src/types.js";

const ALL: Side[] = [Side.N, Side.E, Side.S, Side.W];

describe("Side", () => {
  it("is clockwise N=0 E=1 S=2 W=3", () => {
    expect([Side.N, Side.E, Side.S, Side.W]).toEqual([0, 1, 2, 3]);
  });

  it.each(ALL)("opposite is an involution (%i)", (s) => {
    expect(opposite(opposite(s))).toBe(s);
  });

  it.each(ALL)("opposite is never self (%i)", (s) => {
    expect(opposite(s)).not.toBe(s);
  });

  it.each(ALL)("four quarter turns is identity (%i)", (s) => {
    expect(rotated(s, 4)).toBe(s);
  });

  it("one quarter turn is clockwise", () => {
    expect(rotated(Side.N, 1)).toBe(Side.E);
    expect(rotated(Side.E, 1)).toBe(Side.S);
    expect(rotated(Side.S, 1)).toBe(Side.W);
    expect(rotated(Side.W, 1)).toBe(Side.N);
  });

  it.each(ALL)("two quarter turns equals opposite (%i)", (s) => {
    expect(rotated(s, 2)).toBe(opposite(s));
  });

  // JS `%` keeps the sign of the dividend where Python's does not, which is
  // why `rotated` adds +4 before the final modulo. Without these cases,
  // dropping that guard makes rotated(N, -1) return -1 and no test notices.
  it.each(ALL)("negative turns match their positive equivalent (%i)", (s) => {
    expect(rotated(s, -1)).toBe(rotated(s, 3));
    expect(rotated(s, -2)).toBe(rotated(s, 2));
    expect(rotated(s, -4)).toBe(s);
  });

  it.each(ALL)("never leaves the 0..3 range (%i)", (s) => {
    for (let k = -8; k <= 8; k++) expect([0, 1, 2, 3]).toContain(rotated(s, k));
  });
});

describe("geometry", () => {
  it("treats north as decreasing row", () => {
    expect(DELTA[Side.N]).toEqual([-1, 0]);
    expect(DELTA[Side.E]).toEqual([0, 1]);
    expect(DELTA[Side.S]).toEqual([1, 0]);
    expect(DELTA[Side.W]).toEqual([0, -1]);
  });

  it("steps by the delta", () => {
    expect(step([3, 3], Side.N)).toEqual([2, 3]);
    expect(step([3, 3], Side.W)).toEqual([3, 2]);
  });

  it("detects orthogonal adjacency", () => {
    expect(orthogonallyAdjacent([1, 1], [1, 2])).toBe(true);
    expect(orthogonallyAdjacent([1, 1], [0, 1])).toBe(true);
    expect(orthogonallyAdjacent([1, 1], [1, 1])).toBe(false);
    expect(orthogonallyAdjacent([1, 1], [2, 2])).toBe(false);
    expect(orthogonallyAdjacent([1, 1], [1, 3])).toBe(false);
  });
});
```

`packages/rules/test/rng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRng } from "../src/rng.js";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42), b = makeRng(42);
    const xs = [a.next(), a.next(), a.next()];
    const ys = [b.next(), b.next(), b.next()];
    expect(xs).toEqual(ys);
  });

  it("differs across seeds", () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it("produces values in [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffles deterministically and preserves the multiset", () => {
    const a = [...Array(42).keys()], b = [...Array(42).keys()];
    makeRng(9).shuffle(a);
    makeRng(9).shuffle(b);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(42).keys()]);
  });

  it("actually reorders", () => {
    const a = [...Array(42).keys()];
    makeRng(3).shuffle(a);
    expect(a).not.toEqual([...Array(42).keys()]);
  });

  // Without this, a shuffle that ignored the seed entirely -- always applying
  // a fixed permutation such as arr.reverse() -- would pass every other test
  // here: deterministic, multiset-preserving, and not the identity.
  it("depends on the seed", () => {
    const a = [...Array(42).keys()], b = [...Array(42).keys()];
    makeRng(1).shuffle(a);
    makeRng(2).shuffle(b);
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/types.js` or `../src/rng.js`.

- [ ] **Step 5: Write `packages/rules/src/types.ts`**

Port `passtally/types.py`. Apply T2 — the enum becomes a const object plus a union, and the two `Side` methods become free functions.

```ts
export type Pos = [row: number, col: number];
export type TypeId = 1 | 2 | 3 | 4 | 5 | 6;

export const Side = { N: 0, E: 1, S: 2, W: 3 } as const;
export type Side = 0 | 1 | 2 | 3;

/** The face directly across the cell. */
export function opposite(s: Side): Side {
  return ((s + 2) % 4) as Side;
}

/** Rotate clockwise by `quarterTurns` 90-degree steps. */
export function rotated(s: Side, quarterTurns: number): Side {
  return (((s + quarterTurns) % 4) + 4) % 4 as Side;
}

/** Non-slot outcomes of a trace. */
export const Result = { DEAD: "dead", LOOP: "loop" } as const;
export type Result = "dead" | "loop";

/** Rows increase downward, so N is (-1, 0). */
export const DELTA: Record<Side, Pos> = {
  [Side.N]: [-1, 0],
  [Side.E]: [0, 1],
  [Side.S]: [1, 0],
  [Side.W]: [0, -1],
};

export function step(pos: Pos, side: Side): Pos {
  const [dr, dc] = DELTA[side];
  return [pos[0] + dr, pos[1] + dc];
}

export function orthogonallyAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export type PlaceTile = {
  kind: "place";
  pileIndex: number;
  cellA: Pos;
  cellB: Pos;
  orientation: number;
};

export type MoveMarker = {
  kind: "marker";
  markerIndex: number;   // index within the player's own markerSlots, 0..3
  distance: number;      // signed; sign is direction around the ring
};

export type Move = PlaceTile | MoveMarker;
```

Note `rotated` adds `+ 4` before the final modulo so negative quarter turns behave; Python's `%` already does this, JS's does not.

- [ ] **Step 6: Write `packages/rules/src/config.ts`**

Port `passtally/config.py` verbatim, preserving every `TODO` comment.

```ts
/** Every rule constant for the engine. Nothing else belongs here. */

/** Board dimension. Parameterised everywhere; nothing may assume this value. */
export const N = 6; // TODO: verify against rulebook

/** Whether markers may travel around a corner onto the adjacent edge. */
export const RING_CONTINUOUS = true; // TODO: verify against rulebook

/** The rules give two contradictory end-of-game timings; we implement the
 *  round-completion path. This flag marks the unimplemented alternative. */
export const END_IMMEDIATELY_ON_EMPTY = false; // TODO: verify against rulebook

export const N_PILES = 3;
export const COPIES_PER_TYPE = 7;
export const TILES_PER_PILE = 14;
export const ACTIONS_PER_TURN = 2;
export const MARKERS_PER_PLAYER = 4;
export const MARKER_DISTANCES = [-2, -1, 1, 2] as const;

/** (minPasses, victoryPoints), ascending. Look up by taking the last entry
 *  whose minPasses <= total. Band widths are the natural numbers, so every
 *  threshold is 1 + n(n-1)/2 -- but the top band breaks the pattern by jumping
 *  to 15 VP, so this stays a literal table rather than a formula. */
export const PASSES_TO_VP: readonly (readonly [number, number])[] = [
  [0, 0], [1, 1], [2, 2], [4, 3], [7, 4], [11, 5], [16, 6],
  [22, 7], [29, 8],
  [37, 9], // TODO: source table read "31-45", which overlapped "29-36"
  [46, 10], [56, 15],
];
```

- [ ] **Step 7: Write `packages/rules/src/rng.ts`**

New code — T5. There is no Python original.

```ts
/** Seeded PRNG. Python's random.Random does not port, so deals are NOT
 *  reproducible across the two engines -- oracle fixtures record dealt piles
 *  explicitly rather than seeds. */

export type Rng = {
  next(): number;
  shuffle<T>(arr: T[]): void;
};

/** mulberry32 -- small, fast, good enough for dealing tiles. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    shuffle<T>(arr: T[]): void {
      // Fisher-Yates, descending.
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
    },
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @passtally/rules`
Expected: PASS — all types and rng tests green.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json .gitignore packages/
git commit -m "feat(rules): monorepo scaffold, core types, config, and seeded RNG"
```

---

### Task 2: Ring and board

**Files:**
- Create: `packages/rules/src/ring.ts`, `packages/rules/src/board.ts`
- Test: `packages/rules/test/ring.test.ts`, `packages/rules/test/board.test.ts`

**Interfaces:**
- Consumes: `Side`, `Pos` from `types.ts`; `RING_CONTINUOUS` from `config.ts`.
- Produces: `class Ring` with `n`, `size`, `continuous`, `move(slot, distance): number`; `Cell` interface `{ placementId: number | null; height: number; conns: [Side, Side][] }`; `makeCell()`; `follow(cell, entry): Side | null`; `Slot` interface `{ row, col, side, occupant: number | null }`; `buildRing(n): Slot[]`; `slotIndexOf(n, row, col, side): number`; `Board` interface `{ n, cells: Cell[][], ring: Slot[], nav: Ring, nextPlacementId: number }`; `emptyBoard(n): Board`; `inBounds(board, pos): boolean`; `at(board, pos): Cell`; `partnerOffset(board, row, col): Pos | null`.

Port `passtally/ring.py` (38 lines) and `passtally/board.py` (82 lines). Apply T1 for `Cell`, `Slot` and `Board`; keep `Ring` a class as in Python. `Cell.follow` was a method — it becomes the free function `follow(cell, entry)` per T1.

`partnerOffset` is **new to this module** — T6. It is `Game._partner_offset` from `passtally/game.py`, moved here because the client needs it for tile outlines. Its body is unchanged: scan the four orthogonal neighbours for one sharing this cell's `placementId`, return that offset, else `null`.

**Ring layout, clockwise from the top-left, `4n` slots:**

| slots | edge | cells | side |
| ----- | ---- | ----- | ---- |
| `0 .. n-1` | north | `(0,0)` → `(0,n-1)` | `N` |
| `n .. 2n-1` | east | `(0,n-1)` → `(n-1,n-1)` | `E` |
| `2n .. 3n-1` | south | `(n-1,n-1)` → `(n-1,0)` | `S` |
| `3n .. 4n-1` | west | `(n-1,0)` → `(0,0)` | `W` |

Corner cells legitimately appear twice under two different sides.

- [ ] **Step 1: Write the failing tests**

`packages/rules/test/ring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Ring } from "../src/ring.js";

describe("Ring", () => {
  it("has size 4n", () => expect(new Ring(6).size).toBe(24));

  it("wraps forward", () => {
    const r = new Ring(6);
    expect(r.move(23, 1)).toBe(0);
    expect(r.move(22, 3)).toBe(1);
  });

  it("wraps backward", () => {
    const r = new Ring(6);
    expect(r.move(0, -1)).toBe(23);
    expect(r.move(1, -3)).toBe(22);
  });

  it("move by zero is identity", () => expect(new Ring(6).move(7, 0)).toBe(7));

  it("rejects the discontinuous ring", () => {
    expect(() => new Ring(6, false)).toThrow(/not implemented/i);
  });
});
```

`packages/rules/test/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  at, buildRing, emptyBoard, follow, inBounds, makeCell, partnerOffset, slotIndexOf,
} from "../src/board.js";
import { Side } from "../src/types.js";

const SIZES = [4, 5, 6, 7, 8];

describe("ring construction", () => {
  it.each(SIZES)("slot index round-trips exhaustively (n=%i)", (n) => {
    const ring = buildRing(n);
    expect(ring.length).toBe(4 * n);
    ring.forEach((slot, i) => {
      expect(slotIndexOf(n, slot.row, slot.col, slot.side)).toBe(i);
    });
  });

  it.each(SIZES)("every slot is on the border (n=%i)", (n) => {
    for (const s of buildRing(n)) {
      expect(s.row === 0 || s.row === n - 1 || s.col === 0 || s.col === n - 1).toBe(true);
    }
  });

  it.each(SIZES)("ring entries are unique (n=%i)", (n) => {
    const seen = new Set(buildRing(n).map((s) => `${s.row},${s.col},${s.side}`));
    expect(seen.size).toBe(4 * n);
  });

  it("puts a corner cell under two sides", () => {
    const sides = buildRing(6).filter((s) => s.row === 0 && s.col === 0).map((s) => s.side);
    expect(new Set(sides)).toEqual(new Set([Side.N, Side.W]));
  });

  it("starts at top-left going clockwise", () => {
    const r = buildRing(6);
    expect([r[0]!.row, r[0]!.col, r[0]!.side]).toEqual([0, 0, Side.N]);
    expect([r[6]!.row, r[6]!.col, r[6]!.side]).toEqual([0, 5, Side.E]);
    expect([r[12]!.row, r[12]!.col, r[12]!.side]).toEqual([5, 5, Side.S]);
    expect([r[18]!.row, r[18]!.col, r[18]!.side]).toEqual([5, 0, Side.W]);
  });
});

describe("board", () => {
  it("starts empty", () => {
    const b = emptyBoard(6);
    expect(b.n).toBe(6);
    expect(b.cells.flat().every((c) => c.height === 0 && c.placementId === null)).toBe(true);
    expect(b.ring.every((s) => s.occupant === null)).toBe(true);
  });

  it("knows its bounds", () => {
    const b = emptyBoard(6);
    expect(inBounds(b, [0, 0])).toBe(true);
    expect(inBounds(b, [5, 5])).toBe(true);
    expect(inBounds(b, [-1, 0])).toBe(false);
    expect(inBounds(b, [6, 0])).toBe(false);
    expect(inBounds(b, [0, 6])).toBe(false);
  });

  it("returns null partner for an empty cell", () => {
    expect(partnerOffset(emptyBoard(6), 0, 0)).toBeNull();
  });
});

/** partnerOffset's neighbour scan needs its own coverage: the empty-cell case
 *  above returns on the function's first line and never reaches the loop, so a
 *  swapped [dr,dc], a wrong delta order or an inverted bounds check would go
 *  unnoticed. Cells are built by hand because placeTile does not exist yet. */
describe("partnerOffset", () => {
  function withTile(n: number, a: [number, number], b: [number, number], pid = 7) {
    const board = emptyBoard(n);
    for (const [r, c] of [a, b]) {
      const cell = board.cells[r]![c]!;
      cell.placementId = pid;
      cell.height = 1;
    }
    return board;
  }

  it("finds a horizontal partner from both sides", () => {
    const b = withTile(6, [2, 2], [2, 3]);
    expect(partnerOffset(b, 2, 2)).toEqual([0, 1]);
    expect(partnerOffset(b, 2, 3)).toEqual([0, -1]);
  });

  it("finds a vertical partner from both sides", () => {
    const b = withTile(6, [2, 2], [3, 2]);
    expect(partnerOffset(b, 2, 2)).toEqual([1, 0]);
    expect(partnerOffset(b, 3, 2)).toEqual([-1, 0]);
  });

  it("returns null when the partner has been buried", () => {
    // One half covered by a later tile, so the ids no longer match.
    const b = withTile(6, [2, 2], [2, 3]);
    b.cells[2]![3]!.placementId = 9;
    expect(partnerOffset(b, 2, 2)).toBeNull();
  });

  it("does not look off the board", () => {
    const b = emptyBoard(6);
    const cell = b.cells[0]![0]!;
    cell.placementId = 7;
    cell.height = 1;
    expect(partnerOffset(b, 0, 0)).toBeNull();
  });
});

describe("follow", () => {
  it("matches either end of a pair", () => {
    const c = makeCell({
      placementId: 1, height: 1,
      conns: [[Side.N, Side.W], [Side.S, Side.E]],
    });
    expect(follow(c, Side.N)).toBe(Side.W);
    expect(follow(c, Side.W)).toBe(Side.N);
    expect(follow(c, Side.S)).toBe(Side.E);
    expect(follow(c, Side.E)).toBe(Side.S);
  });

  it("returns null when the face is absent", () => {
    const c = makeCell({ placementId: 1, height: 1, conns: [[Side.N, Side.S]] });
    expect(follow(c, Side.E)).toBeNull();
    expect(follow(makeCell(), Side.N)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/ring.js` / `../src/board.js`.

- [ ] **Step 3: Write `packages/rules/src/ring.ts`**

```ts
import { RING_CONTINUOUS } from "./config.js";

/** The border ring. This class is the single seam for the corner-continuity
 *  rule: if markers turn out to be blocked at corners, only `move` changes. */
export class Ring {
  readonly n: number;
  readonly size: number;
  readonly continuous: boolean;

  constructor(n: number, continuous: boolean = RING_CONTINUOUS) {
    if (!continuous) {
      // Wording matters: the test matches /not implemented/i. Python's test
      // matched on the exception TYPE (NotImplementedError), which JS has no
      // equivalent of, so the message carries the contract here.
      throw new Error(
        "Discontinuous ring is not implemented. To block markers at corners, " +
          "reimplement Ring.move -- no other module needs to change.",
      );
    }
    this.n = n;
    this.size = 4 * n;
    this.continuous = continuous;
  }

  /** Raw ring arithmetic. Ignores occupancy -- see markerDestination. */
  move(slot: number, distance: number): number {
    return (((slot + distance) % this.size) + this.size) % this.size;
  }
}
```

The double modulo is required: JS `%` keeps the sign of the dividend, Python's does not.

- [ ] **Step 4: Write `packages/rules/src/board.ts`**

Port `passtally/board.py`, then append `partnerOffset` moved from `passtally/game.py`.

```ts
import { Ring } from "./ring.js";
import type { Pos, Side } from "./types.js";

export type Cell = {
  placementId: number | null;   // instance id of the TOP tile
  height: number;               // 0 == empty; otherwise the level of the top tile
  conns: [Side, Side][];
};

export function makeCell(init: Partial<Cell> = {}): Cell {
  return { placementId: null, height: 0, conns: [], ...init };
}

/** The face a line entering through `entry` leaves by, or null. */
export function follow(cell: Cell, entry: Side): Side | null {
  for (const [a, b] of cell.conns) {
    if (a === entry) return b;
    if (b === entry) return a;
  }
  return null;
}

export type Slot = {
  row: number;
  col: number;
  side: Side;            // the board edge this slot faces
  occupant: number | null;  // marker id
};

/** Clockwise from the top-left corner. Corner cells appear twice. */
export function buildRing(n: number): Slot[] {
  const slots: Slot[] = [];
  for (let c = 0; c < n; c++) slots.push({ row: 0, col: c, side: 0, occupant: null });
  for (let r = 0; r < n; r++) slots.push({ row: r, col: n - 1, side: 1, occupant: null });
  for (let c = n - 1; c >= 0; c--) slots.push({ row: n - 1, col: c, side: 2, occupant: null });
  for (let r = n - 1; r >= 0; r--) slots.push({ row: r, col: 0, side: 3, occupant: null });
  return slots;
}

/** Inverse of buildRing. Caller must guarantee the cell is on that edge. */
export function slotIndexOf(n: number, row: number, col: number, side: Side): number {
  if (side === 0) return col;
  if (side === 1) return n + row;
  if (side === 2) return 2 * n + (n - 1 - col);
  return 3 * n + (n - 1 - row);
}

export type Board = {
  n: number;
  cells: Cell[][];
  ring: Slot[];
  nav: Ring;
  nextPlacementId: number;
};

export function emptyBoard(n: number): Board {
  return {
    n,
    cells: Array.from({ length: n }, () => Array.from({ length: n }, () => makeCell())),
    ring: buildRing(n),
    nav: new Ring(n),
    nextPlacementId: 1,
  };
}

export function inBounds(board: Board, pos: Pos): boolean {
  const [r, c] = pos;
  return r >= 0 && r < board.n && c >= 0 && c < board.n;
}

export function at(board: Board, pos: Pos): Cell {
  return board.cells[pos[0]]![pos[1]]!;
}

/** Offset of the neighbour sharing this cell's top placement id.
 *
 *  Raw placement ids depend on move order, so they cannot go in a canonical
 *  key -- the offset carries the same information canonically. Moved here from
 *  Game so the client can also draw 1x2 tile outlines. */
export function partnerOffset(board: Board, row: number, col: number): Pos | null {
  const cell = board.cells[row]![col]!;
  if (cell.placementId === null) return null;
  const deltas: Pos[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nb: Pos = [row + dr, col + dc];
    if (inBounds(board, nb) && at(board, nb).placementId === cell.placementId) {
      return [dr, dc];
    }
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @passtally/rules`
Expected: PASS — including the exhaustive round-trip for n in 4..8.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/ring.ts packages/rules/src/board.ts packages/rules/test/ring.test.ts packages/rules/test/board.test.ts
git commit -m "feat(rules): port ring and board, promote partnerOffset"
```

---

### Task 3: Tile types, validator, and rotation cache

**Files:**
- Create: `packages/rules/src/tileTypes.ts`
- Test: `packages/rules/test/tileTypes.test.ts`

**Interfaces:**
- Consumes: `Side`, `TypeId`, `Pos`, `DELTA`, `rotated` from `types.ts`.
- Produces: `TILE_TYPES: Record<TypeId, [CellConns, CellConns]>` where `CellConns = [Side, Side][]`; `ORIENTATIONS = [0,1,2,3]`; `canon(conns): string`; `shapeOf(conns): "X" | "A" | "B"`; `rotConns(conns, k): CellConns`; `resolve(typeId, orientation): [CellConns, CellConns]`; `offsetOf(orientation): Pos`; `distinctOrientations(typeId): number[]`.

Port `passtally/tile_types.py` (135 lines). **Apply T3**: `canon` returns a sorted canonical **string**, not a frozenset.

The six designs are real game data — copy them exactly from `passtally/tile_types.py:21-28`. Canonical orientation is vertical, cell B south of cell A.

**The dedupe result must be exactly `{1:4, 2:2, 3:4, 4:4, 5:2, 6:2}`.** If your counts differ, stop and report — do not adjust the expectation.

- [ ] **Step 1: Write the failing test**

`packages/rules/test/tileTypes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canon, distinctOrientations, offsetOf, ORIENTATIONS, resolve, rotConns,
  shapeOf, TILE_TYPES,
} from "../src/tileTypes.js";
import { Side } from "../src/types.js";
import type { TypeId } from "../src/types.js";

const IDS: TypeId[] = [1, 2, 3, 4, 5, 6];

describe("tile data", () => {
  it("has six designs", () => {
    expect(Object.keys(TILE_TYPES).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("matches the spec shape table", () => {
    const actual = Object.fromEntries(
      IDS.map((t) => [t, [shapeOf(TILE_TYPES[t][0]), shapeOf(TILE_TYPES[t][1])]]),
    );
    expect(actual).toEqual({
      1: ["B", "A"], 2: ["X", "X"], 3: ["X", "A"],
      4: ["X", "B"], 5: ["B", "B"], 6: ["A", "A"],
    });
  });

  it("covers all six unordered shape pairs", () => {
    const pairs = new Set(
      IDS.map((t) => [shapeOf(TILE_TYPES[t][0]), shapeOf(TILE_TYPES[t][1])].sort().join("")),
    );
    expect(pairs.size).toBe(6);
  });

  it("rejects a cell that is not a perfect matching", () => {
    expect(() => shapeOf([[Side.N, Side.E]])).toThrow(/perfect matching/i);
  });
});

describe("rotation", () => {
  it.each(IDS)("every resolved cell is a perfect matching (tile %i)", (t) => {
    for (const o of ORIENTATIONS) {
      for (const conns of resolve(t, o)) {
        expect(["X", "A", "B"]).toContain(shapeOf(conns));
        const faces = conns.flat().sort();
        expect(faces).toEqual([0, 1, 2, 3]);
      }
    }
  });

  // NOTE: the Python original of this test was VACUOUS -- it wrote
  // `for turns in (0, 4, 8): resolve(tid, turns % 4)`, which is 0 every time,
  // so it never rotated anything.
  //
  // A four-turn round trip ALONE is also vacuous: applying any function four
  // times returns to the start when that function is the identity, so a no-op
  // rotConns passes it. The shape-transition cases below are what actually
  // bite. Note X is genuinely rotation-invariant, so "one turn always changes
  // the cell" would be a wrong assertion in the other direction.
  const TURNED: Record<string, "X" | "A" | "B"> = { X: "X", A: "B", B: "A" };

  it.each(IDS)("rotates every cell's shape correctly (tile %i)", (t) => {
    for (const cell of TILE_TYPES[t]) {
      const shape = shapeOf(cell);
      expect(shapeOf(rotConns(cell, 1))).toBe(TURNED[shape]);
      expect(shapeOf(rotConns(cell, 2))).toBe(shape);          // 180-invariant
      expect(shapeOf(rotConns(cell, 3))).toBe(TURNED[shape]);
      expect(canon(rotConns(cell, 4))).toBe(canon(cell));      // round trip
    }
  });

  it("swaps A and B on an odd number of turns", () => {
    const aCell: [Side, Side][] = [[Side.N, Side.E], [Side.S, Side.W]];
    expect(shapeOf(aCell)).toBe("A");
    expect(shapeOf(rotConns(aCell, 1))).toBe("B");
    expect(shapeOf(rotConns(aCell, 2))).toBe("A");
    expect(shapeOf(rotConns(aCell, 3))).toBe("B");
  });

  it("leaves the cross shape unchanged", () => {
    const xCell: [Side, Side][] = [[Side.N, Side.S], [Side.E, Side.W]];
    for (const k of ORIENTATIONS) expect(shapeOf(rotConns(xCell, k))).toBe("X");
  });

  it("follows the orientation offset convention", () => {
    expect(offsetOf(0)).toEqual([1, 0]);
    expect(offsetOf(1)).toEqual([0, -1]);
    expect(offsetOf(2)).toEqual([-1, 0]);
    expect(offsetOf(3)).toEqual([0, 1]);
  });
});

describe("orientation dedupe", () => {
  it("counts 4,2,4,4,2,2", () => {
    const counts = Object.fromEntries(IDS.map((t) => [t, distinctOrientations(t).length]));
    expect(counts).toEqual({ 1: 4, 2: 2, 3: 4, 4: 4, 5: 2, 6: 2 });
  });

  it("keeps the first of each equivalent pair", () => {
    expect(distinctOrientations(2)).toEqual([0, 1]);
    expect(distinctOrientations(5)).toEqual([0, 1]);
    expect(distinctOrientations(6)).toEqual([0, 1]);
    expect(distinctOrientations(1)).toEqual([0, 1, 2, 3]);
  });
});

describe("canon", () => {
  it("is order-independent", () => {
    const a: [Side, Side][] = [[Side.N, Side.S], [Side.E, Side.W]];
    const b: [Side, Side][] = [[Side.W, Side.E], [Side.S, Side.N]];
    expect(canon(a)).toBe(canon(b));
  });

  it("distinguishes different matchings", () => {
    expect(canon([[Side.N, Side.S], [Side.E, Side.W]]))
      .not.toBe(canon([[Side.N, Side.E], [Side.S, Side.W]]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/tileTypes.js`.

- [ ] **Step 3: Write `packages/rules/src/tileTypes.ts`**

```ts
/** The six tile designs, and everything derived from them at module load.
 *
 *  Canonical orientation is vertical: cell B lies to the SOUTH of cell A, and
 *  the shared seam is cell A's S face against cell B's N face.
 *
 *  Every cell pairs all four faces exactly once, so a cell is one of only three
 *  shapes: X (N-S, E-W), A (N-E, S-W), B (N-W, S-E). The shape vocabulary lives
 *  here and nowhere else -- it validates the data and drives orientation dedupe,
 *  while the engine reads the general `conns` form and stays data-agnostic. */

import { DELTA, rotated, Side } from "./types.js";
import type { Pos, TypeId } from "./types.js";

export type CellConns = [Side, Side][];

const N = Side.N, E = Side.E, S = Side.S, W = Side.W;

export const TILE_TYPES: Record<TypeId, [CellConns, CellConns]> = {
  1: [[[W, N], [S, E]], [[N, E], [W, S]]],
  2: [[[N, S], [E, W]], [[N, S], [E, W]]],
  3: [[[N, S], [E, W]], [[N, E], [S, W]]],
  4: [[[N, S], [E, W]], [[S, E], [N, W]]],
  5: [[[S, E], [N, W]], [[S, E], [N, W]]],
  6: [[[N, E], [S, W]], [[N, E], [S, W]]],
};

export const ORIENTATIONS = [0, 1, 2, 3] as const;

// Orientation k is k quarter-turns clockwise from canonical, so the A->B
// direction rotates with it: canonical S, then W, N, E.
const DIRECTION: Record<number, Side> = Object.fromEntries(
  ORIENTATIONS.map((k) => [k, rotated(Side.S, k)]),
);
const OFFSET: Record<number, Pos> = Object.fromEntries(
  ORIENTATIONS.map((k) => [k, DELTA[DIRECTION[k]!]]),
);

/** Order-independent canonical form. T3: a sorted string, because TS has no
 *  value-equality set. Each pair sorted ascending, pairs sorted lexically. */
export function canon(conns: CellConns): string {
  return conns
    .map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`))
    .sort()
    .join("|");
}

const SHAPES: Record<string, "X" | "A" | "B"> = {
  [canon([[N, S], [E, W]])]: "X",
  [canon([[N, E], [S, W]])]: "A",
  [canon([[N, W], [S, E]])]: "B",
};

/** X, A or B. Throws if the cell is not a perfect matching of all four faces. */
export function shapeOf(conns: CellConns): "X" | "A" | "B" {
  const shape = SHAPES[canon(conns)];
  if (shape === undefined) {
    throw new Error(
      `cell ${JSON.stringify(conns)} is not a perfect matching of N/E/S/W -- ` +
        "every cell must pair up all four faces exactly once",
    );
  }
  return shape;
}

/** Rotate a cell's connections clockwise. Each pair sorted for canonicity. */
export function rotConns(conns: CellConns, quarterTurns: number): CellConns {
  return conns.map(([a, b]) => {
    const ra = rotated(a, quarterTurns), rb = rotated(b, quarterTurns);
    return (ra < rb ? [ra, rb] : [rb, ra]) as [Side, Side];
  });
}

/** Fail loudly at load if the tile data violates its invariants. */
function validate(): void {
  const seen = new Set<string>();
  for (const key of Object.keys(TILE_TYPES)) {
    const t = Number(key) as TypeId;
    const [a, b] = TILE_TYPES[t];
    const pair = [shapeOf(a), shapeOf(b)].sort().join("");
    if (seen.has(pair)) throw new Error(`tile ${t} duplicates the shape pair ${pair}`);
    seen.add(pair);
  }
  if (seen.size !== 6) {
    throw new Error(`expected all 6 unordered shape pairs, got ${seen.size}`);
  }
}
validate();

const RESOLVED = new Map<string, [CellConns, CellConns]>();
for (const key of Object.keys(TILE_TYPES)) {
  const t = Number(key) as TypeId;
  const [a, b] = TILE_TYPES[t];
  for (const k of ORIENTATIONS) {
    RESOLVED.set(`${t}:${k}`, [rotConns(a, k), rotConns(b, k)]);
  }
}

/** Precomputed. The hot loop never rotates anything. */
export function resolve(typeId: TypeId, orientation: number): [CellConns, CellConns] {
  const hit = RESOLVED.get(`${typeId}:${orientation}`);
  if (hit === undefined) throw new Error(`no such tile/orientation: ${typeId}/${orientation}`);
  return hit;
}

/** Offset from cell A to cell B. Needed before a tile is chosen. */
export function offsetOf(orientation: number): Pos {
  const hit = OFFSET[orientation];
  if (hit === undefined) throw new Error(`no such orientation: ${orientation}`);
  return hit;
}

/** Board content this orientation produces, anchored top-left. */
function signature(typeId: TypeId, orientation: number): string {
  const [ca, cb] = resolve(typeId, orientation);
  const [dr, dc] = offsetOf(orientation);
  const cells: [Pos, string][] = [[[0, 0], canon(ca)], [[dr, dc], canon(cb)]];
  cells.sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1]);
  const [br, bc] = cells[0]![0];
  return cells
    .map(([p, c]) => `${p[0] - br},${p[1] - bc}:${c}`)
    .join(";");
}

const DISTINCT: Record<number, number[]> = {};
for (const key of Object.keys(TILE_TYPES)) {
  const t = Number(key) as TypeId;
  const kept: number[] = [];
  const seen = new Set<string>();
  for (const k of ORIENTATIONS) {
    const sig = signature(t, k);
    if (!seen.has(sig)) { seen.add(sig); kept.push(k); }
  }
  DISTINCT[t] = kept;
}

/** Orientations producing distinct board states. Tiles 2, 5 and 6 have only 2. */
export function distinctOrientations(typeId: TypeId): number[] {
  return DISTINCT[typeId]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/rules`
Expected: PASS — especially the `{1:4, 2:2, 3:4, 4:4, 5:2, 6:2}` dedupe counts.

- [ ] **Step 5: Verify the rotation test is not vacuous**

Temporarily make `rotConns` a no-op (`return conns;`), run the suite, and confirm `four single-step rotations return to canonical` and `swaps A and B on an odd number of turns` both **fail**. Restore `rotConns` and confirm they pass. Report both outcomes. Do not commit the temporary change.

The Python original of this test was vacuous and shipped that way — this step exists so the port does not inherit the defect.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/tileTypes.ts packages/rules/test/tileTypes.test.ts
git commit -m "feat(rules): port tile designs, validator, and rotation cache"
```

---

### Task 4: Placement

**Files:**
- Create: `packages/rules/src/placement.ts`
- Test: `packages/rules/test/placement.test.ts`

**Interfaces:**
- Consumes: `Board`, `at`, `inBounds` from `board.ts`; `resolve` from `tileTypes.ts`; `orthogonallyAdjacent`, `Pos`, `TypeId` from `types.ts`.
- Produces: `canPlace(board, posA, posB): boolean` (pure); `placeTile(board, posA, posB, typeId, orientation): number` returning the new placement id.

Port `passtally/placement.py` (43 lines). **`canPlace` takes no tile or orientation** — every cell of every tile carries a line on all four faces, so a connection-continuity check could never fail and was deliberately removed. Do not add one.

- [ ] **Step 1: Write the failing test**

`packages/rules/test/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { at, emptyBoard } from "../src/board.js";
import { canPlace, placeTile } from "../src/placement.js";
import { canon, resolve } from "../src/tileTypes.js";
import { Side } from "../src/types.js";

describe("canPlace", () => {
  it("allows empty adjacent cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(true);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(true);
  });

  it("rejects non-adjacent cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [0, 2])).toBe(false);
    expect(canPlace(b, [0, 0], [1, 1])).toBe(false);
    expect(canPlace(b, [0, 0], [0, 0])).toBe(false);
  });

  it("rejects off-board cells", () => {
    const b = emptyBoard(6);
    expect(canPlace(b, [0, 0], [-1, 0])).toBe(false);
    expect(canPlace(b, [5, 5], [6, 5])).toBe(false);
  });

  it("allows level 2 on two level-1 tiles", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(true);
  });

  it("rejects straddling both halves of one tile", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(false);
  });

  it("rejects spanning two different heights", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    placeTile(b, [0, 0], [0, 1], 2, 3);
    expect(canPlace(b, [0, 0], [1, 0])).toBe(false);
  });

  it("rejects half on a tile and half on bare board", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(canPlace(b, [0, 0], [0, 1])).toBe(false);
  });

  it("does not mutate", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    // Covers ring and nextPlacementId too, not just cells. `nav` is a Ring
    // instance and not usefully JSON-comparable, so compare plain data only.
    const snapshot = () => JSON.stringify([b.cells, b.ring, b.nextPlacementId]);
    const before = snapshot();
    canPlace(b, [0, 0], [0, 1]);
    canPlace(b, [0, 0], [1, 0]);
    canPlace(b, [3, 3], [3, 4]);
    expect(snapshot()).toBe(before);
  });
});

/** `resolve` returns entries from a module-level cache built once at load, so
 *  placeTile must COPY the conns rather than alias them. Without these tests a
 *  reversion to `cell.conns = conns` passes the whole suite while silently
 *  corrupting the rotation cache for every later placement of that tile. */
describe("placeTile does not alias the rotation cache", () => {
  it("gives the cell its own conns array", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(at(b, [0, 0]).conns).not.toBe(resolve(2, 0)[0]);
    expect(at(b, [1, 0]).conns).not.toBe(resolve(2, 0)[1]);
  });

  it("survives in-place mutation of a placed cell", () => {
    const original = canon(resolve(2, 0)[0]);
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);

    at(b, [0, 0]).conns[0]![0] = Side.W;      // corrupt the placed cell
    at(b, [0, 0]).conns.push([Side.N, Side.N]);

    expect(canon(resolve(2, 0)[0])).toBe(original);
  });
});

describe("placeTile", () => {
  it("sets id, height and conns on both cells", () => {
    const b = emptyBoard(6);
    const pid = placeTile(b, [0, 0], [1, 0], 2, 0);
    expect(pid).toBe(1);
    expect(at(b, [0, 0]).placementId).toBe(pid);
    expect(at(b, [1, 0]).placementId).toBe(pid);
    expect(at(b, [0, 0]).height).toBe(1);
    expect(at(b, [1, 0]).height).toBe(1);
    expect(at(b, [0, 0]).conns.length).toBeGreaterThan(0);
    expect(b.nextPlacementId).toBe(2);
  });

  it("stacking increments height and replaces the top", () => {
    const b = emptyBoard(6);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    const top = placeTile(b, [0, 0], [0, 1], 6, 3);
    expect(at(b, [0, 0]).height).toBe(2);
    expect(at(b, [0, 1]).height).toBe(2);
    expect(at(b, [0, 0]).placementId).toBe(top);
    expect(at(b, [1, 0]).height).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/placement.js`.

- [ ] **Step 3: Write `packages/rules/src/placement.ts`**

```ts
/** Placement legality and commit.
 *
 *  Legality is support-only. Every cell in this tile set carries a line on all
 *  four faces, so a connection-continuity check would compare true against true
 *  on every shared face and could never fail. It is deliberately absent. */

import { at, inBounds } from "./board.js";
import type { Board } from "./board.js";
import { resolve } from "./tileTypes.js";
import { orthogonallyAdjacent } from "./types.js";
import type { Pos, TypeId } from "./types.js";

/** Pure. Depends only on the footprint -- if any tile fits, all of them do. */
export function canPlace(board: Board, posA: Pos, posB: Pos): boolean {
  if (!inBounds(board, posA) || !inBounds(board, posB)) return false;
  if (!orthogonallyAdjacent(posA, posB)) return false;

  const a = at(board, posA), b = at(board, posB);
  if (a.height !== b.height) return false;                       // differing heights
  if (a.height > 0 && a.placementId === b.placementId) return false; // straddling one tile
  return true;
}

/** Commit a placement. Returns the new placement id. Board state only --
 *  pile bookkeeping belongs to the caller. */
export function placeTile(
  board: Board, posA: Pos, posB: Pos, typeId: TypeId, orientation: number,
): number {
  const pid = board.nextPlacementId;
  board.nextPlacementId += 1;
  const [connsA, connsB] = resolve(typeId, orientation);
  const pairs: [Pos, typeof connsA][] = [[posA, connsA], [posB, connsB]];
  for (const [pos, conns] of pairs) {
    const cell = at(board, pos);
    cell.placementId = pid;
    cell.height += 1;
    cell.conns = conns.map(([x, y]) => [x, y]);
  }
  return pid;
}
```

Note `conns.map(...)` copies the arrays. `resolve` returns cached data shared across all callers; assigning it directly would let a later mutation corrupt the cache.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/rules`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/placement.ts packages/rules/test/placement.test.ts
git commit -m "feat(rules): port support-only placement legality and commit"
```

---

### Task 5: Tracing and scoring

**Files:**
- Create: `packages/rules/src/trace.ts`
- Test: `packages/rules/test/trace.test.ts`, `packages/rules/test/scoring.test.ts`

**Interfaces:**
- Consumes: `Board`, `follow`, `inBounds`, `slotIndexOf` from `board.ts`; `PASSES_TO_VP` from `config.ts`; `opposite`, `Result`, `Side`, `step` from `types.ts`.
- Produces: `traceFrom(board, row, col, entry): [Result | number, number]`; `trace(board, startSlot): [Result | number, number]`; `passesToVp(total): number`; `scoreLines(board, markerSlots): Map<string, number>`; `scoreFor(board, markerSlots): number`.

Port `passtally/trace.py` (96 lines). **Three rules that must not be "simplified":**

1. The visited set is keyed on `(row, col, entry)`, **not** on the cell. Re-entering a cell through a different face is legal and must keep counting.
2. `placementId` is compared against the **previous step only**, never a set of everything seen. A line may cross the same tile twice and each crossing scores.
3. `scoreFor` **sums all lines before converting** to VP. The table is nonlinear.

`scoreLines` returns a `Map` keyed by a canonical `"lo-hi"` slot-pair string (T3 again — `frozenset` has no TS equivalent). There is **no `endpoint !== slot` guard**: the board decomposes into simple paths and cycles, a border slot is always a path endpoint, so a trace reaches the *other* endpoint, necessarily a different slot.

- [ ] **Step 1: Write the failing tests**

`packages/rules/test/trace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard, slotIndexOf } from "../src/board.js";
import { placeTile } from "../src/placement.js";
import { trace, traceFrom } from "../src/trace.js";
import { Result, Side } from "../src/types.js";

describe("trace", () => {
  it("counts three passes across three level-1 tiles", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.W));
    expect(end).toBe(slotIndexOf(3, 0, 2, Side.E));
    expect(passes).toBe(3);
  });

  it("counts a seam crossing once", () => {
    const b = emptyBoard(3);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.N));
    expect(end).toBe(Result.DEAD);
    expect(passes).toBe(1);
  });

  it("dies on an empty cell", () => {
    const b = emptyBoard(3);
    placeTile(b, [0, 0], [0, 1], 2, 3);
    const [end, passes] = trace(b, slotIndexOf(3, 0, 0, Side.W));
    expect(end).toBe(Result.DEAD);
    expect(passes).toBe(1);
  });

  it("returns zero passes from an empty board", () => {
    expect(trace(emptyBoard(3), 0)).toEqual([Result.DEAD, 0]);
  });

  // Tile 1 at orientation 1 lays out as (B west, A east).
  // Row 1 tile: (1,0)=B routes W->N, (1,1)=A routes N->E.
  // Row 0 tile: (0,0)=B routes S->E, (0,1)=A routes W->S.
  it("counts a tile crossed twice, twice", () => {
    const b = emptyBoard(3);
    placeTile(b, [1, 1], [1, 0], 1, 1);
    placeTile(b, [0, 1], [0, 0], 1, 1);
    const [end, passes] = trace(b, slotIndexOf(3, 1, 0, Side.W));
    expect(end).toBe(Result.DEAD);
    expect(passes).toBe(3); // 2 if the second crossing were wrongly suppressed
  });

  it("scores 5 across levels 1,1,2,1", () => {
    const b = emptyBoard(4);
    placeTile(b, [0, 0], [1, 0], 2, 0);
    placeTile(b, [0, 1], [1, 1], 2, 0);
    placeTile(b, [0, 2], [0, 3], 2, 3);
    placeTile(b, [1, 2], [1, 3], 2, 3);
    placeTile(b, [0, 2], [1, 2], 2, 0);
    expect([0, 1, 2, 3].map((c) => b.cells[0]![c]!.height)).toEqual([1, 1, 2, 1]);

    const [end, passes] = trace(b, slotIndexOf(4, 0, 0, Side.W));
    expect(end).toBe(slotIndexOf(4, 0, 3, Side.E));
    expect(passes).toBe(5);
  });

  it("terminates on a closed loop", () => {
    const b = emptyBoard(4);
    placeTile(b, [1, 2], [1, 1], 1, 1);
    placeTile(b, [2, 1], [2, 2], 1, 3);
    const [end, passes] = traceFrom(b, 1, 1, Side.E);
    expect(end).toBe(Result.LOOP);
    expect(passes).toBe(3);
  });

  it("is symmetric from both ends", () => {
    const b = emptyBoard(3);
    for (let col = 0; col < 3; col++) placeTile(b, [0, col], [1, col], 2, 0);
    const west = slotIndexOf(3, 0, 0, Side.W), east = slotIndexOf(3, 0, 2, Side.E);
    expect(trace(b, west)).toEqual([east, 3]);
    expect(trace(b, east)).toEqual([west, 3]);
  });
});
```

`packages/rules/test/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard, slotIndexOf } from "../src/board.js";
import type { Board } from "../src/board.js";
import { placeTile } from "../src/placement.js";
import { passesToVp, scoreFor, scoreLines } from "../src/trace.js";
import { Side } from "../src/types.js";

describe("passesToVp", () => {
  it.each([
    [0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [6, 3], [7, 4], [10, 4],
    [11, 5], [15, 5], [16, 6], [21, 6], [22, 7], [28, 7], [29, 8],
    [36, 8], [37, 9], [45, 9], [46, 10], [55, 10], [56, 15], [500, 15],
  ])("maps %i passes to %i VP", (total, vp) => {
    expect(passesToVp(total)).toBe(vp);
  });
});

/** A 4x4 board with a 2-pass line along row 0 and another along row 3. */
function twoParallelLines(): Board {
  const b = emptyBoard(4);
  for (const row of [0, 3]) {
    placeTile(b, [row, 0], [row, 1], 2, 3);
    placeTile(b, [row, 2], [row, 3], 2, 3);
  }
  return b;
}

describe("scoreLines", () => {
  it("scores one connected pair as a single line", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E)];
    const lines = scoreLines(b, slots);
    expect(lines.size).toBe(1);
    expect([...lines.values()]).toEqual([2]);
  });

  it("dedupes a pair found from both ends", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E)];
    expect(scoreLines(b, slots).size).toBe(1);
  });

  it("scores nothing for unconnected markers", () => {
    const b = twoParallelLines();
    const slots = [slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 2, 0, Side.W)];
    expect(scoreLines(b, slots).size).toBe(0);
    expect(scoreFor(b, slots)).toBe(0);
  });

  it("sums before converting", () => {
    const b = twoParallelLines();
    const slots = [
      slotIndexOf(4, 0, 0, Side.W), slotIndexOf(4, 0, 3, Side.E),
      slotIndexOf(4, 3, 0, Side.W), slotIndexOf(4, 3, 3, Side.E),
    ];
    expect([...scoreLines(b, slots).values()].sort()).toEqual([2, 2]);
    // Summed first: 4 passes -> 3 VP. Converted separately: 2 + 2 = 4 VP.
    expect(passesToVp(2) + passesToVp(2)).toBe(4);
    expect(scoreFor(b, slots)).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/trace.js`.

- [ ] **Step 3: Write `packages/rules/src/trace.ts`**

```ts
/** Line tracing and scoring.
 *
 *  Because every cell pairs its four faces bijectively, `follow` is an
 *  involution and the whole step relation is reversible. A trace starting from
 *  a border slot therefore cannot loop: revisiting a state would require two
 *  predecessors, and the reverse trajectory would have to exit off-board. The
 *  LOOP guard is kept regardless -- it is three lines, and it is the difference
 *  between a bug and a hang if the tile data is ever revised. */

import { follow, inBounds, slotIndexOf } from "./board.js";
import type { Board } from "./board.js";
import { PASSES_TO_VP } from "./config.js";
import { opposite, Result, step } from "./types.js";
import type { Side } from "./types.js";

/** Follow a line from a cell and entry face. Returns [endpoint, passes], where
 *  endpoint is a Result member or a ring-slot index. */
export function traceFrom(
  board: Board, row: number, col: number, entry: Side,
): [Result | number, number] {
  let passes = 0;
  let lastId: number | null = null;
  const seen = new Set<string>();

  for (;;) {
    // Keyed by (cell, ENTRY FACE) -- not by cell. Re-entering the same cell
    // through a different face is legal and must keep counting.
    const key = `${row},${col},${entry}`;
    if (seen.has(key)) return [Result.LOOP, passes];
    seen.add(key);

    const cell = board.cells[row]![col]!;
    if (cell.placementId === null) return [Result.DEAD, passes];

    const exitFace = follow(cell, entry);
    if (exitFace === null) return [Result.DEAD, passes];

    // Compare against the PREVIOUS STEP ONLY, never a visited-set. A line may
    // cross the same tile more than once and each crossing scores; a set would
    // silently eat the second pass. A seam crossing leaves placementId
    // unchanged and correctly adds nothing.
    if (cell.placementId !== lastId) {
      passes += cell.height;
      lastId = cell.placementId;
    }

    const [nextRow, nextCol] = step([row, col], exitFace);
    if (!inBounds(board, [nextRow, nextCol])) {
      return [slotIndexOf(board.n, row, col, exitFace), passes];
    }
    row = nextRow; col = nextCol; entry = opposite(exitFace);
  }
}

/** Follow the line entering the board at a ring slot. */
export function trace(board: Board, startSlot: number): [Result | number, number] {
  const slot = board.ring[startSlot]!;
  return traceFrom(board, slot.row, slot.col, slot.side);
}

/** Convert a pass total to victory points via the nonlinear band table. */
export function passesToVp(total: number): number {
  let vp = 0;
  for (const [minPasses, value] of PASSES_TO_VP) {
    if (total < minPasses) break;
    vp = value;
  }
  return vp;
}

/** Passes for each line running between two of these markers, keyed by the
 *  canonical unordered slot pair so a line found from both ends is recorded
 *  once.
 *
 *  No endpoint-differs-from-start guard is needed: each cell contributes two
 *  disjoint wires and each wire-end links to exactly one neighbour, so every
 *  connection point has degree at most 2 and the board decomposes into simple
 *  paths and cycles. A border slot cannot lie on a cycle, so it is a path
 *  ENDPOINT -- and tracing from one endpoint reaches the other, which is
 *  necessarily a different slot. Same argument that makes LOOP unreachable. */
export function scoreLines(board: Board, markerSlots: number[]): Map<string, number> {
  const owned = new Set(markerSlots);
  const lines = new Map<string, number>();
  for (const slot of markerSlots) {
    const [endpoint, passes] = trace(board, slot);
    if (typeof endpoint === "number" && owned.has(endpoint)) {
      const key = slot < endpoint ? `${slot}-${endpoint}` : `${endpoint}-${slot}`;
      lines.set(key, passes);
    }
  }
  return lines;
}

/** Victory points earned. Sums all lines BEFORE converting -- the table is
 *  nonlinear, so converting each line separately gives the wrong answer. */
export function scoreFor(board: Board, markerSlots: number[]): number {
  let total = 0;
  for (const passes of scoreLines(board, markerSlots).values()) total += passes;
  return passesToVp(total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @passtally/rules`
Expected: PASS — especially `counts a tile crossed twice, twice` at 3, and `sums before converting` at 3.

- [ ] **Step 5: Verify the two load-bearing rules are not vacuous**

Two temporary mutations, each run separately, restored afterwards. Report the outcome of each.

1. Change the visited key from `` `${row},${col},${entry}` `` to `` `${row},${col}` ``. Confirm at least one trace test **fails**. (The Python suite had *zero* coverage of this until its final review — do not inherit that gap. If nothing fails, add a test that catches it before proceeding.)
2. Change `if (cell.placementId !== lastId)` to track a `Set` of seen ids. Confirm `counts a tile crossed twice, twice` **fails** with 2.

Do not commit either mutation.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/trace.ts packages/rules/test/trace.test.ts packages/rules/test/scoring.test.ts
git commit -m "feat(rules): port tracing and nonlinear sum-before-convert scoring"
```

---

### Task 6: Marker movement

**Files:**
- Create: `packages/rules/src/markers.ts`
- Test: `packages/rules/test/markers.test.ts`

**Interfaces:**
- Consumes: `Board` from `board.ts`.
- Produces: `markerDestination(board, startSlot, distance): number | null`.

Port `passtally/markers.py` (31 lines). Signed distance; occupied slots are jumped **without consuming distance**, so the landing slot is always empty.

**The `position !== startSlot` clause is load-bearing, not defensive padding.** Without it, a marker on an otherwise-full ring walks a whole lap and returns its own slot instead of `null`.

- [ ] **Step 1: Write the failing test**

`packages/rules/test/markers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard } from "../src/board.js";
import { markerDestination } from "../src/markers.js";

describe("markerDestination", () => {
  it("moves forward", () => {
    const b = emptyBoard(6);
    expect(markerDestination(b, 0, 1)).toBe(1);
    expect(markerDestination(b, 0, 2)).toBe(2);
  });

  it("moves backward on a negative distance", () => {
    const b = emptyBoard(6);
    expect(markerDestination(b, 5, -1)).toBe(4);
    expect(markerDestination(b, 5, -2)).toBe(3);
  });

  it("wraps around the ring", () => {
    const b = emptyBoard(6);
    expect(markerDestination(b, 23, 1)).toBe(0);
    expect(markerDestination(b, 0, -1)).toBe(23);
  });

  it("lands three away when jumping one occupant at distance 2", () => {
    const b = emptyBoard(6);
    b.ring[1]!.occupant = 99;
    expect(markerDestination(b, 0, 2)).toBe(3);
  });

  it("does not consume distance for several occupants", () => {
    const b = emptyBoard(6);
    b.ring[1]!.occupant = 99;
    b.ring[2]!.occupant = 98;
    b.ring[4]!.occupant = 97;
    expect(markerDestination(b, 0, 2)).toBe(5);
  });

  it("skips straight past an occupant at distance 1", () => {
    const b = emptyBoard(6);
    b.ring[1]!.occupant = 99;
    expect(markerDestination(b, 0, 1)).toBe(2);
  });

  it("always lands on an empty slot", () => {
    const b = emptyBoard(6);
    b.ring[1]!.occupant = 99;
    for (const d of [-2, -1, 1, 2]) {
      const dest = markerDestination(b, 0, d)!;
      expect(b.ring[dest]!.occupant).toBeNull();
    }
  });

  it("returns null when every other slot is occupied", () => {
    const b = emptyBoard(6);
    b.ring.forEach((s, i) => { if (i !== 0) s.occupant = i; });
    expect(markerDestination(b, 0, 1)).toBeNull();
  });

  it("has no destination for zero distance", () => {
    expect(markerDestination(emptyBoard(6), 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/markers.js`.

- [ ] **Step 3: Write `packages/rules/src/markers.ts`**

```ts
/** Marker movement around the border ring. */

import type { Board } from "./board.js";

/** Where a marker moving `distance` slots ends up, or null if nowhere.
 *
 *  The sign of `distance` is the direction around the ring. Occupied slots are
 *  jumped without consuming distance, so the destination is always empty. */
export function markerDestination(
  board: Board, startSlot: number, distance: number,
): number | null {
  if (distance === 0) return null;

  const stride = distance > 0 ? 1 : -1;
  let remaining = Math.abs(distance);
  let position = startSlot;

  // A full lap is the most that can ever be needed; if the ring is entirely
  // occupied there is nowhere to land.
  for (let i = 0; i < board.nav.size; i++) {
    position = board.nav.move(position, stride);
    // A marker must land somewhere other than where it started. After a full
    // lap, position returns to startSlot; this guard excludes it even if empty.
    if (board.ring[position]!.occupant === null && position !== startSlot) {
      remaining -= 1;
      if (remaining === 0) return position;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @passtally/rules`
Expected: PASS

- [ ] **Step 5: Verify the start-slot guard is not vacuous**

Temporarily remove `&& position !== startSlot`, run the suite, and confirm `returns null when every other slot is occupied` **fails** (it will return 0). Restore it and confirm it passes. Report both outcomes. Do not commit the temporary change.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/markers.ts packages/rules/test/markers.test.ts
git commit -m "feat(rules): port marker movement with free jumps over occupied slots"
```

---

### Task 7: Game

**Files:**
- Create: `packages/rules/src/game.ts`, `packages/rules/src/index.ts`
- Test: `packages/rules/test/game.test.ts`, `packages/rules/test/legalMoves.test.ts`, `packages/rules/test/key.test.ts`

**Interfaces:**
- Consumes: everything built so far.
- Produces: `Pile` `{ ordered: TypeId[]; faceUp: TypeId | null }`; `Player` `{ markerSlots: number[]; score: number }`; `class Game` with `board`, `piles`, `players`, `currentPlayer`, `actionsLeft`, `firstPlayer`, and methods `static newGame(nPlayers, seed?, boardSize?)`, `setupPlaceMarker(player, slot)`, `isSetupComplete()`, `apply(move)`, `legalMoves()`, `isOver()`, `winner()`, `clone()`, `key()`.

Port `passtally/game.py` (298 lines). Apply **T4** for `clone` and **T5** for the deal.

**Behaviours the Python engine earned through review — all must survive the port:**

- `isSetupComplete()` is true when every player holds `MARKERS_PER_PLAYER` markers. `apply` throws until it is true; `setupPlaceMarker` throws once it is.
- Range checks on `pileIndex` and `player` — negative indices must throw, not wrap. In Python `piles[-1]` silently drew from the last pile; JS returns `undefined`, which is a different but equally bad failure.
- An out-of-range `orientation` throws the same error type as every other bad input.
- `_triggerFired` has two clauses. **The first is provably subsumed by the second** — `legalMoves` skips piles whose `faceUp` is null, so exhausted piles emit no `PlaceTile` and the second clause already returns true. It is kept as a fast path that avoids materialising the full move list. Keep both, and keep a comment saying so.
- `key()` encodes each cell's **partner offset**, never raw `placementId`, and includes scores, `currentPlayer`, `actionsLeft`, and the final-round and over flags.

- [ ] **Step 1: Write the failing tests**

`packages/rules/test/game.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slotIndexOf } from "../src/board.js";
import { COPIES_PER_TYPE } from "../src/config.js";
import { Game } from "../src/game.js";
import { placeTile } from "../src/placement.js";
import { Side } from "../src/types.js";
import type { Move } from "../src/types.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });
const marker = (markerIndex: number, distance: number): Move =>
  ({ kind: "marker", markerIndex, distance });

describe("construction", () => {
  it("deals three piles of fourteen", () => {
    const g = Game.newGame(2, 7);
    expect(g.piles.length).toBe(3);
    for (const p of g.piles) {
      expect(p.ordered.length).toBe(13);
      expect(p.faceUp).not.toBeNull();
    }
  });

  it("uses every tile exactly seven times", () => {
    const g = Game.newGame(2, 7);
    const dealt = g.piles.flatMap((p) => [...p.ordered, p.faceUp!]);
    expect(dealt.length).toBe(42);
    for (const t of [1, 2, 3, 4, 5, 6]) {
      expect(dealt.filter((x) => x === t).length).toBe(COPIES_PER_TYPE);
    }
  });

  it("deals the same game for the same seed", () => {
    expect(Game.newGame(2, 42).piles.map((p) => p.ordered))
      .toEqual(Game.newGame(2, 42).piles.map((p) => p.ordered));
  });

  it("deals differently for different seeds", () => {
    expect(Game.newGame(2, 1).piles.map((p) => p.ordered))
      .not.toEqual(Game.newGame(2, 2).piles.map((p) => p.ordered));
  });

  it("rejects bad player counts", () => {
    for (const n of [0, 1, 4]) expect(() => Game.newGame(n)).toThrow();
  });
});

describe("setup", () => {
  it("records markers and occupants", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(g.players[0]!.markerSlots).toEqual([0]);
    expect(g.board.ring[0]!.occupant).toBe(0);
  });

  it("rejects an occupied slot", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.setupPlaceMarker(1, 0)).toThrow();
  });

  it("rejects a second marker on the same edge", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.setupPlaceMarker(0, 1)).toThrow();
  });

  it("rejects a fifth marker", () => {
    expect(() => setup().setupPlaceMarker(0, 30)).toThrow();
  });

  it("rejects a negative player index", () => {
    expect(() => Game.newGame(2, 1, 6).setupPlaceMarker(-1, 3)).toThrow();
  });

  it("reports completeness", () => {
    const g = Game.newGame(2, 1, 6);
    expect(g.isSetupComplete()).toBe(false);
    const done = setup();
    expect(done.isSetupComplete()).toBe(true);
  });

  it("refuses play before setup is complete", () => {
    const g = Game.newGame(2, 1, 6);
    g.setupPlaceMarker(0, 0);
    expect(() => g.apply(marker(0, 1))).toThrow();
  });

  it("refuses setup once play has begun", () => {
    expect(() => setup().setupPlaceMarker(0, 30)).toThrow();
  });
});

describe("turns", () => {
  it("is two actions", () => {
    const g = setup();
    expect(g.actionsLeft).toBe(2);
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(g.actionsLeft).toBe(1);
    expect(g.currentPlayer).toBe(0);
    g.apply(place(0, [2, 3], [3, 3], 0));
    expect(g.actionsLeft).toBe(2);
    expect(g.currentPlayer).toBe(1);
  });

  it("advances the pile on a placement", () => {
    const g = setup();
    const pile = g.piles[0]!;
    const nextUp = pile.ordered[pile.ordered.length - 1]!;
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(pile.faceUp).toBe(nextUp);
    expect(pile.ordered.length).toBe(12);
  });

  it("rejects an illegal placement", () => {
    const g = setup();
    g.apply(place(0, [2, 2], [3, 2], 0));
    expect(() => g.apply(place(0, [2, 2], [3, 2], 0))).toThrow();
  });

  it("rejects a cell pair contradicting the orientation", () => {
    expect(() => setup().apply(place(0, [2, 2], [2, 3], 0))).toThrow();
  });

  it("rejects a negative pile index", () => {
    expect(() => setup().apply(place(-1, [2, 2], [3, 2], 0))).toThrow();
  });

  it("rejects an out-of-range orientation", () => {
    expect(() => setup().apply(place(0, [2, 2], [3, 2], 7))).toThrow();
  });

  it("rejects an illegal marker distance", () => {
    expect(() => setup().apply(marker(0, 3))).toThrow();
  });

  it("moves a marker and preserves its id", () => {
    const g = setup(2, 1, 6);
    const start = g.players[0]!.markerSlots[0]!;
    const id = g.board.ring[start]!.occupant;
    g.apply(marker(0, 1));
    const moved = g.players[0]!.markerSlots[0]!;
    expect(moved).not.toBe(start);
    expect(g.board.ring[start]!.occupant).toBeNull();
    expect(g.board.ring[moved]!.occupant).toBe(id);
  });
});

describe("scoring and end", () => {
  /** A 3x3 board (ring of 12) where BOTH players hold a scoring line.
   *
   *  Three vertical tile-2 (X/X) placements fill rows 0-1. X routes W<->E, so
   *  row 0 carries a line from slot 11 to slot 3, and row 1 from slot 10 to
   *  slot 4 -- both 3 passes, which falls in the 2-3 band for 2 VP.
   *
   *  Player 0 takes edges 3,1,0,2 as slots 11,3,1,6 (marker 0 is slot 11).
   *  Player 1 takes edges 0,1,2,3 as slots  0,4,7,10.
   *  Every player holds one marker per edge and no slot is shared. */
  function scoringBoard(): Game {
    const g = Game.newGame(2, 1, 3);
    for (const slot of [11, 3, 1, 6]) g.setupPlaceMarker(0, slot);
    for (const slot of [0, 4, 7, 10]) g.setupPlaceMarker(1, slot);
    for (let col = 0; col < 3; col++) placeTile(g.board, [0, col], [1, col], 2, 0);
    return g;
  }

  it("puts the expected lines on the scoring board", () => {
    const g = scoringBoard();
    expect(g.players[0]!.markerSlots[0]).toBe(slotIndexOf(3, 0, 0, Side.W));
    expect(g.players[0]!.markerSlots[1]).toBe(slotIndexOf(3, 0, 2, Side.E));
    expect(g.players[1]!.markerSlots[3]).toBe(slotIndexOf(3, 1, 0, Side.W));
    expect(g.players[1]!.markerSlots[1]).toBe(slotIndexOf(3, 1, 2, Side.E));
  });

  it("awards score once, at end of turn", () => {
    const g = scoringBoard();
    expect(g.players[0]!.score).toBe(0);
    g.apply(marker(0, 1));                 // 11 -> 2 (0 and 1 are occupied)
    expect(g.players[0]!.score).toBe(0);   // mid-turn, not scored yet
    g.apply(marker(0, -1));                // 2 -> 11, back where it started
    expect(g.players[0]!.score).toBe(2);   // 3 passes falls in the 2-3 band
  });

  /** Player 1 holds a genuine 2 VP line here, so a mutant awarding score to
   *  every player would give them 2 on player 0's turn. A board where player 1
   *  scores nothing would pass either way -- do not "simplify" this. */
  it("scores only the current player", () => {
    const g = scoringBoard();
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));
    expect(g.players[0]!.score).toBe(2);
    expect(g.players[1]!.score).toBe(0);
  });

  it("scores player 1 on player 1's own turn", () => {
    const g = scoringBoard();
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));   // player 0's turn ends
    g.apply(marker(0, 1));
    g.apply(marker(0, -1));   // player 1's turn ends
    expect(g.players[1]!.score).toBe(2);
  });

  it("has no winner before the end", () => {
    const g = setup();
    expect(g.isOver()).toBe(false);
    expect(g.winner()).toBeNull();
  });

  it("triggers the final round when the piles empty", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(g.isOver()).toBe(false);   // player 1 still gets a turn
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(g.isOver()).toBe(true);
  });

  it("gives three players a two-turn tail", () => {
    const g = setup(3);
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P1
    expect(g.isOver()).toBe(false);
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P2
    expect(g.isOver()).toBe(false);
    g.apply(marker(0, 1)); g.apply(marker(0, -1));   // P3
    expect(g.isOver()).toBe(true);
  });

  it("rejects a move after the game ends", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    g.apply(marker(0, 1)); g.apply(marker(0, -1));
    expect(() => g.apply(marker(0, 1))).toThrow();
  });
});
```

`packages/rules/test/legalMoves.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MARKER_DISTANCES } from "../src/config.js";
import { Game } from "../src/game.js";
import { markerDestination } from "../src/markers.js";
import { distinctOrientations } from "../src/tileTypes.js";
import type { Move } from "../src/types.js";

function setup(nPlayers = 2, seed = 1, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, seed, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}
const places = (ms: Move[]) => ms.filter((m) => m.kind === "place");
const markers = (ms: Move[]) => ms.filter((m) => m.kind === "marker");

describe("legalMoves", () => {
  it("only emits moves apply accepts", () => {
    const g = setup();
    for (const m of g.legalMoves()) g.clone().apply(m);
  });

  it("counts 30 footprints per orientation on an empty 6x6", () => {
    const g = setup(2, 1, 6);
    const ps = places(g.legalMoves());
    g.piles.forEach((pile, index) => {
      for (const o of distinctOrientations(pile.faceUp!)) {
        expect(ps.filter((m) => m.pileIndex === index && m.orientation === o).length).toBe(30);
      }
      const count = ps.filter((m) => m.pileIndex === index).length;
      expect(count).toBe(distinctOrientations(pile.faceUp!).length === 4 ? 120 : 60);
    });
  });

  it("emits no duplicate placements for symmetric tiles", () => {
    const g = setup();
    const ps = places(g.legalMoves());
    const keys = ps.map((m) => `${m.pileIndex}|${[
      `${m.cellA[0]},${m.cellA[1]}`, `${m.cellB[0]},${m.cellB[1]}`,
    ].sort().join("/")}|${m.orientation}`);
    expect(new Set(keys).size).toBe(keys.length);

    g.piles.forEach((pile, index) => {
      if (distinctOrientations(pile.faceUp!).length === 2) {
        const emitted = new Set(ps.filter((m) => m.pileIndex === index).map((m) => m.orientation));
        expect(emitted).toEqual(new Set([0, 1]));
      }
    });
  });

  it("generates moves for every marker", () => {
    const ms = markers(setup().legalMoves());
    expect(new Set(ms.map((m) => m.markerIndex))).toEqual(new Set([0, 1, 2, 3]));
  });

  /** +1 and -1 land on the same slot only when the ring is saturated. For a
   *  fixed direction, |distance| 2 always needs strictly more empty slots than
   *  |distance| 1 along the same scan, so same-direction landings can never
   *  coincide -- a collision needs the forward and backward scans to converge,
   *  which requires leaving exactly one slot empty besides the marker's own.
   *  Do not "simplify" this back to a lightly-occupied ring. */
  it("dedupes marker moves reaching the same slot", () => {
    const g = setup(2, 1, 6);
    const start = g.players[0]!.markerSlots[0]!;
    const empties = g.board.ring
      .map((s, i) => (s.occupant === null && i !== start ? i : -1))
      .filter((i) => i >= 0);
    const [, ...fill] = empties;
    fill.forEach((slot, i) => { g.board.ring[slot]!.occupant = 900 + i; });

    const ms = markers(g.legalMoves()).filter((m) => m.markerIndex === 0);
    const dests = ms.map((m) => markerDestination(g.board, start, m.distance));
    expect(new Set(dests).size).toBe(dests.length);
    expect(ms.length).toBe(1);
    expect(ms.length).toBeLessThan(MARKER_DISTANCES.length);
  });

  it("emits no placements when every pile is empty", () => {
    const g = setup();
    for (const p of g.piles) { p.ordered.length = 0; p.faceUp = null; }
    expect(places(g.legalMoves()).length).toBe(0);
  });
});
```

`packages/rules/test/key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { at } from "../src/board.js";
import { Game } from "../src/game.js";
import { placeTile } from "../src/placement.js";
import { canon } from "../src/tileTypes.js";
import type { Move } from "../src/types.js";

function setup(seed = 1, boardSize = 6): Game {
  const g = Game.newGame(2, seed, boardSize);
  for (let p = 0; p < 2; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}
const place = (pileIndex: number, cellA: [number, number], cellB: [number, number],
  orientation: number): Move => ({ kind: "place", pileIndex, cellA, cellB, orientation });

describe("key", () => {
  it("matches for a clone", () => {
    const g = setup();
    expect(g.clone().key()).toBe(g.key());
  });

  it("is independent after cloning", () => {
    const g = setup();
    const twin = g.clone();
    twin.apply(place(0, [2, 2], [3, 2], 0));
    expect(at(g.board, [2, 2]).height).toBe(0);
    expect(at(twin.board, [2, 2]).height).toBe(1);
    expect(twin.key()).not.toBe(g.key());
  });

  it("collapses move-order permutations", () => {
    const a = setup();
    a.apply(place(0, [2, 2], [3, 2], 0));
    a.apply(place(1, [2, 4], [3, 4], 0));
    const b = setup();
    b.apply(place(1, [2, 4], [3, 4], 0));
    b.apply(place(0, [2, 2], [3, 2], 0));
    expect(a.key()).toBe(b.key());
  });

  it("distinguishes placement grouping", () => {
    const horizontal = Game.newGame(2, 1, 4);
    placeTile(horizontal.board, [0, 0], [0, 1], 2, 3);
    placeTile(horizontal.board, [1, 0], [1, 1], 2, 3);

    const vertical = Game.newGame(2, 1, 4);
    placeTile(vertical.board, [0, 0], [1, 0], 2, 0);
    placeTile(vertical.board, [0, 1], [1, 1], 2, 0);

    for (const row of [0, 1]) {
      for (const col of [0, 1]) {
        const l = at(horizontal.board, [row, col]), r = at(vertical.board, [row, col]);
        expect(l.height).toBe(1);
        expect(r.height).toBe(1);
        expect(canon(l.conns)).toBe(canon(r.conns));
      }
    }
    expect(horizontal.key()).not.toBe(vertical.key());
  });

  it("ignores raw placement ids", () => {
    const forward = Game.newGame(2, 1, 4);
    placeTile(forward.board, [0, 0], [1, 0], 2, 0);
    placeTile(forward.board, [0, 2], [1, 2], 2, 0);

    const backward = Game.newGame(2, 1, 4);
    placeTile(backward.board, [0, 2], [1, 2], 2, 0);
    placeTile(backward.board, [0, 0], [1, 0], 2, 0);

    expect(forward.key()).toBe(backward.key());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @passtally/rules`
Expected: FAIL — cannot resolve `../src/game.js`.

- [ ] **Step 3: Write `packages/rules/src/game.ts`**

Port `passtally/game.py`. The structure is a direct translation; these members need care and are given in full.

```ts
import { emptyBoard, partnerOffset } from "./board.js";
import type { Board } from "./board.js";
import * as config from "./config.js";
import { markerDestination } from "./markers.js";
import { canPlace, placeTile } from "./placement.js";
import { makeRng } from "./rng.js";
import { canon, distinctOrientations, offsetOf, ORIENTATIONS, TILE_TYPES } from "./tileTypes.js";
import { scoreFor } from "./trace.js";
import type { Move, Pos, TypeId } from "./types.js";

export type Pile = { ordered: TypeId[]; faceUp: TypeId | null };
export type Player = { markerSlots: number[]; score: number };

export class Game {
  board: Board;
  piles: Pile[];
  players: Player[];
  currentPlayer = 0;
  actionsLeft = config.ACTIONS_PER_TURN;
  firstPlayer = 0;
  finalRound = false;
  over = false;

  private constructor(board: Board, piles: Pile[], players: Player[]) {
    this.board = board;
    this.piles = piles;
    this.players = players;
  }

  static newGame(nPlayers: number, seed = 0, boardSize: number = config.N): Game {
    if (nPlayers < 2 || nPlayers > 3) {
      throw new Error(`nPlayers must be 2 or 3, got ${nPlayers}`);
    }
    const deck: TypeId[] = [];
    // Numeric sort -- Array.sort defaults to lexicographic, which is a latent
    // bug the moment there are more than nine designs.
    for (const key of Object.keys(TILE_TYPES).map(Number).sort((a, b) => a - b)) {
      for (let i = 0; i < config.COPIES_PER_TYPE; i++) deck.push(key as TypeId);
    }
    makeRng(seed).shuffle(deck);

    const piles: Pile[] = [];
    for (let i = 0; i < config.N_PILES; i++) {
      const ordered = deck.slice(i * config.TILES_PER_PILE, (i + 1) * config.TILES_PER_PILE);
      const faceUp = ordered.pop() ?? null;
      piles.push({ ordered, faceUp });
    }
    const players: Player[] = Array.from({ length: nPlayers }, () => ({
      markerSlots: [], score: 0,
    }));
    return new Game(emptyBoard(boardSize), piles, players);
  }

  // -- setup -----------------------------------------------------------

  isSetupComplete(): boolean {
    return this.players.every((p) => p.markerSlots.length === config.MARKERS_PER_PLAYER);
  }

  setupPlaceMarker(player: number, slot: number): void {
    if (!Number.isInteger(player) || player < 0 || player >= this.players.length) {
      throw new Error(`no such player: ${player}`);
    }
    if (this.isSetupComplete()) throw new Error("setup is already complete");
    const entry = this.players[player]!;
    if (entry.markerSlots.length >= config.MARKERS_PER_PLAYER) {
      throw new Error(`player ${player} has already placed all markers`);
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.board.ring.length) {
      throw new Error(`slot ${slot} is not on the ring`);
    }
    if (this.board.ring[slot]!.occupant !== null) throw new Error(`slot ${slot} is occupied`);

    const edge = Math.floor(slot / this.board.n);
    if (entry.markerSlots.some((s) => Math.floor(s / this.board.n) === edge)) {
      throw new Error(`player ${player} already has a marker on edge ${edge}`);
    }
    this.board.ring[slot]!.occupant =
      player * config.MARKERS_PER_PLAYER + entry.markerSlots.length;
    entry.markerSlots.push(slot);
  }

  // -- moves -----------------------------------------------------------

  apply(move: Move): void {
    if (this.over) throw new Error("the game is over");
    if (!this.isSetupComplete()) throw new Error("setup is not complete");
    if (move.kind === "place") this.applyPlace(move);
    else this.applyMarker(move);

    this.actionsLeft -= 1;
    if (this.actionsLeft === 0) this.endTurn();
  }

  private applyPlace(move: Extract<Move, { kind: "place" }>): void {
    if (!Number.isInteger(move.pileIndex) ||
        move.pileIndex < 0 || move.pileIndex >= this.piles.length) {
      throw new Error(`no such pile: ${move.pileIndex}`);
    }
    if (!(ORIENTATIONS as readonly number[]).includes(move.orientation)) {
      throw new Error(`no such orientation: ${move.orientation}`);
    }
    const pile = this.piles[move.pileIndex]!;
    if (pile.faceUp === null) throw new Error(`pile ${move.pileIndex} is empty`);

    const [dr, dc] = offsetOf(move.orientation);
    const expected: Pos = [move.cellA[0] + dr, move.cellA[1] + dc];
    if (move.cellB[0] !== expected[0] || move.cellB[1] !== expected[1]) {
      throw new Error(
        `cellB ${move.cellB} contradicts orientation ${move.orientation}, ` +
          `which requires ${expected}`,
      );
    }
    if (!canPlace(this.board, move.cellA, move.cellB)) {
      throw new Error(`illegal placement at ${move.cellA}/${move.cellB}`);
    }
    placeTile(this.board, move.cellA, move.cellB, pile.faceUp, move.orientation);
    pile.faceUp = pile.ordered.pop() ?? null;
  }

  private applyMarker(move: Extract<Move, { kind: "marker" }>): void {
    const entry = this.players[this.currentPlayer]!;
    if (move.markerIndex < 0 || move.markerIndex >= entry.markerSlots.length) {
      throw new Error(`no marker with index ${move.markerIndex}`);
    }
    if (!(config.MARKER_DISTANCES as readonly number[]).includes(move.distance)) {
      throw new Error(`distance must be one of ${config.MARKER_DISTANCES}`);
    }
    const source = entry.markerSlots[move.markerIndex]!;
    const destination = markerDestination(this.board, source, move.distance);
    if (destination === null) throw new Error("no reachable destination");

    const markerId = this.board.ring[source]!.occupant;
    this.board.ring[source]!.occupant = null;
    this.board.ring[destination]!.occupant = markerId;
    entry.markerSlots[move.markerIndex] = destination;
  }

  // -- turn structure --------------------------------------------------

  private endTurn(): void {
    const entry = this.players[this.currentPlayer]!;
    entry.score += scoreFor(this.board, entry.markerSlots);

    if (!this.finalRound && this.triggerFired()) this.finalRound = true;

    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    this.actionsLeft = config.ACTIONS_PER_TURN;

    if (this.finalRound && this.currentPlayer === this.firstPlayer) this.over = true;
  }

  private triggerFired(): boolean {
    // Clause 1 is provably subsumed by clause 2 -- legalMoves skips piles whose
    // faceUp is null, so exhausted piles emit no placement and clause 2 already
    // returns true. Kept as a fast path: it answers a yes/no question without
    // materialising the full move list, including marker moves nobody inspects.
    if (this.piles.every((p) => p.faceUp === null)) return true;
    return !this.legalMoves().some((m) => m.kind === "place");
  }

  // -- queries ---------------------------------------------------------

  /** Every distinct-outcome action for the current player.
   *
   *  Not every legal action: marker moves landing on an already-reached slot
   *  are deduped away, though apply would accept them. Correct for search,
   *  and the end-of-game trigger depends on the placement half being exact. */
  legalMoves(): Move[] {
    const moves: Move[] = [];

    this.piles.forEach((pile, pileIndex) => {
      if (pile.faceUp === null) return;
      // Legality is footprint-only, so the tile affects nothing here except
      // which orientations are distinct.
      for (const orientation of distinctOrientations(pile.faceUp)) {
        const [dr, dc] = offsetOf(orientation);
        for (let row = 0; row < this.board.n; row++) {
          for (let col = 0; col < this.board.n; col++) {
            const cellA: Pos = [row, col];
            const cellB: Pos = [row + dr, col + dc];
            if (canPlace(this.board, cellA, cellB)) {
              moves.push({ kind: "place", pileIndex, cellA, cellB, orientation });
            }
          }
        }
      }
    });

    const entry = this.players[this.currentPlayer]!;
    entry.markerSlots.forEach((slot, markerIndex) => {
      const reached = new Set<number>();
      for (const distance of config.MARKER_DISTANCES) {
        const destination = markerDestination(this.board, slot, distance);
        if (destination !== null && !reached.has(destination)) {
          reached.add(destination);
          moves.push({ kind: "marker", markerIndex, distance });
        }
      }
    });

    return moves;
  }

  isOver(): boolean { return this.over; }

  /** The single highest scorer, or null if unfinished or tied. */
  winner(): number | null {
    if (!this.over) return null;
    const best = Math.max(...this.players.map((p) => p.score));
    const leaders = this.players
      .map((p, i) => (p.score === best ? i : -1))
      .filter((i) => i >= 0);
    return leaders.length === 1 ? leaders[0]! : null;
  }

  /** Deep copy, hand-written (T4). No closures or back-references to trip on. */
  clone(): Game {
    const board: Board = {
      n: this.board.n,
      cells: this.board.cells.map((row) =>
        row.map((c) => ({
          placementId: c.placementId,
          height: c.height,
          conns: c.conns.map(([a, b]) => [a, b] as [typeof a, typeof b]),
        })),
      ),
      ring: this.board.ring.map((s) => ({ ...s })),
      nav: this.board.nav,          // immutable; safe to share
      nextPlacementId: this.board.nextPlacementId,
    };
    const g = new Game(
      board,
      this.piles.map((p) => ({ ordered: [...p.ordered], faceUp: p.faceUp })),
      this.players.map((p) => ({ markerSlots: [...p.markerSlots], score: p.score })),
    );
    g.currentPlayer = this.currentPlayer;
    g.actionsLeft = this.actionsLeft;
    g.firstPlayer = this.firstPlayer;
    g.finalRound = this.finalRound;
    g.over = this.over;
    return g;
  }

  /** Canonical state string: top tiles, markers, piles, scores and turn state.
   *
   *  A placement's history is irrelevant once buried, so only the top tile at
   *  each cell contributes. Raw placement ids depend on move order, so each
   *  cell records its PARTNER OFFSET instead -- same information, canonically.
   *  Move-order permutations therefore collapse to the same key. */
  key(): string {
    const cells: string[] = [];
    for (let row = 0; row < this.board.n; row++) {
      for (let col = 0; col < this.board.n; col++) {
        const cell = this.board.cells[row]![col]!;
        const conns = cell.height > 0 ? canon(cell.conns) : "-";
        const p = partnerOffset(this.board, row, col);
        cells.push(`${cell.height}:${conns}:${p === null ? "-" : `${p[0]},${p[1]}`}`);
      }
    }
    const markers = this.players
      .map((p) => [...p.markerSlots].sort((a, b) => a - b).join(","))
      .join(";");
    const piles = this.piles.map((p) => `${p.ordered.join(",")}/${p.faceUp ?? "-"}`).join(";");
    const scores = this.players.map((p) => p.score).join(",");
    return [
      cells.join("|"), markers, piles, scores,
      this.currentPlayer, this.actionsLeft, this.finalRound, this.over,
    ].join("#");
  }
}
```

Also create `packages/rules/src/index.ts` re-exporting the public surface:

```ts
export * from "./types.js";
export * as config from "./config.js";
export * from "./rng.js";
export * from "./ring.js";
export * from "./board.js";
export * from "./tileTypes.js";
export * from "./placement.js";
export * from "./trace.js";
export * from "./markers.js";
export * from "./game.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @passtally/rules`
Expected: PASS — the whole suite.

- [ ] **Step 5: Verify the current-player scoring guard is not vacuous**

Temporarily change `endTurn` to award `scoreFor` to every player rather than only `this.players[this.currentPlayer]`. Confirm `scores only the current player` **fails**. Restore and confirm it passes. Report both outcomes. Do not commit the mutation.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/game.ts packages/rules/src/index.ts packages/rules/test/game.test.ts packages/rules/test/legalMoves.test.ts packages/rules/test/key.test.ts
git commit -m "feat(rules): port Game with hand-written clone and canonical key"
```

---

### Task 8: The differential oracle

**Files:**
- Create: `tools/gen_oracle.py`, `packages/rules/src/digest.ts`
- Create: `packages/rules/test/fixtures/oracle/*.json` (generated)
- Test: `packages/rules/test/oracle.test.ts`

**Interfaces:**
- Consumes: `Game` from `game.ts`; the Python engine in `passtally/`.
- Produces: `digest(game): string`; a fixture format shared by both languages.

**This task is the gate on the whole port.** The Python engine is the reference; a divergence anywhere in a playout is caught at the action that caused it.

**The digest must be byte-identical across languages.** Two rules make that work:

1. **Fixed key order, no sorting.** Python dicts and JS objects both preserve insertion order, so both sides build the object in the same order and neither sorts.
2. **No whitespace.** Python must use `json.dumps(obj, separators=(",", ":"))`; `JSON.stringify` already emits none.

Digest shape, in this exact order:

```json
{"n":6,"cells":[[[h,conns,partner],...],...],"ring":[occupant,...],
 "piles":[[faceUp,ordered],...],"players":[[markerSlots,score],...],
 "cur":0,"act":2,"first":0,"final":false,"over":false}
```

`conns` is `null` for an empty cell, else pairs each sorted ascending and the list sorted lexically. `partner` is `null` or `[dr,dc]`. `occupant` is `null` or the marker id.

**Fixtures record dealt piles explicitly, never seeds** — T5 means Python and TS produce different deals from the same seed.

- [ ] **Step 1: Write `tools/gen_oracle.py`**

```python
"""Generate differential oracle fixtures from the Python engine.

The Python engine is the reference implementation. Each fixture records a
complete random playout -- the explicit deal, the setup placements, every move,
and a portable state digest AFTER EVERY ACTION -- so the TypeScript port can
replay it and be checked step by step.

Run: PYTHONPATH=. python tools/gen_oracle.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from passtally import config
from passtally.board import partner_offset
from passtally.game import Game
from passtally.types import MoveMarker, PlaceTile

OUT = Path("packages/rules/test/fixtures/oracle")
N_FIXTURES = 25
MAX_ACTIONS = 400


def digest(game: Game) -> str:
    """Portable canonical state. Key order is fixed and nothing is sorted --
    the TypeScript side builds the same object in the same order."""
    cells = []
    for row in range(game.board.n):
        out_row = []
        for col in range(game.board.n):
            cell = game.board.cells[row][col]
            if cell.height == 0:
                conns = None
            else:
                pairs = sorted(sorted((int(a), int(b))) for a, b in cell.conns)
                conns = pairs
            p = partner_offset(game.board, row, col)
            out_row.append([cell.height, conns, list(p) if p else None])
        cells.append(out_row)

    obj = {
        "n": game.board.n,
        "cells": cells,
        "ring": [s.occupant for s in game.board.ring],
        "piles": [[p.face_up, list(p.ordered)] for p in game.piles],
        "players": [[list(p.marker_slots), p.score] for p in game.players],
        "cur": game.current_player,
        "act": game.actions_left,
        "first": game.first_player,
        "final": game._final_round,
        "over": game._over,
    }
    return json.dumps(obj, separators=(",", ":"))


def encode(move) -> dict:
    if isinstance(move, PlaceTile):
        return {
            "kind": "place", "pileIndex": move.pile_index,
            "cellA": list(move.cell_a), "cellB": list(move.cell_b),
            "orientation": move.orientation,
        }
    return {"kind": "marker", "markerIndex": move.marker_index, "distance": move.distance}


def snake_order(n_players: int) -> list[int]:
    order: list[int] = []
    for pass_index in range(config.MARKERS_PER_PLAYER):
        seq = range(n_players) if pass_index % 2 == 0 else reversed(range(n_players))
        order.extend(seq)
    return order


def playout(rng: random.Random, n_players: int, board_size: int) -> dict:
    game = Game.new(n_players, seed=rng.randrange(1 << 30), board_size=board_size)
    deal = [[p.face_up, list(p.ordered)] for p in game.piles]

    setup: list[list[int]] = []
    for player in snake_order(n_players):
        free = [
            i for i, s in enumerate(game.board.ring)
            if s.occupant is None
            and all(e // board_size != i // board_size for e in game.players[player].marker_slots)
        ]
        slot = rng.choice(free)
        game.setup_place_marker(player, slot)
        setup.append([player, slot])

    steps = [{"move": None, "digest": digest(game)}]
    for _ in range(MAX_ACTIONS):
        if game.is_over():
            break
        moves = game.legal_moves()
        if not moves:
            break
        move = rng.choice(moves)
        game.apply(move)
        steps.append({"move": encode(move), "digest": digest(game)})

    return {
        "nPlayers": n_players, "boardSize": board_size,
        "deal": deal, "setup": setup, "steps": steps,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    rng = random.Random(20260817)
    for i in range(N_FIXTURES):
        n_players = 2 if i % 3 else 3
        board_size = 6 if i % 4 else 4
        fixture = playout(rng, n_players, board_size)
        (OUT / f"playout-{i:02d}.json").write_text(
            json.dumps(fixture, separators=(",", ":")), encoding="utf-8"
        )
    print(f"wrote {N_FIXTURES} fixtures to {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate the fixtures**

Run: `PYTHONPATH=. python tools/gen_oracle.py`
Expected: `wrote 25 fixtures to packages/rules/test/fixtures/oracle`

Inspect one file and confirm `steps` has a `digest` on every entry and the first `move` is `null`.

- [ ] **Step 3: Write `packages/rules/src/digest.ts`**

```ts
/** Portable canonical state digest, byte-identical to tools/gen_oracle.py.
 *
 *  Key order is fixed and nothing is sorted at the top level -- Python dicts
 *  and JS objects both preserve insertion order, so both sides build the same
 *  object the same way. JSON.stringify emits no whitespace; the Python side
 *  passes separators=(",", ":") to match. */

import { partnerOffset } from "./board.js";
import type { Game } from "./game.js";

export function digest(game: Game): string {
  const cells = [];
  for (let row = 0; row < game.board.n; row++) {
    const outRow = [];
    for (let col = 0; col < game.board.n; col++) {
      const cell = game.board.cells[row]![col]!;
      const conns = cell.height === 0
        ? null
        : cell.conns
            .map(([a, b]) => (a < b ? [a, b] : [b, a]))
            .sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);
      const p = partnerOffset(game.board, row, col);
      outRow.push([cell.height, conns, p === null ? null : [p[0], p[1]]]);
    }
    cells.push(outRow);
  }

  return JSON.stringify({
    n: game.board.n,
    cells,
    ring: game.board.ring.map((s) => s.occupant),
    piles: game.piles.map((p) => [p.faceUp, [...p.ordered]]),
    players: game.players.map((p) => [[...p.markerSlots], p.score]),
    cur: game.currentPlayer,
    act: game.actionsLeft,
    first: game.firstPlayer,
    final: game.finalRound,
    over: game.over,
  });
}
```

- [ ] **Step 4: Write the oracle replay test**

`packages/rules/test/oracle.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { digest } from "../src/digest.js";
import { Game } from "../src/game.js";
import type { Move, TypeId } from "../src/types.js";

type Fixture = {
  nPlayers: number;
  boardSize: number;
  deal: [TypeId | null, TypeId[]][];
  setup: [number, number][];
  steps: { move: Move | null; digest: string }[];
};

// The package is ESM, so there is no __dirname.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oracle");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("differential oracle", () => {
  it("has fixtures", () => expect(FILES.length).toBeGreaterThan(0));

  it.each(FILES)("%s replays identically", (file) => {
    const fx: Fixture = JSON.parse(readFileSync(join(DIR, file), "utf-8"));

    // Seeds do not port (T5), so install the recorded deal directly.
    const game = Game.newGame(fx.nPlayers, 0, fx.boardSize);
    fx.deal.forEach(([faceUp, ordered], i) => {
      game.piles[i]!.faceUp = faceUp;
      game.piles[i]!.ordered = [...ordered];
    });

    for (const [player, slot] of fx.setup) game.setupPlaceMarker(player, slot);

    fx.steps.forEach((stepData, index) => {
      if (stepData.move !== null) game.apply(stepData.move);
      expect(digest(game), `${file} diverged at step ${index}`).toBe(stepData.digest);
    });
  });
});
```

- [ ] **Step 5: Run the oracle**

Run: `npm test -w @passtally/rules`
Expected: PASS — every fixture replays with matching digests at every step.

**If a fixture diverges**, the message names the file and step. Read both digests, find the first differing field, and fix the TypeScript. **Do not edit `passtally/*.py` or regenerate fixtures to make a failure go away** — the Python engine is the reference, and a divergence means the port is wrong.

- [ ] **Step 6: Verify the oracle can actually fail**

Temporarily break one ported rule — change `passesToVp` to return `total` directly. Confirm the oracle test **fails** on the first fixture where a score is awarded. Restore and confirm it passes. Report both outcomes. Do not commit the mutation.

An oracle that cannot fail is worth nothing, and this suite has already produced three tests that passed while testing nothing.

- [ ] **Step 7: Add a full-game smoke test**

Append to `packages/rules/test/oracle.test.ts`:

```ts
describe("smoke", () => {
  it.each([2, 3])("plays a full %i-player game to completion", (nPlayers) => {
    const g = Game.newGame(nPlayers, 12345, 6);
    let order: number[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const seq = pass % 2 === 0
        ? [...Array(nPlayers).keys()]
        : [...Array(nPlayers).keys()].reverse();
      order = order.concat(seq);
    }
    for (const player of order) {
      const free = g.board.ring
        .map((s, i) => (s.occupant === null ? i : -1))
        .filter((i) => i >= 0)
        .filter((i) => !g.players[player]!.markerSlots
          .some((e) => Math.floor(e / g.board.n) === Math.floor(i / g.board.n)));
      g.setupPlaceMarker(player, free[0]!);
    }
    expect(g.isSetupComplete()).toBe(true);

    let guard = 0;
    while (!g.isOver() && guard++ < 2000) {
      const moves = g.legalMoves();
      if (moves.length === 0) break;
      g.apply(moves[guard % moves.length]!);
    }
    expect(g.isOver()).toBe(true);
    expect(g.piles.every((p) => p.faceUp === null)).toBe(true);
  });
});
```

- [ ] **Step 8: Run the full suite**

Run: `npm test -w @passtally/rules && npm run typecheck`
Expected: PASS, no type errors, output pristine.

- [ ] **Step 9: Commit**

```bash
git add tools/gen_oracle.py packages/rules/src/digest.ts packages/rules/test/oracle.test.ts packages/rules/test/fixtures/
git commit -m "feat(rules): differential oracle against the Python engine"
```

---

## Verification

- [ ] **Full suite green**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors, no warnings.

- [ ] **No board dimension hardcoded outside config**

Run: `grep -rn "\b6\b" packages/rules/src --include=*.ts | grep -v config.ts`
Expected: no hits representing a grid dimension. Tile ids 1–6 and the shape-pair count of 6 in `tileTypes.ts` are legitimate.

- [ ] **Rules package has no dependencies**

Run: `cat packages/rules/package.json`
Expected: no `dependencies` key.

- [ ] **The Python engine is untouched**

Run: `git diff --stat 432cb63..HEAD -- passtally/ tests/`
Expected: no output. The oracle is only valid if the reference did not move.

---

## Self-Review Notes

Checked against the spec section by section:

- §2 monorepo, `packages/rules`, no runtime deps → Task 1
- §3 T1–T6 translation rules → applied across Tasks 1–7, stated once at the top
- §3 seeded RNG does not port → Task 1 (`rng.ts`), and why fixtures record deals → Task 8
- §3 differential oracle → Task 8
- §4 `partnerOffset` promoted for the client → Task 2
- §10 ported suite including the four hard-won regression guards → Tasks 3, 5, 6, 7
- §10 vacuity discipline → explicit mutation-check steps in Tasks 3, 5, 6, 7 and 8

Out of scope for this plan, and in plan 2: the `Session` interface, `GameView` and its redaction test, `geometry.ts`/`hitTest`, tentative state, orientation normalization, and all rendering.
