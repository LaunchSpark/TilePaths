import { describe, expect, it } from "vitest";
import { tweenedScore } from "../src/ui/rail.js";

// Backs the animated-score readout (Task 8): a pure interpolation with real
// arithmetic (easing, clamping), so -- unlike the DOM rendering around it --
// it gets a unit test of its own.
describe("tweenedScore", () => {
  it("starts at the source value", () => {
    expect(tweenedScore(3, 9, 0, 400)).toBe(3);
  });

  it("reaches the target value once the duration has elapsed", () => {
    expect(tweenedScore(3, 9, 400, 400)).toBe(9);
  });

  it("clamps to the target for elapsed times beyond the duration", () => {
    expect(tweenedScore(3, 9, 10_000, 400)).toBe(9);
  });

  it("clamps to the source for negative elapsed times", () => {
    expect(tweenedScore(3, 9, -50, 400)).toBe(3);
  });

  it("moves strictly between the two values partway through", () => {
    const mid = tweenedScore(3, 9, 200, 400);
    expect(mid).toBeGreaterThan(3);
    expect(mid).toBeLessThan(9);
  });

  it("eases out rather than moving at a constant rate", () => {
    // An ease-out curve covers more ground in the first half of the tween
    // than the second -- unlike a linear tween, where both halves are equal.
    const quarter = tweenedScore(0, 100, 100, 400);
    const half = tweenedScore(0, 100, 200, 400);
    expect(quarter).toBeGreaterThan(half / 2);
  });

  it("handles a decreasing value the same way", () => {
    expect(tweenedScore(9, 3, 0, 400)).toBe(9);
    expect(tweenedScore(9, 3, 400, 400)).toBe(3);
  });
});
