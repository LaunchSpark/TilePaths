import { Side, slotIndexOf } from "@passtally/rules";

export type Layout = {
  originX: number;
  originY: number;
  size: number;
  n: number;
};

export type Hit =
  | { kind: "cell"; row: number; col: number }
  | { kind: "slot"; index: number }
  | { kind: "none" };

export type Rect = { x: number; y: number; w: number; h: number };

export function layoutFor(n: number, size: number, originX = 0, originY = 0): Layout {
  return { originX, originY, size, n };
}

export function unit(layout: Layout): number {
  return layout.size / (layout.n + 2);
}

export function hitTest(px: number, py: number, layout: Layout): Hit {
  const size = unit(layout);
  const u = Math.floor((px - layout.originX) / size);
  const v = Math.floor((py - layout.originY) / size);
  const last = layout.n + 1;

  if (u < 0 || v < 0 || u > last || v > last) return { kind: "none" };

  const onVerticalEdge = u === 0 || u === last;
  const onHorizontalEdge = v === 0 || v === last;
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
  const size = unit(layout);
  return {
    x: layout.originX + (col + 1) * size,
    y: layout.originY + (row + 1) * size,
    w: size,
    h: size,
  };
}

export function slotRect(layout: Layout, slotIndex: number): Rect {
  const size = unit(layout);
  const n = layout.n;
  const last = n + 1;
  let u: number;
  let v: number;
  if (slotIndex < n) {
    u = slotIndex + 1;
    v = 0;
  } else if (slotIndex < 2 * n) {
    u = last;
    v = slotIndex - n + 1;
  } else if (slotIndex < 3 * n) {
    u = n - (slotIndex - 2 * n);
    v = last;
  } else {
    u = 0;
    v = n - (slotIndex - 3 * n);
  }
  return { x: layout.originX + u * size, y: layout.originY + v * size, w: size, h: size };
}
