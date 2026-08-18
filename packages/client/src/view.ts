import { config, distinctOrientations, partnerOffset } from "@passtally/rules";
import type { Board, Game } from "@passtally/rules";
import type { CellView, GameView } from "./types.js";

export type Overlay = { board: Board; actionsLeft: number };

export function setupOrder(nPlayers: number): number[] {
  const order: number[] = [];
  for (let pass = 0; pass < config.MARKERS_PER_PLAYER; pass++) {
    const seq = [...Array(nPlayers).keys()];
    order.push(...(pass % 2 === 0 ? seq : seq.reverse()));
  }
  return order;
}

export function nextSetupPlayer(game: Game): number | null {
  if (game.isSetupComplete()) return null;
  const placed = game.players.reduce((sum, player) => sum + player.markerSlots.length, 0);
  return setupOrder(game.players.length)[placed] ?? null;
}

/** Ask the engine which setup slots are legal by trying each one on a clone.
 * This keeps the per-edge and occupancy rules out of the client view layer. */
function legalSetupSlots(game: Game, player: number | null): number[] {
  if (player === null) return [];
  const legal: number[] = [];
  for (let slot = 0; slot < game.board.ring.length; slot++) {
    const trial = game.clone();
    try {
      trial.setupPlaceMarker(player, slot);
      legal.push(slot);
    } catch {
      // The rules engine is the authority; rejected slots are simply omitted.
    }
  }
  return legal;
}

function cellViews(board: Board): CellView[][] {
  const rows: CellView[][] = [];
  for (let row = 0; row < board.n; row++) {
    const out: CellView[] = [];
    for (let col = 0; col < board.n; col++) {
      const cell = board.cells[row]![col]!;
      out.push({
        height: cell.height,
        conns: cell.height ? cell.conns.map(([a, b]) => [a, b]) : null,
        partner: partnerOffset(board, row, col),
      });
    }
    rows.push(out);
  }
  return rows;
}

export function buildView(game: Game, overlay?: Overlay): GameView {
  const board = overlay?.board ?? game.board;
  const setupNext = nextSetupPlayer(game);
  return {
    n: board.n,
    cells: cellViews(board),
    ring: board.ring.map((slot) => ({
      row: slot.row,
      col: slot.col,
      side: slot.side,
      occupant: slot.occupant,
    })),
    piles: game.piles.map((pile) => ({
      faceUp: pile.faceUp,
      count: pile.ordered.length + (pile.faceUp === null ? 0 : 1),
      distinctOrientations: pile.faceUp === null ? [] : [...distinctOrientations(pile.faceUp)],
    })),
    players: game.players.map((player) => ({
      markerSlots: [...player.markerSlots],
      score: player.score,
    })),
    currentPlayer: game.currentPlayer,
    actionsLeft: overlay?.actionsLeft ?? game.actionsLeft,
    phase: game.isOver() ? "over" : setupNext === null ? "play" : "setup",
    setupNext,
    setupLegalSlots: legalSetupSlots(game, setupNext),
    winner: game.winner(),
  };
}

export function displayRanking(view: GameView): number[] {
  return view.players
    .map((player, index) => ({ index, score: player.score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.index);
}
