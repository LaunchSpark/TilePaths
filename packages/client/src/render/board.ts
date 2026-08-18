import { offsetOf } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { cellRect, slotRect, unit } from "../geometry.js";
import type { Layout, Rect } from "../geometry.js";
import type { Controller } from "../state.js";
import { drawCellArt, levelFill } from "./tiles.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

function strokeRect(ctx: CanvasRenderingContext2D, rect: Rect, colour: string, width: number): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.strokeRect(rect.x + width / 2, rect.y + width / 2, rect.w - width, rect.h - width);
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  controller: Controller,
  hoverCell: [number, number] | null,
): void {
  const view = controller.view();
  const size = unit(layout);

  ctx.fillStyle = "#e7e2d8";
  ctx.fillRect(layout.originX, layout.originY, layout.size, layout.size);
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(
    layout.originX + size,
    layout.originY + size,
    layout.size - 2 * size,
    layout.size - 2 * size,
  );

  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      const rect = cellRect(layout, row, col);
      const cell = view.cells[row]![col]!;
      if (cell.conns === null) strokeRect(ctx, rect, "#ddd7cb", 1);
      else drawCellArt(ctx, rect, cell.conns, cell.height);
    }
  }

  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 1.5;
  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      if (view.cells[row]![col]!.partner === null) continue;
      const rect = cellRect(layout, row, col);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  view.ring.forEach((slot, index) => {
    if (slot.occupant === null) return;
    const rect = slotRect(layout, index);
    ctx.fillStyle = PLAYER_COLOURS[Math.floor(slot.occupant / 4) % PLAYER_COLOURS.length]!;
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  if (controller.state === "markerSelected") {
    for (const destination of controller.markerDestinations) {
      strokeRect(ctx, slotRect(layout, destination.slot), "#2f6fd0", 3);
    }
  }

  if (controller.state === "tileSelected" && hoverCell !== null) {
    const faceUp = view.piles[controller.selectedPile!]!.faceUp as TypeId | null;
    if (faceUp !== null) {
      const [dr, dc] = offsetOf(controller.ghostOrientation);
      ctx.globalAlpha = 0.55;
      for (const [row, col] of [hoverCell, [hoverCell[0] + dr, hoverCell[1] + dc]]) {
        if (row! < 0 || col! < 0 || row! >= view.n || col! >= view.n) continue;
        const rect = cellRect(layout, row!, col!);
        ctx.fillStyle = levelFill(view.cells[row!]![col!]!.height + 1);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        strokeRect(ctx, rect, "#2f6fd0", 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}
