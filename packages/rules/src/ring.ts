import { RING_CONTINUOUS } from "./config.js";

/** The border ring. This class is the single seam for the corner-continuity
 *  rule: if markers turn out to be blocked at corners, only `move` changes. */
export class Ring {
  readonly n: number;
  readonly size: number;
  readonly continuous: boolean;

  constructor(n: number, continuous: boolean = RING_CONTINUOUS) {
    if (!continuous) {
      throw new Error(
        "Discontinuous ring not implemented. To block markers at corners, " +
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
