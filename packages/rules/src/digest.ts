/** Portable canonical state digest, byte-identical to tools/gen_oracle.py.
 *
 *  Key order is fixed and nothing is sorted at the top level -- Python dicts
 *  and JS objects both preserve insertion order, so both sides build the same
 *  object the same way. JSON.stringify emits no whitespace; the Python side
 *  passes separators=(",", ":") to match. */

import { partnerOffset } from "./board.js";
import type { Game } from "./game.js";

export function digest(game: Game): string {
  const cells = [];
  for (let row = 0; row < game.board.n; row++) {
    const outRow = [];
    for (let col = 0; col < game.board.n; col++) {
      const cell = game.board.cells[row]![col]!;
      const conns = cell.height === 0
        ? null
        : cell.conns
            .map(([a, b]) => (a < b ? [a, b] : [b, a]))
            .sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);
      const p = partnerOffset(game.board, row, col);
      outRow.push([cell.height, conns, p === null ? null : [p[0], p[1]]]);
    }
    cells.push(outRow);
  }

  return JSON.stringify({
    n: game.board.n,
    cells,
    ring: game.board.ring.map((s) => s.occupant),
    piles: game.piles.map((p) => [p.faceUp, [...p.ordered]]),
    players: game.players.map((p) => [[...p.markerSlots], p.score]),
    cur: game.currentPlayer,
    act: game.actionsLeft,
    first: game.firstPlayer,
    final: game.finalRound,
    over: game.over,
  });
}
