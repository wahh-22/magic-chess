export type GraphicsQuality = "high" | "low";
export const ARCANA = { ivory: "#d9dfe2", slate: "#3b4a55", gold: "#d9b25f", cyan: "#7fd6dc", obsidian: "#25313e" } as const;
export const QUALITY_KEY = "magic-chess.graphics-quality";
/**
 * `grassCount`/`pebbleCount` scanned ground cover, `propDensity` the share of bushes kept;
 * `godRays` light shafts on the post stack; `lodBias` scales the LOD rings of scanned trees
 * and rocks (low switches to the lighter levels closer to the board).
 */
export const QUALITY_PRESETS = {
  high: { dustCount: 260, grassCount: 7000, pebbleCount: 700, propDensity: 1, shadowSize: 2048, dpr: 1.5, postprocessing: true, godRays: true, lodBias: 1 },
  low: { dustCount: 60, grassCount: 1200, pebbleCount: 220, propDensity: 0.35, shadowSize: 1024, dpr: 0.75, postprocessing: false, godRays: false, lodBias: 0.5 },
} as const;
export function parseQuality(value: string | null): GraphicsQuality {
  return value === "low" ? "low" : "high";
}
export function readQuality(): GraphicsQuality {
  try { return parseQuality(localStorage.getItem(QUALITY_KEY)); }
  catch { return "high"; }
}

// Units are board squares (a life-size knight is about one unit tall). The playing
// surface stays at y = 0; a carved border and two steps lead down to the plaza.
export const BOARD_HALF = 4;
export const BORDER_WIDTH = 0.45;
export const STEP_DEPTH = 0.4;
export const STEP_HEIGHT = 0.12;
export const STEP_COUNT = 2;
export const PLATFORM_HALF = BOARD_HALF + BORDER_WIDTH + STEP_DEPTH * STEP_COUNT;
export const PLAZA_Y = -STEP_HEIGHT * (STEP_COUNT + 1);
/** Paved plaza half-extent; ragged edges blend into the terrain beyond it. */
export const PLAZA_HALF = 15.5;
/** No ruin, tree or wall comes closer to the board centre than this (horizontal radius). */
export const RUINS_INNER_RADIUS = 17;
export const TERRAIN_RADIUS = 170;

/**
 * The CC0 sky (Poly Haven "Rolling Hills") is baked with its sun at this equirect `u`
 * (three's convention: u = atan2(z, x) / 2π + 0.5) and elevation. The sun light uses
 * the same azimuth, slightly higher so shadows stay long but readable on the board.
 */
export const SKY = {
  url: "/environment/rolling_hills_sky.webp",
  /** Where the sun sits in the baked texture. */
  bakedSunU: 0.1532,
  /** Where the sky is rotated to put it: just behind the temple entablature in the play view. */
  sunU: 0.2215,
  sunElevationDeg: 9.1,
  /** The texture stores rows from the zenith down to this elevation. */
  cropElevationDeg: -12,
  /** Encoded value v (0..1) decodes as y = v^2.2, radiance = y / (1 - y). */
  maxRadiance: 200,
  /** Radiance cap for the image-based lighting copy (the sun light carries the rest). */
  lightingCeiling: 12,
} as const;
export const SUN_LIGHT_ELEVATION_DEG = 14;
export function sunDirection(elevationDeg: number = SKY.sunElevationDeg): [number, number, number] {
  const azimuth = (SKY.sunU - 0.5) * Math.PI * 2;
  const elevation = elevationDeg * Math.PI / 180;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

export const CAMERA_FOV = 42;
// Play view at ~39° (FOV 42): steep enough that every pawn shows above the taller back rank (a
// 29° view hid e2 behind the king), like Chess Infinity's play camera. The sky, the sun
// behind the colonnade and the hills appear when orbiting low and in cinematic shots.
export const DEFAULT_CAMERA: [number, number, number] = [0, 7.95, 9.93];
export const CAMERA_TARGET: [number, number, number] = [0, 0.4, 0.6];
export const CAMERA_MIN_DISTANCE = 4;
export const CAMERA_MAX_DISTANCE = 14;
/** Lowest orbit keeps the eye at least ~11° above the plaza, looking down at the board. */
export const CAMERA_MAX_POLAR = 1.38;
/** Every camera pose (orbit, cinematic, shake) stays inside this cylinder. */
export const CAMERA_BOUNDS = { radius: RUINS_INNER_RADIUS - 1.5, minY: PLAZA_Y + 0.6, maxY: 22 } as const;
