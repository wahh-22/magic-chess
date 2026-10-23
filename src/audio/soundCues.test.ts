import { describe, expect, it } from "vitest";
import { GameState } from "../core/GameState";
import type { MoveEvent, Square } from "../core/types";
import { planMove } from "../scene/animation/planMove";
import { cuesForImpact, cuesForMove, panForWorldX } from "./soundCues";

function move(game: GameState, from: Square, to: Square): MoveEvent {
  const result = game.applyMove({ from, to });
  if (!result.ok) throw new Error(result.error);
  return result.event;
}

describe("stone sound cues", () => {
  it("slides at departure and sets down at arrival, not the post-move pause", () => {
    const event = move(new GameState(), "e2", "e4");
    const plan = planMove(event);
    expect(cuesForMove(event, plan)).toEqual([
      { cue: "slide", atMs: 0, pan: 0.1 },
      { cue: "set-down", atMs: plan.tracks[0]!.durationMs, pan: 0.1 },
    ]);
  });

  it("slides a knight along its L like every other piece", () => {
    const event = move(new GameState(), "g1", "f3");
    const plan = planMove(event);
    expect(cuesForMove(event, plan).map(({ cue, atMs }) => ({ cue, atMs }))).toEqual([
      { cue: "slide", atMs: 0 },
      { cue: "set-down", atMs: plan.tracks[0]!.durationMs },
    ]);
  });

  it("includes the delayed castling rook departure and landing", () => {
    const event = move(new GameState("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1", "g1");
    const plan = planMove(event);
    const rook = plan.tracks[1]!;
    expect(cuesForMove(event, plan)).toContainEqual({ cue: "slide", atMs: rook.startMs, pan: 0.7 });
    expect(cuesForMove(event, plan)).toContainEqual({ cue: "set-down", atMs: rook.startMs + rook.durationMs, pan: 0.3 });
  });

  it("uses the actual en passant victim position and schedules rubble relative to impact", () => {
    const game = new GameState();
    move(game, "e2", "e4"); move(game, "a7", "a6");
    move(game, "e4", "e5"); move(game, "d7", "d5");
    const event = move(game, "e5", "d6");
    const plan = planMove(event);
    expect(cuesForMove(event, plan).some(({ cue }) => cue === "hit")).toBe(false);
    expect(cuesForImpact(plan.impact!)).toEqual([
      { cue: "hit", atMs: 0, pan: -0.1 },
      { cue: "shatter", atMs: 35, pan: -0.1 },
      { cue: "pebbles", atMs: 230, pan: -0.1 },
      { cue: "pebbles", atMs: 470, pan: -0.1 },
    ]);
  });

  it("announces check and game end after the final arrival", () => {
    const game = new GameState();
    move(game, "f2", "f3"); move(game, "e7", "e5"); move(game, "g2", "g4");
    const event = move(game, "d8", "h4");
    const plan = planMove(event);
    const arrival = plan.tracks[0]!.durationMs;
    expect(cuesForMove(event, plan)).toContainEqual({ cue: "check", atMs: arrival, pan: 0.7 });
    expect(cuesForMove(event, plan)).toContainEqual({ cue: "game-end", atMs: arrival + 100, pan: 0 });
  });

  it("does not announce check or game end on ordinary moves", () => {
    const event = move(new GameState(), "e2", "e3");
    expect(cuesForMove(event, planMove(event)).map(({ cue }) => cue)).toEqual(["slide", "set-down"]);
  });

  it("announces a drawn game without a check knock", () => {
    const event = move(new GameState("k7/8/1QK5/8/8/8/8/8 w - - 0 1"), "b6", "c7");
    expect(event.outcome?.kind).toBe("stalemate");
    const cues = cuesForMove(event, planMove(event));
    expect(cues.some(({ cue }) => cue === "game-end")).toBe(true);
    expect(cues.some(({ cue }) => cue === "check")).toBe(false);
  });

  it("keeps the end cue inside custom animation completion timing", () => {
    const game = new GameState();
    move(game, "f2", "f3"); move(game, "e7", "e5"); move(game, "g2", "g4");
    const event = move(game, "d8", "h4");
    const plan = planMove(event); plan.durationMs = plan.tracks[0]!.durationMs;
    expect(cuesForMove(event, plan).at(-1)!.atMs).toBe(plan.durationMs);
  });

  it("clamps stereo pan to the board range", () => {
    expect([-9, -4, 0, 4, 9].map(panForWorldX)).toEqual([-0.8, -0.8, 0, 0.8, 0.8]);
  });
});
