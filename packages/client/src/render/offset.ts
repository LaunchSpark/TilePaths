import { DELTA } from "@passtally/rules";
import type { PathStep, Side } from "@passtally/rules";
import type { LineView } from "../lines.js";

/** Lane index (0-based, within its cell's group) for one line's visit to one
 *  step of its path, keyed by cell + owner + ascending slot pair + step
 *  index. Exported alongside `assignLanes` so a renderer can look up the
 *  lane for a given `(line, stepIndex)` without re-deriving the key format. */
export type LaneAssignment = Map<string, number>;

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** The `LaneAssignment` key for one line's visit to one step of its path.
 *  Includes the cell so two entries at different cells never collide, and
 *  the owner/slots/stepIndex so a self-crossing line's repeat visit to the
 *  same cell gets its own entry. */
export function laneKey(line: LineView, stepIndex: number): string {
  const step = line.steps[stepIndex]!;
  return `${cellKey(step.row, step.col)}|${line.owner}|${line.slots[0]}-${line.slots[1]}|${stepIndex}`;
}

type GroupEntry = {
  key: string;
  cell: string;
  owner: number;
  slots: readonly [number, number];
  stepIndex: number;
};

/** Assigns every `(line, stepIndex)` visit to a cell a lane number, grouped
 *  by the cell it occupies and numbered within that group by sorting on
 *  `(owner, slots[0], slots[1], stepIndex)`. Deterministic given the same
 *  `lines` input, so the same line always lands in the same lane between
 *  redraws -- and a self-crossing line's second visit to a cell, having a
 *  different `stepIndex`, always sorts into its own lane. */
export function assignLanes(lines: LineView[]): LaneAssignment {
  const groups = new Map<string, GroupEntry[]>();
  for (const line of lines) {
    line.steps.forEach((step, stepIndex) => {
      const entry: GroupEntry = {
        key: laneKey(line, stepIndex),
        cell: cellKey(step.row, step.col),
        owner: line.owner,
        slots: line.slots,
        stepIndex,
      };
      const group = groups.get(entry.cell);
      if (group) group.push(entry);
      else groups.set(entry.cell, [entry]);
    });
  }

  const lanes: LaneAssignment = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) =>
      a.owner - b.owner
      || a.slots[0] - b.slots[0]
      || a.slots[1] - b.slots[1]
      || a.stepIndex - b.stepIndex);
    group.forEach((entry, lane) => lanes.set(entry.key, lane));
  }
  return lanes;
}

/** Unit vector for the step's travel direction, derived from the incoming
 *  direction implied by its entry face and the outgoing direction implied by
 *  its exit face. Falls back to due "east" for the degenerate case where
 *  entry and exit imply no net direction (zero-length vector). */
function travelUnit(entry: Side, exit: Side): [number, number] {
  const [enterRow, enterCol] = DELTA[entry];
  const [exitRow, exitCol] = DELTA[exit];
  const dx = exitCol - enterCol;
  const dy = exitRow - enterRow;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) return [1, 0];
  return [dx / magnitude, dy / magnitude];
}

/** Perpendicular displacement, in the same units as `gap`, for lane `lane`
 *  of `lanes` total lanes sharing a step. Lane offsets are centred on the
 *  true path -- `(lane - (lanes - 1) / 2) * gap` -- and rotated 90 degrees
 *  from the step's travel direction so they separate lanes sideways rather
 *  than along the line itself. */
export function offsetFor(
  step: PathStep,
  lane: number,
  lanes: number,
  gap: number,
): [number, number] {
  const [dx, dy] = travelUnit(step.entry, step.exit);
  const magnitude = (lane - (lanes - 1) / 2) * gap;
  // `|| 0` folds any resulting -0 (e.g. dy === 0, magnitude < 0) to +0 so
  // callers never have to reason about signed-zero equality.
  return [(-dy * magnitude) || 0, (dx * magnitude) || 0];
}
