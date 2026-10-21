export type GraphicsQuality = "high" | "low";
export const QUALITY_KEY = "magic-chess.graphics-quality";

export const QUALITY_PRESETS = {
  high: { dustCount: 160, torchStride: 3, torchShadows: 2, shadowSize: 1024, dpr: 1.5, postprocessing: true },
  low: { dustCount: 40, torchStride: 6, torchShadows: 0, shadowSize: 512, dpr: 0.75, postprocessing: false },
} as const;

export function parseQuality(value: string | null): GraphicsQuality {
  return value === "low" ? "low" : "high";
}

export function readQuality(): GraphicsQuality {
  try { return parseQuality(localStorage.getItem(QUALITY_KEY)); }
  catch { return "high"; }
}

// Smooth deterministic multi-frequency noise; no random jumps or per-frame allocation.
export function torchFlicker(seconds: number, seed: number): number {
  return 1 + 0.09 * Math.sin(seconds * 2.7 + seed * 7.3)
    + 0.05 * Math.sin(seconds * 6.1 + seed * 3.7)
    + 0.025 * Math.sin(seconds * 13.3 + seed);
}

// Entire orbit (maxDistance 18), not just the initial camera, is kept clear.
export const CAMERA_KEEP_OUT = 18;
export const PILLAR_RADIUS = 22;
export const PILLAR_HALF_WIDTH = 0.9;
export const WALL_DISTANCE = 26;
export const PILLARS = Array.from({ length: 12 }, (_, index) => {
  const angle = index * Math.PI / 6;
  return { x: Math.sin(angle) * PILLAR_RADIUS, z: Math.cos(angle) * PILLAR_RADIUS, angle };
});
export const DAIS = [
  { width: 11.8, height: 0.3, y: -1.2 },
  { width: 10.7, height: 0.3, y: -0.9 },
  { width: 9.6, height: 0.49, y: -0.505 },
] as const;
