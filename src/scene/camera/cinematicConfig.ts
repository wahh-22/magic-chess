export interface CinematicConfig {
  approachMs: number;
  holdMs: number;
  returnMs: number;
  distance: number;
  height: number;
  sideways: number;
  targetHeight: number;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
}

export const DEFAULT_CINEMATIC_CONFIG: Readonly<CinematicConfig> = {
  approachMs: 500,
  holdMs: 650,
  returnMs: 700,
  distance: 4,
  height: 2.6,
  sideways: 1.5,
  targetHeight: 0.5,
  minDistance: 3,
  maxDistance: 18,
  maxPolarAngle: Math.PI / 2.3,
};
