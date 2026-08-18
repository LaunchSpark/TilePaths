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

function cellViews(board: Board): CellView[][] {
  const rows: CellView[][] = [];
  for (let row = 0; row < board.n; row++) {
    const out: CellView[] = [];
    for (let col = 0; col < board.n; col++) {
      const cell = board.cells[row]![col]!;
      out.push({
        height: cell.height,
        conns: cell.height === 0 ? null : cell.conns.map(([a, b]) => [a, b]),
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
    winner: game.winner(),
  };
}

export function displayRanking(view: GameView): number[] {
  return view.players
    .map((player, index) => ({ index, score: player.score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.index);
}
