import type { PieceType } from "../../core/types";
import type { VfxConfig } from "../../config/vfx";
import type { GraphicsQuality } from "../environment/battlefieldConfig";
import type { Burst } from "./effectsStore";
import { emberSeed, killTag, type EmberPool, type SpawnRequest } from "./embers";
import { colliderRadius, type PieceBounds } from "./pieceColliders";

/** Where and how one capture sprays, derived once from its burst. */
export interface CaptureSite {
  tag: number;
  seed: number;
  /** Victim centre, world [x, z]. */
  position: [number, number];
  direction: [number, number];
  height: number;
  radius: number;
}

/** Per-burst presentation bookkeeping held by the VFX layer. */
export interface TrackedBurst {
  breakSpawned: boolean;
  /** Clock seconds of the latest flash and its strength (1 at contact). */
  flashAtS: number;
  flashScale: number;
}

export function captureSite(burst: Burst, bounds: Readonly<Record<PieceType, PieceBounds>>, config: VfxConfig): CaptureSite {
  const size = bounds[burst.victim.type];
  return {
    tag: burst.id,
    // Same capture → same spray, independent of the global burst counter.
    seed: emberSeed(burst.victim.id, burst.victim.square),
    position: burst.impact.position,
    direction: burst.impact.direction,
    height: size.height * config.impactHeight,
    radius: colliderRadius(size),
  };
}

/** Contact burst on the victim's struck face, or the break burst from its body. */
export function captureSpawn(phase: "impact" | "break", site: CaptureSite, quality: GraphicsQuality, config: VfxConfig): SpawnRequest {
  const preset = config.presets[quality];
  const [x, z] = site.position, [dx, dz] = site.direction;
  if (phase === "impact") {
    // The attacker travels along `direction`, so the struck face is behind the centre.
    const front = site.radius * 0.6;
    return {
      origin: [x - dx * front, site.height, z - dz * front], direction: site.direction, seed: site.seed, tag: site.tag,
      sparks: preset.sparks, embers: preset.embers, drifters: preset.drifters,
    };
  }
  return {
    origin: [x, site.height * 0.8, z], direction: site.direction, seed: (site.seed ^ 0x9e3779b9) >>> 0, tag: site.tag,
    sparks: preset.breakSparks, embers: preset.breakEmbers, drifters: 0,
  };
}

export function poolCapacity(quality: GraphicsQuality, config: VfxConfig): number {
  const p = config.presets[quality];
  return (p.sparks + p.embers + p.drifters + p.breakSparks + p.breakEmbers) * config.maxBursts;
}

/** Fast linear rise, quadratic fall: a short hot flash, not a lingering lamp. */
export function flashIntensity(elapsedMs: number, config: VfxConfig): number {
  const { intensity, riseMs, decayMs } = config.flash;
  if (elapsedMs < 0) return 0;
  if (elapsedMs < riseMs) return intensity * (elapsedMs / riseMs);
  const fall = (elapsedMs - riseMs) / decayMs;
  return fall >= 1 ? 0 : intensity * (1 - fall) ** 2;
}

/** RGBA for one trail sample: HDR hot near the weapon contact, cooler away from it, fast fade. */
export function trailColor(atMs: number, hitMs: number, alpha: number, trail: VfxConfig["trail"], out: Float32Array, offset: number) {
  const { hotWindowMs, hot, cool, fadePower } = trail;
  const heat = Math.max(0, 1 - Math.abs(atMs - hitMs) / hotWindowMs) ** 1.5;
  for (let c = 0; c < 3; c++) out[offset + c] = cool[c]! + (hot[c]! - cool[c]!) * heat;
  out[offset + 3] = Math.max(0, alpha) ** fadePower;
}

/** Forget bursts the store dropped (undo, new game, resume) and remove their particles. */
export function reconcileBursts(tracked: Map<number, TrackedBurst>, bursts: readonly Pick<Burst, "id">[], pool: EmberPool) {
  for (const id of tracked.keys()) {
    let live = false;
    for (let i = 0; i < bursts.length && !live; i++) live = bursts[i]!.id === id;
    if (!live) { tracked.delete(id); killTag(pool, id); }
  }
}
