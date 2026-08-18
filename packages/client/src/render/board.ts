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

function drawCellGuide(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  const arm = Math.min(rect.w, rect.h) * 0.18;
  ctx.strokeStyle = "#c8c1b4";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(centreX - arm, centreY);
  ctx.lineTo(centreX + arm, centreY);
  ctx.moveTo(centreX, centreY - arm);
  ctx.lineTo(centreX, centreY + arm);
  ctx.stroke();
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

  if (view.phase === "setup") {
    const colour = PLAYER_COLOURS[(view.setupNext ?? 0) % PLAYER_COLOURS.length]!;
    for (const slot of view.setupLegalSlots) {
      const rect = slotRect(layout, slot);
      ctx.fillStyle = "#d1c7b6";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      strokeRect(ctx, rect, colour, 2);
    }
  }

  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      const rect = cellRect(layout, row, col);
      const cell = view.cells[row]![col]!;
      if (cell.conns === null) {
        strokeRect(ctx, rect, "#ddd7cb", 1);
        drawCellGuide(ctx, rect);
      } else {
        drawCellArt(ctx, rect, cell.conns, cell.height);
      }
    }
  }

  // One 2:1 outline per placement makes the two occupied cells read as a
  // physical domino. Only the north/west cell draws, so each tile appears once.
  for (let row = 0; row < view.n; row++) {
    for (let col = 0; col < view.n; col++) {
      const partner = view.cells[row]![col]!.partner;
      if (partner === null) continue;
      const [dr, dc] = partner;
      if (dr < 0 || dc < 0) continue;
      const first = cellRect(layout, row, col);
      const second = cellRect(layout, row + dr, col + dc);
      strokeRect(ctx, {
        x: Math.min(first.x, second.x),
        y: Math.min(first.y, second.y),
        w: Math.max(first.x + first.w, second.x + second.w) - Math.min(first.x, second.x),
        h: Math.max(first.y + first.h, second.y + second.h) - Math.min(first.y, second.y),
      }, "#1b1b1b", 2);
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
      const ghostCells: [number, number][] = [
        hoverCell,
        [hoverCell[0] + dr, hoverCell[1] + dc],
      ];
      const visibleRects: Rect[] = [];
      for (const [row, col] of ghostCells) {
        if (row! < 0 || col! < 0 || row! >= view.n || col! >= view.n) continue;
        const rect = cellRect(layout, row!, col!);
        visibleRects.push(rect);
        ctx.fillStyle = levelFill(view.cells[row!]![col!]!.height + 1);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      if (visibleRects.length === 2) {
        const [first, second] = visibleRects as [Rect, Rect];
        strokeRect(ctx, {
          x: Math.min(first.x, second.x),
          y: Math.min(first.y, second.y),
          w: Math.max(first.x + first.w, second.x + second.w) - Math.min(first.x, second.x),
          h: Math.max(first.y + first.h, second.y + second.h) - Math.min(first.y, second.y),
        }, "#2f6fd0", 3);
      } else {
        for (const rect of visibleRects) strokeRect(ctx, rect, "#2f6fd0", 3);
      }
      ctx.globalAlpha = 1;
    }
  }
}
