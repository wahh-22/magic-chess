import type { AnimationClip, BufferGeometry, Group, Material } from "three";

export interface PieceRig {
  scene: Group;
  clips: { idle?: AnimationClip; attack?: AnimationClip };
  hitTimeMs: number;
  clipDurationMs: number;
}
import type { Color, PieceType } from "../../core/types";

/**
 * Source of piece meshes and stone materials (D2, D12), procedural or processed glTF.
 * Geometry is centered on x/z, rests on y = 0, fits a 1×1 square, and faces +x.
 */
export interface PieceModelProvider {
  geometry(type: PieceType): BufferGeometry;
  rig?(type: PieceType): PieceRig | undefined;
  material(type: PieceType, color: Color): Material;
  /** Plain UV-free stone for convex hulls; callers clone before animating opacity. */
  fragmentMaterial(type: PieceType, color: Color): Material;
}
