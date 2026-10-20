import type { Color } from "../core/types";

/**
 * Y rotation of each side's pieces: geometry faces +x, white turns to -z and black to +z,
 * so pieces face the opponent. Shared by the live pieces and their debris.
 */
export const FACING: Record<Color, number> = { w: Math.PI / 2, b: -Math.PI / 2 };
