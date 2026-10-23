import { DEFAULT_DIFFICULTY, DIFFICULTIES } from "../core/engine/difficulty";
import type { Color, GameOutcome, PieceInstance, PieceType } from "../core/types";
import type { GameSettings } from "./gameStore";

const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
/** Tally order: cheapest first, as players usually read a capture row. */
const TALLY_ORDER: PieceType[] = ["p", "n", "b", "r", "q"];
const PIECE_NAMES: Record<PieceType, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

const opponent = (color: Color): Color => color === "w" ? "b" : "w";

/** White's material minus Black's, in pawns. */
export function materialBalance(pieces: PieceInstance[]): number {
  return pieces.reduce((sum, piece) => sum + (piece.color === "w" ? 1 : -1) * VALUES[piece.type], 0);
}

/**
 * Opponent pieces `color` has taken, compared with a standard starting army. Promoted pieces
 * beyond the starting count came from pawns, so a promotion is not mistaken for a capture.
 */
export function capturedBy(pieces: PieceInstance[], color: Color): PieceType[] {
  const count = Object.fromEntries(TALLY_ORDER.map((type) => [type, 0])) as Record<PieceType, number>;
  for (const piece of pieces) if (piece.color === opponent(color) && piece.type !== "k") count[piece.type]++;
  const promoted = TALLY_ORDER.slice(1).reduce((sum, type) => sum + Math.max(0, count[type] - START_COUNT[type]), 0);
  count.p += promoted;
  return TALLY_ORDER.flatMap((type) => Array<PieceType>(Math.max(0, START_COUNT[type] - count[type])).fill(type));
}

export function describeCaptured(types: PieceType[]): string {
  if (!types.length) return "No captures";
  const parts = TALLY_ORDER.flatMap((type) => {
    const n = types.filter((item) => item === type).length;
    return n ? [`${n} ${PIECE_NAMES[type]}${n > 1 ? "s" : ""}`] : [];
  });
  return `Captured ${parts.join(", ")}`;
}

export function playerName(settings: GameSettings, color: Color): string {
  if (settings.mode === "local") return color === "w" ? "White" : "Black";
  if (color === settings.humanColor) return "You";
  const difficulty = DIFFICULTIES.find((item) => item.id === settings.difficultyId) ?? DEFAULT_DIFFICULTY;
  return `Stockfish ${difficulty.label}`;
}

/** Left and right plate colours: the human player sits on the left against the engine. */
export function plateSides(settings: GameSettings): [Color, Color] {
  return settings.mode === "ai" && settings.humanColor === "b" ? ["b", "w"] : ["w", "b"];
}

export interface MoveEntry { number: number; san: string; ply: number }

export function moveColumns(history: string[]): Record<Color, MoveEntry[]> {
  const columns: Record<Color, MoveEntry[]> = { w: [], b: [] };
  history.forEach((san, ply) => columns[ply % 2 === 0 ? "w" : "b"].push({ number: Math.floor(ply / 2) + 1, san, ply }));
  return columns;
}

export const LOW_TIME_MS = 30_000;

export function isLowTime(ms: number): boolean {
  return ms <= LOW_TIME_MS;
}

/** Check is announced once the checking move has played out on the board. */
export function hudBanner({ inCheck, outcome, animating }: {
  inCheck: boolean; outcome: GameOutcome | null; animating: boolean;
}): "check" | "checkmate" | null {
  if (animating) return null;
  if (outcome) return outcome.kind === "checkmate" ? "checkmate" : null;
  return inCheck ? "check" : null;
}
