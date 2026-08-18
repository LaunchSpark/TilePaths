import type { Layout } from "../geometry.js";
import { cellRect } from "../geometry.js";
import type { HighlightedPath } from "../path-highlight.js";
import { drawConnection } from "./tiles.js";

export function drawPathHighlights(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  paths: readonly HighlightedPath[],
): void {
  const drawn = new Set<string>();
  ctx.save();
  ctx.strokeStyle = "#ffd928";
  ctx.lineWidth = Math.max(4, cellRect(layout, 0, 0).w * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const path of paths) {
    for (const segment of path.segments) {
      const lo = Math.min(segment.entry, segment.exit);
      const hi = Math.max(segment.entry, segment.exit);
      const key = `${segment.row},${segment.col},${lo},${hi}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      drawConnection(
        ctx,
        cellRect(layout, segment.row, segment.col),
        segment.entry,
        segment.exit,
      );
    }
  }
  ctx.restore();
}
