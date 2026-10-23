import { DEFAULT_ANIMATION_CONFIG, type AnimationConfig } from "../../config/animation";
import type { MoveEvent, PieceType } from "../../core/types";
import { planAttack, type AttackChoreography } from "./attackChoreography";
import { squareToWorld } from "../coords";
import { trackPath } from "./sampleTrack";
import { FACING } from '../facing';
import { PEDESTAL_STEP_MS } from '../effects/pedestalFade';
import { shortestArc, stablePhase, type MotionPhase, type WalkCycle, type AttackTiming } from './motion';

export interface Track {
  pieceId: string;
  kind: "glide" | "shatter";
  startMs: number;
  durationMs: number;
  from: [number, number];
  to: [number, number];
  /** The pedestal travels with the gliding piece instead of staying on its square. */
  carriesPedestal?: boolean;
  /** Corner of a two-leg slide (the knight's L); the piece never leaves the board. */
  via?: [number, number];
  motion?: MotionPhase[];
  /** Freeze at first contact while the skeletal attack runs, then finish the move. */
  hold?: { atMs: number; durationMs: number };
}

/** The instant the attacker reaches its victim; destruction effects start here. */
export interface Impact {
  atMs: number;
  /** Delay from contact to visible armour break; never shifts the impact cue. */
  reactionMs?: number;
  pieceId: string;
  /** World [x, z] of the captured piece. */
  position: [number, number];
  /** Unit [x, z] direction the attacker was travelling. */
  direction: [number, number];
}

export interface MovePlan {
  durationMs: number;
  tracks: Track[];
  impact?: Impact;
  attack?: AttackChoreography;
  phases?: MotionPhase[];
  skeletalAttack?: { pieceId: string; startMs: number; endMs: number; variant?: number; rate?: number; hitMs?: number; trailStartMs?: number; trailEndMs?: number };
}

export interface RigAttackTiming {
  hitTimeMs: number;
  clipDurationMs: number;
  walkCycle?: WalkCycle;
  trotCycle?: WalkCycle;
  hasTrot?: boolean;
  attacks?: AttackTiming[];
}

/** Fraction (0..1) of a segment where it first enters the victim's contact circle. */
export function segmentEntry(start: [number, number], end: [number, number], victim: [number, number], distance: number): number | undefined {
  const dx = end[0] - start[0], dz = end[1] - start[1];
  const ox = start[0] - victim[0], oz = start[1] - victim[1];
  if (Math.hypot(ox, oz) <= distance) return 0;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return undefined;
  const projection = -(ox * dx + oz * dz) / lengthSquared;
  const discriminant = distance * distance - (ox * ox + oz * oz - projection * projection * lengthSquared);
  if (discriminant < 0) return undefined;
  const entry = projection - Math.sqrt(discriminant / lengthSquared);
  return entry < 0 || entry > 1 ? undefined : entry;
}

/** Earliest contact along the track's path (both legs of an L), including
 * off-destination victims. Inverts the sampler's smoothstep easing.
 */
