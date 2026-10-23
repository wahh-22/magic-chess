import type { AnimationClip, Group } from 'three';

export interface AttackTiming {
  durationMs: number;
  hitMs: number;
  activeEndMs?: number;
  trailStartMs?: number;
  trailEndMs?: number;
}
export interface WalkCycle { durationMs: number; strideBoardUnits: number }
/** Structural V4 contract, also accepts older single-attack providers. */
export interface RuntimeRig {
  scene: Group;
  pedestal?: { object: import('three').Object3D; height: number; nodeName: string };
  preserveMaterials?: boolean;
  clips: {
    idle?: AnimationClip;
    walk?: AnimationClip;
    trot?: AnimationClip;
    hit?: AnimationClip;
    attack?: AnimationClip;
    attacks?: (AttackTiming & { clip: AnimationClip })[];
  };
  /** T10 exposes variant metadata beside clips; nested form supports fixtures. */
  attacks?: (AttackTiming & { clip: AnimationClip })[];
  walkCycle?: WalkCycle;
  trotCycle?: WalkCycle;
  weaponTip?: string;
  hitTimeMs?: number;
  clipDurationMs?: number;
}
export interface MotionPhase {
  pieceId: string;
  kind: 'turn' | 'walk' | 'glide' | 'attack' | 'hit' | 'stepDown' | 'stepUp';
  startMs: number;
  durationMs: number;
  from: [number, number];
  to: [number, number];
  fromYaw: number;
  toYaw: number;
  clip?: 'walk' | 'trot';
  rate?: number;
  cycleMs?: number;
}
export function shortestArc(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
export function phaseAt(phases: MotionPhase[], elapsedMs: number) {
  return phases.find(p => elapsedMs >= p.startMs && elapsedMs < p.startMs + p.durationMs);
}
export function sampleMotion(phases: MotionPhase[], elapsedMs: number) {
  const phase = phaseAt(phases, elapsedMs) ?? (elapsedMs < phases[0]!.startMs ? phases[0]! : phases.at(-1)!);
  const t = Math.max(0, Math.min(1, (elapsedMs - phase.startMs) / phase.durationMs));
  const yawT = (phase.kind === 'turn' || phase.kind === 'stepUp' || phase.kind === 'stepDown') ? t * t * (3 - 2 * t) : t;
  // Glides ease in and out like the classic slide; walks stay linear to match the feet.
  const moveT = phase.kind === 'glide' ? t * t * (3 - 2 * t) : t;
  return {
    x: phase.from[0] + (phase.to[0] - phase.from[0]) * moveT,
    y: 0,
    z: phase.from[1] + (phase.to[1] - phase.from[1]) * moveT,
    yaw: phase.fromYaw + (phase.toYaw - phase.fromYaw) * yawT,
    visible: true,
  };
}
export function rigTiming(rig?: RuntimeRig) {
  if (!rig) return undefined;
  return {
    hitTimeMs: rig.hitTimeMs ?? 0, clipDurationMs: rig.clipDurationMs ?? 0,
    ...(rig.clips.walk && rig.walkCycle ? { walkCycle: rig.walkCycle } : {}),
    hasTrot: !!rig.clips.trot, trotCycle: rig.trotCycle,
    attacks: rig.attacks ?? rig.clips.attacks,
  };
}
export function stablePhase(id: string): number {
  return ([...id].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0) / 4294967296;
}
