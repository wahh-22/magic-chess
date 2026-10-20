import type { MoveEvent } from "../core/types";
import type { Impact, MovePlan } from "../scene/animation/planMove";
import type { SoundCue } from "./SoundProvider";

export interface TimedCue {
  cue: SoundCue;
  /** Relative to move start, or burst creation for impact cues. */
  atMs: number;
  pan: number;
}

export function panForWorldX(x: number): number {
  return Math.max(-0.8, Math.min(0.8, x / 5));
}

/** Impact cues are deliberately separate: effectsStore owns the actual collision instant. */
export function cuesForMove(event: MoveEvent, plan: MovePlan): TimedCue[] {
  const cues: TimedCue[] = [];
  let arrival = 0;
  let destinationPan = 0;
  for (const track of plan.tracks) {
    if (track.kind === "shatter") continue;
    if (track.kind === "glide") {
      cues.push({ cue: "slide", atMs: track.startMs, pan: panForWorldX(track.from[0]) });
    }
    const atMs = track.startMs + track.durationMs;
    cues.push({ cue: "set-down", atMs, pan: panForWorldX(track.to[0]) });
    arrival = Math.max(arrival, atMs);
    if (track.pieceId === event.pieceId) destinationPan = panForWorldX(track.to[0]);
  }
  if (event.check) cues.push({ cue: "check", atMs: arrival, pan: destinationPan });
  if (event.outcome) cues.push({ cue: "game-end", atMs: Math.min(arrival + 100, plan.durationMs), pan: 0 });
  return cues.sort((a, b) => a.atMs - b.atMs);
}

export function cuesForImpact(impact: Impact): TimedCue[] {
  const pan = panForWorldX(impact.position[0]);
  return [
    { cue: "hit", atMs: 0, pan },
    { cue: "shatter", atMs: 35, pan },
    { cue: "pebbles", atMs: 230, pan },
    { cue: "pebbles", atMs: 470, pan },
  ];
}
