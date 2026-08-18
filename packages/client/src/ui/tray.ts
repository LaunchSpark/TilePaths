import { resolve } from "@passtally/rules";
import type { TypeId } from "@passtally/rules";
import { drawCellArt } from "../render/tiles.js";
import type { Controller } from "../state.js";

const PILE_PX = 64;

function drawPileTile(canvas: HTMLCanvasElement, typeId: TypeId): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [connsA, connsB] = resolve(typeId, 0);
  const half = PILE_PX / 2;
  drawCellArt(ctx, { x: 0, y: 0, w: PILE_PX, h: half }, connsA, 1);
  drawCellArt(ctx, { x: 0, y: half, w: PILE_PX, h: half }, connsB, 1);
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
    canvas.width = PILE_PX;
    canvas.height = PILE_PX;
    if (pile.faceUp !== null && !controller.isSpent(index)) drawPileTile(canvas, pile.faceUp);
    canvas.addEventListener("click", () =>
      controller.handleAndRender({ kind: "selectPile", pileIndex: index }));

    const count = document.createElement("div");
    count.className = "pile-count";
    count.textContent = String(pile.count);

    wrap.append(canvas, count);
    root.append(wrap);
  });
}
