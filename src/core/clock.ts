import type { Color, GameOutcome, PieceInstance } from "./types";

export const TIME_CONTROLS = ["none", "5+0", "10+5", "15+10"] as const;
export type TimeControl = typeof TIME_CONTROLS[number];
export interface ClockState {
  remaining: Record<Color, number>;
  increment: number;
  running: Color | null;
  lastSwitch: number;
}
export function startClock(control: TimeControl, color: Color, now: number): ClockState | null {
  if (control === "none") return null;
  const [minutes, seconds] = control.split("+").map(Number);
  const base = minutes! * 60000;
  return { remaining: { w: base, b: base }, increment: seconds! * 1000, running: color, lastSwitch: now };
}
export function remainingAt(clock: ClockState, now: number): Record<Color, number> {
  const remaining = { ...clock.remaining };
  if (clock.running) remaining[clock.running] = Math.max(0, remaining[clock.running] - Math.max(0, now - clock.lastSwitch));
  return remaining;
}
export function pauseClock(clock: ClockState, now: number): ClockState {
  return { ...clock, remaining: remainingAt(clock, now), running: null, lastSwitch: now };
}
export function resumeClock(clock: ClockState, color: Color, now: number): ClockState {
  return { ...clock, running: color, lastSwitch: now };
}
export function switchClock(clock: ClockState, next: Color, now: number): ClockState {
  const remaining = remainingAt(clock, now);
  if (clock.running) remaining[clock.running] += clock.increment;
  return { ...clock, remaining, running: next, lastSwitch: now };
}
/** Side-only material rule: K, K+B and K+N cannot mate. Other material can.
 * This intentionally does not use the whole-board chess.js draw predicate.
 */
export function cannotMate(pieces: PieceInstance[], color: Color): boolean {
  const material = pieces.filter((p) => p.color === color && p.type !== "k");
  return material.length === 0 || (material.length === 1 && (material[0]!.type === "b" || material[0]!.type === "n"));
}
export function flagFall(clock: ClockState | null, now: number, pieces: PieceInstance[]): GameOutcome | null {
  if (!clock?.running || remainingAt(clock, now)[clock.running] > 0) return null;
  const winner = clock.running === "w" ? "b" : "w";
  return cannotMate(pieces, winner) ? { kind: "timeout-draw" } : { kind: "timeout", winner };
}
export function formatTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 10) return `00:${(Math.floor(seconds * 10) / 10).toFixed(1).padStart(4, "0")}`;
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
