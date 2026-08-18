import { emptyBoard, partnerOffset } from "./board.js";
import type { Board } from "./board.js";
import * as config from "./config.js";
import { markerDestination } from "./markers.js";
import { canPlace, placeTile } from "./placement.js";
import { makeRng } from "./rng.js";
import { canon, distinctOrientations, offsetOf, ORIENTATIONS, TILE_TYPES } from "./tileTypes.js";
import { scoreFor } from "./trace.js";
import type { Move, Pos, TypeId } from "./types.js";

export type Pile = { ordered: TypeId[]; faceUp: TypeId | null };
export type Player = { markerSlots: number[]; score: number };

export class Game {
  board: Board;
  piles: Pile[];
  players: Player[];
  currentPlayer = 0;
  actionsLeft = config.ACTIONS_PER_TURN;
  firstPlayer = 0;
  finalRound = false;
  over = false;

  private constructor(board: Board, piles: Pile[], players: Player[]) {
    this.board = board;
    this.piles = piles;
    this.players = players;
  }

  static newGame(nPlayers: number, seed = 0, boardSize: number = config.N): Game {
    if (!Number.isInteger(nPlayers) || nPlayers < 2 || nPlayers > 3) {
      throw new Error(`nPlayers must be 2 or 3, got ${nPlayers}`);
    }
    const deck: TypeId[] = [];
    // Numeric sort -- Array.sort defaults to lexicographic, which is a latent
    // bug the moment there are more than nine designs.
    for (const key of Object.keys(TILE_TYPES).map(Number).sort((a, b) => a - b)) {
      for (let i = 0; i < config.COPIES_PER_TYPE; i++) deck.push(key as TypeId);
    }
    makeRng(seed).shuffle(deck);

    const piles: Pile[] = [];
    for (let i = 0; i < config.N_PILES; i++) {
      const ordered = deck.slice(i * config.TILES_PER_PILE, (i + 1) * config.TILES_PER_PILE);
      const faceUp = ordered.pop() ?? null;
      piles.push({ ordered, faceUp });
    }
    const players: Player[] = Array.from({ length: nPlayers }, () => ({
      markerSlots: [], score: 0,
    }));
    return new Game(emptyBoard(boardSize), piles, players);
  }

  // -- setup -----------------------------------------------------------

  isSetupComplete(): boolean {
    return this.players.every((p) => p.markerSlots.length === config.MARKERS_PER_PLAYER);
  }

  setupPlaceMarker(player: number, slot: number): void {
    if (!Number.isInteger(player) || player < 0 || player >= this.players.length) {
      throw new Error(`no such player: ${player}`);
    }
    if (this.isSetupComplete()) throw new Error("setup is already complete");
    const entry = this.players[player]!;
    if (entry.markerSlots.length >= config.MARKERS_PER_PLAYER) {
      throw new Error(`player ${player} has already placed all markers`);
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.board.ring.length) {
      throw new Error(`slot ${slot} is not on the ring`);
    }
    if (this.board.ring[slot]!.occupant !== null) throw new Error(`slot ${slot} is occupied`);

    const edge = Math.floor(slot / this.board.n);
    if (entry.markerSlots.some((s) => Math.floor(s / this.board.n) === edge)) {
      throw new Error(`player ${player} already has a marker on edge ${edge}`);
    }
    this.board.ring[slot]!.occupant =
      player * config.MARKERS_PER_PLAYER + entry.markerSlots.length;
    entry.markerSlots.push(slot);
  }

  // -- moves -----------------------------------------------------------

  apply(move: Move): void {
    if (this.over) throw new Error("the game is over");
    if (!this.isSetupComplete()) throw new Error("setup is not complete");
    if (move.kind === "place") this.applyPlace(move);
    else this.applyMarker(move);

    this.actionsLeft -= 1;
    if (this.actionsLeft === 0) this.endTurn();
  }

  private applyPlace(move: Extract<Move, { kind: "place" }>): void {
    if (!Number.isInteger(move.pileIndex) ||
        move.pileIndex < 0 || move.pileIndex >= this.piles.length) {
      throw new Error(`no such pile: ${move.pileIndex}`);
    }
    if (!(ORIENTATIONS as readonly number[]).includes(move.orientation)) {
      throw new Error(`no such orientation: ${move.orientation}`);
    }
    const pile = this.piles[move.pileIndex]!;
    if (pile.faceUp === null) throw new Error(`pile ${move.pileIndex} is empty`);

    const [dr, dc] = offsetOf(move.orientation);
    const expected: Pos = [move.cellA[0] + dr, move.cellA[1] + dc];
    if (move.cellB[0] !== expected[0] || move.cellB[1] !== expected[1]) {
      throw new Error(
        `cellB ${move.cellB} contradicts orientation ${move.orientation}, ` +
          `which requires ${expected}`,
      );
    }
    if (!canPlace(this.board, move.cellA, move.cellB)) {
      throw new Error(`illegal placement at ${move.cellA}/${move.cellB}`);
    }
    placeTile(this.board, move.cellA, move.cellB, pile.faceUp, move.orientation);
    pile.faceUp = pile.ordered.pop() ?? null;
  }

  private applyMarker(move: Extract<Move, { kind: "marker" }>): void {
    const entry = this.players[this.currentPlayer]!;
    if (!Number.isInteger(move.markerIndex) ||
        move.markerIndex < 0 || move.markerIndex >= entry.markerSlots.length) {
      throw new Error(`no marker with index ${move.markerIndex}`);
    }
    if (!(config.MARKER_DISTANCES as readonly number[]).includes(move.distance)) {
      throw new Error(`distance must be one of ${config.MARKER_DISTANCES}`);
    }
    const source = entry.markerSlots[move.markerIndex]!;
    const destination = markerDestination(this.board, source, move.distance);
    if (destination === null) throw new Error("no reachable destination");

    const markerId = this.board.ring[source]!.occupant;
    this.board.ring[source]!.occupant = null;
    this.board.ring[destination]!.occupant = markerId;
    entry.markerSlots[move.markerIndex] = destination;
  }

