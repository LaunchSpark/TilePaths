import { Game, config } from "@passtally/rules";
import { hitTest, layoutFor } from "./geometry.js";
import { drawBoard } from "./render/board.js";
import { LocalSession } from "./session.js";
import { Controller } from "./state.js";
import { renderLog } from "./ui/log.js";
import { renderPlayers } from "./ui/rail.js";
import { renderTray, TILE_DRAG_TYPE } from "./ui/tray.js";

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const ctx = canvas.getContext("2d")!;
const trayRoot = document.querySelector<HTMLElement>("#piles")!;
const playersRoot = document.querySelector<HTMLElement>("#players")!;
const logRoot = document.querySelector<HTMLElement>("#log")!;
const actionsLabel = document.querySelector<HTMLElement>("#actions")!;
const rotateLeftButton = document.querySelector<HTMLButtonElement>("#rotate-left")!;
const rotateRightButton = document.querySelector<HTMLButtonElement>("#rotate-right")!;
const rotationLabel = document.querySelector<HTMLElement>("#rotation")!;
const commitButton = document.querySelector<HTMLButtonElement>("#commit")!;
const status = document.querySelector<HTMLElement>("#status")!;

const controller = new Controller(new LocalSession(Game.newGame(2, Date.now() & 0xffff)));
const layout = layoutFor(controller.view().n, canvas.width);
let hoverCell: [number, number] | null = null;

function render(): void {
  const view = controller.view();
  drawBoard(ctx, layout, controller, hoverCell);
  renderTray(trayRoot, controller);
  renderPlayers(playersRoot, controller);
  renderLog(logRoot, controller);

  actionsLabel.textContent = view.phase === "setup"
    ? `setup: player ${(view.setupNext ?? 0) + 1} places a marker`
    : `actions left: ${view.actionsLeft}`;
  const canRotate = controller.state === "tileSelected";
  rotateLeftButton.disabled = !canRotate;
  rotateRightButton.disabled = !canRotate;
  rotationLabel.textContent = `${controller.ghostOrientation * 90}°`;
  commitButton.disabled = view.phase !== "play" || view.actionsLeft !== 0;
  commitButton.textContent = view.phase !== "play"
    ? "commit"
    : view.actionsLeft === 0
      ? "commit turn"
      : view.actionsLeft === config.ACTIONS_PER_TURN
        ? `take ${config.ACTIONS_PER_TURN} actions`
        : `${view.actionsLeft} more action`;
  commitButton.title = view.phase === "play" && view.actionsLeft > 0
    ? `Passtally turns require ${config.ACTIONS_PER_TURN} actions.`
    : "Commit the completed turn";

  if (controller.lastRejection !== null) {
    status.textContent = controller.lastRejection;
    canvas.classList.remove("shake");
    void canvas.offsetWidth;
    canvas.classList.add("shake");
  } else if (view.phase === "over") {
    status.textContent = view.winner === null
      ? "Game over — a tie."
      : `Game over — player ${view.winner + 1} wins.`;
  } else {
    status.textContent = "";
  }
}

function boardPoint(clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) * canvas.width / rect.width,
    (clientY - rect.top) * canvas.height / rect.height,
  ];
}

function updateHover(clientX: number, clientY: number): void {
  const [x, y] = boardPoint(clientX, clientY);
  const hit = hitTest(x, y, layout);
  hoverCell = hit.kind === "cell" ? [hit.row, hit.col] : null;
}

controller.onChange = render;

canvas.addEventListener("mousemove", (event) => {
  const before = hoverCell;
  updateHover(event.clientX, event.clientY);
  const changed = JSON.stringify(hoverCell) !== JSON.stringify(before);
  if (changed) render();
});

canvas.addEventListener("click", (event) => {
  const [x, y] = boardPoint(event.clientX, event.clientY);
  controller.handleAndRender({
    kind: "click",
    hit: hitTest(x, y, layout),
  });
});

canvas.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes(TILE_DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  updateHover(event.clientX, event.clientY);
  drawBoard(ctx, layout, controller, hoverCell);
});

canvas.addEventListener("dragleave", (event) => {
  if (event.relatedTarget !== null && canvas.contains(event.relatedTarget as Node)) return;
  hoverCell = null;
  drawBoard(ctx, layout, controller, hoverCell);
});

canvas.addEventListener("drop", (event) => {
  if (event.dataTransfer === null) return;
  const rawPileIndex = event.dataTransfer.getData(TILE_DRAG_TYPE);
  if (!/^\d+$/.test(rawPileIndex)) return;
  const pileIndex = Number(rawPileIndex);
  event.preventDefault();
  if (controller.selectedPile !== pileIndex) {
    controller.handle({ kind: "selectPile", pileIndex });
  }
  const [x, y] = boardPoint(event.clientX, event.clientY);
  hoverCell = null;
  controller.handleAndRender({ kind: "click", hit: hitTest(x, y, layout) });
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  controller.handleAndRender({ kind: "rotate", direction: event.deltaY < 0 ? -1 : 1 });
}, { passive: false });

rotateLeftButton.addEventListener("click", () =>
  controller.handleAndRender({ kind: "rotate", direction: -1 }));
rotateRightButton.addEventListener("click", () =>
  controller.handleAndRender({ kind: "rotate", direction: 1 }));
commitButton.addEventListener("click", () => controller.handleAndRender({ kind: "commit" }));

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key >= "1" && key <= String(config.N_PILES)) {
    controller.handleAndRender({ kind: "selectPile", pileIndex: Number(key) - 1 });
  } else if (key === "r") {
    controller.handleAndRender({ kind: "rotate" });
  } else if (key === "escape") {
    controller.handleAndRender({ kind: "escape" });
  } else if (key === "backspace") {
    event.preventDefault();
    controller.handleAndRender({ kind: "undo" });
  } else if (key === "enter") {
    controller.handleAndRender({ kind: "commit" });
  } else if (key === "tab") {
    event.preventDefault();
    const view = controller.view();
    const count = view.players[view.currentPlayer]!.markerSlots.length;
    controller.handleAndRender({
      kind: "selectMarker",
      markerIndex: ((controller.selectedMarker ?? -1) + 1) % count,
    });
  }
});

render();
