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
