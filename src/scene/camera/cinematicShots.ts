import type { MoveEvent, PieceType } from "../../core/types";
import type { Impact } from "../animation/planMove";
import { squareToWorld } from "../coords";
import { CAMERA_BOUNDS } from "../environment/battlefieldConfig";
import { DEFAULT_CINEMATIC_CONFIG, type CinematicConfig } from "./cinematicConfig";

export type Point3 = [number, number, number];
export interface CameraPose {
  position: Point3;
  target: Point3;
}
export interface CinematicShot {
  pose: CameraPose;
  config: Readonly<CinematicConfig>;
}

/** Unknown victims do not qualify. Mate takes precedence, even with a pawn victim. */
export function qualifiesForCinematic(event: MoveEvent, victimType?: PieceType): boolean {
  return event.outcome?.kind === "checkmate" ||
    Boolean(event.captured && victimType && victimType !== "p");
}

/** Call only after qualification; impact may be omitted for a non-capture mate. */
export function planCinematicShot(
  event: MoveEvent,
  impact?: Pick<Impact, "position" | "direction">,
  config: Readonly<CinematicConfig> = DEFAULT_CINEMATIC_CONFIG,
): CinematicShot {
  const [x, z] = impact?.position ?? squareToWorld(event.to);
  const from = squareToWorld(event.from);
  const to = squareToWorld(event.to);
  const [dx, dz] = impact?.direction ?? [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dz);
  const ux = length > 0 ? dx / length : 0;
  const uz = length > 0 ? dz / length : -1;
  return {
    config,
    pose: {
      target: [x, config.targetHeight, z],
      position: [x - ux * config.distance - uz * config.sideways,
        config.height, z - uz * config.distance + ux * config.sideways],
    },
  };
}

/** Cinematic targets can move to edge squares; constrain their camera in world space,
 * not just its distance to the moving target: above the plaza and inside the ruins. */
export function constrainScenePose(pose: CameraPose): CameraPose {
  const [x, y, z] = pose.position;
  const radius = Math.hypot(x, z);
  const scale = radius > CAMERA_BOUNDS.radius ? CAMERA_BOUNDS.radius / radius : 1;
  return { target: pose.target, position: [
    x * scale,
    Math.max(CAMERA_BOUNDS.minY, Math.min(CAMERA_BOUNDS.maxY, y)),
    z * scale,
  ] };
}

/** Clamped smoothstep has zero velocity at both ends, including a skipped return. */
export function easeCinematic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function blendCameraPose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = easeCinematic(progress);
  if (t === 0) return from;
  if (t === 1) return to;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const orbit = (pose: CameraPose) => {
    const x = pose.position[0] - pose.target[0];
    const y = pose.position[1] - pose.target[1];
    const z = pose.position[2] - pose.target[2];
    const radius = Math.hypot(x, y, z);
    return { radius, polar: radius ? Math.acos(Math.max(-1, Math.min(1, y / radius))) : 0, azimuth: Math.atan2(x, z) };
  };
  const a = orbit(from);
  const b = orbit(to);
  // Interpolate around the target, not through it: opposite views must not zoom
  // inside the board or violate OrbitControls' minimum distance during approach.
  const angle = Math.atan2(Math.sin(b.azimuth - a.azimuth), Math.cos(b.azimuth - a.azimuth));
  const azimuth = a.azimuth + angle * t;
  const polar = lerp(a.polar, b.polar);
  const radius = lerp(a.radius, b.radius);
  const target: Point3 = [lerp(from.target[0], to.target[0]), lerp(from.target[1], to.target[1]), lerp(from.target[2], to.target[2])];
  const horizontal = radius * Math.sin(polar);
  return {
    target,
    position: [target[0] + horizontal * Math.sin(azimuth), target[1] + radius * Math.cos(polar), target[2] + horizontal * Math.cos(azimuth)],
  };
}

export function cinematicDuration(shot: CinematicShot): number {
  return shot.config.approachMs + shot.config.holdMs + shot.config.returnMs;
}

export function sampleCinematicShot(shot: CinematicShot, original: CameraPose, elapsedMs: number): CameraPose {
  const { approachMs, holdMs, returnMs } = shot.config;
  if (elapsedMs <= 0) return original;
  if (elapsedMs >= cinematicDuration(shot)) return original;
  if (elapsedMs < approachMs) return blendCameraPose(original, shot.pose, elapsedMs / approachMs);
  if (elapsedMs <= approachMs + holdMs) return shot.pose;
  return blendCameraPose(shot.pose, original, (elapsedMs - approachMs - holdMs) / returnMs);
}