  // -- turn structure --------------------------------------------------

  private endTurn(): void {
    const entry = this.players[this.currentPlayer]!;
    entry.score += scoreFor(this.board, entry.markerSlots);

    if (!this.finalRound && this.triggerFired()) this.finalRound = true;

    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    this.actionsLeft = config.ACTIONS_PER_TURN;

    if (this.finalRound && this.currentPlayer === this.firstPlayer) this.over = true;
  }

  /** Internal, but deliberately NOT `private`: each clause needs its own test
   *  and they mask each other otherwise. Python's `_trigger_fired` was
   *  likewise underscore-prefixed rather than truly inaccessible. */
  triggerFired(): boolean {
    // Clause 1 is provably subsumed by clause 2 -- legalMoves skips piles whose
    // faceUp is null, so exhausted piles emit no placement and clause 2 already
    // returns true. Kept as a fast path: it answers a yes/no question without
    // materialising the full move list, including marker moves nobody inspects.
    if (this.piles.every((p) => p.faceUp === null)) return true;
    return !this.legalMoves().some((m) => m.kind === "place");
  }

  // -- queries ---------------------------------------------------------

  /** Every distinct-outcome action for the current player.
   *
   *  Not every legal action: marker moves landing on an already-reached slot
   *  are deduped away, though apply would accept them. Correct for search,
   *  and the end-of-game trigger depends on the placement half being exact. */
  legalMoves(): Move[] {
    const moves: Move[] = [];

    this.piles.forEach((pile, pileIndex) => {
      if (pile.faceUp === null) return;
      // Legality is footprint-only, so the tile affects nothing here except
      // which orientations are distinct.
      for (const orientation of distinctOrientations(pile.faceUp)) {
        const [dr, dc] = offsetOf(orientation);
        for (let row = 0; row < this.board.n; row++) {
          for (let col = 0; col < this.board.n; col++) {
            const cellA: Pos = [row, col];
            const cellB: Pos = [row + dr, col + dc];
            if (canPlace(this.board, cellA, cellB)) {
              moves.push({ kind: "place", pileIndex, cellA, cellB, orientation });
            }
          }
        }
      }
    });

    const entry = this.players[this.currentPlayer]!;
    entry.markerSlots.forEach((slot, markerIndex) => {
      const reached = new Set<number>();
      for (const distance of config.MARKER_DISTANCES) {
        const destination = markerDestination(this.board, slot, distance);
        if (destination !== null && !reached.has(destination)) {
          reached.add(destination);
          moves.push({ kind: "marker", markerIndex, distance });
        }
      }
    });

    return moves;
  }

  isOver(): boolean { return this.over; }

  /** The single highest scorer, or null if unfinished or tied. */
  winner(): number | null {
    if (!this.over) return null;
    const best = Math.max(...this.players.map((p) => p.score));
    const leaders = this.players
      .map((p, i) => (p.score === best ? i : -1))
      .filter((i) => i >= 0);
    return leaders.length === 1 ? leaders[0]! : null;
  }

  /** Deep copy, hand-written (T4). No closures or back-references to trip on. */
  clone(): Game {
    const board: Board = {
      n: this.board.n,
      cells: this.board.cells.map((row) =>
        row.map((c) => ({
          placementId: c.placementId,
          height: c.height,
          conns: c.conns.map(([a, b]) => [a, b] as [typeof a, typeof b]),
        })),
      ),
      ring: this.board.ring.map((s) => ({ ...s })),
      nav: this.board.nav,          // immutable; safe to share
      nextPlacementId: this.board.nextPlacementId,
    };
    const g = new Game(
      board,
      this.piles.map((p) => ({ ordered: [...p.ordered], faceUp: p.faceUp })),
      this.players.map((p) => ({ markerSlots: [...p.markerSlots], score: p.score })),
    );
    g.currentPlayer = this.currentPlayer;
    g.actionsLeft = this.actionsLeft;
    g.firstPlayer = this.firstPlayer;
    g.finalRound = this.finalRound;
    g.over = this.over;
    return g;
  }

  /** Canonical state string: top tiles, markers, piles, scores and turn state.
   *
   *  A placement's history is irrelevant once buried, so only the top tile at
   *  each cell contributes. Raw placement ids depend on move order, so each
   *  cell records its PARTNER OFFSET instead -- same information, canonically.
   *  Move-order permutations therefore collapse to the same key. */
  key(): string {
    const cells: string[] = [];
    for (let row = 0; row < this.board.n; row++) {
      for (let col = 0; col < this.board.n; col++) {
        const cell = this.board.cells[row]![col]!;
        const conns = cell.height > 0 ? canon(cell.conns) : "-";
        const p = partnerOffset(this.board, row, col);
        cells.push(`${cell.height}:${conns}:${p === null ? "-" : `${p[0]},${p[1]}`}`);
      }
    }
    const markers = this.players
      .map((p) => [...p.markerSlots].sort((a, b) => a - b).join(","))
      .join(";");
    const piles = this.piles.map((p) => `${p.ordered.join(",")}/${p.faceUp ?? "-"}`).join(";");
    const scores = this.players.map((p) => p.score).join(",");
    return [
      cells.join("|"), markers, piles, scores,
      this.currentPlayer, this.actionsLeft, this.finalRound, this.over,
    ].join("#");
  }
}
