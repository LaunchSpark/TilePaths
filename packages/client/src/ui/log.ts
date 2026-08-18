import type { Controller } from "../state.js";

export function renderLog(root: HTMLElement, controller: Controller): void {
  root.replaceChildren();
  const list = document.createElement("ol");
  for (const entry of controller.log) {
    const item = document.createElement("li");
    const lines = entry.lines.length === 0
      ? "no lines"
      : entry.lines.map((line) => `${line.slots[0]}–${line.slots[1]} (${line.passes})`).join(", ");
    item.textContent =
      `P${entry.player + 1}: ${lines} → ${entry.totalPasses} passes, +${entry.vpAwarded} VP`;
    list.append(item);
  }
  root.append(list);
}
