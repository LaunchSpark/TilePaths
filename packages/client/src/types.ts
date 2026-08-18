import type { Move, Pos, Side, TypeId } from "@passtally/rules";

export type CellView = {
  height: number;
  conns: [Side, Side][] | null;
  partner: Pos | null;
};

export type SlotView = {
  row: number;
  col: number;
  side: Side;
  occupant: number | null;
};

export type PileView = {
  faceUp: TypeId | null;
  count: number;
  distinctOrientations: number[];
};

export type PlayerView = { markerSlots: number[]; score: number };

export type GameView = {
  n: number;
  cells: CellView[][];
  ring: SlotView[];
  piles: PileView[];
  players: PlayerView[];
  currentPlayer: number;
  actionsLeft: number;
  phase: "setup" | "play" | "over";
  setupNext: number | null;
  winner: number | null;
};

export type TurnResult = {
  player: number;
  lines: { slots: [number, number]; passes: number }[];
  totalPasses: number;
  vpAwarded: number;
};

export type { Move };
