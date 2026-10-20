import type { MoveEvent, PieceInstance } from "./types";

/** Advance the displayed position only after the scene finishes an event. */
export function applyEventToPieces(pieces: PieceInstance[], event: MoveEvent): PieceInstance[] {
  return pieces
    .filter((piece) => piece.id !== event.captured?.pieceId)
    .map((piece) => {
      if (piece.id === event.pieceId) {
        return { ...piece, square: event.to, type: event.promotion ?? piece.type };
      }
      if (piece.id === event.rookMove?.pieceId) {
        return { ...piece, square: event.rookMove.to };
      }
      return piece;
    });
}
