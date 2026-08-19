import type { TracedPath } from "@passtally/rules";
import type { Layout } from "../geometry.js";
import { cellRect, slotRect } from "../geometry.js";
import type { LineView } from "../lines.js";
import { PLAYER_COLOURS } from "./board.js";
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

/** Text colour (near-black or near-white) that reads clearly against a badge
 *  filled with the given hex colour. */
function contrastingText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1b1b1b" : "#f6f3ec";
}

/** Draw each line's pass count on both of its endpoint markers, filled in the
 *  owner's colour with a numeral that contrasts against it. */
export function drawPassBadges(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  lines: readonly LineView[],
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const line of lines) {
    const colour = PLAYER_COLOURS[line.owner % PLAYER_COLOURS.length]!;
    const textColour = contrastingText(colour);
    for (const slot of line.slots) {
      const rect = slotRect(layout, slot);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const radius = rect.w * 0.32;

      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = textColour;
      ctx.font = `bold ${Math.max(9, rect.w * 0.4)}px sans-serif`;
      ctx.fillText(String(line.passes), cx, cy);
    }
  }
  ctx.restore();
}
