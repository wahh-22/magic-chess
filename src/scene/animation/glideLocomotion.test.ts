import { describe, expect, it } from 'vitest';
import { DEFAULT_ANIMATION_CONFIG as config } from '../../config/animation';
import type { MoveEvent } from '../../core/types';
import { FACING } from '../facing';
import { pedestalPresentation } from '../effects/pedestalFade';
import { planMove } from './planMove';
import { sampleTrack } from './sampleTrack';

// L10 (user): "mejor vamos hacer que se deslicen, como estaba antes. no que caminen".
const event = (overrides: Partial<MoveEvent> = {}): MoveEvent => ({ pieceId: 'w-p', color: 'w', from: 'e2', to: 'e3', san: 'e3', uci: 'e2e3', check: false, outcome: null, ...overrides });
const rig = { hitTimeMs: 300, clipDurationMs: 900, walkCycle: { durationMs: 1200, strideBoardUnits: 0.4 }, attacks: [{ durationMs: 900, hitMs: 300, trailStartMs: 200, trailEndMs: 400 }] };
const classic = (length: number) => Math.max(config.minMoveMs, Math.min(config.maxMoveMs, length / config.glideSquaresPerSecond * 1000));

describe('glide locomotion for authored rigs (default)', () => {
  it('is the default: pieces slide, they do not walk', () => {
    expect(config.locomotion).toBe('glide');
  });

  it('a quiet move is one glide in guard: no walk, no turn, no step off the pedestal, classic timing', () => {
    const plan = planMove(event(), config, undefined, 'p', rig);
    expect(plan.phases!.map((p) => p.kind)).toEqual(['glide']);
    expect(plan.durationMs).toBeCloseTo(classic(1) + config.postMovePauseMs);
    for (const t of [0, 200, 400]) expect(sampleTrack(plan.tracks[0]!, t, config)).toMatchObject({ y: 0 });
    expect(plan.phases![0]!.fromYaw).toBeCloseTo(FACING.w);
    expect(plan.phases![0]!.toYaw).toBeCloseTo(FACING.w);
  });

  it('a knight slides its L through the corner within the classic duration', () => {
    const plan = planMove(event({ pieceId: 'w-n', from: 'g1', to: 'f3', san: 'Nf3', uci: 'g1f3' }), config, undefined, 'n', rig);
    const glides = plan.phases!.filter((p) => p.kind === 'glide');
    expect(glides).toHaveLength(2);
    expect(glides[0]!.to).toEqual(glides[1]!.from);
    expect(glides.reduce((sum, p) => sum + p.durationMs, 0)).toBeCloseTo(classic(3));
    expect(plan.phases!.some((p) => p.kind === 'turn' || p.kind === 'walk')).toBe(false);
  });

  it('a capture glides in, faces the victim to strike with the authored hit, then glides on and faces the opponent', () => {
    const plan = planMove(event({ to: 'd3', captured: { pieceId: 'b-p', square: 'd3' }, san: 'exd3', uci: 'e2d3' }), config, 0.6, 'p', rig);
    const kinds = plan.phases!.filter((p) => p.pieceId === 'w-p').map((p) => p.kind);
    expect(kinds[0]).toBe('glide');
    expect(kinds).toContain('attack');
    expect(kinds.at(-1)).toBe('turn');
    expect(kinds).not.toContain('walk');
    expect(kinds).not.toContain('stepDown');
    const attack = plan.skeletalAttack!;
    expect(plan.impact!.atMs).toBeCloseTo(attack.startMs + 300 / attack.rate!);
    expect(plan.phases!.at(-1)!.toYaw % (2 * Math.PI)).toBeCloseTo(FACING.w % (2 * Math.PI));
  });

  // The V8 knight ships authored attacks but no walk clip: gliding must not depend on one.
  it('a rig with authored attacks but no walk cycle still glides, aims, strikes and carries its pedestal', () => {
    const noWalk = { hitTimeMs: 760, clipDurationMs: 2150, attacks: [{ durationMs: 2150, hitMs: 760, trailStartMs: 600, trailEndMs: 900 }] };
    const plan = planMove(event({ pieceId: 'w-n', from: 'c3', to: 'd5', captured: { pieceId: 'b-p', square: 'd5' }, san: 'Nxd5', uci: 'c3d5' }), config, 0.6, 'n', noWalk);
    const kinds = plan.phases!.filter((p) => p.pieceId === 'w-n').map((p) => p.kind);
    expect(kinds).toContain('glide');
    expect(kinds).toContain('attack');
    expect(plan.phases!.some((p) => p.kind === 'hit')).toBe(true);
    expect(plan.impact!.atMs).toBeCloseTo(plan.skeletalAttack!.startMs + 760 / plan.skeletalAttack!.rate!);
    expect(plan.tracks[0]!.carriesPedestal).toBe(true);
  });

  it('the pedestal travels with the gliding piece: always shown, never a step down', () => {
    const plan = planMove(event(), config, undefined, 'p', rig);
    for (const t of [0, 100, 300, plan.durationMs]) {
      expect(pedestalPresentation(plan.tracks[0], t, 0.2)).toMatchObject({ height: 0, sourceOpacity: 1, destinationOpacity: 0 });
    }
  });
});
