import { describe, expect, it, vi } from "vitest";
import { createWebAudioSampler, MUTE_STORAGE_KEY } from "./webAudioSampler";

function harness(saved: string | null = null) {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; playbackRate: { value: number } }[] = [];
  const gains: { gain: { value: number } }[] = [];
  const pans: { pan: { value: number } }[] = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    state: "suspended", destination: {},
    resume: vi.fn(async () => { context.state = "running"; }),
    decodeAudioData: vi.fn(async () => ({})),
    createBufferSource: vi.fn(() => {
      const source = { ...node(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 0 }, buffer: null, onended: null };
      sources.push(source); return source;
    }),
    createGain: vi.fn(() => { const gain = { ...node(), gain: { value: 0 } }; gains.push(gain); return gain; }),
    createStereoPanner: vi.fn(() => { const pan = { ...node(), pan: { value: 0 } }; pans.push(pan); return pan; }),
  };
  const fetchAudio = vi.fn(async () => new ArrayBuffer(1));
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const sampler = createWebAudioSampler({ createContext, fetchAudio, storage, random: () => 0.5 });
  return { sampler, context, createContext, fetchAudio, storage, sources, gains, pans };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("Web Audio stone sampler", () => {
  it("does not create audio or fetch before a user gesture", () => {
    const h = harness(); h.sampler.play("slide");
    expect(h.createContext).not.toHaveBeenCalled();
    expect(h.fetchAudio).not.toHaveBeenCalled();
  });

  it("unlocks, caches decoded variants and applies rate, volume and pan", async () => {
    const h = harness(); await h.sampler.unlock();
    h.sampler.play("slide", { pan: 0.4, rate: 0.8, volume: 0.5 }); await flush();
    const count = h.fetchAudio.mock.calls.length;
    h.sampler.play("slide"); await flush();
    expect(h.context.resume).toHaveBeenCalledOnce();
    expect(h.fetchAudio.mock.calls.length).toBe(count);
    expect(h.sources).toHaveLength(2);
    expect(h.sources[0]!.playbackRate.value).toBe(0.8);
    expect(h.gains[0]!.gain.value).toBe(0.5);
    expect(h.pans[0]!.pan.value).toBe(0.4);
  });

  it("restores and persists mute, stopping already playing sources", async () => {
    const h = harness("true"); await h.sampler.unlock();
    h.sampler.play("hit"); await flush(); expect(h.sources).toHaveLength(0);
    h.sampler.setMuted(false); h.sampler.play("hit"); await flush();
    h.sampler.setMuted(true);
    expect(h.sources[0]!.stop).toHaveBeenCalledOnce();
    expect(h.storage.setItem).toHaveBeenLastCalledWith(MUTE_STORAGE_KEY, "true");
  });

  it("drops pending decodes on mute rather than replaying them after unmute", async () => {
    const h = harness(); await h.sampler.unlock();
    h.sampler.play("shatter"); h.sampler.setMuted(true); h.sampler.setMuted(false);
    await flush(); expect(h.sources).toHaveLength(0);
  });

  it("fails quietly on missing files and retries the next play", async () => {
    const h = harness(); await h.sampler.unlock();
    h.fetchAudio.mockRejectedValueOnce(new Error("offline"));
    h.sampler.play("hit"); await flush(); expect(h.sources).toHaveLength(0);
    h.sampler.play("hit"); await flush(); expect(h.sources).toHaveLength(1);
  });

  it("shares in-flight decodes across simultaneous plays of the same sample", async () => {
    const h = harness(); await h.sampler.unlock();
    h.sampler.play("hit"); h.sampler.play("hit"); await flush();
    expect(h.fetchAudio).toHaveBeenCalledOnce();
    expect(h.context.decodeAudioData).toHaveBeenCalledOnce();
    expect(h.sources).toHaveLength(2);
  });

  it("clamps out-of-range playback options", async () => {
    const h = harness(); await h.sampler.unlock();
    h.sampler.play("hit", { pan: 9, volume: -4, rate: 20 }); await flush();
    expect(h.pans[0]!.pan.value).toBe(1);
    expect(h.gains[0]!.gain.value).toBe(0);
    expect(h.sources[0]!.playbackRate.value).toBe(3);
  });

  it("drops playback while context is suspended", async () => {
    const h = harness(); await h.sampler.unlock(); h.context.state = "suspended";
    h.sampler.play("hit"); await flush(); expect(h.sources).toHaveLength(0);
  });
});
