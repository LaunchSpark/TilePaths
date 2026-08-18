import { config, markerDestination, offsetOf } from "@passtally/rules";
import type { Move, Pos, TypeId } from "@passtally/rules";
import type { Hit } from "./geometry.js";
import { normalizePlacement } from "./orient.js";
import type { LocalSession } from "./session.js";
import { Tentative } from "./tentative.js";
import type { GameView, TurnResult } from "./types.js";

export type UiState =
  | "setup" | "idle" | "tileSelected" | "markerSelected" | "committing" | "gameOver";

export type UiInput =
  | { kind: "click"; hit: Hit }
  | { kind: "selectPile"; pileIndex: number }
  | { kind: "selectMarker"; markerIndex: number }
  | { kind: "rotate" }
  | { kind: "undo" }
  | { kind: "escape" }
  | { kind: "commit" };

export type Destination = { slot: number; distance: number };

export class Controller {
  readonly session: LocalSession;
  private tentative: Tentative;

  state: UiState = "setup";
  selectedPile: number | null = null;
  selectedMarker: number | null = null;
  ghostOrientation = 0;
  markerDestinations: Destination[] = [];
  lastRejection: string | null = null;
  log: TurnResult[] = [];
  onChange: (() => void) | null = null;

  constructor(session: LocalSession) {
    this.session = session;
    this.tentative = new Tentative(session);
    this.state = session.getView().phase === "setup" ? "setup" : "idle";
  }

  view(): GameView {
    return this.state === "setup" ? this.session.getView() : this.tentative.view();
  }

  isSpent(pileIndex: number): boolean {
    return this.tentative.isSpent(pileIndex);
  }

  handle(input: UiInput): void {
    this.lastRejection = null;
    try {
      this.dispatch(input);
    } catch (error) {
      this.lastRejection = error instanceof Error ? error.message : String(error);
    }
  }

  handleAndRender(input: UiInput): void {
    this.handle(input);
    this.onChange?.();
  }

  private clearSelection(): void {
    this.selectedPile = null;
    this.selectedMarker = null;
    this.markerDestinations = [];
    this.ghostOrientation = 0;
  }

  private dispatch(input: UiInput): void {
    if (this.state === "gameOver") return;

    if (input.kind === "escape") {
      this.clearSelection();
      if (this.state !== "setup") this.state = "idle";
      return;
    }

    if (this.state === "setup") {
      if (input.kind !== "click" || input.hit.kind !== "slot") return;
      const player = this.session.getView().setupNext;
      if (player === null) return;
      this.session.placeSetupMarker(player, input.hit.index);
      if (this.session.getView().phase === "play") this.state = "idle";
      return;
    }

    switch (input.kind) {
      case "selectPile": return this.onSelectPile(input.pileIndex);
      case "selectMarker": return this.onSelectMarker(input.markerIndex);
      case "rotate": return this.onRotate();
      case "undo": return this.onUndo();
      case "commit": return this.onCommit();
      case "click": return this.onClick(input.hit);
    }
  }

  private onSelectPile(pileIndex: number): void {
    if (this.tentative.actionsLeft() <= 0) throw new Error("no actions left this turn");
    if (this.tentative.isSpent(pileIndex)) {
      throw new Error(`pile ${pileIndex} is already spent this turn`);
    }
    if (this.view().piles[pileIndex]?.faceUp == null) {
      throw new Error(`pile ${pileIndex} is empty`);
    }
    this.clearSelection();
    this.selectedPile = pileIndex;
    this.state = "tileSelected";
  }

  private onSelectMarker(markerIndex: number): void {
    if (this.tentative.actionsLeft() <= 0) throw new Error("no actions left this turn");
    const view = this.view();
    if (view.players[view.currentPlayer]?.markerSlots[markerIndex] === undefined) {
      throw new Error(`no marker with index ${markerIndex}`);
    }
    this.clearSelection();
    this.selectedMarker = markerIndex;
    this.markerDestinations = this.destinationsFor(markerIndex);
    this.state = "markerSelected";
  }

  private destinationsFor(markerIndex: number): Destination[] {
    const board = this.tentative.overlayGame().board;
    const view = this.view();
    const from = view.players[view.currentPlayer]!.markerSlots[markerIndex]!;
    const seen = new Set<number>();
    const destinations: Destination[] = [];
    for (const distance of config.MARKER_DISTANCES) {
      const slot = markerDestination(board, from, distance);
      if (slot !== null && !seen.has(slot)) {
        seen.add(slot);
        destinations.push({ slot, distance });
      }
    }
    return destinations;
  }

  private onRotate(): void {
    if (this.state !== "tileSelected") return;
    this.ghostOrientation = (this.ghostOrientation + 1) % 4;
  }

  private onUndo(): void {
    this.tentative.undo();
    this.clearSelection();
    this.state = "idle";
  }

  private onCommit(): void {
    if (!this.tentative.isComplete()) {
      throw new Error(`a turn needs ${config.ACTIONS_PER_TURN} actions before committing`);
    }
    this.state = "committing";
    try {
      this.log.push(this.session.commit([...this.tentative.moves]));
      this.tentative.clear();
      this.clearSelection();
      this.state = this.session.getView().phase === "over" ? "gameOver" : "idle";
    } catch (error) {
      this.state = "idle";
      throw error;
    }
  }

  private onClick(hit: Hit): void {
    if (hit.kind === "none") return;
    if (this.state === "tileSelected" && hit.kind === "cell") {
      return this.placeAt([hit.row, hit.col]);
    }
    if (this.state === "markerSelected" && hit.kind === "slot") {
      return this.moveMarkerTo(hit.index);
    }
    if (hit.kind === "slot") {
      const view = this.view();
      const own = view.players[view.currentPlayer]!.markerSlots.indexOf(hit.index);
      if (own >= 0) this.onSelectMarker(own);
    }
  }

  private placeAt(anchor: Pos): void {
    const pileIndex = this.selectedPile;
    if (pileIndex === null) return;
    const faceUp = this.view().piles[pileIndex]!.faceUp;
    if (faceUp === null) throw new Error(`pile ${pileIndex} is empty`);

    const normalized = normalizePlacement(faceUp as TypeId, anchor, this.ghostOrientation);
    const [dr, dc] = offsetOf(normalized.orientation);
    const move: Move = {
      kind: "place",
      pileIndex,
      cellA: normalized.anchor,
      cellB: [normalized.anchor[0] + dr, normalized.anchor[1] + dc],
      orientation: normalized.orientation,
    };
    this.tentative.add(move);
    this.clearSelection();
    this.state = "idle";
  }

  private moveMarkerTo(slot: number): void {
    const markerIndex = this.selectedMarker;
    if (markerIndex === null) return;
    const target = this.markerDestinations.find((destination) => destination.slot === slot);
    if (target === undefined) throw new Error(`slot ${slot} is not reachable`);
    this.tentative.add({ kind: "marker", markerIndex, distance: target.distance });
    this.clearSelection();
    this.state = "idle";
  }
}
