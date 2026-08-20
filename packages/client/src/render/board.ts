import { offsetOf } from "@passtally/rules";
import type { TracedPath, TypeId } from "@passtally/rules";
import { cellRect, slotRect, unit } from "../geometry.js";
import type { Layout, Rect } from "../geometry.js";
import type { Controller } from "../state.js";
import type { GameView } from "../types.js";
import { crossingsAt } from "./breakdown.js";
import { drawPathHighlights } from "./highlights.js";
import { drawCellArt, levelFill } from "./tiles.js";

export const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

function strokeRect(ctx: CanvasRenderingContext2D, rect: Rect, colour: string, width: number): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.strokeRect(rect.x + width / 2, rect.y + width / 2, rect.w - width, rect.h - width);
}

function drawStartingPaths(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = Math.max(2, rect.w * 0.09);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(rect.x, centreY);
  ctx.lineTo(rect.x + rect.w, centreY);
  ctx.moveTo(centreX, rect.y);
  ctx.lineTo(centreX, rect.y + rect.h);
  ctx.stroke();
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  controller: Controller,
  view: GameView,
  hoverCell: [number, number] | null,
  highlighted: readonly TracedPath[] = [],
): void {
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
        drawStartingPaths(ctx, rect);
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

  // Pending placements are movable until committed. A restrained tint and
  // dashed outline distinguish them without obscuring their path artwork.
  for (const move of controller.pendingPlacements) {
    const [dr, dc] = offsetOf(move.orientation);
    const first = cellRect(layout, move.cellA[0], move.cellA[1]);
    const second = cellRect(layout, move.cellA[0] + dr, move.cellA[1] + dc);
    const bounds: Rect = {
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      w: Math.max(first.x + first.w, second.x + second.w) - Math.min(first.x, second.x),
      h: Math.max(first.y + first.h, second.y + second.h) - Math.min(first.y, second.y),
    };
    ctx.save();
    ctx.fillStyle = "rgba(47, 111, 208, 0.10)";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.setLineDash([6, 4]);
    strokeRect(ctx, bounds, "#2f6fd0", 2);
    ctx.restore();
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

  // Legal-anchor tint: which cells could receive the selected tile at its
  // current orientation, independent of where the pointer currently sits.
  // `legalAnchors()` is a plain cached getter (recomputed only on selection,
  // rotation or board change -- see Controller.recomputeLegalAnchors), so
  // calling it here every render frame, including every mousemove, does not
  // re-run the canPlace scan each time.
  if (controller.state === "tileSelected") {
    const [dr, dc] = offsetOf(controller.ghostOrientation);
    ctx.save();
    ctx.fillStyle = "rgba(63, 160, 90, 0.16)";
    for (const [row, col] of controller.legalAnchors()) {
      const anchorRect = cellRect(layout, row, col);
      ctx.fillRect(anchorRect.x, anchorRect.y, anchorRect.w, anchorRect.h);
      const partnerRow = row + dr;
      const partnerCol = col + dc;
      if (partnerRow >= 0 && partnerCol >= 0 && partnerRow < view.n && partnerCol < view.n) {
        const partnerRect = cellRect(layout, partnerRow, partnerCol);
        ctx.fillRect(partnerRect.x, partnerRect.y, partnerRect.w, partnerRect.h);
      }
    }
    ctx.restore();
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

  drawPathHighlights(ctx, layout, highlighted);

  if (hoverCell !== null) drawHoverReadout(ctx, layout, view, controller, hoverCell);
}

/** Reports the hovered cell's level and, when it sits on a visible line, how
 *  many passes it contributes there and to whose lines. Tier 1 already badges
 *  any tile at level >= 2, so a bare level number would be redundant on its
 *  own -- the per-line contribution is the part a badge can't show. Driven
 *  entirely by `controller.hoveredCell` (passed in as `hoverCell`) and
 *  `controller.visibleLines()`, the same completed-line set already drawn by
 *  `drawLines`/`drawPassBadges`, so this adds no new tracing of its own. */
function drawHoverReadout(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  view: GameView,
  controller: Controller,
  hoverCell: [number, number],
): void {
  const [row, col] = hoverCell;
  if (row < 0 || col < 0 || row >= view.n || col >= view.n) return;
  const level = view.cells[row]![col]!.height;

  const lines = [`Level ${level}`];
  for (const crossing of crossingsAt(hoverCell, controller.visibleLines())) {
    const passWord = crossing.passes === 1 ? "pass" : "passes";
    lines.push(
      `P${crossing.owner + 1} line ${crossing.slots[0]}–${crossing.slots[1]}: `
      + `${crossing.passes} ${passWord}`,
    );
  }

  const font = "12px sans-serif";
  const lineHeight = 15;
  const padX = 8;
  const padY = 6;
  ctx.save();
  ctx.font = font;
  const textWidth = Math.max(...lines.map((text) => ctx.measureText(text).width));
  const boxW = textWidth + padX * 2;
  const boxH = lines.length * lineHeight + padY * 2;
  const boxX = layout.originX + 4;
  const boxY = layout.originY + 4;

  ctx.fillStyle = "rgba(27, 27, 27, 0.85)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = "#f6f3ec";
  ctx.textBaseline = "top";
  lines.forEach((text, index) => {
    ctx.fillText(text, boxX + padX, boxY + padY + index * lineHeight);
  });
  ctx.restore();
}
