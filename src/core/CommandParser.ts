import type { LegalMove, MoveRequest, PromotionPiece, Square } from "./types";

export type CommandError = "empty" | "unrecognized" | "illegal" | "ambiguous";

export type CommandResult =
  | { ok: true; move: MoveRequest }
  | { ok: false; error: CommandError }
  | { ok: false; error: "promotion-required"; from: Square; to: Square };

// "e2e4", "e2-e4", "e2 to e4", "e2 a e4", with an optional promotion piece.
const COORDINATE = /^([a-h][1-8])\s*(?:-|x|to|a)?\s*([a-h][1-8])\s*=?([qrbn])?$/;
// Standard algebraic notation without check marks: "Nf3", "exd5", "Nbd2", "e8=Q".
const ALGEBRAIC = /^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])=?([QRBN])?$/;
const CASTLING = /^[o0]-[o0](-[o0])?$/i;

/**
 * Turns free text into a legal move. Every input source (clicks today, voice
 * later) goes through here, matched against the legal moves of the position.
 */
export function parseCommand(text: string, legalMoves: LegalMove[]): CommandResult {
  const input = text.trim();
  if (!input) return { ok: false, error: "empty" };

  const coordinate = COORDINATE.exec(input.toLowerCase());
  if (coordinate) {
    const [, from, to, promotion] = coordinate;
    const matches = legalMoves.filter((m) => m.from === from && m.to === to);
    return resolve(matches, promotion as PromotionPiece | undefined);
  }

  const notation = input.replace(/[+#!?]+$/, "");
  if (CASTLING.test(notation)) {
    const san = notation.length > 3 ? "O-O-O" : "O-O";
    return resolve(legalMoves.filter((m) => stripSuffix(m.san) === san));
  }

  const algebraic = ALGEBRAIC.exec(withUppercasePiece(notation));
  if (!algebraic) return { ok: false, error: "unrecognized" };
  const [, piece = "P", fromFile, fromRank, target, promotion] = algebraic;
  const matches = legalMoves.filter(
    (m) =>
      pieceOf(m.san) === piece &&
      m.to === target &&
      (!fromFile || m.from[0] === fromFile) &&
      (!fromRank || m.from[1] === fromRank),
  );
  return resolve(matches, promotion?.toLowerCase() as PromotionPiece | undefined);
}

function resolve(matches: LegalMove[], promotion?: PromotionPiece): CommandResult {
  if (matches.length === 0) return { ok: false, error: "illegal" };
  if (matches.length > 1) return { ok: false, error: "ambiguous" };
  const { from, to, isPromotion } = matches[0]!;
  if (isPromotion && !promotion) return { ok: false, error: "promotion-required", from, to };
  if (!isPromotion && promotion) return { ok: false, error: "illegal" };
  return { ok: true, move: promotion ? { from, to, promotion } : { from, to } };
}

/** Lets players type "nf3"; "b" stays a file because "bc4" could be a pawn move. */
function withUppercasePiece(notation: string): string {
  return /^[nrqk][a-h1-8x]/.test(notation) ? notation[0]!.toUpperCase() + notation.slice(1) : notation;
}

function pieceOf(san: string): string {
  return /^[NBRQK]/.test(san) ? san[0]! : "P";
}

function stripSuffix(san: string): string {
  return san.replace(/[+#]+$/, "");
}
