import { Game, config } from "@passtally/rules";
import { hitTest, layoutFor, placementAnchor } from "./geometry.js";
import { drawBoard } from "./render/board.js";
import { LocalSession } from "./session.js";
import { Controller } from "./state.js";
import { renderLog } from "./ui/log.js";
import { renderPlayers } from "./ui/rail.js";
import { renderTray } from "./ui/tray.js";
import {
  endDragPreview,
  isDragPreviewActive,
  rotateDragPreview,
} from "./ui/drag-preview.js";

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
let hoverPoint: [number, number] | null = null;

function render(): void {
  if (hoverPoint !== null) {
    hoverCell = placementAnchor(
      hoverPoint[0], hoverPoint[1], layout, controller.ghostOrientation,
    );
  }
  const view = controller.view();
  drawBoard(ctx, layout, controller, hoverCell);
  // Keep the pointer-capturing source in the DOM until the drag finishes.
  if (!isDragPreviewActive()) renderTray(trayRoot, controller, {
    move: (clientX, clientY) => {
      updateHover(clientX, clientY);
      drawBoard(ctx, layout, controller, hoverCell);
    },
    drop: (pileIndex, clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const onBoard = clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom;
      hoverCell = null;
      hoverPoint = null;
      if (!onBoard) {
        controller.handleAndRender({ kind: "escape" });
        return;
      }
      if (controller.selectedPile !== pileIndex) {
        controller.handle({ kind: "selectPile", pileIndex });
      }
      const [x, y] = boardPoint(clientX, clientY);
      const anchor = placementAnchor(x, y, layout, controller.ghostOrientation);
      controller.handleAndRender({
        kind: "click",
        hit: anchor === null ? { kind: "none" } : { kind: "cell", row: anchor[0], col: anchor[1] },
      });
    },
  });
  rotateDragPreview(controller.ghostOrientation);
  renderPlayers(playersRoot, controller);
  renderLog(logRoot, controller);

  actionsLabel.textContent = view.phase === "setup"
    ? `setup: player ${(view.setupNext ?? 0) + 1} places a marker`
    : `actions left: ${view.actionsLeft}`;
  const canRotate = controller.state === "tileSelected";
  rotateLeftButton.disabled = !canRotate;
  rotateRightButton.disabled = !canRotate;
  rotationLabel.textContent = `${controller.ghostOrientation * 90}°`;
  const endingTurn = view.phase === "play"
    && (controller.session.game.actionsLeft === 1 || view.actionsLeft === 0);
  commitButton.disabled = view.phase !== "play" || controller.pendingActions === 0;
  commitButton.textContent = endingTurn ? "End Turn" : "Commit Move";
  commitButton.title = controller.pendingActions === 0
    ? "Choose an action first"
    : endingTurn
      ? "Commit this move, score, and end the turn"
      : "Commit this move and continue the turn";

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
  hoverPoint = [x, y];
  hoverCell = placementAnchor(x, y, layout, controller.ghostOrientation);
}

controller.onChange = render;

canvas.addEventListener("mousemove", (event) => {
  const before = hoverCell;
  updateHover(event.clientX, event.clientY);
  const changed = JSON.stringify(hoverCell) !== JSON.stringify(before);
  if (changed) render();
});

canvas.addEventListener("mouseleave", () => {
  if (isDragPreviewActive()) return;
  hoverPoint = null;
  hoverCell = null;
  render();
});

canvas.addEventListener("click", (event) => {
  const [x, y] = boardPoint(event.clientX, event.clientY);
  const anchor = placementAnchor(x, y, layout, controller.ghostOrientation);
  controller.handleAndRender({
    kind: "click",
    hit: anchor === null ? hitTest(x, y, layout) : { kind: "cell", row: anchor[0], col: anchor[1] },
  });
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

window.addEventListener("mousedown", (event) => {
  if (event.button !== 2) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const pileCanvas = target.closest<HTMLCanvasElement>(".pile canvas");
  if (pileCanvas !== null) {
    const pile = pileCanvas.closest<HTMLElement>(".pile");
    const pileIndex = pile === null ? -1 : Array.from(trayRoot.children).indexOf(pile);
    if (pileIndex >= 0) controller.handle({ kind: "selectPile", pileIndex });
  }
  if (controller.state !== "tileSelected") return;
  if (pileCanvas === null && !canvas.contains(target) && !isDragPreviewActive()) return;
  event.preventDefault();
  controller.handleAndRender({ kind: "rotate" });
});

window.addEventListener("contextmenu", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (controller.state === "tileSelected" && (
    target.closest(".pile canvas") !== null
    || canvas.contains(target)
    || isDragPreviewActive()
  )) event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key >= "1" && key <= String(config.N_PILES)) {
    controller.handleAndRender({ kind: "selectPile", pileIndex: Number(key) - 1 });
  } else if (key === "r") {
    event.preventDefault();
    controller.handleAndRender({ kind: "rotate" });
  } else if (key === "escape") {
    endDragPreview();
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
