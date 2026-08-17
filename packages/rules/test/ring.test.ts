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
