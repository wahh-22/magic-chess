import type { SoundCue, SoundOptions, SoundProvider } from "./SoundProvider";

export const MUTE_STORAGE_KEY = "magic-chess:sound-muted";
const files = (names: string[]) => names.map((name) => `${import.meta.env.BASE_URL}sounds/${name}.mp3`);
export const SOUND_FILES: Record<SoundCue, readonly string[]> = {
  slide: files(["footstep_concrete_000", "footstep_concrete_001", "footstep_concrete_002"]),
  "set-down": files(["footstep_concrete_002"]),
  hit: files(["impactMining_000"]),
  shatter: files(["impactMining_001", "impactMining_002"]),
  pebbles: files(["impactMining_003"]),
  check: files(["impactMining_004"]),
  "game-end": files(["impactMining_000"]),
};
const cueRates: Partial<Record<SoundCue, number>> = { check: 0.65, "game-end": 0.5, pebbles: 1.4 };
const cueVolumes: Partial<Record<SoundCue, number>> = { slide: 0.45, pebbles: 0.25, check: 0.65 };

interface SamplerDependencies {
  createContext?: () => AudioContext;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
  storage?: Pick<Storage, "getItem" | "setItem">;
  random?: () => number;
}

/** No AudioContext, network request or decode until unlock/play after a gesture. */
export function createWebAudioSampler(deps: SamplerDependencies = {}): SoundProvider {
  let context: AudioContext | undefined;
  let storage = deps.storage;
  let muted = false;
  try {
    storage ??= globalThis.localStorage;
    muted = storage?.getItem(MUTE_STORAGE_KEY) === "true";
  } catch { /* Private browsing/storage denial must not break the game. */ }
  const random = deps.random ?? Math.random;
  const buffers = new Map<string, Promise<AudioBuffer>>();
  const playing = new Set<AudioBufferSourceNode>();
  let generation = 0;
  const load = (url: string, audio: AudioContext) => {
    let pending = buffers.get(url);
    if (!pending) {
      pending = (async () => {
        const data = deps.fetchAudio ? await deps.fetchAudio(url) : await fetch(url).then((response) => {
          if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
          return response.arrayBuffer();
        });
        return audio.decodeAudioData(data);
      })().catch((error: unknown) => { buffers.delete(url); throw error; });
      buffers.set(url, pending);
    }
    return pending;
  };

  return {
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      generation++;
      if (muted) {
        for (const source of playing) source.stop();
        playing.clear();
      }
      try { storage?.setItem(MUTE_STORAGE_KEY, String(value)); } catch { /* Optional persistence. */ }
    },
    async unlock() {
      // resume must happen synchronously in the gesture handler, before any await.
      context ??= deps.createContext ? deps.createContext() : new AudioContext();
      if (context.state !== "running") await context.resume();
    },
    play(cue: SoundCue, options: SoundOptions = {}) {
      const audio = context;
      if (muted || !audio || audio.state !== "running") return;
      const variants = SOUND_FILES[cue];
      const url = variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))]!;
      const requestGeneration = generation;
      // A slow network must not play an obsolete move seconds later.
      const requestedAt = performance.now();
      void load(url, audio).then((buffer) => {
        if (muted || generation !== requestGeneration || audio.state !== "running" || performance.now() - requestedAt > 250) return;
        const source = audio.createBufferSource();
        const gain = audio.createGain();
        const pan = audio.createStereoPanner();
        source.buffer = buffer;
        source.playbackRate.value = Math.max(0.25, Math.min(3, (options.rate ?? cueRates[cue] ?? 1) * (0.97 + random() * 0.06)));
        gain.gain.value = Math.max(0, Math.min(1, (options.volume ?? cueVolumes[cue] ?? 0.7) * (0.92 + random() * 0.16)));
        pan.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
        source.connect(gain); gain.connect(pan); pan.connect(audio.destination);
        playing.add(source);
        source.onended = () => {
          playing.delete(source);
          source.disconnect(); gain.disconnect(); pan.disconnect();
        };
        source.start();
      }).catch(() => { /* Offline/missing samples are silent, never fatal to play. */ });
    },
  };
}

let shared: SoundProvider | undefined;
/** Hook and toggle share this instance; importing the module has no audio side effects. */
export function getSoundProvider(): SoundProvider {
  return shared ??= createWebAudioSampler();
}
