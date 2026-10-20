import { TIME_CONTROLS, pauseClock, startClock, type ClockState } from "../core/clock";
import { replayUci } from "../core/pgn";
import type { GameState } from "../core/GameState";
import type { GameOutcome } from "../core/types";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { GameSettings } from "./gameStore";

export const SAVE_KEY = "magic-chess:game:v1";
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface SavedGame {
  settings: GameSettings;
  game: GameState;
  clock: ClockState | null;
  phase: "playing" | "over";
  outcome: GameOutcome | null;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function decode(raw: unknown): SavedGame {
  if (!record(raw) || raw.version !== 1 || !record(raw.settings)) throw Error("Invalid save version");
  const s = raw.settings;
  if ((s.mode !== "ai" && s.mode !== "local") || (s.humanColor !== "w" && s.humanColor !== "b") ||
      !DIFFICULTIES.some((d) => d.id === s.difficultyId) || !TIME_CONTROLS.some((t) => t === s.timeControl)) throw Error("Invalid settings");
  if (!Array.isArray(raw.moves) || raw.moves.length > 10000 || !raw.moves.every((m): m is string => typeof m === "string")) throw Error("Invalid moves");
  const game = replayUci(raw.moves);
  const control = TIME_CONTROLS.find((t) => t === s.timeControl)!;
  const settings: GameSettings = { mode: s.mode, humanColor: s.humanColor,
    difficultyId: DIFFICULTIES.find((d) => d.id === s.difficultyId)!.id, timeControl: control };
  const expectedClock = startClock(settings.timeControl!, game.turn(), 0);
  let clock: ClockState | null = null;
  if (expectedClock) {
    const c = raw.clock;
    if (!record(c) || !record(c.remaining) || !finite(c.remaining.w) || !finite(c.remaining.b) ||
        c.increment !== expectedClock.increment || c.running !== null || !finite(c.lastSwitch)) throw Error("Invalid clock");
    clock = { remaining: { w: c.remaining.w, b: c.remaining.b }, increment: expectedClock.increment, running: null, lastSwitch: c.lastSwitch };
  } else if (raw.clock !== null) throw Error("Unexpected clock");
  if (raw.phase !== "playing" && raw.phase !== "over") throw Error("Invalid phase");
  let outcome = game.outcome();
  if (record(raw.outcome) && (raw.outcome.kind === "timeout" || raw.outcome.kind === "timeout-draw")) {
    if (!clock || clock.remaining[game.turn()] !== 0) throw Error("Invalid timeout");
    if (raw.outcome.kind === "timeout") {
      const winner = game.turn() === "w" ? "b" : "w";
      if (raw.outcome.winner !== winner) throw Error("Invalid winner");
      outcome = { kind: "timeout", winner };
    } else outcome = { kind: "timeout-draw" };
  }
  if ((raw.phase === "over") !== Boolean(outcome)) throw Error("Invalid outcome");
  return { settings, game, clock, phase: raw.phase, outcome };
}
export function readSave(storage?: SaveStorage): SavedGame | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(SAVE_KEY);
    return text === null ? null : decode(JSON.parse(text));
  } catch {
    try { storage.removeItem(SAVE_KEY); } catch { /* Storage may be disabled. */ }
    return null;
  }
}
/** Store paused balances: offline time is never charged, Continue resumes now. */
export function writeSave(storage: SaveStorage | undefined, save: SavedGame, now: number): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, settings: save.settings,
      moves: save.game.uciHistory(), clock: save.clock && pauseClock(save.clock, now),
      phase: save.phase, outcome: save.outcome }));
    return true;
  } catch { return false; }
}
export function browserStorage(): SaveStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
