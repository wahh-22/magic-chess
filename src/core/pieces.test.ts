import { describe, expect, it } from "vitest";
import { GameState } from "./GameState";
import { applyEventToPieces } from "./pieces";
import type { MoveRequest } from "./types";

describe("applyEventToPieces", () => {
  it.each<{ name: string; fen?: string; moves: MoveRequest[] }>([
    { name: "quiet move", moves: [{ from: "e2", to: "e4" }] },
    { name: "capture", moves: [{ from: "e2", to: "e4" }, { from: "d7", to: "d5" }, { from: "e4", to: "d5" }] },
    { name: "en passant", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", moves: [{ from: "e5", to: "d6" }] },
    { name: "kingside castling", fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", moves: [{ from: "e1", to: "g1" }] },
    { name: "queenside castling", fen: "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", moves: [{ from: "e8", to: "c8" }] },
    { name: "promotion capture", fen: "1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1", moves: [{ from: "a7", to: "b8", promotion: "n" }] },
  ])("mirrors $name without mutating the input or changing ids", ({ fen, moves }) => {
    const game = new GameState(fen);
    let displayed = game.pieces();
    for (const move of moves) {
      const before = structuredClone(displayed);
      const result = game.applyMove(move);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      const next = applyEventToPieces(displayed, result.event);
      expect(displayed).toEqual(before);
      expect(next.find((piece) => piece.square === move.to)?.id).toBe(result.event.pieceId);
      expect([...next].sort((a, b) => a.id.localeCompare(b.id))).toEqual(game.pieces().sort((a, b) => a.id.localeCompare(b.id)));
      displayed = next;
    }
  });
});
