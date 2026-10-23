import { describe, expect, it } from 'vitest';
import manifest from '../../../public/models/manifest.json';
import type { MoveEvent, PieceType } from '../../core/types';
import { planMove } from './planMove';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';

// The authored walk is opt-in since L10 (pieces glide by default); these pin the walk mode.
const walk = { ...DEFAULT_ANIMATION_CONFIG, locomotion: 'walk' as const };

type ShippedRig = { walkCycle?: { durationMs: number; strideBoardUnits: number }; attacks: { durationMs: number; hitMs: number; trailStartMs: number; trailEndMs: number }[] };

// Walk-mode pacing over the shipped timing, both attack variants and sides. Only pieces
// that ship a walk clip can walk (the V8 knight has none; glideLocomotion.test covers it).
describe('walk-mode one-square pacing', () => {
  for (const type of ['p', 'n', 'b', 'r', 'q', 'k'] as PieceType[]) {
    for (const color of ['w', 'b'] as const) {
      const entry = manifest.pieces[type].colors[color] as unknown as { rig: ShippedRig; hitTimeMs: number; clipDurationMs: number };
      if (!entry.rig.walkCycle) continue;
      const base: MoveEvent = { pieceId: `${color}-${type}`, color, from: 'e4', to: color === 'w' ? 'e5' : 'e3', san: 'move', uci: 'move', check: false, outcome: null };
      const rig = { ...entry.rig, hitTimeMs: entry.hitTimeMs, clipDurationMs: entry.clipDurationMs };
      it(`${color} ${type}: quiet 1.5–2s; capture 3.5–4s with every attack`, () => {
        const quiet = planMove(base, walk, undefined, type, rig);
        expect(quiet.durationMs).toBeGreaterThanOrEqual(1500);
        expect(quiet.durationMs).toBeLessThanOrEqual(2000);
        // Bishops (and kings/queens) also make a one-square diagonal quiet move.
        const diagonal = planMove({ ...base, to: color === 'w' ? 'd5' : 'd3' }, walk, undefined, type, rig);
        expect(diagonal.durationMs).toBeGreaterThanOrEqual(1500);
        expect(diagonal.durationMs).toBeLessThanOrEqual(2000);
        for (const attack of rig.attacks) {
          const capture = planMove({ ...base, to: color === 'w' ? 'd5' : 'd3', captured: { pieceId: 'victim', square: color === 'w' ? 'd5' : 'd3' } }, walk, 0.6, type, { ...rig, attacks: [attack] });
          expect(capture.durationMs).toBeGreaterThanOrEqual(3500);
          expect(capture.durationMs).toBeLessThanOrEqual(4000);
          expect(capture.impact!.atMs).toBeCloseTo(capture.skeletalAttack!.startMs + attack.hitMs / capture.skeletalAttack!.rate!);
          expect(capture.skeletalAttack!.rate).toBeLessThanOrEqual(1.3);
          expect(capture.skeletalAttack!.endMs).toBeGreaterThan(capture.skeletalAttack!.startMs + attack.trailEndMs / capture.skeletalAttack!.rate!);
          for (const phase of capture.tracks[0]!.motion!.filter(p => p.kind === 'walk')) {
            const distance = Math.hypot(phase.to[0] - phase.from[0], phase.to[1] - phase.from[1]);
            // Natural cadence (L4: "no tan robotizado"): the clip never plays faster than a
            // brisk walk; when that cadence cannot cover the leg in time, the root glides a
            // little faster than the feet (a slight slide beats frantic legs).
            const cadence = rig.walkCycle!.durationMs / phase.cycleMs!;
            expect(cadence).toBeGreaterThanOrEqual(1);
            expect(cadence).toBeLessThanOrEqual(1.8);
            const covered = phase.durationMs / phase.cycleMs! * rig.walkCycle!.strideBoardUnits;
            if (cadence < 1.8) expect(covered).toBeCloseTo(distance);
            else expect(covered).toBeLessThanOrEqual(distance + 1e-6);
          }
        }
      });
    }
  }
});
