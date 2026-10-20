import type { MoveEvent, PieceInstance, PieceType } from "../../core/types";
import { squareToWorld } from "../coords";
import type { Vec3 } from "./dust";

/** Geometry dimensions; procedural models have their feet at y=0. */
export interface PieceBounds {
  width: number;
  height: number;
  depth: number;
}

export interface PieceColliderPlan {
  id: string;
  position: Vec3;
  radius: number;
  halfHeight: number;
}

/** Read-only decorative proxies, never bodies attached to the live piece meshes.
 * Omit all animated pieces for the entire move: no stale source-square obstacle,
 * and no victim collider when fragments are created at impact (including en passant).
 */
export function planPieceColliders(
  pieces: readonly PieceInstance[], activeMove: MoveEvent | undefined,
  bounds: Readonly<Record<PieceType, PieceBounds>>,
): PieceColliderPlan[] {
  const excluded = new Set([activeMove?.pieceId, activeMove?.rookMove?.pieceId, activeMove?.captured?.pieceId]);
  return pieces.filter(({ id }) => !excluded.has(id)).map((piece) => {
    const size = bounds[piece.type];
    const [x, z] = squareToWorld(piece.square);
    return {
      id: piece.id,
      position: [x, size.height / 2, z],
      radius: Math.max(size.width, size.depth) / 2,
      halfHeight: size.height / 2,
    };
  });
}
