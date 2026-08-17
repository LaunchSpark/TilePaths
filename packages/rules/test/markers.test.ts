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
