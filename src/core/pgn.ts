import { Chess, DEFAULT_POSITION } from "chess.js";
import { GameState } from "./GameState";
import type { GameOutcome, PromotionPiece } from "./types";

export function replayUci(moves: string[]): GameState {
  const game = new GameState();
  for (const uci of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error("Invalid saved move");
    const result = game.applyMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as PromotionPiece | undefined });
    if (!result.ok) throw new Error("Invalid saved position");
  }
  return game;
}
/** Imported games always become local two-player games, without a clock.
 * Only standard-start PGNs are supported so physical piece identities are stable.
 */
export function importPgn(text: string): GameState {
  try {
    const chess = new Chess();
    chess.loadPgn(text);
    const headers = chess.getHeaders();
    if (headers.FEN && headers.FEN !== DEFAULT_POSITION) throw new Error("Only standard starting positions are supported");
    const game = new GameState();
    // SAN is resolved through chess.js, then every move goes through GameState.
    const replay = new Chess();
    for (const san of chess.history()) {
      const move = replay.move(san);
      const result = game.applyMove({ from: move.from, to: move.to, promotion: move.promotion as PromotionPiece | undefined });
      if (!result.ok) throw new Error("Move after game end");
    }
    return game;
  } catch (error) {
    throw new Error(`Invalid PGN: ${error instanceof Error ? error.message : "cannot read this game"}`, { cause: error });
  }
}
export function exportPgn(game: GameState, options: { white: string; black: string; date: Date; outcome?: GameOutcome | null }): string {
  const chess = new Chess();
  for (const uci of game.uciHistory()) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const outcome = options.outcome ?? game.outcome();
  const result = !outcome ? "*" : "winner" in outcome ? (outcome.winner === "w" ? "1-0" : "0-1") : "1/2-1/2";
  const date = options.date;
  chess.header("Event", "Magic Chess", "Date", `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`,
    "White", options.white, "Black", options.black, "Result", result);
  return chess.pgn();
}
