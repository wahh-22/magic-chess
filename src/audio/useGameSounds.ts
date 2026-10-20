import { useEffect } from "react";
import type { MoveEvent } from "../core/types";
import { planMove, type MovePlan } from "../scene/animation/planMove";
import type { SoundProvider } from "./SoundProvider";
import { cuesForMove } from "./soundCues";
import { scheduleCues, subscribeToImpactSounds } from "./soundPlayback";
import { getSoundProvider } from "./webAudioSampler";

export interface GameSoundsOptions {
  activeEvent?: MoveEvent;
  /** Supply the scene's plan if animation timings are customized. Keep identity stable. */
  plan?: MovePlan;
  provider?: SoundProvider;
}

/** Mount once outside Canvas. Impact sounds subscribe directly to new effects bursts. */
export function useGameSounds({ activeEvent, plan, provider = getSoundProvider() }: GameSoundsOptions): SoundProvider {
  useEffect(() => {
    const unlock = () => { void provider.unlock().catch(() => { /* Retry on the next gesture. */ }); };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    const unsubscribe = subscribeToImpactSounds(provider);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      unsubscribe();
    };
  }, [provider]);

  useEffect(() => {
    if (!activeEvent) return;
    return scheduleCues(provider, cuesForMove(activeEvent, plan ?? planMove(activeEvent)));
  }, [activeEvent, plan, provider]);

  return provider;
}
