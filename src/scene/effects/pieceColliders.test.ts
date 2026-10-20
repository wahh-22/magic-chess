import { describe, expect, it } from "vitest";
import type { MoveEvent, PieceInstance, PieceType } from "../../core/types";
import { planPieceColliders, type PieceBounds } from "./pieceColliders";

const types: PieceType[] = ["p", "n", "b", "r", "q", "k"];
const pieces: PieceInstance[] = types.map((type, i) => ({ id: type, type, color: "w", square: `${"abcdefgh"[i]}2` }));
const bounds = Object.fromEntries(types.map((type, i) => [type, { width: 0.5 + i * 0.02, depth: 0.6 + i * 0.02, height: 0.8 + i * 0.1 }])) as Record<PieceType, PieceBounds>;
const move: MoveEvent = { san: "Rxb2", uci: "d2b2", color: "w", pieceId: "r", from: "d2", to: "b2", captured: { pieceId: "n", square: "b2" }, check: false, outcome: null };

describe("planPieceColliders", () => {
  it("places one fixed proxy per displayed live piece using each type's bounds", () => {
    const plans = planPieceColliders(pieces, undefined, bounds);
    expect(plans).toHaveLength(pieces.length);
    plans.forEach((plan, i) => {
      const size = bounds[types[i]!];
      expect(plan.id).toBe(pieces[i]!.id);
      expect(plan.position).toEqual([-3.5 + i, size.height / 2, 2.5]);
      expect(plan.radius).toBe(Math.max(size.width, size.depth) / 2);
      expect(plan.halfHeight).toBe(size.height / 2);
    });
  });

  it("excludes the moving attacker and victim throughout the capture, including impact", () => {
    expect(planPieceColliders(pieces, move, bounds).map(({ id }) => id)).toEqual(["p", "b", "q", "k"]);
  });

  it("never restores the victim after impact and restores the attacker at its destination", () => {
    const after = pieces.filter(({ id }) => id !== "n").map((piece) => piece.id === "r" ? { ...piece, square: "b2" } : piece);
    const plans = planPieceColliders(after, undefined, bounds);
    expect(plans.some(({ id }) => id === "n")).toBe(false);
    expect(plans.find(({ id }) => id === "r")?.position).toEqual([-2.5, bounds.r.height / 2, 2.5]);
  });

  it("excludes both moving pieces during castling, without mutating inputs", () => {
    const before = structuredClone(pieces);
    const event = { ...move, pieceId: "k", captured: undefined, rookMove: { pieceId: "r", from: "d2", to: "f2" } };
    expect(planPieceColliders(pieces, event, bounds).map(({ id }) => id)).toEqual(["p", "n", "b", "q"]);
    expect(pieces).toEqual(before);
  });
});
