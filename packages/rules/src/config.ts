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
