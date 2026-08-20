import { hideBreakdown, renderBreakdown } from "../render/breakdown.js";
import type { Controller } from "../state.js";
import { displayRanking } from "../view.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

/** Renders the player list. Hovering a score opens the breakdown popover
 *  (`renderBreakdown`) into `breakdownRoot`, positioned beside the hovered
 *  row; leaving it hides the popover again. */
export function renderPlayers(root: HTMLElement, breakdownRoot: HTMLElement, controller: Controller): void {
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
    score.className = "score";
    score.textContent = String(view.players[index]!.score);
    score.addEventListener("mouseenter", () => {
      renderBreakdown(breakdownRoot, controller, index);
      const rowRect = row.getBoundingClientRect();
      const railRect = root.closest<HTMLElement>("#rail")?.getBoundingClientRect() ?? rowRect;
      breakdownRoot.style.top = `${rowRect.top}px`;
      breakdownRoot.style.left = `${Math.max(0, railRect.left - 268)}px`;
    });
    score.addEventListener("mouseleave", () => hideBreakdown(breakdownRoot));

    row.append(swatch, name, score);
    root.append(row);
  }
}
