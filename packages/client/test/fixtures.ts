import { Game, placeTile } from "@passtally/rules";
import { Controller } from "../src/state.js";
import { LocalSession } from "../src/session.js";

/** A 3x3 board where BOTH players hold a scoring line.
 *
 *  Three vertical cross tiles fill rows 0-1. The X shape routes W<->E, so row 0
 *  carries a line from slot 11 to slot 3, and row 1 from slot 10 to slot 4 --
 *  three passes each. Player 0 takes slots 11, 3, 1, 6; player 1 takes
 *  0, 4, 7, 10. Every player holds one marker per edge and no slot is shared. */
export function scoringBoard(): Game {
  const g = Game.newGame(2, 1, 3);
  for (const slot of [11, 3, 1, 6]) g.setupPlaceMarker(0, slot);
  for (const slot of [0, 4, 7, 10]) g.setupPlaceMarker(1, slot);
  for (let col = 0; col < 3; col++) placeTile(g.board, [0, col], [1, col], 2, 0);
  return g;
}

/** A 6x6 board mid-setup-complete with no tiles placed, so nobody has a line. */
export function emptyPlay(nPlayers = 2, boardSize = 6): Game {
  const g = Game.newGame(nPlayers, 1, boardSize);
  for (let p = 0; p < nPlayers; p++) {
    for (let edge = 0; edge < 4; edge++) g.setupPlaceMarker(p, edge * boardSize + p);
  }
  return g;
}

/** A 3x3 board where one line crosses the SAME tile twice through different
 *  faces -- the case colour cannot distinguish, only offset can.
 *
 *  Tile 1 at orientation 1 lays out as (B west, A east). Row 1's tile routes
 *  W->N, row 0's turns the line around, and it re-enters row 1's tile through
 *  a different face. This is the engine suite's own double-crossing fixture;
 *  tracing from slot slotIndexOf(3, 1, 0, Side.W) gives 3 passes across two
 *  physical tiles. */
export function selfCrossingBoard(): Game {
  const g = Game.newGame(2, 1, 3);
  placeTile(g.board, [1, 1], [1, 0], 1, 1);
  placeTile(g.board, [0, 1], [0, 0], 1, 1);
  return g;
}

/** A Controller driving a LocalSession over the given game. */
export function controllerOn(game: Game): Controller {
  return new Controller(new LocalSession(game));
}

/** A Controller already past setup, on an empty board, ready to select a
 *  pile and place a tile -- setup is fully driven by `emptyPlay` itself, so
 *  the Controller's constructor observes phase "play" and starts in "idle". */
export function controllerInPlay(nPlayers = 2, boardSize = 6): Controller {
  return controllerOn(emptyPlay(nPlayers, boardSize));
}
