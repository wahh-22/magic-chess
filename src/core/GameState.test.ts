import { describe, expect, it } from "vitest";
import { GameState } from "./GameState";
import type { MoveEvent, MoveResult } from "./types";

function play(game: GameState, ...moves: string[]): MoveEvent[] {
  return moves.map((uci) => {
    const result = game.applyMove({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as "q" | undefined,
    });
    if (!result.ok) throw new Error(`move ${uci} failed: ${result.error}`);
    return result.event;
  });
}

function expectError(result: MoveResult, error: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(error);
}

describe("GameState — setup", () => {
  it("starts with 32 pieces with stable ids and white to move", () => {
    const game = new GameState();
    expect(game.pieces()).toHaveLength(32);
    expect(game.turn()).toBe("w");
    expect(game.pieceAt("g1")).toEqual({ id: "w-n-g1", color: "w", type: "n", square: "g1" });
    expect(new Set(game.pieces().map((p) => p.id)).size).toBe(32);
    expect(game.outcome()).toBeNull();
  });

  it("lists legal targets for one square", () => {
    const game = new GameState();
    expect(game.legalMovesFrom("e2").map((m) => m.to).sort()).toEqual(["e3", "e4"]);
    expect(game.legalMovesFrom("e7")).toEqual([]); // not black's turn
    expect(game.legalMoves()).toHaveLength(20);
  });
});

describe("GameState — moves", () => {
  it("moves a piece keeping its id and passes the turn", () => {
    const game = new GameState();
    const [event] = play(game, "g1f3");
    expect(event).toMatchObject({ san: "Nf3", pieceId: "w-n-g1", from: "g1", to: "f3", color: "w" });
    expect(event!.captured).toBeUndefined();
    expect(game.pieceAt("f3")?.id).toBe("w-n-g1");
    expect(game.pieceAt("g1")).toBeUndefined();
    expect(game.turn()).toBe("b");
  });

  it("reports the captured piece and removes it", () => {
    const game = new GameState();
    const events = play(game, "e2e4", "d7d5", "e4d5");
    expect(events[2]!.captured).toEqual({ pieceId: "b-p-d7", square: "d5" });
    expect(game.pieces()).toHaveLength(31);
    expect(game.pieceAt("d5")?.id).toBe("w-p-e2");
  });

  it("reports en passant captures on the passed square", () => {
    const game = new GameState();
    const events = play(game, "e2e4", "a7a6", "e4e5", "d7d5", "e5d6");
    expect(events[4]!.captured).toEqual({ pieceId: "b-p-d7", square: "d5" });
    expect(game.pieceAt("d5")).toBeUndefined();
  });

  it("marks en passant as a capture in the legal moves", () => {
    const game = new GameState();
    play(game, "e2e4", "a7a6", "e4e5", "d7d5");
    expect(game.legalMovesFrom("e5").find((m) => m.to === "d6")?.isCapture).toBe(true);
  });

  it("moves the rook when castling on both sides", () => {
    const game = new GameState("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1");
    const [kingside, queenside] = play(game, "e1g1", "e8c8");
    expect(kingside).toMatchObject({ san: "O-O", rookMove: { pieceId: "w-r-h1", from: "h1", to: "f1" } });
    expect(queenside).toMatchObject({ san: "O-O-O", rookMove: { pieceId: "b-r-a8", from: "a8", to: "d8" } });
    expect(game.pieceAt("f1")?.id).toBe("w-r-h1");
    expect(game.pieceAt("d8")?.id).toBe("b-r-a8");
  });

  it("requires a promotion piece and keeps the pawn id after promoting", () => {
    const game = new GameState("8/4P3/8/8/8/8/k7/4K3 w - - 0 1");
    expect(game.legalMovesFrom("e7").every((m) => m.isPromotion)).toBe(true);
    expectError(game.applyMove({ from: "e7", to: "e8" }), "promotion-required");
    const [event] = play(game, "e7e8q");
    expect(event!.promotion).toBe("q");
    expect(game.pieceAt("e8")).toEqual({ id: "w-p-e7", color: "w", type: "q", square: "e8" });
  });

  it("rejects illegal moves without changing the state", () => {
    const game = new GameState();
    const before = { fen: game.fen(), pieces: game.pieces() };
    expectError(game.applyMove({ from: "e2", to: "e5" }), "illegal");
    expectError(game.applyMove({ from: "e7", to: "e5" }), "illegal");
    expectError(game.applyMove({ from: "z9", to: "e5" }), "illegal");
    expect(game.fen()).toBe(before.fen);
    expect(game.pieces()).toEqual(before.pieces);
    expect(game.history()).toEqual([]);
  });

  it("flags checks", () => {
    const game = new GameState();
    const events = play(game, "e2e4", "f7f6", "d1h5");
    expect(events[2]!.check).toBe(true);
    expect(game.inCheck()).toBe(true);
  });
});

describe("GameState — endings", () => {
  it("detects checkmate with the winner", () => {
    const game = new GameState();
    const events = play(game, "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7");
    expect(events[6]!.outcome).toEqual({ kind: "checkmate", winner: "w" });
    expect(game.outcome()).toEqual({ kind: "checkmate", winner: "w" });
    expect(game.history()).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
  });

  it("detects stalemate", () => {
    const game = new GameState("7k/8/5Q2/8/8/8/8/K7 w - - 0 1");
    play(game, "f6f7");
    expect(game.outcome()).toEqual({ kind: "stalemate" });
  });

  it("detects insufficient material", () => {
    const game = new GameState("4k3/8/8/8/8/8/3p4/4K3 w - - 0 1");
    play(game, "e1d2");
    expect(game.outcome()).toEqual({ kind: "insufficient-material" });
  });

  it("detects threefold repetition", () => {
    const game = new GameState();
    play(game, "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect(game.outcome()).toEqual({ kind: "threefold-repetition" });
  });

  it("detects the fifty-move rule", () => {
    const game = new GameState("4k3/8/8/8/8/8/R7/4K3 w - - 99 80");
    play(game, "a2a3");
    expect(game.outcome()).toEqual({ kind: "fifty-move-rule" });
  });

  it("rejects moves after the game is over", () => {
    const game = new GameState();
    play(game, "f2f3", "e7e5", "g2g4", "d8h4");
    expect(game.outcome()).toEqual({ kind: "checkmate", winner: "b" });
    expectError(game.applyMove({ from: "a2", to: "a3" }), "game-over");
  });
});
