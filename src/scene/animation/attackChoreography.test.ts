import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_CONFIG as config } from "../../config/animation";
import type { MoveEvent, PieceType } from "../../core/types";
import { planMove } from "./planMove";
import { sampleAttack } from "./attackChoreography";
import { sampleTrack } from "./sampleTrack";

const event: MoveEvent = { san: "Nxd5", uci: "c3d5", color: "w", pieceId: "attacker", from: "c3", to: "d5", check: false, outcome: null, captured: { pieceId: "victim", square: "d5" } };

describe("rigid attack choreography", () => {
  it.each<PieceType>(["n", "r", "p", "b", "q", "k"])("winds up, strikes and returns to rest: %s", (type) => {
    const plan = planMove(event, config, 0.6, type);
    const attack = plan.attack!;
    expect(attack.strikeMs).toBe(plan.impact!.atMs);
    expect(attack.strikeMs).toBeLessThanOrEqual(plan.tracks[0]!.durationMs);
    const windup = sampleAttack(attack, attack.windupMs);
    expect(windup.height).toBe(0);
    if (type !== "r") expect(windup.pitch).toBeLessThan(0);
    const strike = sampleAttack(attack, attack.strikeMs);
    expect(strike.height).toBe(0);
    expect(strike.offset).toBe(0);
    if (type !== "r") expect(strike.pitch).toBeGreaterThan(0);
    expect(sampleAttack(attack, attack.endMs)).toMatchObject({ height: 0, offset: 0, pitch: 0 });
    for (const time of [attack.startMs, attack.windupMs, attack.strikeMs, attack.endMs]) {
      const before = sampleAttack(attack, time - 0.0001);
      const after = sampleAttack(attack, time + 0.0001);
      for (const key of ["height", "offset", "pitch"] as const) expect(Math.abs(before[key] - after[key])).toBeLessThan(0.0001);
    }
  });

  it("does not penetrate the contact proxies before the strike; the attacker stays grounded", () => {
    const plan = planMove(event, config, 0.6, "n");
    const attack = plan.attack!;
    for (let time = 0; time < attack.strikeMs; time += 5) {
      const base = sampleTrack(plan.tracks[0]!, time, config);
      const pose = sampleAttack(attack, time);
      expect(pose.offset).toBeLessThanOrEqual(0);
      expect(base.y * (1 - pose.grounding) + pose.height).toBeGreaterThanOrEqual(0);
    }
    const pose = sampleAttack(attack, attack.strikeMs);
    expect(pose.grounding).toBe(1);
    expect(pose.height).toBe(0);
  });

  it("leaves quiet moves untouched and handles immediate/off-path contact", () => {
    expect(planMove({ ...event, captured: undefined }, config, 0.6, "n").attack).toBeUndefined();
    for (const distance of [0, 0.6, 10]) {
      const plan = planMove(event, config, distance, "r");
      expect(plan.attack!.strikeMs).toBe(plan.impact!.atMs);
      expect(Number.isFinite(sampleAttack(plan.attack!, 0).height)).toBe(true);
    }
    const enPassant = planMove({ ...event, from: "e5", to: "d6", captured: { pieceId: "victim", square: "d5" } }, config, 0.6, "p");
    expect(enPassant.attack!.strikeMs).toBe(enPassant.impact!.atMs);
  });
});
