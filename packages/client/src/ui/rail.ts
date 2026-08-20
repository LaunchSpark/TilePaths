import { hideBreakdown, renderBreakdown } from "../render/breakdown.js";
import type { Controller } from "../state.js";
import { displayRanking } from "../view.js";

const PLAYER_COLOURS = ["#2f6fd0", "#d0562f", "#3fa05a"];

const SCORE_TWEEN_MS = 400;

/** Value a score tween has reached at `elapsedMs` into a `durationMs` tween
 *  from `from` to `to`, eased out so it settles rather than stopping short.
 *  Pure and separately tested (`test/rail.test.ts`) since, unlike the DOM
 *  code around it, it has real arithmetic worth checking on its own. */
export function tweenedScore(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs = SCORE_TWEEN_MS,
): number {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const eased = 1 - (1 - t) * (1 - t);
  return Math.round(from + (to - from) * eased);
}

type ScoreAnim = { from: number; to: number; start: number };

// Module-level so a tween survives across the fresh DOM `renderPlayers`
// builds on every call (it replaces the whole player list each time it
// runs), and so it can keep animating on its own via requestAnimationFrame
// even when nothing else is triggering a render (e.g. the pointer is idle
// right after a commit).
const scoreAnims = new Map<number, ScoreAnim>();
const lastScores = new Map<number, number>();
let animHandle: number | null = null;

/** Renders the player list. Hovering a score opens the breakdown popover
 *  (`renderBreakdown`) into `breakdownRoot`, positioned beside the hovered
 *  row; leaving it hides the popover again. A score that changed since the
 *  previous call tweens to its new value over `SCORE_TWEEN_MS` rather than
 *  snapping -- driven by `scoreAnims`, keyed by player index so several
 *  players' scores can tween independently after one commit. */
export function renderPlayers(root: HTMLElement, breakdownRoot: HTMLElement, controller: Controller): void {
  const view = controller.view();
  const now = performance.now();
  let stillAnimating = false;
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

    const target = view.players[index]!.score;
    const previousTarget = lastScores.get(index);
    if (previousTarget !== undefined && previousTarget !== target) {
      const anim = scoreAnims.get(index);
      const displayedNow = anim
        ? tweenedScore(anim.from, anim.to, now - anim.start)
        : previousTarget;
      scoreAnims.set(index, { from: displayedNow, to: target, start: now });
    }
    lastScores.set(index, target);

    const anim = scoreAnims.get(index);
    let displayed = target;
    if (anim) {
      const elapsed = now - anim.start;
      displayed = tweenedScore(anim.from, anim.to, elapsed);
      if (elapsed < SCORE_TWEEN_MS) stillAnimating = true;
      else scoreAnims.delete(index);
    }

    const score = document.createElement("strong");
    score.className = "score";
    if (anim && displayed !== target) score.classList.add("tweening");
    score.textContent = String(displayed);
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

  if (stillAnimating && animHandle === null) {
    animHandle = requestAnimationFrame(() => {
      animHandle = null;
      renderPlayers(root, breakdownRoot, controller);
    });
  }
}
