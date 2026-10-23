import { describe, expect, it } from 'vitest';
import { planMove } from './planMove';
import { sampleTrack } from './sampleTrack';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';

// The authored walk is opt-in since L10 (pieces glide by default); these pin the walk mode.
const config = { ...DEFAULT_ANIMATION_CONFIG, locomotion: 'walk' as const };
import type { MoveEvent } from '../../core/types';

const event = (overrides: Partial<MoveEvent> = {}): MoveEvent => ({ pieceId: 'pawn', color: 'w', from: 'e2', to: 'e4', san: 'e4', uci: 'e2e4', check: false, outcome: null, ...overrides });
const rig = { hitTimeMs: 300, clipDurationMs: 900, walkCycle: { durationMs: 1000, strideBoardUnits: 0.8 }, attacks: [{ durationMs: 900, hitMs: 300, trailStartMs: 200, trailEndMs: 400 }] };

describe('authored locomotion', () => {
  it('skips an aligned turn and glides linearly at the stride speed, without duration clamps', () => {
    const plan = planMove(event(), config, 0.6, 'p', rig);
    const walks = plan.phases!.filter(p => p.kind === 'walk');
    expect(plan.phases!.filter(p => p.kind === 'turn')).toHaveLength(0);
    expect(walks[0]!.durationMs).toBeCloseTo(2500 / config.walkBaseRate);
    const a = sampleTrack(plan.tracks[0]!, 500, config), b = sampleTrack(plan.tracks[0]!, 1000, config);
    expect(a.z - b.z).toBeCloseTo(0.4 * config.walkBaseRate);
    expect(a.y).toBe(0);
    expect(plan.durationMs).toBeCloseTo(400 + 2500 / config.walkBaseRate + config.postMovePauseMs);
  });
  // Authored strides are short for board-sized pieces: long legs walk briskly (up to
  // walkMaxRate, feet still in sync) and never last longer than walkMaxLegMs.
  it('speeds up a long walk with the feet in sync, up to the brisk-walk rate', () => {
    const plan = planMove(event({ to: 'e5' }), config, undefined, 'p', rig);
    const walk = plan.phases!.find(p => p.kind === 'walk')!;
    const natural = 3 / 0.8 * 1000;
    const rate = natural / config.walkMaxLegMs;
    expect(rate).toBeGreaterThan(1);
    expect(rate).toBeLessThanOrEqual(config.walkMaxRate);
    expect(walk.durationMs).toBeCloseTo(config.walkMaxLegMs);
    expect(walk.cycleMs).toBeCloseTo(1000 / rate);
  });
  it('caps a very long walk: brisk rate at most walkMaxRate, leg duration at most walkMaxLegMs', () => {
    const plan = planMove(event({ pieceId: 'queen', from: 'd1', to: 'd8', san: 'Qd8', uci: 'd1d8' }), config, undefined, 'q', rig);
    const walk = plan.phases!.find(p => p.kind === 'walk')!;
    expect(walk.durationMs).toBeCloseTo(config.walkMaxLegMs);
    expect(walk.cycleMs).toBeCloseTo(1000 / Math.min(config.walkMaxRate, 7 / 0.8 * 1000 / config.walkMaxLegMs));
  });
  it('still bounds pathological strides by both rate and long-leg duration', () => {
    const plan = planMove(event({ to: 'e8' }), config, undefined, 'p', { ...rig, walkCycle: { durationMs: 1000, strideBoardUnits: 0.02 } });
    const walk = plan.phases!.find(p => p.kind === 'walk')!;
    expect(walk.rate).toBe(config.walkMaxRate);
    expect(walk.durationMs).toBe(config.walkMaxLegMs);
    expect(walk.cycleMs).toBe(1000 / config.walkMaxRate);
  });
  it('overlaps quiet departure/arrival turns with the pedestal steps, using the shortest arc', () => {
    const plan = planMove(event({ to: 'g2' }), config, undefined, 'p', rig);
    expect(plan.phases!.filter(p => p.kind === 'turn')).toHaveLength(0);
    const departure = plan.phases![0]!;
    expect(departure.kind).toBe('stepDown');
    expect(departure.durationMs).toBe(200);
    expect(Math.abs(departure.toYaw - departure.fromYaw)).toBeCloseTo(Math.PI / 2);
    expect(sampleTrack(plan.tracks[0]!, 100, config)).toMatchObject({ x: 0.5, z: 2.5 });
    expect(plan.phases!.at(-1)!).toMatchObject({ kind: 'stepUp', toYaw: Math.PI / 2, durationMs: 200 });
  });
  it('walks the knight L as two straight legs with an in-place corner turn and trot on its long leg', () => {
    const plan = planMove(event({ from: 'b1', to: 'c3' }), config, undefined, 'n', { ...rig, hasTrot: true });
    const walks = plan.phases!.filter(p => p.kind === 'walk');
    expect(walks.map(p => p.clip)).toEqual(['trot', 'walk']);
    expect(walks[0]!.to).toEqual(walks[1]!.from);
    const corner = plan.phases!.find(p => p.kind === 'turn' && p.startMs === walks[0]!.startMs + walks[0]!.durationMs)!;
    expect(corner.from).toEqual(corner.to);
    expect(sampleTrack(plan.tracks[0]!, corner.startMs + 100, config)).toMatchObject({ x: corner.from[0], z: corner.from[1] });
  });
  it('selects attacks deterministically, hits on the authored event, then breaks before advancing', () => {
    const move = event({ to: 'd3', captured: { pieceId: 'victim', square: 'd3' } });
    const plan = planMove(move, config, 0.6, 'p', rig);
    expect(plan).toEqual(planMove(move, config, 0.6, 'p', rig));
    const attack = plan.phases!.find(p => p.kind === 'attack')!;
    expect(plan.impact!.atMs).toBeCloseTo(attack.startMs + 300 / config.attackRate);
    expect(plan.skeletalAttack!.variant).toBe(0);
    expect(plan.tracks[1]!.startMs).toBe(plan.impact!.atMs + config.hitReactionMs);
    expect(sampleTrack(plan.tracks[1]!, plan.impact!.atMs, config).visible).toBe(true);
    expect(sampleTrack(plan.tracks[1]!, plan.tracks[1]!.startMs, config).visible).toBe(false);
    const before = sampleTrack(plan.tracks[0]!, attack.startMs, config);
    const hit = sampleTrack(plan.tracks[0]!, plan.impact!.atMs, config);
    expect(before).toEqual(hit);
    expect(plan.phases!.filter(p => p.kind === 'walk').at(-1)!.startMs).toBeGreaterThanOrEqual(plan.tracks[1]!.startMs);
    expect(Math.hypot(before.x - plan.impact!.position[0], before.z - plan.impact!.position[1])).toBeCloseTo(0.6);
  });
  it('walks both castling pieces using their own strides', () => {
    const plan = planMove(event({ from: 'e1', to: 'g1', rookMove: { pieceId: 'rook', from: 'h1', to: 'f1' } }), config, undefined, 'k', rig, { ...rig, walkCycle: { durationMs: 1000, strideBoardUnits: 1 } });
    expect(plan.phases!.filter(p => p.kind === 'walk').map(p => p.durationMs)).toEqual([2500 / config.walkBaseRate, 2000 / config.walkBaseRate]);
    expect(plan.phases!.filter(p => p.kind === 'stepDown')).toHaveLength(2);
    expect(plan.phases!.filter(p => p.kind === 'stepUp')).toHaveLength(2);
  });
  it('keeps variant indices when malformed metadata is skipped and preserves authored hit/trail events', () => {
    const move = event({ to: 'd3', captured: { pieceId: 'victim', square: 'd3' } });
    const plan = planMove(move, config, 0.6, 'p', { ...rig, attacks: [{ durationMs: 0, hitMs: 10 }, { durationMs: 1400, hitMs: 700, trailStartMs: 600, trailEndMs: 800 }] });
    expect(plan.skeletalAttack).toMatchObject({ variant: 1, hitMs: 700, rate: config.attackRate, trailStartMs: 600, trailEndMs: 800 });
    expect(plan.impact!.atMs).toBeCloseTo(plan.skeletalAttack!.startMs + 700 / config.attackRate);
    expect(plan.skeletalAttack!.endMs - plan.skeletalAttack!.startMs).toBeCloseTo(1400 / config.attackRate + config.hitstopMs);
  });
  it('turns toward the off-path en-passant victim, then completes the authoritative destination', () => {
    const plan = planMove(event({ from: 'e5', to: 'd6', captured: { pieceId: 'victim', square: 'd5' } }), config, 0.3, 'p', rig);
    const hit = sampleTrack(plan.tracks[0]!, plan.impact!.atMs, config);
    const [dx, dz] = plan.impact!.direction;
    expect(Math.hypot(dx, dz)).toBeCloseTo(1);
    expect(dz).toBeGreaterThan(0);
    expect(hit).toMatchObject({ x: -0.5, z: -1.5 });
    expect(sampleTrack(plan.tracks[0]!, plan.durationMs, config)).toMatchObject({ x: -0.5, z: -1.5, visible: true });
  });
  it('retains a procedural attack if a walking model has no authored attack clip', () => {
    const plan = planMove(event({ to: 'd3', captured: { pieceId: 'victim', square: 'd3' } }), config, 0.6, 'p', { ...rig, hitTimeMs: 0, clipDurationMs: 0, attacks: undefined });
    expect(plan.skeletalAttack).toBeUndefined();
    expect(plan.attack).toBeDefined();
    const phase = plan.phases!.find(p => p.kind === 'attack')!;
    expect(plan.attack!.startMs).toBeCloseTo(phase.startMs);
    expect(plan.impact!.atMs).toBe(plan.attack!.strikeMs);
  });
  it('falls back for missing or invalid stride data', () => {
    expect(planMove(event(), config, undefined, 'p', { ...rig, walkCycle: { durationMs: 0, strideBoardUnits: 0 } })).toEqual(planMove(event(), config));
  });
});
