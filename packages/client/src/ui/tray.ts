import { resolve } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { drawCellArt } from "../render/tiles.js";
import type { Controller } from "../state.js";
import { endDragPreview, moveDragPreview, startDragPreview } from "./drag-preview.js";

const PILE_WIDTH = 64;
const PILE_HEIGHT = 128;

export type TrayDragHandlers = {
  move(clientX: number, clientY: number): void;
  drop(pileIndex: number, clientX: number, clientY: number): void;
};

function drawPileTile(canvas: HTMLCanvasElement, typeId: TypeId): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [connsA, connsB] = resolve(typeId, 0);
  const half = PILE_HEIGHT / 2;
  drawCellArt(ctx, { x: 0, y: 0, w: PILE_WIDTH, h: half }, connsA, 1);
  drawCellArt(ctx, { x: 0, y: half, w: PILE_WIDTH, h: half }, connsB, 1);

  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, PILE_WIDTH - 2, PILE_HEIGHT - 2);
}

export function renderTray(
  root: HTMLElement,
  controller: Controller,
  drag: TrayDragHandlers,
): void {
  const view = controller.view();
  root.replaceChildren();

  view.piles.forEach((pile, index) => {
    const wrap = document.createElement("div");
    wrap.className = "pile";
    if (controller.selectedPile === index) wrap.classList.add("selected");
    if (controller.isSpent(index)) wrap.classList.add("spent");
    if (pile.faceUp === null) wrap.classList.add("empty");

    const canvas = document.createElement("canvas");
    canvas.width = PILE_WIDTH;
    canvas.height = PILE_HEIGHT;
    canvas.title = "Drag to place. Right-click or press R to rotate 90 degrees.";
    const canDrag = view.phase === "play"
      && view.actionsLeft > 0
      && pile.faceUp !== null
      && !controller.isSpent(index);
    canvas.classList.toggle("can-drag", canDrag);
    if (pile.faceUp !== null && !controller.isSpent(index)) drawPileTile(canvas, pile.faceUp);
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let moved = false;

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !canDrag) return;
      event.preventDefault();
      controller.handle({ kind: "selectPile", pileIndex: index });
      if (controller.lastRejection !== null) {
        controller.onChange?.();
        return;
      }
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      moved = false;
      canvas.setPointerCapture(pointerId);
      wrap.classList.add("selected", "dragging");
      startDragPreview(canvas, event.clientX, event.clientY, controller.ghostOrientation);
      controller.onChange?.();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) >= 4) moved = true;
      moveDragPreview(event.clientX, event.clientY);
      drag.move(event.clientX, event.clientY);
    });

    canvas.addEventListener("pointerup", (event) => {
      if (event.pointerId !== pointerId || event.button !== 0) return;
      canvas.releasePointerCapture(pointerId);
      pointerId = null;
      endDragPreview();
      wrap.classList.remove("dragging");
      if (moved) drag.drop(index, event.clientX, event.clientY);
      else controller.onChange?.();
    });

    canvas.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      endDragPreview();
      controller.handle({ kind: "escape" });
      controller.onChange?.();
    });

    const count = document.createElement("div");
    count.className = "pile-count";
    count.textContent = String(pile.count);

    wrap.append(canvas, count);
    root.append(wrap);
  });
}
