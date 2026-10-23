import type { AnimationClip, BufferGeometry, Group, Material, Object3D } from "three";
import type { RigidPart } from '../effects/pieceParts';

export interface PieceAttack {
  clip: AnimationClip;
  durationMs: number;
  hitMs: number;
  activeEndMs: number;
  trailStartMs: number;
  trailEndMs: number;
}

export interface PieceRig {
  scene: Group;
  /** Board-space static base, rendered independently of the animated figure. */
  pedestal?: { object: Object3D; height: number; nodeName: string };
  /** Authored per-side materials must not be replaced by a shared tint. */
  preserveMaterials?: boolean;
  clips: { idle?: AnimationClip; walk?: AnimationClip; trot?: AnimationClip; hit?: AnimationClip; attack?: AnimationClip };
  attacks?: PieceAttack[];
  walkCycle?: { durationMs: number; strideBoardUnits: number };
  weaponTip?: string;
  hitTimeMs: number;
  clipDurationMs: number;
}
import type { Color, PieceType } from "../../core/types";

/**
 * Source of piece meshes and stone materials (D2, D12), procedural or processed glTF.
 * Geometry is centered on x/z, rests on y = 0, fits a 1×1 square, and faces +x.
 */
export interface PieceModelProvider {
  geometry(type: PieceType, color?: Color): BufferGeometry;
  /** Cached rigid armor, sampled at idle time zero; absent for deformable/static models. */
  parts?(type: PieceType, color?: Color): RigidPart[] | undefined;
  rig?(type: PieceType, color?: Color): PieceRig | undefined;
  material(type: PieceType, color: Color): Material | Material[];
  /** Plain UV-free stone for convex hulls; callers clone before animating opacity. */
  fragmentMaterial(type: PieceType, color: Color): Material;
}
