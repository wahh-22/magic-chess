import { Chess, type Move, type Square as ChessSquare } from "chess.js";
import type {
  Color,
  GameOutcome,
  LegalMove,
  MoveEvent,
  MoveRequest,
  MoveResult,
  PieceInstance,
  PromotionPiece,
  Square,
} from "./types";

const SQUARE_PATTERN = /^[a-h][1-8]$/;

/**
 * Authoritative game state. Wraps chess.js for the rules and tracks a stable id
 * for every physical piece so the scene knows exactly which model to animate.
 */
export class GameState {
  private readonly chess: Chess;
  private readonly bySquare = new Map<Square, PieceInstance>();
  private readonly snapshots: { pieces: PieceInstance[]; event: MoveEvent }[] = [];

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const id = `${cell.color}-${cell.type}-${cell.square}`;
        this.bySquare.set(cell.square, { id, color: cell.color, type: cell.type, square: cell.square });
      }
    }
  }

  fen(): string {
    return this.chess.fen();
  }

  turn(): Color {
    return this.chess.turn();
  }

  inCheck(): boolean {
    return this.chess.inCheck();
  }

  history(): string[] {
    return this.chess.history();
  }

  uciHistory(): string[] {
    return this.snapshots.map(({ event }) => event.uci);
  }

  pieces(): PieceInstance[] {
    return [...this.bySquare.values()].map((piece) => ({ ...piece }));
  }

  pieceAt(square: Square): PieceInstance | undefined {
    const piece = this.bySquare.get(square);
    return piece && { ...piece };
  }

  legalMoves(): LegalMove[] {
    return this.chess.moves({ verbose: true }).map(toLegalMove).filter(uniqueByTarget());
  }

  legalMovesFrom(square: Square): LegalMove[] {
    if (!SQUARE_PATTERN.test(square)) return [];
    return this.chess
      .moves({ verbose: true, square: square as ChessSquare })
      .map(toLegalMove)
      .filter(uniqueByTarget());
  }

  outcome(): GameOutcome | null {
    const chess = this.chess;
    if (chess.isCheckmate()) return { kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
    if (chess.isStalemate()) return { kind: "stalemate" };
    if (chess.isInsufficientMaterial()) return { kind: "insufficient-material" };
    if (chess.isThreefoldRepetition()) return { kind: "threefold-repetition" };
    if (chess.isDrawByFiftyMoves()) return { kind: "fifty-move-rule" };
    return null;
  }

  applyMove(request: MoveRequest): MoveResult {
    if (this.outcome()) return { ok: false, error: "game-over" };

    const candidates = this.chess
      .moves({ verbose: true })
      .filter((m) => m.from === request.from && m.to === request.to);
    if (candidates.length === 0) return { ok: false, error: "illegal" };
    if (candidates[0]!.isPromotion() && !request.promotion) {
      return { ok: false, error: "promotion-required" };
    }
    const chosen = candidates.find((m) => !m.isPromotion() || m.promotion === request.promotion);
    if (!chosen) return { ok: false, error: "illegal" };

    const pieces = this.pieces();
    const move = this.chess.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
    const event = this.trackPieces(move);
    this.snapshots.push({ pieces, event });
    return { ok: true, event };
  }

  undo(): MoveEvent | null {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return null;
    this.chess.undo();
    this.bySquare.clear();
    for (const piece of snapshot.pieces) this.bySquare.set(piece.square, { ...piece });
    return snapshot.event;
  }

  /** Mirrors a move applied by chess.js onto the tracked physical pieces. */
  private trackPieces(move: Move): MoveEvent {
    const mover = this.bySquare.get(move.from)!;
    const event: MoveEvent = {
      san: move.san,
      uci: move.lan,
      color: move.color,
      pieceId: mover.id,
      from: move.from,
      to: move.to,
      check: this.chess.inCheck(),
      outcome: this.outcome(),
    };

    // isCapture() ignores en passant, so rely on the captured piece instead.
    if (move.captured) {
      const square = move.isEnPassant() ? `${move.to[0]}${move.from[1]}` : move.to;
      event.captured = { pieceId: this.bySquare.get(square)!.id, square };
      this.bySquare.delete(square);
    }

    this.bySquare.delete(move.from);
    mover.square = move.to;
    if (move.promotion) {
      mover.type = move.promotion;
      event.promotion = move.promotion as PromotionPiece;
    }
    this.bySquare.set(move.to, mover);

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rank = move.from[1];
      const [rookFrom, rookTo] = move.isKingsideCastle() ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
      const rook = this.bySquare.get(rookFrom)!;
      this.bySquare.delete(rookFrom);
      rook.square = rookTo;
      this.bySquare.set(rookTo, rook);
      event.rookMove = { pieceId: rook.id, from: rookFrom, to: rookTo };
    }

    return event;
  }
}

function toLegalMove(move: Move): LegalMove {
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    isPromotion: move.isPromotion(),
    isCapture: move.captured !== undefined,
  };
}

/** Promotions appear once per piece choice in chess.js; the board needs one entry per target. */
function uniqueByTarget() {
  const seen = new Set<string>();
  return (move: LegalMove) => {
    const key = `${move.from}${move.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
