import type { Color, PieceType } from "../../core/types";

type Vec2 = [number, number];
type Vec3 = [number, number, number];

/** One posed piece. Positions are on the floor (y = 0); a piece looks toward `face`. */
export interface ShotPiece {
  type: PieceType;
  color: Color;
  at: Vec2;
  face: Vec2;
  /** Authored clip frame (rig playback); idle at time 0 when absent. */
  pose?: { role: "idle" | "attack" | "hit" | "walk"; variant?: number; timeMs: number };
  /** Show the static V4 pedestal under the figure. */
  pedestal?: boolean;
}

export interface ShotLight {
  color: string;
  /** Candela (physical units, decay 2). */
  intensity: number;
  position: Vec3;
  target: Vec3;
  /** Cone half-angle in degrees. */
  angle: number;
  penumbra?: number;
  shadow?: boolean;
}

/** A soft screen-space glow on the far backdrop (smoke lit from behind). */
export interface BackdropGlow {
  /** Screen position, 0..1 from the bottom-left corner. */
  uv: Vec2;
  color: string;
  /** Radius as a fraction of the screen height. */
  radius: number;
  intensity: number;
}

export interface EmberCloud {
  seed: number; count: number; center: Vec3; extent: Vec3; drift: Vec3;
  /** Ember size multiplier (foreground bokeh needs bigger, softer embers). */
  scale?: number;
}

export interface Shot {
  camera: { position: Vec3; target: Vec3; fov: number };
  pieces: ShotPiece[];
  lights: ShotLight[];
  /** Image-based light for metal reflections: warm and cool panels in a black room. */
  environment: { warm: number; cool: number; intensity: number };
  backdrop: BackdropGlow[];
  /** Ember clouds; a small one near the camera turns into foreground bokeh. */
  embers: EmberCloud[];
  /** World point kept sharp; `range` is the depth band in focus. */
  focus: { target: Vec3; range: number; bokeh: number };
  /** Floor pool under the subject: it fades to black at `radius`, so no horizon or edge shows. */
  floor: { center: Vec2; radius: number };
  /** Black fog: distance where falloff starts and where everything is black. */
  fog: [number, number];
  /** Darkens a screen region for UI: direction the darkness comes from and its reach (0..1). */
  shade?: { side: "left" | "bottom"; reach: number; strength: number };
  vignette: number;
}

// Warm gold and cool moonlight used by every composition.
const GOLD = "#ffb35c";
const EMBER = "#ff7a2e";
const COOL = "#7fa6ff";

/**
 * Title background (16:9): the ivory knight rears in the right foreground against the
 * obsidian knight in the mid-ground; the left 40 % stays black for the menu panel.
 */
const title: Shot = {
  camera: { position: [-0.5, 0.4, 2.5], target: [-0.34, 0.52, 0], fov: 30 },
  pieces: [
    { type: "n", color: "w", at: [0.32, 0.15], face: [-0.35, -0.25], pose: { role: "attack", variant: 1, timeMs: 920 }, pedestal: true },
    { type: "n", color: "b", at: [-0.35, -0.25], face: [0.32, 0.15], pose: { role: "attack", variant: 0, timeMs: 300 }, pedestal: true },
  ],
  lights: [
    { color: GOLD, intensity: 70, position: [2.0, 2.0, -1.2], target: [0.32, 0.55, 0.15], angle: 22, penumbra: 0.8, shadow: true },
    { color: COOL, intensity: 80, position: [-1.8, 1.8, -2.4], target: [-0.35, 0.5, -0.25], angle: 20, penumbra: 0.9, shadow: true },
    { color: COOL, intensity: 6, position: [-1.6, 1.2, 1.6], target: [-0.35, 0.6, -0.25], angle: 16, penumbra: 1 },
    { color: "#ffd9a8", intensity: 9, position: [-0.6, 1.3, 2.5], target: [0.32, 0.55, 0.15], angle: 12, penumbra: 1 },
  ],
  environment: { warm: 1.4, cool: 0.8, intensity: 1.3 },
  backdrop: [
    { uv: [0.74, 0.62], color: EMBER, radius: 0.45, intensity: 0.06 },
    { uv: [0.5, 0.52], color: COOL, radius: 0.28, intensity: 0.03 },
  ],
  embers: [
    { seed: 7, count: 110, center: [0.05, 0.7, 0], extent: [1.5, 1.2, 1.0], drift: [0.15, 1, 0.05] },
    { seed: 8, count: 5, center: [0.1, 1.0, 1.4], extent: [0.6, 0.2, 0.3], drift: [0.1, 1, 0], scale: 3 },
  ],
  focus: { target: [0.32, 0.75, 0.15], range: 1.4, bokeh: 2 },
  floor: { center: [0, 0], radius: 1.5 },
  fog: [2.4, 5.5],
  shade: { side: "left", reach: 0.42, strength: 0.92 },
  vignette: 0.62,
};

