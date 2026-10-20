import { Vector3 } from "three";
import type { MoveEvent, PieceInstance, PieceType } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import { squareToWorld } from "../coords";
import type { Vec3 } from "./dust";
import { planMove } from "../animation/planMove";

/** Geometry dimensions; every provider has its feet at y=0. */
export interface PieceBounds {
  width: number;
  height: number;
  depth: number;
}

/** Recompute for the active provider, never share procedural dimensions across a swap. */
export function modelBounds(provider: PieceModelProvider): Record<PieceType, PieceBounds> {
  const types: PieceType[] = ["p", "n", "b", "r", "q", "k"];
  return Object.fromEntries(types.map((type) => {
    const geometry = provider.geometry(type);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3());
    return [type, { width: size.x, height: size.y, depth: size.z }];
  })) as Record<PieceType, PieceBounds>;
}

/** The same conservative radius drives both impact timing and physics. */
export function colliderRadius(size: PieceBounds): number {
  return Math.max(size.width, size.depth) / 2;
}

export function captureContactDistance(
  pieces: readonly PieceInstance[], event: MoveEvent, bounds: Readonly<Record<PieceType, PieceBounds>>,
): number | undefined {
  const attacker = pieces.find(({ id }) => id === event.pieceId);
  const victim = pieces.find(({ id }) => id === event.captured?.pieceId);
  return attacker && victim ? colliderRadius(bounds[attacker.type]) + colliderRadius(bounds[victim.type]) : undefined;
}

export interface PieceColliderPlan {
  id: string;
  bodyType: "fixed" | "kinematicPosition";
  position: Vec3;
  radius: number;
  halfHeight: number;
}

/** One-way decorative proxies. Only glide/hop tracks move; shattering victims
 * have no collider for the entire move (including off-destination en passant).
 */
export function planPieceColliders(
  pieces: readonly PieceInstance[], activeMove: MoveEvent | undefined,
  bounds: Readonly<Record<PieceType, PieceBounds>>,
): PieceColliderPlan[] {
  const tracks = activeMove ? planMove(activeMove, undefined, captureContactDistance(pieces, activeMove, bounds)).tracks : [];
  const moving = new Set(tracks.filter(({ kind }) => kind !== "shatter").map(({ pieceId }) => pieceId));
  const excluded = new Set(tracks.filter(({ kind }) => kind === "shatter").map(({ pieceId }) => pieceId));
  return pieces.filter(({ id }) => !excluded.has(id)).map((piece) => {
    const size = bounds[piece.type];
    const [x, z] = squareToWorld(piece.square);
    return {
      id: piece.id,
      bodyType: moving.has(piece.id) ? "kinematicPosition" : "fixed",
      position: [x, size.height / 2, z],
      radius: colliderRadius(size),
      halfHeight: size.height / 2,
    };
  });
}
