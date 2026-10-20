import type { BufferGeometry } from "three";
import type { PieceType } from "../../core/types";

export interface Fragment {
  /** Convex geometry in fragment-local coordinates, relative to center. */
  geometry: BufferGeometry;
  /** Offset from the original piece origin; place the body at piece + center. */
  center: [number, number, number];
  /** Approximate volume in model units cubed, useful for debris mass. */
  volume: number;
}

/**
 * Replaceable fracture source (D3). Runtime point-cloud Voronoi hulls implement
 * the MVP; a later provider will load Blender pre-fractured fragments unchanged
 * behind this interface. Returned arrays/geometries are cached and shared:
 * consumers must not mutate or dispose them during the provider's lifetime.
 */
export interface FractureProvider {
  fragments(type: PieceType): Fragment[];
}
