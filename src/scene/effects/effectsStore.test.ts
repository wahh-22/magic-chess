import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import { effectsStore } from "./effectsStore";

const victim = { id: "victim", type: "p", color: "b", square: "d5" } as const;
const impact = { atMs: 0, pieceId: victim.id, position: [-0.5, -0.5], direction: [1, 0] } as const;
function addBurst() {
  effectsStore.getState().addBurst({ ...impact, position: [...impact.position], direction: [...impact.direction] }, victim);
  return effectsStore.getState().bursts.at(-1)!.id;
}

beforeEach(() => effectsStore.getState().clear());

describe("destruction lifecycle", () => {
  it.each(["dust", "debris"] as const)("waits for both effects when %s finishes first", (first) => {
    const id = addBurst();
    effectsStore.getState().finishEffect(id, first);
    expect(effectsStore.getState().bursts).toHaveLength(1);
    effectsStore.getState().finishEffect(id, first); // callbacks are idempotent
    expect(effectsStore.getState().bursts).toHaveLength(1);
    effectsStore.getState().finishEffect(id, first === "dust" ? "debris" : "dust");
    expect(effectsStore.getState().bursts).toHaveLength(0);
  });

  it("evicts oldest debris first at the cap, but lets its dust finish", () => {
    const first = addBurst();
    for (let i = 0; i < DEFAULT_EFFECTS_CONFIG.debris.maxSimultaneousBursts; i++) addBurst();
    const bursts = effectsStore.getState().bursts;
    expect(bursts[0]!.id).toBe(first);
    expect(bursts[0]!.debrisDone).toBe(true);
    expect(bursts.filter((burst) => !burst.debrisDone)).toHaveLength(DEFAULT_EFFECTS_CONFIG.debris.maxSimultaneousBursts);
    effectsStore.getState().finishEffect(first, "dust");
    expect(effectsStore.getState().bursts.some((burst) => burst.id === first)).toBe(false);
  });

  it("ignores late completion after clear and does not affect a new burst", () => {
    const oldId = addBurst();
    effectsStore.getState().clear();
    const newId = addBurst();
    effectsStore.getState().finishEffect(oldId, "debris");
    expect(effectsStore.getState().bursts.map((burst) => burst.id)).toEqual([newId]);
  });
});
