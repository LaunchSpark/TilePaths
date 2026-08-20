import { config, passesToVp } from "@passtally/rules";
import type { LineView } from "../lines.js";
import type { Controller } from "../state.js";

/** One physical tile's contribution to a line: how many times the line
 *  crossed it (a run of consecutive equal-`placementId` steps) and at what
 *  level. A tile crossed twice by the same line -- leaving and later
 *  returning -- produces two separate entries here, one per run, because
 *  each crossing scores independently. */
export type TileContribution = { placementId: number; level: number; passes: number };

/** Groups `line.steps` into runs of consecutive equal `placementId`,
 *  skipping uncovered cells (`placementId === null`, which contribute
 *  nothing). Each run is one crossing of one physical tile, worth `height`
 *  passes. A run boundary is either a change of `placementId` or a gap
 *  through an uncovered cell -- so a line that leaves a tile and later
 *  crosses it again produces two entries, not one merged by id. */
export function tilesInLine(line: LineView): TileContribution[] {
  const tiles: TileContribution[] = [];
  let runId: number | null = null;
  for (const step of line.steps) {
    if (step.placementId === null) {
      runId = null;
      continue;
    }
    if (step.placementId === runId) continue; // still inside the same run
    runId = step.placementId;
    tiles.push({ placementId: step.placementId, level: step.height, passes: step.height });
  }
  return tiles;
}

const CURVE_WIDTH = 176;
const CURVE_HEIGHT = 64;
const CURVE_PAD = 6;

/** Draws `config.PASSES_TO_VP` as an ascending step curve and marks `total`
 *  on it. This is the only place `passesToVp` enters the client -- everywhere
 *  else, VP totals come from the view, never a client-side reimplementation
 *  of the conversion. */
function drawPassesToVpCurve(total: number): SVGSVGElement {
  const table = config.PASSES_TO_VP;
  const lastEntry = table[table.length - 1]!;
  const maxVp = lastEntry[1];
  const maxPasses = Math.max(lastEntry[0], total) + 4;

  const xScale = (passes: number) => CURVE_PAD + (passes / maxPasses) * (CURVE_WIDTH - 2 * CURVE_PAD);
  const yScale = (vp: number) => CURVE_HEIGHT - CURVE_PAD - (vp / maxVp) * (CURVE_HEIGHT - 2 * CURVE_PAD);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`);
  svg.setAttribute("width", String(CURVE_WIDTH));
  svg.setAttribute("height", String(CURVE_HEIGHT));
  svg.setAttribute("class", "vp-curve");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Passes to victory points curve, current total ${total} passes`);

  // Each [minPasses, vp] band holds flat until the next band's minPasses, so
  // the curve is a staircase: two points per band (its start, and where it
  // ends), joined into a single polyline.
  const points: [number, number][] = [];
  table.forEach(([minPasses, vp], index) => {
    const next = table[index + 1];
    const bandEnd = next ? next[0] : maxPasses;
    points.push([minPasses, vp], [bandEnd, vp]);
  });

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = points
    .map(([passes, vp], index) => `${index === 0 ? "M" : "L"} ${xScale(passes)} ${yScale(vp)}`)
    .join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#665f52");
  path.setAttribute("stroke-width", "1.5");
  svg.append(path);

  const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  marker.setAttribute("cx", String(xScale(total)));
  marker.setAttribute("cy", String(yScale(passesToVp(total))));
  marker.setAttribute("r", "4");
  marker.setAttribute("fill", "#2f6fd0");
  svg.append(marker);

  return svg;
}

function lineLabel(line: LineView): string {
  return `${line.slots[0]}–${line.slots[1]}`;
}

/** Renders the scoring breakdown for a hovered player's CURRENT lines (not
 *  history -- see the module-level rationale in the task brief: the
 *  cumulative score is a sum of nonlinear per-turn conversions and cannot be
 *  decomposed after the fact). Shows each line's tiles, the total passes, its
 *  VP conversion, and where that total sits on the passes-to-VP curve. */
export function renderBreakdown(root: HTMLElement, controller: Controller, player: number): void {
  root.replaceChildren();
  root.classList.remove("hidden");

  const lines = controller.linesForPlayer(player);
  const total = lines.reduce((sum, line) => sum + line.passes, 0);
  const vp = passesToVp(total);

  const title = document.createElement("h3");
  title.textContent = `Player ${player + 1} — current position`;
  root.append(title);

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "breakdown-empty";
    empty.textContent = "No completed lines right now.";
    root.append(empty);
  }

  for (const line of lines) {
    const lineEl = document.createElement("div");
    lineEl.className = "breakdown-line";

    const header = document.createElement("div");
    header.className = "breakdown-line-header";
    header.textContent = `Line ${lineLabel(line)} — ${line.passes} pass${line.passes === 1 ? "" : "es"}`;
    lineEl.append(header);

    const tileList = document.createElement("ul");
    for (const tile of tilesInLine(line)) {
      const item = document.createElement("li");
      item.textContent =
        `level ${tile.level} tile — ${tile.passes} pass${tile.passes === 1 ? "" : "es"}`;
      tileList.append(item);
    }
    lineEl.append(tileList);
    root.append(lineEl);
  }

  const totalEl = document.createElement("p");
  totalEl.className = "breakdown-total";
  totalEl.textContent = `Total: ${total} pass${total === 1 ? "" : "es"} → ${vp} VP`;
  root.append(totalEl);

  root.append(drawPassesToVpCurve(total));
}

export function hideBreakdown(root: HTMLElement): void {
  root.classList.add("hidden");
  root.replaceChildren();
}
