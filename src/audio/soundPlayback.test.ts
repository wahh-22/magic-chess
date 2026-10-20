import { afterEach, describe, expect, it, vi } from "vitest";
import { effectsStore } from "../scene/effects/effectsStore";
import type { Impact } from "../scene/animation/planMove";
import type { SoundProvider } from "./SoundProvider";
import { scheduleCues, subscribeToImpactSounds } from "./soundPlayback";

const impact: Impact = { atMs: 800, pieceId: "victim", position: [2, 0], direction: [1, 0] };
const victim = { id: "victim", color: "b" as const, type: "p" as const, square: "g4" };
function provider(): SoundProvider {
  return { play: vi.fn(), unlock: vi.fn(async () => {}), setMuted: vi.fn(), muted: false };
}
afterEach(() => { effectsStore.getState().clear(); vi.useRealTimers(); });

describe("sound playback lifecycle", () => {
  it("cancels all pending move cues on cleanup, including StrictMode's first setup", () => {
    vi.useFakeTimers(); const sound = provider();
    const cancel = scheduleCues(sound, [{ cue: "slide", atMs: 0, pan: 0 }, { cue: "set-down", atMs: 500, pan: 0 }]);
    cancel(); vi.runAllTimers(); expect(sound.play).not.toHaveBeenCalled();
  });

  it("plays each new burst once, ignoring existing bursts and update notifications", () => {
    vi.useFakeTimers(); const sound = provider();
    effectsStore.getState().addBurst(impact, victim);
    const dispose = subscribeToImpactSounds(sound);
    effectsStore.getState().addBurst(impact, victim);
    const id = effectsStore.getState().bursts.at(-1)!.id;
    effectsStore.getState().finishEffect(id, "dust");
    vi.runAllTimers();
    expect(vi.mocked(sound.play).mock.calls.map(([cue]) => cue)).toEqual(["hit", "shatter", "pebbles", "pebbles"]);
    expect(sound.play).toHaveBeenCalledWith("hit", { pan: 0.4 });
    dispose();
  });

  it("cancels delayed rubble when effects are cleared (undo/load) or subscription ends", () => {
    vi.useFakeTimers(); const sound = provider();
    const dispose = subscribeToImpactSounds(sound);
    effectsStore.getState().addBurst(impact, victim);
    vi.advanceTimersByTime(0); expect(sound.play).toHaveBeenCalledOnce();
    effectsStore.getState().clear(); vi.runAllTimers(); expect(sound.play).toHaveBeenCalledOnce();
    effectsStore.getState().addBurst(impact, victim); dispose();
    vi.runAllTimers(); expect(sound.play).toHaveBeenCalledOnce();
  });
});
