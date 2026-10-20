import type { Color, GameOutcome } from "../core/types";

const colorName = (color: Color) => color === "w" ? "White" : "Black";

export function describeOutcome(outcome: GameOutcome): string {
  switch (outcome.kind) {
    case "checkmate": return `Checkmate — ${colorName(outcome.winner)} wins`;
    case "stalemate": return "Stalemate — draw";
    case "insufficient-material": return "Draw by insufficient material";
    case "threefold-repetition": return "Draw by threefold repetition";
    case "fifty-move-rule": return "Draw by the fifty-move rule";
  }
}

const commandErrors = new Map([
  ["illegal", "That move is not legal."],
  ["ambiguous", "More than one piece can make that move."],
  ["unrecognized", "That command was not recognized."],
  ["empty", "Enter a move."],
  ["game-over", "The game is over."],
  ["promotion-required", "Choose a piece for promotion."],
]);

export function isEngineError(code: string): boolean {
  return !commandErrors.has(code);
}

export function describeError(code: string): string {
  return commandErrors.get(code) ?? `The engine failed: ${code}`;
}

export function turnLabel(color: Color, inCheck: boolean): string {
  return `${colorName(color)} to move${inCheck ? " — check!" : ""}`;
}

/** HUD status: the turn while playing, the result once the game is over. */
export function statusLabel(color: Color, inCheck: boolean, outcome: GameOutcome | null): string {
  return outcome ? describeOutcome(outcome) : turnLabel(color, inCheck);
}
