export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";
/** Algebraic square such as "e4". */
export type Square = string;

/** A physical piece. Its id never changes, even when a pawn promotes. */
export interface PieceInstance {
  id: string;
  color: Color;
  type: PieceType;
  square: Square;
}

export interface MoveRequest {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface LegalMove {
  from: Square;
  to: Square;
  san: string;
  isPromotion: boolean;
  isCapture: boolean;
}

export type GameOutcome =
  | { kind: "timeout"; winner: Color }
  | { kind: "timeout-draw" }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "insufficient-material" }
  | { kind: "threefold-repetition" }
  | { kind: "fifty-move-rule" };

/** Everything the scene needs to animate one move. */
export interface MoveEvent {
  san: string;
  uci: string;
  color: Color;
  pieceId: string;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  captured?: { pieceId: string; square: Square };
  rookMove?: { pieceId: string; from: Square; to: Square };
  check: boolean;
  outcome: GameOutcome | null;
}

export type MoveError = "illegal" | "promotion-required" | "game-over";

export type MoveResult = { ok: true; event: MoveEvent } | { ok: false; error: MoveError };