/** Phones (9:16): the same duel re-framed; the lower third stays dark for the menu. */
const titlePortrait: Shot = {
  ...title,
  camera: { position: [-0.3, 0.5, 3.0], target: [0, 0.3, -0.05], fov: 46 },
  pieces: [
    { type: "n", color: "w", at: [0.26, 0.12], face: [-0.3, -0.02], pose: { role: "attack", variant: 1, timeMs: 920 }, pedestal: true },
    { type: "n", color: "b", at: [-0.28, -0.2], face: [0.3, 0.2], pose: { role: "attack", variant: 0, timeMs: 300 }, pedestal: true },
  ],
  lights: [
    { color: GOLD, intensity: 70, position: [2.0, 2.0, -1.2], target: [0.26, 0.55, 0.12], angle: 22, penumbra: 0.8, shadow: true },
    { color: COOL, intensity: 80, position: [-1.8, 1.8, -2.4], target: [-0.28, 0.5, -0.2], angle: 20, penumbra: 0.9, shadow: true },
    { color: COOL, intensity: 6, position: [-1.6, 1.2, 1.8], target: [-0.28, 0.6, -0.2], angle: 16, penumbra: 1 },
    { color: "#ffd9a8", intensity: 9, position: [-0.5, 1.3, 2.7], target: [0.26, 0.55, 0.12], angle: 12, penumbra: 1 },
  ],
  embers: [
    { seed: 7, count: 120, center: [0, 0.85, 0], extent: [1.4, 1.6, 1.0], drift: [0.15, 1, 0.05] },
    { seed: 9, count: 5, center: [-0.15, 0.9, 1.6], extent: [0.5, 0.6, 0.3], drift: [0.1, 1, 0], scale: 3 },
  ],
  focus: { target: [0.1, 0.7, 0], range: 1.4, bokeh: 2 },
  backdrop: [
    { uv: [0.66, 0.68], color: EMBER, radius: 0.3, intensity: 0.07 },
    { uv: [0.3, 0.64], color: COOL, radius: 0.2, intensity: 0.035 },
  ],
  floor: { center: [0, 0], radius: 1.0 },
  shade: { side: "bottom", reach: 0.42, strength: 0.9 },
};

/** Loading art 1: the two queens face off, full-bleed, dark floor for text at the bottom. */
const queens: Shot = {
  camera: { position: [0, 0.45, 3.4], target: [0, 0.55, 0], fov: 30 },
  pieces: [
    { type: "q", color: "w", at: [0.45, 0.1], face: [-0.2, 0.6], pose: { role: "attack", variant: 1, timeMs: 1650 }, pedestal: true },
    { type: "q", color: "b", at: [-0.45, -0.1], face: [0.2, 0.5], pose: { role: "attack", variant: 0, timeMs: 880 }, pedestal: true },
  ],
  lights: [
    { color: GOLD, intensity: 40, position: [1.5, 1.9, 1.3], target: [0.45, 0.65, 0.1], angle: 20, penumbra: 0.8, shadow: true },
    { color: GOLD, intensity: 45, position: [1.6, 1.5, -1.8], target: [0.45, 0.7, 0.1], angle: 20, penumbra: 0.8 },
    { color: COOL, intensity: 30, position: [-1.5, 1.8, 1.2], target: [-0.45, 0.65, -0.1], angle: 20, penumbra: 0.8, shadow: true },
    { color: COOL, intensity: 50, position: [-1.6, 1.5, -2.0], target: [-0.45, 0.7, -0.1], angle: 20, penumbra: 0.8 },
  ],
  environment: { warm: 1.3, cool: 1, intensity: 1.2 },
  backdrop: [
    { uv: [0.68, 0.6], color: EMBER, radius: 0.35, intensity: 0.06 },
    { uv: [0.32, 0.6], color: COOL, radius: 0.3, intensity: 0.04 },
  ],
  embers: [
    { seed: 21, count: 90, center: [0, 0.75, 0], extent: [2.0, 1.3, 1.0], drift: [0, 1, 0.1] },
    { seed: 22, count: 5, center: [0.1, 0.7, 2.0], extent: [0.8, 0.4, 0.3], drift: [0.1, 1, 0], scale: 3 },
  ],
  focus: { target: [0, 0.8, 0], range: 1.5, bokeh: 2 },
  floor: { center: [0, 0], radius: 1.4 },
  fog: [2.8, 6.5],
  shade: { side: "bottom", reach: 0.3, strength: 0.85 },
  vignette: 0.6,
};

