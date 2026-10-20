import { describe, expect, it } from "vitest";
import type { GameOutcome } from "../core/types";
import { describeError, describeOutcome, statusLabel, turnLabel } from "./messages";

describe("describeOutcome", () => {
  it.each<[GameOutcome, string]>([
    [{ kind: "checkmate", winner: "w" }, "Checkmate — White wins"],
    [{ kind: "checkmate", winner: "b" }, "Checkmate — Black wins"],
    [{ kind: "stalemate" }, "Stalemate — draw"],
    [{ kind: "insufficient-material" }, "Draw by insufficient material"],
    [{ kind: "threefold-repetition" }, "Draw by threefold repetition"],
    [{ kind: "fifty-move-rule" }, "Draw by the fifty-move rule"],
  ])("describes %j", (outcome, expected) => {
    expect(describeOutcome(outcome)).toBe(expected);
  });
});

describe("describeError", () => {
  it.each([
    ["illegal", "That move is not legal."],
    ["ambiguous", "More than one piece can make that move."],
    ["unrecognized", "That command was not recognized."],
    ["empty", "Enter a move."],
    ["game-over", "The game is over."],
    ["promotion-required", "Choose a piece for promotion."],
    ["Worker stopped", "The engine failed: Worker stopped"],
    ["Invalid engine move", "The engine failed: Invalid engine move"],
    ["toString", "The engine failed: toString"],
  ])("describes %s", (code, expected) => {
    expect(describeError(code)).toBe(expected);
  });
});

describe("turnLabel", () => {
  it.each([
    ["w", false, "White to move"],
    ["b", false, "Black to move"],
    ["w", true, "White to move — check!"],
    ["b", true, "Black to move — check!"],
  ] as const)("labels %s with check=%s", (color, inCheck, expected) => {
    expect(turnLabel(color, inCheck)).toBe(expected);
  });
});

describe("statusLabel", () => {
  it("shows whose turn it is while the game is running", () => {
    expect(statusLabel("b", true, null)).toBe("Black to move — check!");
  });

  it("shows the result instead of the turn once the game is over", () => {
    expect(statusLabel("b", true, { kind: "checkmate", winner: "w" })).toBe("Checkmate — White wins");
    expect(statusLabel("w", false, { kind: "stalemate" })).toBe("Stalemate — draw");
  });
});
