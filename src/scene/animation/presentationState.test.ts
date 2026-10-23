import { expect, it } from 'vitest';
import { planMove } from './planMove';
import { publishImpactClock, reactionFinished, rigState } from './presentationState';
import { sampleMotion, shortestArc, stablePhase } from './motion';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';

// The authored walk is opt-in since L10 (pieces glide by default); these pin the walk mode.
const config = { ...DEFAULT_ANIMATION_CONFIG, locomotion: 'walk' as const };
import type { MoveEvent } from '../../core/types';

it('shares contact, hitstop, reaction and break clocks without shifting impact', () => {
  const plan = planMove({ pieceId: 'a', color: 'w', from: 'e4', to: 'd5', captured: { pieceId: 'b', square: 'd5' } } as MoveEvent, config, 0.6, 'p', { hitTimeMs: 200, clipDurationMs: 800, walkCycle: { durationMs: 1000, strideBoardUnits: 1 } });
  const impact = plan.impact!, attack = plan.skeletalAttack!;
  expect(rigState(plan, 'b', impact.atMs - 1)).toBeUndefined();
  expect(rigState(plan, 'b', impact.atMs)).toEqual({ role: 'hit', timeMs: 0 });
  expect(rigState(plan, 'b', impact.atMs + 69)?.timeMs).toBe(0);
  expect(rigState(plan, 'b', impact.atMs + 100)?.timeMs).toBe(30);
  expect(rigState(plan, 'a', impact.atMs)?.timeMs).toBeCloseTo(200);
  expect(rigState(plan, 'a', impact.atMs + 69)?.timeMs).toBeCloseTo(200);
  expect(rigState(plan, 'a', attack.endMs)?.role).not.toBe('attack');
  publishImpactClock(impact, impact.atMs + config.hitReactionMs - 1);
  expect(reactionFinished(impact)).toBe(false);
  publishImpactClock(impact, impact.atMs + config.hitReactionMs);
  expect(reactionFinished(impact)).toBe(true);
  expect(rigState(plan, 'b', impact.atMs + config.hitReactionMs)).toBeUndefined();
  expect(reactionFinished({ ...impact, reactionMs: undefined })).toBe(true);
});

it('samples the shortest yaw arc, stable idle phases and walking clocks independent of frame rate', () => {
  expect(shortestArc(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  expect(stablePhase('a')).toBe(stablePhase('a'));
  expect(stablePhase('a')).not.toBe(stablePhase('b'));
  const plan = planMove({ pieceId: 'a', color: 'b', from: 'e7', to: 'e5' } as MoveEvent, config, undefined, 'p', { hitTimeMs: 0, clipDurationMs: 0, walkCycle: { durationMs: 1000, strideBoardUnits: 0.8 } });
  expect(rigState(plan, 'a', 500)).toEqual({ role: 'walk', timeMs: 300, cycleMs: 1000 / config.walkBaseRate });
  expect(sampleMotion(plan.tracks[0]!.motion!, 500).yaw).toBeCloseTo(-Math.PI / 2);
  expect(rigState(undefined, 'a', 0)).toBeUndefined();
});