/** Loading art 2: an ivory pawn line, low and close; only the nearest pawn is sharp. Full-bleed, text at the bottom. */
const pawns: Shot = {
  camera: { position: [-0.95, 0.44, 1.3], target: [0.25, 0.4, -0.3], fov: 32 },
  pieces: [0, 1, 2, 3, 4, 5].map((i): ShotPiece => ({
    type: "p", color: "w", at: [-0.15 + i * 0.62, -0.25 - i * 0.05], face: [-0.6 + i * 0.6, 2], pedestal: true,
  })),
  lights: [
    { color: GOLD, intensity: 50, position: [1.4, 1.9, 1.4], target: [0.6, 0.3, -0.3], angle: 30, penumbra: 0.8, shadow: true },
    { color: COOL, intensity: 40, position: [1.5, 1.6, -3.6], target: [1.2, 0.4, -2.2], angle: 26, penumbra: 0.9, shadow: true },
    { color: "#ffd9a8", intensity: 4, position: [-1.6, 0.9, 1.6], target: [-0.15, 0.5, -0.25], angle: 18, penumbra: 1 },
  ],
  environment: { warm: 1, cool: 0.7, intensity: 0.5 },
  backdrop: [
    { uv: [0.7, 0.6], color: EMBER, radius: 0.45, intensity: 0.06 },
    { uv: [0.85, 0.75], color: COOL, radius: 0.3, intensity: 0.03 },
  ],
  embers: [{ seed: 3, count: 110, center: [0.8, 0.6, -0.8], extent: [3.2, 1.2, 2.6], drift: [0.1, 1, 0] }],
  focus: { target: [-0.15, 0.55, -0.25], range: 0.6, bokeh: 3 },
  floor: { center: [1, -0.6], radius: 2.6 },
  fog: [2.2, 6],
  shade: { side: "bottom", reach: 0.3, strength: 0.85 },
  vignette: 0.6,
};

export const SHOTS = { title, "title-portrait": titlePortrait, "loading-1": queens, "loading-2": pawns } satisfies Record<string, Shot>;
export type ShotName = keyof typeof SHOTS;

/**
 * Contact sheet for picking clip frames: eight copies of one piece in a row, sampled evenly
 * over the clip. `?poses=n-w-attack-1` = type, colour, role, attack variant.
 */
export function poseSheet(spec: string, durationMs = 2500): Shot {
  const [type = "n", color = "w", role = "attack", variant = "0"] = spec.split("-");
  const pieces = Array.from({ length: 8 }, (_, i): ShotPiece => ({
    type: type as PieceType, color: color as Color, at: [(i - 3.5) * 0.9, 0], face: [(i - 3.5) * 0.9 + 1, 0.4],
    pose: { role: role as "attack", variant: Number(variant), timeMs: (durationMs * i) / 7 }, pedestal: true,
  }));
  return {
    camera: { position: [0, 0.7, 3.7], target: [0, 0.5, 0], fov: 40 },
    pieces,
    lights: [{ color: "#ffffff", intensity: 80, position: [0, 4, 4], target: [0, 0.5, 0], angle: 50, penumbra: 0.3 }],
    environment: { warm: 1, cool: 1, intensity: 1.2 },
    backdrop: [],
    embers: [{ seed: 1, count: 0, center: [0, 0, 0], extent: [1, 1, 1], drift: [0, 1, 0] }],
    focus: { target: [0, 0.5, 0], range: 20, bokeh: 0 },
    floor: { center: [0, 0], radius: 5 },
    fog: [30, 60],
    vignette: 0,
  };
}
