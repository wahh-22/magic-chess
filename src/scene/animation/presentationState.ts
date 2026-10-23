import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';
import type { MovePlan, Impact } from './planMove';
import { phaseAt } from './motion';
import { sampleAttackClock, type RigPlaybackState } from '../pieces/rigPlayback';

/** One-way clock mailbox: debris observes the same plan clock as the live victim. */
const impactClocks = new WeakMap<Impact, number>();
export function publishImpactClock(impact: Impact, elapsedMs: number) { impactClocks.set(impact, elapsedMs); }
export function reactionFinished(impact: Impact): boolean {
  return !impact.reactionMs || (impactClocks.get(impact) ?? impact.atMs) >= impact.atMs + impact.reactionMs;
}
export function rigState(plan: MovePlan | undefined, pieceId: string, elapsedMs: number | undefined): RigPlaybackState | undefined {
  if (!plan || elapsedMs === undefined) return undefined;
  const phase = phaseAt(plan.phases?.filter(p => p.pieceId === pieceId) ?? [], elapsedMs);
  if (phase?.kind === 'hit') return { role: 'hit', timeMs: Math.max(0, elapsedMs - phase.startMs - Math.min(DEFAULT_ANIMATION_CONFIG.hitstopMs, elapsedMs - phase.startMs)) };
  const attack = plan.skeletalAttack;
  if (attack?.pieceId === pieceId && plan.impact && elapsedMs >= attack.startMs && elapsedMs < attack.endMs) {
    return { role: 'attack', timeMs: sampleAttackClock(elapsedMs, attack, plan.impact.atMs, DEFAULT_ANIMATION_CONFIG.hitstopMs)!, variant: attack.variant, hitMs: attack.hitMs };
  }
  if (phase?.kind === 'walk') return { role: phase.clip ?? 'walk', timeMs: elapsedMs - phase.startMs, cycleMs: phase.cycleMs };
  return undefined;
}
