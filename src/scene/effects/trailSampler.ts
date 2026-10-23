import type { PieceType } from '../../core/types';

/** Fallback when a rig declares no weaponTip. GLTFLoader sanitizes dots in joint names.
 * Sword's bind tip points down. Only the queen holds her weapon in the left hand. */
export function weaponTipBinding(type: PieceType) {
  return { bone: type === 'n' ? 'lance' : type === 'r' ? 'hand_R' : type === 'q' ? 'handL' : 'handR', direction: type === 'k' ? -1 : 1 };
}

export interface TrailPoint { position: [number, number, number]; atMs: number; alpha: number }
/** Short bounded history; absolute timestamps make hitstop, rewind and expiry safe. */
export function sampleTrail(previous: TrailPoint[], position: [number, number, number], nowMs: number, hitMs: number, lifetimeMs: number, enabled = true, window = { startMs: hitMs - 80, endMs: hitMs + 80 }): TrailPoint[] {
  if (!enabled || nowMs < window.startMs || nowMs < (previous.at(-1)?.atMs ?? -Infinity)) return [];
  const points = previous.filter(p => nowMs - p.atMs < lifetimeMs).map(p => ({ ...p, alpha: 1 - (nowMs - p.atMs) / lifetimeMs }));
  if (nowMs <= window.endMs && nowMs !== points.at(-1)?.atMs) points.push({ position: [...position], atMs: nowMs, alpha: 1 });
  return points.slice(-16);
}
