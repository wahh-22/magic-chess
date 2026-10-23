import { describe, expect, it } from 'vitest';
import { pedestalPresentation } from './pedestalFade';
import type { Track } from '../animation/planMove';

const track: Track = { pieceId: 'king', kind: 'glide', startMs: 100, durationMs: 2000, from: [0, 0], to: [1, 1] };
describe('pedestal presentation on the move clock', () => {
  it('steps down in 200ms, walks at board height, then steps up in 200ms', () => {
    expect(pedestalPresentation(track, 100, 0.08).height).toBe(0);
    expect(pedestalPresentation(track, 200, 0.08).height).toBeCloseTo(-0.04);
    expect(pedestalPresentation(track, 300, 0.08).height).toBe(-0.08);
    expect(pedestalPresentation(track, 1500, 0.08).height).toBe(-0.08);
    expect(pedestalPresentation(track, 2000, 0.08).height).toBeCloseTo(-0.04);
    expect(pedestalPresentation(track, 2100, 0.08).height).toBe(0);
  });
  it('leaves the fading source fixed and fades the destination in only on arrival', () => {
    expect(pedestalPresentation(track, 300, 0.08)).toMatchObject({ sourceOpacity: 0.5, destinationOpacity: 0 });
    expect(pedestalPresentation(track, 500, 0.08).sourceOpacity).toBe(0);
    expect(pedestalPresentation(track, 2000, 0.08).destinationOpacity).toBeCloseTo(0.5);
    expect(pedestalPresentation(track, 300, 0.08).sourceGlow).toBeGreaterThan(0);
    expect(pedestalPresentation(track, 2100, 0.08).destinationGlow).toBe(0);
  });
  it('restores a full pedestal without a track on cancellation/reset, including delayed castling', () => {
    expect(pedestalPresentation(undefined, 1000, 0.08)).toEqual({ height: 0, sourceOpacity: 1, destinationOpacity: 0, sourceGlow: 0, destinationGlow: 0 });
    expect(pedestalPresentation(track, 0, 0.08).sourceOpacity).toBe(1);
    const victim = { ...track, kind: 'shatter' as const, startMs: 500, durationMs: 0 };
    expect(pedestalPresentation(victim, 499, 0.08).sourceOpacity).toBe(1);
    expect(pedestalPresentation(victim, 700, 0.08).sourceOpacity).toBeCloseTo(0.5);
    expect(pedestalPresentation(victim, 900, 0.08).sourceOpacity).toBe(0);
  });
});
