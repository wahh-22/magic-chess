import { effectsStore } from "../scene/effects/effectsStore";
import type { SoundProvider } from "./SoundProvider";
import { cuesForImpact, type TimedCue } from "./soundCues";

export function scheduleCues(provider: SoundProvider, cues: readonly TimedCue[]): () => void {
  // Even zero-delay sounds wait a tick so React StrictMode cleanup can cancel them.
  const timers = cues.map(({ cue, atMs, pan }) =>
    setTimeout(() => provider.play(cue, { pan }), atMs));
  return () => { timers.forEach(clearTimeout); };
}

/** Read-only subscription; never schedules impact from the move plan as well. */
export function subscribeToImpactSounds(provider: SoundProvider): () => void {
  let previous = new Set(effectsStore.getState().bursts.map(({ id }) => id));
  const cancellations = new Map<number, () => void>();
  const unsubscribe = effectsStore.subscribe(({ bursts }) => {
    const current = new Set(bursts.map(({ id }) => id));
    for (const [id, cancel] of cancellations) {
      if (!current.has(id)) { cancel(); cancellations.delete(id); }
    }
    for (const burst of bursts) {
      if (!previous.has(burst.id)) {
        cancellations.set(burst.id, scheduleCues(provider, cuesForImpact(burst.impact)));
      }
    }
    previous = current;
  });
  return () => {
    unsubscribe();
    for (const cancel of cancellations.values()) cancel();
    cancellations.clear();
  };
}
