import { Side } from "@passtally/rules";
import type { Rect } from "../geometry.js";

function facePoint(rect: Rect, side: Side): [number, number] {
  const { x, y, w, h } = rect;
  if (side === Side.N) return [x + w / 2, y];
  if (side === Side.E) return [x + w, y + h / 2];
  if (side === Side.S) return [x + w / 2, y + h];
  return [x, y + h / 2];
}

export function levelFill(level: number): string {
  return `hsl(38 42% ${Math.max(28, 82 - (level - 1) * 16)}%)`;
}

export function drawCellArt(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  conns: [Side, Side][],
  level: number,
): void {
  ctx.fillStyle = levelFill(level);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = Math.max(2, rect.w * 0.09);
  ctx.lineCap = "round";

  for (const [a, b] of conns) {
    const [ax, ay] = facePoint(rect, a);
    const [bx, by] = facePoint(rect, b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    if ((a + 2) % 4 === b) {
      ctx.lineTo(bx, by);
    } else {
      ctx.quadraticCurveTo(rect.x + rect.w / 2, rect.y + rect.h / 2, bx, by);
    }
    ctx.stroke();
  }

  if (level > 1) {
    ctx.fillStyle = "#111";
    ctx.font = `${Math.round(rect.w * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(level), rect.x + rect.w - 3, rect.y + rect.h - 2);
  }
}
