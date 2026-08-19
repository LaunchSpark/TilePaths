import type { TracedPath } from "@passtally/rules";
import type { Layout } from "../geometry.js";
import { cellRect } from "../geometry.js";
import { drawConnection } from "./tiles.js";

export function drawPathHighlights(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  paths: readonly TracedPath[],
): void {
  const drawn = new Set<string>();
  ctx.save();
  ctx.strokeStyle = "#ffd928";
  ctx.lineWidth = Math.max(4, cellRect(layout, 0, 0).w * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const path of paths) {
    for (const step of path.steps) {
      const lo = Math.min(step.entry, step.exit);
      const hi = Math.max(step.entry, step.exit);
      const key = `${step.row},${step.col},${lo},${hi}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      drawConnection(
        ctx,
        cellRect(layout, step.row, step.col),
        step.entry,
        step.exit,
      );
    }
  }
  ctx.restore();
}
