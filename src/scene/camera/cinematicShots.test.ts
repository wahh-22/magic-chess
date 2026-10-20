import { describe, expect, it } from "vitest";
import type { MoveEvent, PieceType } from "../../core/types";
import { DEFAULT_CINEMATIC_CONFIG } from "./cinematicConfig";
import { blendCameraPose, planCinematicShot, qualifiesForCinematic, sampleCinematicShot, type CameraPose } from "./cinematicShots";

const move: MoveEvent = {
  san: "Rxe5", uci: "e4e5", color: "w", pieceId: "attacker",
  from: "e4", to: "e5", captured: { pieceId: "victim", square: "e5" },
  check: false, outcome: null,
};
const start: CameraPose = { position: [0, 9, 9.5], target: [0, 0, 0] };

describe("cinematic qualification", () => {
  it.each<PieceType>(["n", "b", "r", "q", "k"])("shows a capture of %s", (type) => {
    expect(qualifiesForCinematic(move, type)).toBe(true);
  });
  it("does not show pawn takes pawn, ordinary pawn captures, or unknown victims", () => {
    expect(qualifiesForCinematic(move, "p")).toBe(false);
    expect(qualifiesForCinematic(move)).toBe(false);
  });
  it("does not show a quiet move or check alone", () => {
    expect(qualifiesForCinematic({ ...move, captured: undefined, check: true }, "q")).toBe(false);
  });
  it("shows checkmate with or without a capture, including a pawn victim", () => {
    const mate = { ...move, outcome: { kind: "checkmate", winner: "w" } } as MoveEvent;
    expect(qualifiesForCinematic(mate, "p")).toBe(true);
    expect(qualifiesForCinematic({ ...mate, captured: undefined })).toBe(true);
  });
});

describe("cinematic shot planning and sampling", () => {
  const shot = planCinematicShot(move, { position: [0.5, -0.5], direction: [0, -1] });
  const config = DEFAULT_CINEMATIC_CONFIG;
  const duration = config.approachMs + config.holdMs + config.returnMs;
  it("targets the impact slightly above the board", () => {
    expect(shot.pose.target).toEqual([0.5, config.targetHeight, -0.5]);
  });
  it("places the camera behind the attacker with a sideways offset", () => {
    expect(shot.pose.position[2]).toBeGreaterThan(shot.pose.target[2]);
    expect(shot.pose.position[0]).not.toBe(shot.pose.target[0]);
    const reverse = planCinematicShot(move, { position: [0, 0], direction: [0, 1] });
    expect(reverse.pose.position[2]).toBeLessThan(0);
    const horizontal = planCinematicShot(move, { position: [0, 0], direction: [1, 0] });
    expect(horizontal.pose.position[0]).toBeLessThan(0);
  });
  it("approaches, holds, and returns exactly to the user's original pose", () => {
    expect(sampleCinematicShot(shot, start, 0)).toEqual(start);
    expect(sampleCinematicShot(shot, start, config.approachMs)).toEqual(shot.pose);
    expect(sampleCinematicShot(shot, start, config.approachMs + config.holdMs / 2)).toEqual(shot.pose);
    expect(sampleCinematicShot(shot, start, duration)).toEqual(start);
    expect(sampleCinematicShot(shot, start, duration + 100)).toEqual(start);
  });
  it("remains above the board, inside orbit distance/polar limits, and is smooth at phase boundaries", () => {
    for (let ms = 0; ms <= duration; ms += 10) {
      const { position, target } = sampleCinematicShot(shot, start, ms);
      const distance = Math.hypot(...position.map((v, i) => v - target[i]!));
      expect(position[1]).toBeGreaterThanOrEqual(config.height);
      expect(distance).toBeGreaterThanOrEqual(config.minDistance);
      expect(distance).toBeLessThanOrEqual(config.maxDistance);
      expect(Math.acos((position[1] - target[1]) / distance)).toBeLessThanOrEqual(config.maxPolarAngle);
    }
    const before = sampleCinematicShot(shot, start, config.approachMs - 1);
    expect(Math.hypot(...before.position.map((v, i) => v - shot.pose.position[i]!))).toBeLessThan(0.001);
  });
  it("keeps distance limits even when the user's view is opposite the shot", () => {
    const opposite: CameraPose = {
      position: [shot.pose.target[0] - 4, 2.5, shot.pose.target[2] - 6],
      target: shot.pose.target,
    };
    for (let ms = 0; ms <= duration; ms += 10) {
      const pose = sampleCinematicShot(shot, opposite, ms);
      expect(Math.hypot(...pose.position.map((v, i) => v - pose.target[i]!))).toBeGreaterThanOrEqual(config.minDistance);
    }
  });
  it("smoothly skips from any phase back to the original pose", () => {
    for (const ms of [200, config.approachMs + 100, duration - 200]) {
      const current = sampleCinematicShot(shot, start, ms);
      expect(blendCameraPose(current, start, 0)).toEqual(current);
      expect(blendCameraPose(current, start, 1)).toEqual(start);
      expect(blendCameraPose(current, start, 2)).toEqual(start);
    }
  });
  it("uses square coordinates for quiet mate and safely handles zero direction", () => {
    const fallback = planCinematicShot({ ...move, captured: undefined });
    expect(fallback.pose.target).toEqual([0.5, config.targetHeight, -0.5]);
    expect(planCinematicShot(move, { position: [0, 0], direction: [0, 0] }).pose.position.every(Number.isFinite)).toBe(true);
  });
});
