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
