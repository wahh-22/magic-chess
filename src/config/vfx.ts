import vfx from "./vfx.json";

export type Range = [number, number];
export type Rgb = [number, number, number];

/** Per-capture particle budget for one graphics quality. */
export interface VfxPreset {
  /** Fast streaking sparks at the weapon contact. */
  sparks: number;
  /** Slower glowing embers at the weapon contact; they settle on the floor. */
  embers: number;
  /** Embers that float upward and drift with the wind (~2 s). */
  drifters: number;
  /** Extra sparks and embers when the victim breaks after its reaction. */
  breakSparks: number;
  breakEmbers: number;
  /** Brief point-light flash at the impact. */
  light: boolean;
  /** Colour scale: without bloom (low), HDR sparks would tone-map to white instead of orange. */
  brightness: number;
}

export interface ParticleKindConfig {
  /** Launch speed, board units per second. */
  speed: Range;
  /** Linear air drag per second (velocity decays as e^(−drag·t)). */
  drag: number;
  lifeMs: Range;
  /** Billboard radius, board units. */
  size: Range;
  /** Starting temperature on the colour ramp (1 = white-hot). */
  heat: Range;
  /** Tail length as seconds of velocity; 0 draws a round ember. */
  streakSeconds: number;
  /** Upward lift as a fraction of gravity; above 1 the particle rises. */
  buoyancy?: number;
}

export interface VfxConfig {
  presets: { high: VfxPreset; low: VfxPreset };
  /** Shared pool capacity, in full high-preset captures. */
  maxBursts: number;
  /** Board units per second squared. */
  gravity: number;
  floorY: number;
  /** Embers rest on the board platform only; beyond it they fall away. */
  floorHalf: number;
  floorBounce: number;
  floorFriction: number;
  wind: { x: number; z: number; gustHz: number };
  spark: ParticleKindConfig;
  ember: ParticleKindConfig;
  drifter: ParticleKindConfig;
  /** Launch cone: upward bias, bias along the attack, and spawn radius. */
  spread: { upward: number; forward: number; radius: number };
  /** Contact height as a fraction of the victim's height. */
  impactHeight: number;
  flash: { intensity: number; riseMs: number; decayMs: number; distance: number; color: string; breakScale: number };
  /** Weapon trail: HDR hot colour near the hit, cooler away from it, fast fade. */
  trail: { hotWindowMs: number; hot: Rgb; cool: Rgb; fadePower: number };
  /** The base dust puff waits for the armour parts to land. */
  dustLandDelayMs: number;
}

export const DEFAULT_VFX_CONFIG = vfx as VfxConfig;
