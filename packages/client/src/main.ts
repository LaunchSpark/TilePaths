import { Game, config } from "@passtally/rules";
import { hitTest, layoutFor } from "./geometry.js";
import { drawBoard } from "./render/board.js";
import { LocalSession } from "./session.js";
import { Controller } from "./state.js";
import { renderLog } from "./ui/log.js";
import { renderPlayers } from "./ui/rail.js";
import { renderTray } from "./ui/tray.js";

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const ctx = canvas.getContext("2d")!;
const trayRoot = document.querySelector<HTMLElement>("#piles")!;
const playersRoot = document.querySelector<HTMLElement>("#players")!;
const logRoot = document.querySelector<HTMLElement>("#log")!;
const actionsLabel = document.querySelector<HTMLElement>("#actions")!;
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
  commitButton.disabled = view.phase !== "play" || view.actionsLeft !== 0;

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

controller.onChange = render;

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(event.clientX - rect.left, event.clientY - rect.top, layout);
  const next: [number, number] | null = hit.kind === "cell" ? [hit.row, hit.col] : null;
  const changed = JSON.stringify(next) !== JSON.stringify(hoverCell);
  hoverCell = next;
  if (changed) render();
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  controller.handleAndRender({
    kind: "click",
    hit: hitTest(event.clientX - rect.left, event.clientY - rect.top, layout),
  });
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  controller.handleAndRender({ kind: "rotate" });
}, { passive: false });

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
