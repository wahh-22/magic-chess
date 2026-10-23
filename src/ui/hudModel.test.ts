import { describe, expect, it } from "vitest";
import { GameState } from "../core/GameState";
import type { PieceInstance } from "../core/types";
import {
  capturedBy, describeCaptured, hudBanner, isLowTime, materialBalance, moveColumns, plateSides, playerName,
} from "./hudModel";

function piecesAfter(...sans: string[]): PieceInstance[] {
  const game = new GameState();
  for (const san of sans) {
    // Promotion moves are listed once, without the piece suffix.
    const bare = (text: string) => text.replace(/=[QRBN]/, "");
    const move = game.legalMoves().find((candidate) => bare(candidate.san) === bare(san));
    if (!move) throw new Error(`Illegal test move ${san}`);
    game.applyMove({ from: move.from, to: move.to, ...(move.isPromotion ? { promotion: "q" } : {}) });
  }
  return game.pieces();
}

describe("material", () => {
  it("is balanced with nothing captured at the start", () => {
    const pieces = new GameState().pieces();
    expect(materialBalance(pieces)).toBe(0);
    expect(capturedBy(pieces, "w")).toEqual([]);
    expect(capturedBy(pieces, "b")).toEqual([]);
  });

  it("credits each capture to the capturing side and orders the tally by value", () => {
    // White takes on d5 and the queen on g2; Black takes on d5 and g2.
    const pieces = piecesAfter("e4", "d5", "exd5", "Qxd5", "Nc3", "Qxg2", "Bxg2");
    expect(capturedBy(pieces, "w")).toEqual(["p", "q"]);
    expect(capturedBy(pieces, "b")).toEqual(["p", "p"]);
    expect(materialBalance(pieces)).toBe(8);
  });

  it("counts a promoted pawn as material, not as a captured pawn", () => {
    const pieces = piecesAfter("h4", "g5", "hxg5", "h6", "gxh6", "Nf6", "h7", "Ng8", "hxg8=Q");
    // White took g5, h6 and the g8 knight; Black took nothing. White's h-pawn became a queen.
    expect(capturedBy(pieces, "w")).toEqual(["p", "p", "n"]);
    expect(capturedBy(pieces, "b")).toEqual([]);
    expect(materialBalance(pieces)).toBe(2 + 3 + 8);
  });

  it("describes a tally for screen readers", () => {
    expect(describeCaptured([])).toBe("No captures");
    expect(describeCaptured(["p", "p", "n", "q"])).toBe("Captured 2 pawns, 1 knight, 1 queen");
  });
});

describe("players", () => {
  it("names both sides in a local game", () => {
    const settings = { mode: "local", humanColor: "w", difficultyId: "casual" } as const;
    expect(playerName(settings, "w")).toBe("White");
    expect(playerName(settings, "b")).toBe("Black");
    expect(plateSides(settings)).toEqual(["w", "b"]);
  });

  it("names the human and the engine with its level, the human on the left", () => {
    const settings = { mode: "ai", humanColor: "b", difficultyId: "club" } as const;
    expect(playerName(settings, "b")).toBe("You");
    expect(playerName(settings, "w")).toBe("Stockfish Club player");
    expect(plateSides(settings)).toEqual(["b", "w"]);
    expect(playerName({ ...settings, difficultyId: "unknown" }, "w")).toBe("Stockfish Casual");
  });
});

describe("move columns", () => {
  it("splits SAN history into numbered white and black columns", () => {
    expect(moveColumns(["e4", "e5", "Nf3"])).toEqual({
      w: [{ number: 1, san: "e4", ply: 0 }, { number: 2, san: "Nf3", ply: 2 }],
      b: [{ number: 1, san: "e5", ply: 1 }],
    });
    expect(moveColumns([])).toEqual({ w: [], b: [] });
  });
});

describe("clock and banners", () => {
  it("warns at thirty seconds or less", () => {
    expect(isLowTime(30_001)).toBe(false);
    expect(isLowTime(30_000)).toBe(true);
    expect(isLowTime(0)).toBe(true);
  });

  it("announces check once the move has played out, and checkmate at the end", () => {
    expect(hudBanner({ inCheck: true, outcome: null, animating: false })).toBe("check");
    expect(hudBanner({ inCheck: true, outcome: null, animating: true })).toBeNull();
    expect(hudBanner({ inCheck: false, outcome: null, animating: false })).toBeNull();
    expect(hudBanner({ inCheck: true, outcome: { kind: "checkmate", winner: "w" }, animating: false })).toBe("checkmate");
    expect(hudBanner({ inCheck: false, outcome: { kind: "stalemate" }, animating: false })).toBeNull();
  });
});
