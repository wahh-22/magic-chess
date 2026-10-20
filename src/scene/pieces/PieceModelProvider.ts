import type { BufferGeometry } from "three";
import type { PieceType } from "../../core/types";

/**
 * Source of piece meshes (D2). Procedural pieces implement it today; AI-generated
 * models cleaned in Blender will implement it later without touching the scene.
 * Geometry is centered on x/z, rests on y = 0, fits a 1×1 square, and faces +x.
 */
export interface PieceModelProvider {
  geometry(type: PieceType): BufferGeometry;
}
