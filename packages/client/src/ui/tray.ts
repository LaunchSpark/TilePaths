import { resolve } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { drawCellArt } from "../render/tiles.js";
import type { Controller } from "../state.js";

const PILE_WIDTH = 64;
const PILE_HEIGHT = 128;

export const TILE_DRAG_TYPE = "application/x-passtally-pile";

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

export function renderTray(root: HTMLElement, controller: Controller): void {
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
    canvas.draggable = view.phase === "play"
      && view.actionsLeft > 0
      && pile.faceUp !== null
      && !controller.isSpent(index);
    if (pile.faceUp !== null && !controller.isSpent(index)) drawPileTile(canvas, pile.faceUp);
    canvas.addEventListener("click", () =>
      controller.handleAndRender({ kind: "selectPile", pileIndex: index }));
    canvas.addEventListener("dragstart", (event) => {
      controller.handle({ kind: "selectPile", pileIndex: index });
      if (controller.lastRejection !== null || event.dataTransfer === null) {
        event.preventDefault();
        controller.onChange?.();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(TILE_DRAG_TYPE, String(index));
      wrap.classList.add("selected", "dragging");
    });
    canvas.addEventListener("dragend", (event) => {
      if (
        event.dataTransfer?.dropEffect === "none"
        && controller.state === "tileSelected"
        && controller.selectedPile === index
        && controller.lastRejection === null
      ) {
        controller.handleAndRender({ kind: "escape" });
      }
    });

    const count = document.createElement("div");
    count.className = "pile-count";
    count.textContent = String(pile.count);

    wrap.append(canvas, count);
    root.append(wrap);
  });
}
