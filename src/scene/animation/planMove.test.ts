import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_CONFIG } from "../../config/animation";
import type { MoveEvent } from "../../core/types";
import { squareToWorld } from "../coords";
import { planMove } from "./planMove";

function move(overrides: Partial<MoveEvent> = {}): MoveEvent {
  return {
    san: "e4", uci: "e2e4", color: "w", pieceId: "pawn", from: "e2", to: "e4",
    check: false, outcome: null, ...overrides,
  };
}

const config = DEFAULT_ANIMATION_CONFIG;

describe("planMove", () => {
  it("plans a quiet pawn glide using distance and includes the post-move pause", () => {
    const plan = planMove(move());
    expect(plan.tracks).toEqual([{
      pieceId: "pawn", kind: "glide", startMs: 0,
      durationMs: 2000 / config.glideSquaresPerSecond,
      from: squareToWorld("e2"), to: squareToWorld("e4"),
    }]);
    expect(plan.durationMs).toBeCloseTo(2000 / config.glideSquaresPerSecond + config.postMovePauseMs);
  });

  it("clamps short and long move durations to custom bounds", () => {
    const custom = { ...config, minMoveMs: 600, maxMoveMs: 1000 };
    expect(planMove(move({ to: "e3" }), custom).tracks[0]?.durationMs).toBe(600);
    expect(planMove(move({ from: "a1", to: "h8" }), custom).tracks[0]?.durationMs).toBe(1000);
  });

  it.each([["b1", "c3"], ["b1", "d2"], ["d4", "c2"], ["d4", "b3"]])(
    "detects the knight L-shape from %s to %s", (from, to) => {
      expect(planMove(move({ from, to })).tracks[0]?.kind).toBe("hop");
    },
  );

  it("uses Euclidean distance and honors custom speed and pause", () => {
    const custom = { ...config, glideSquaresPerSecond: 4, minMoveMs: 1, maxMoveMs: 10000, postMovePauseMs: 90 };
    const plan = planMove(move({ from: "a1", to: "c3" }), custom);
    expect(plan.tracks[0]?.durationMs).toBeCloseTo(Math.hypot(2, 2) / 4 * 1000);
    expect(plan.tracks[0]?.kind).toBe("glide");
    expect(plan.durationMs).toBeCloseTo(Math.hypot(2, 2) / 4 * 1000 + 90);
  });

  it.each(["e4", "d5"])("shatters the captured piece at its own square %s on impact, including en passant", (square) => {
    const custom = { ...config, captureImpactLeadMs: 75, postMovePauseMs: 33 };
    const plan = planMove(move({ captured: { pieceId: "victim", square } }), custom);
    const arrival = plan.tracks[0]!.durationMs;
    expect(plan.tracks[1]).toEqual({
      pieceId: "victim", kind: "shatter", startMs: arrival - 75, durationMs: 0,
      from: squareToWorld(square), to: squareToWorld(square),
    });
    expect(plan.durationMs).toBeCloseTo(arrival + 33);
  });

  it("describes the impact with the victim position and the unit attack direction", () => {
    const custom = { ...config, captureImpactLeadMs: 75 };
    const plan = planMove(move({ from: "e5", to: "d6", captured: { pieceId: "victim", square: "d5" } }), custom);
    expect(plan.impact).toMatchObject({
      atMs: plan.tracks[0]!.durationMs - 75,
      pieceId: "victim",
      position: squareToWorld("d5"),
    });
    expect(plan.impact!.direction[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(plan.impact!.direction[1]).toBeCloseTo(-Math.SQRT1_2);
  });

  it("has no impact for quiet moves", () => {
    expect(planMove(move()).impact).toBeUndefined();
  });

  it("delays the castling rook glide and waits for the last track", () => {
    const custom = { ...config, castlingRookDelayMs: 370, postMovePauseMs: 42 };
    const plan = planMove(move({ pieceId: "king", from: "e1", to: "g1", rookMove: { pieceId: "rook", from: "h1", to: "f1" } }), custom);
    expect(plan.tracks[1]).toEqual({
      pieceId: "rook", kind: "glide", startMs: 370, durationMs: 2000 / custom.glideSquaresPerSecond,
      from: squareToWorld("h1"), to: squareToWorld("f1"),
    });
    expect(plan.durationMs).toBeCloseTo(370 + 2000 / custom.glideSquaresPerSecond + 42);
  });
});
