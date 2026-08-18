import type { Controller } from "../state.js";
import { displayRanking } from "../view.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

export function renderPlayers(root: HTMLElement, controller: Controller): void {
  const view = controller.view();
  root.replaceChildren();
  for (const index of displayRanking(view)) {
    const row = document.createElement("div");
    row.className = "player";
    if (index === view.currentPlayer) row.classList.add("active");

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = PLAYER_COLOURS[index % PLAYER_COLOURS.length]!;

    const name = document.createElement("span");
    name.textContent = `Player ${index + 1}`;
    name.style.flex = "1";

    const score = document.createElement("strong");
    score.textContent = String(view.players[index]!.score);

    row.append(swatch, name, score);
    root.append(row);
  }
}
