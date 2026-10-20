import type { Difficulty } from "./difficulty";

/** A chess engine that proposes moves. Implementations can be swapped (D4). */
export interface Engine {
  /** Resolves with the best move in UCI form, e.g. "e2e4" or "e7e8q". */
  bestMove(fen: string, difficulty: Difficulty): Promise<string>;
  newGame(): Promise<void>;
  dispose(): void;
}