function firstContactMs(track: Track, victim: [number, number], distance: number): number | undefined {
  const path = trackPath(track);
  const lengths = path.slice(1).map((point, i) => Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0, fraction: number | undefined;
  for (const [i, length] of lengths.entries()) {
    const entry = segmentEntry(path[i]!, path[i + 1]!, victim, distance);
    if (entry !== undefined) { fraction = total ? (travelled + entry * length) / total : 0; break; }
    travelled += length;
  }
  if (fraction === undefined) return undefined;
  if (fraction === 0) return 0;
  let low = 0, high = 1;
  for (let i = 0; i < 48; i++) {
    const middle = (low + high) / 2;
    if (middle * middle * (3 - 2 * middle) < fraction) low = middle;
    else high = middle;
  }
  return high * track.durationMs;
}

/** Presentation only: the event already describes an authoritative, applied move.
 * contactDistance is the active provider's sum of attacker/victim proxy radii.
 * Omit it to retain legacy timing; paths that never touch also use that fallback.
 */
export function planMove(event: MoveEvent, config: AnimationConfig = DEFAULT_ANIMATION_CONFIG, contactDistance?: number, attackerType: PieceType = "p", rig?: RigAttackTiming, rookRig?: RigAttackTiming): MovePlan {
  // Authored rigs take the phased path: walking needs a measured walk cycle, while
  // gliding (the default) only needs authored attacks (the V8 knight has no walk clip).
  const phased = config.locomotion === 'walk' ? validCycle(rig?.walkCycle) : validCycle(rig?.walkCycle) || !!rig?.attacks?.length;
  if (phased) return planWalkingMove(event, config, contactDistance, attackerType, rig!, rookRig);
  const from = squareToWorld(event.from);
  const to = squareToWorld(event.to);
  const dx = Math.abs(to[0] - from[0]);
  const dz = Math.abs(to[1] - from[1]);
  const moveDuration = (start: [number, number], end: [number, number], length = Math.hypot(end[0] - start[0], end[1] - start[1])) =>
    Math.max(config.minMoveMs, Math.min(config.maxMoveMs, length / config.glideSquaresPerSecond * 1000));
  // Knights slide their L on the board: the two-square leg first, then the one-square leg.
  const via: [number, number] | undefined = dx === 1 && dz === 2 ? [from[0], to[1]] : dx === 2 && dz === 1 ? [to[0], from[1]] : undefined;
  const mover: Track = {
    pieceId: event.pieceId,
    kind: "glide",
    startMs: 0,
    durationMs: moveDuration(from, to, via ? dx + dz : undefined),
    from,
    to,
    ...(via ? { via } : {}),
  };
  const tracks: Track[] = [mover];
  let impact: Impact | undefined;

  if (event.captured) {
    const square = squareToWorld(event.captured.square);
    const contact = contactDistance !== undefined && Number.isFinite(contactDistance) && contactDistance >= 0
      ? firstContactMs(mover, square, contactDistance) : undefined;
    const atMs = contact ?? Math.max(0, mover.durationMs - config.captureImpactLeadMs);
    const legStart = via ?? from;
    const length = Math.hypot(to[0] - legStart[0], to[1] - legStart[1]);
    tracks.push({ pieceId: event.captured.pieceId, kind: "shatter", startMs: atMs, durationMs: 0, from: square, to: square });
    impact = {
      atMs,
      pieceId: event.captured.pieceId,
      position: square,
      direction: [(to[0] - legStart[0]) / length, (to[1] - legStart[1]) / length],
    };
  }
  if (event.rookMove) {
    const rookFrom = squareToWorld(event.rookMove.from);
    const rookTo = squareToWorld(event.rookMove.to);
    tracks.push({
      pieceId: event.rookMove.pieceId, kind: "glide",
      startMs: config.castlingRookDelayMs,
      durationMs: moveDuration(rookFrom, rookTo), from: rookFrom, to: rookTo,
    });
  }

  // The strike is constrained by first contact (or the off-path fallback), not
  // arrival. Fit anticipation/lunge to that instant so every effect has one clock.
  const validRig = rig && Number.isFinite(rig.hitTimeMs) && Number.isFinite(rig.clipDurationMs) && rig.hitTimeMs >= 0 && rig.hitTimeMs <= rig.clipDurationMs && rig.clipDurationMs > 0;
  const skeletalAttack = impact && validRig ? { pieceId: event.pieceId, startMs: impact.atMs, endMs: impact.atMs + rig.clipDurationMs + config.hitstopMs } : undefined;
  if (skeletalAttack && impact && rig) {
    mover.hold = { atMs: skeletalAttack.startMs, durationMs: rig.clipDurationMs + config.hitstopMs };
    impact.atMs = skeletalAttack.startMs + rig.hitTimeMs;
    tracks.find((track) => track.kind === "shatter")!.startMs = impact.atMs;
  }
  const attack = impact && !skeletalAttack ? planAttack(event.pieceId, impact.atMs, config.attacks[attackerType]) : undefined;
  if (attack) impact!.atMs = attack.strikeMs;
  return {
    durationMs: Math.max(...tracks.map((track) => track.startMs + track.durationMs + (track.hold?.durationMs ?? 0)), attack?.endMs ?? 0) + config.postMovePauseMs,
    tracks,
    ...(impact ? { impact } : {}),
    ...(attack ? { attack } : {}),
    ...(skeletalAttack ? { skeletalAttack } : {}),
  };
}

function validCycle(cycle?: WalkCycle): cycle is WalkCycle {
  return !!cycle && Number.isFinite(cycle.durationMs) && cycle.durationMs > 0 && Number.isFinite(cycle.strideBoardUnits) && cycle.strideBoardUnits > 0;
}

/** All phases use one absolute presentation clock. Walking is linear: one authored
 * cycle covers exactly its measured stride, including fractional final cycles. */
function planWalkingMove(event: MoveEvent, config: AnimationConfig, contactDistance: number | undefined, type: PieceType, rig: RigAttackTiming, rookRig?: RigAttackTiming): MovePlan {
  const phases: MotionPhase[] = [], tracks: Track[] = [];
  let impact: Impact | undefined, skeletalAttack: MovePlan['skeletalAttack'], attack: MovePlan['attack'];
  const homeYaw = FACING[event.color];
  // L10: pieces glide in guard on their pedestal by default; walking is opt-in.
  const gliding = config.locomotion !== 'walk';
  function build(pieceId: string, from: [number, number], to: [number, number], timing: RigAttackTiming, startMs: number, knight: boolean, capture: boolean) {
    const motion: MotionPhase[] = [];
    let at = startMs, point = from, yaw = homeYaw;
    function add(kind: MotionPhase['kind'], end: [number, number], endYaw: number, durationMs: number, clip?: 'walk' | 'trot', rate?: number) {
      if (durationMs <= 0) return;
      motion.push({ pieceId, kind, startMs: at, durationMs, from: point, to: end, fromYaw: yaw, toYaw: endYaw, ...(clip ? { clip, rate } : {}) });
      at += durationMs; point = end; yaw = endYaw;
    }
    function turn(target: number) {
      const arc = shortestArc(yaw, target);
      if (Math.abs(arc) <= 0.001) return;
      const previous = motion.at(-1);
      // A quiet departure can orient during the step down. Captures keep the
      // short guard-to-approach turn before closing to weapon contact.
      if (!capture && previous?.kind === 'stepDown') {
        previous.toYaw = yaw + arc;
        yaw += arc;
      } else add('turn', point, yaw + arc, config.turnMs);
    }
    if (!gliding) add('stepDown', point, yaw, PEDESTAL_STEP_MS);
    const dx = Math.abs(to[0] - from[0]), dz = Math.abs(to[1] - from[1]);
    const corner: [number, number] | undefined = knight ? dx > dz ? [to[0], from[1]] : [from[0], to[1]] : undefined;
    const path = corner ? [from, corner, to] : [from, to];
    // A glide keeps the classic timing for the whole path, shared by its legs.
    const pathLength = path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]), 0);
    const glideMsPerUnit = pathLength > 0
      ? Math.max(config.minMoveMs, Math.min(config.maxMoveMs, pathLength / config.glideSquaresPerSecond * 1000)) / pathLength : 0;
    const victim = capture && event.captured ? squareToWorld(event.captured.square) : undefined;
    let contactLeg = path.length - 2, entry = 1;
    if (victim) {
      const radius = Number.isFinite(contactDistance) && contactDistance! >= 0 ? contactDistance! : 0.6;
      for (let i = 0; i < path.length - 1; i++) {
        const fraction = segmentEntry(path[i]!, path[i + 1]!, victim, radius);
        if (fraction !== undefined) { contactLeg = i; entry = fraction; break; }
      }
    }
    function walk(end: [number, number], longLeg: boolean) {
      const distance = Math.hypot(end[0] - point[0], end[1] - point[1]);
      if (distance < 1e-9) return;
      if (gliding) {
        // Slide in guard, facing wherever the piece already faces (no clip: idle plays).
        add('glide', end, yaw, distance * glideMsPerUnit);
        return;
      }
      turn(-Math.atan2(end[1] - point[1], end[0] - point[0]));
      const trot = knight && timing.hasTrot && longLeg;
      // If T10 only supplies walkCycle, slow/speed the trot clip to that cycle.
      // A separate trotCycle, when present, gives its own measured stride.
      const cycle = trot && validCycle(timing.trotCycle) ? timing.trotCycle : timing.walkCycle!;
      // The leg's duration follows the agile pacing target (walkSquareMs per board unit,
      // at most walkMaxLegMs); the clip's cadence is matched to it but never exceeds a
      // brisk walk (walkMaxRate). Authored strides are short for board-sized pieces, so
      // when that cadence cannot cover the leg the root glides slightly faster than the
      // feet: a small slide reads far more natural than frantic legs.
      const naturalMs = distance / cycle.strideBoardUnits * cycle.durationMs;
      const durationMs = Math.min(naturalMs / config.walkBaseRate, distance * config.walkSquareMs, config.walkMaxLegMs);
      const rate = Math.min(config.walkMaxRate, Math.max(1, naturalMs / durationMs));
      add('walk', end, yaw, durationMs, trot ? 'trot' : 'walk', rate);
      motion.at(-1)!.cycleMs = cycle.durationMs / rate;
    }
    for (let i = 0; i < path.length - 1; i++) {
      const end = path[i + 1]!;
      const longLeg = Math.hypot(end[0] - path[i]![0], end[1] - path[i]![1]) >= 2;
      if (victim && i === contactLeg) {
        walk([path[i]![0] + (end[0] - path[i]![0]) * entry, path[i]![1] + (end[1] - path[i]![1]) * entry], longLeg);
        const direction: [number, number] = [victim[0] - point[0], victim[1] - point[1]];
        const length = Math.hypot(...direction);
        if (length > 0) { direction[0] /= length; direction[1] /= length; }
        else { direction[0] = Math.cos(yaw); direction[1] = -Math.sin(yaw); }
        turn(-Math.atan2(direction[1], direction[0]));
        const variants = timing.attacks?.map((entry, index) => ({ entry, index })).filter(({ entry: a }) => Number.isFinite(a.durationMs) && a.durationMs > 0 && Number.isFinite(a.hitMs) && a.hitMs >= 0 && a.hitMs <= a.durationMs);
        const selection = variants?.length ? variants[Math.floor(stablePhase(`${event.pieceId}:${event.from}:${event.to}:${event.san}`) * variants.length)] : undefined;
        const variant = selection?.index, selected = selection?.entry;
        const hitMs = selected?.hitMs ?? timing.hitTimeMs;
        const durationMs = selected?.durationMs ?? timing.clipDurationMs;
        let hitAt: number, endAt: number;
        if (durationMs > 0 && hitMs >= 0 && hitMs <= durationMs) {
          hitAt = at + hitMs / config.attackRate;
          // Long spell clips carry a long stationary recovery. Keep every active
          // event, then blend its recovery into the arrival instead of waiting.
          const recoveryEndMs = Math.min(durationMs / config.attackRate, Math.max(1750, (selected?.trailEndMs ?? hitMs) / config.attackRate + 150));
          endAt = at + recoveryEndMs + config.hitstopMs;
          skeletalAttack = { pieceId, startMs: at, endMs: endAt, variant, rate: config.attackRate, hitMs, trailStartMs: selected?.trailStartMs, trailEndMs: selected?.trailEndMs };
        } else {
          // Retain the procedural attack when a walking model lacks attack clips.
          const fallback = config.attacks[type];
          attack = planAttack(pieceId, at + fallback.anticipationMs + fallback.hangMs + fallback.strikeMs, fallback);
          hitAt = attack.strikeMs; endAt = attack.endMs;
        }
        impact = { atMs: hitAt, reactionMs: config.hitReactionMs, pieceId: event.captured!.pieceId, position: victim, direction };
        const breakAt = hitAt + config.hitReactionMs;
        add('attack', point, yaw, Math.max(endAt, breakAt) - at);
        tracks.push({ pieceId: impact.pieceId, kind: 'shatter', startMs: breakAt, durationMs: 0, from: victim, to: victim });
        phases.push({ pieceId: impact.pieceId, kind: 'hit', startMs: hitAt, durationMs: config.hitReactionMs, from: victim, to: victim, fromYaw: -Math.atan2(-direction[1], -direction[0]), toYaw: -Math.atan2(-direction[1], -direction[0]) });
      }
      walk(end, longLeg);
    }
    // Face the opponent again: while stepping onto the arriving pedestal when walking,
    // or with a short turn after a capture glide. An aligned arrival has a zero arc.
    if (gliding) turn(homeYaw);
    else add('stepUp', point, yaw + shortestArc(yaw, homeYaw), PEDESTAL_STEP_MS);
    const track: Track = { pieceId, kind: 'glide', startMs, durationMs: at - startMs, from, to, motion, ...(gliding ? { carriesPedestal: true } : {}) };
    phases.push(...motion);
    return track;
  }
  const from = squareToWorld(event.from), to = squareToWorld(event.to);
  const knight = type === 'n' && ((Math.abs(to[0] - from[0]) === 2 && Math.abs(to[1] - from[1]) === 1) || (Math.abs(to[0] - from[0]) === 1 && Math.abs(to[1] - from[1]) === 2));
  const mover = build(event.pieceId, from, to, rig, 0, knight, !!event.captured);
  tracks.unshift(mover);
  if (event.rookMove) {
    const timing = validCycle(rookRig?.walkCycle) ? rookRig! : rig;
    tracks.push(build(event.rookMove.pieceId, squareToWorld(event.rookMove.from), squareToWorld(event.rookMove.to), timing, config.castlingRookDelayMs, false, false));
  }
  return { durationMs: Math.max(...tracks.map(t => t.startMs + t.durationMs)) + config.postMovePauseMs, tracks, phases, ...(impact ? { impact } : {}), ...(skeletalAttack ? { skeletalAttack } : {}), ...(attack ? { attack } : {}) };
}
