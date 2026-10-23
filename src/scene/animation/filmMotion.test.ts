import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_CONFIG as config } from "../../config/animation";
import type { MoveEvent, PieceType } from "../../core/types";
import { squareToWorld } from "../coords";
import { sampleAttack } from "./attackChoreography";
import { planMove } from "./planMove";
import { sampleTrack } from "./sampleTrack";

const move = (from: string, to: string, captured?: string): MoveEvent =>
  ({ pieceId: "mover", from, to, ...(captured ? { captured: { pieceId: "victim", square: captured } } : {}) }) as MoveEvent;

const samples = (durationMs: number, steps = 60) => Array.from({ length: steps + 1 }, (_, i) => (i / steps) * durationMs);

describe("film-style motion: pieces slide, never jump", () => {
  it("a plain move stays on the board for its whole duration", () => {
    const plan = planMove(move("d2", "d4"));
    for (const time of samples(plan.durationMs)) expect(sampleTrack(plan.tracks[0]!, time, config).y).toBe(0);
  });

  it("a knight slides along its L: two squares first, then one, never through the air", () => {
    const plan = planMove(move("g1", "f3"));
    const track = plan.tracks[0]!;
    expect(track.kind).toBe("glide");
    const corner = squareToWorld("g3");
    const points = samples(plan.durationMs, 400).map((time) => sampleTrack(track, time, config));
    for (const point of points) expect(point.y).toBe(0);
    // Every sample lies on one of the two legs: g1→g3 (x fixed), then g3→f3 (z fixed).
    for (const point of points) {
      const onFirstLeg = Math.abs(point.x - corner[0]) < 1e-9;
      const onSecondLeg = Math.abs(point.z - corner[1]) < 1e-9;
      expect(onFirstLeg || onSecondLeg).toBe(true);
    }
    expect(points.at(-1)).toMatchObject({ x: squareToWorld("f3")[0], z: squareToWorld("f3")[1] });
  });

  it("a knight capture hits on the final leg, when it reaches the victim", () => {
    const plan = planMove(move("g1", "f3", "f3"), config, 0.6, "n");
    const track = plan.tracks[0]!;
    const impact = plan.impact!;
    const atImpact = sampleTrack(track, impact.atMs, config);
    expect(Math.abs(atImpact.z - squareToWorld("g3")[1])).toBeLessThan(1e-6);
    expect(Math.hypot(atImpact.x - impact.position[0], atImpact.z - impact.position[1])).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(impact.direction).toEqual([Math.sign(squareToWorld("f3")[0] - squareToWorld("g3")[0]), 0]);
  });

  it.each(["p", "n", "b", "r", "q", "k"] as PieceType[])("the %s attack is a grounded strike with no leap", (type) => {
    const plan = planMove(move("d4", "d5", "d5"), config, 0.6, type);
    expect(plan.attack).toBeDefined();
    for (const time of samples(plan.durationMs, 200)) expect(sampleAttack(plan.attack!, time).height).toBe(0);
  });
});
