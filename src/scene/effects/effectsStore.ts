import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { PieceInstance } from "../../core/types";
import type { Impact } from "../animation/planMove";

/** One capture's decorative destruction, independent of authoritative game state. */
export interface Burst {
  id: number;
  impact: Impact;
  victim: PieceInstance;
  /** Seed for every random choice of this burst, so it can be reproduced. */
  seed: number;
  dustDone?: boolean;
  debrisDone?: boolean;
}

interface EffectsState {
  bursts: Burst[];
  addBurst(impact: Impact, victim: PieceInstance): void;
  removeBurst(id: number): void;
  finishEffect(id: number, effect: "dust" | "debris"): void;
  clear(): void;
}

let nextId = 1;

/** Presentation-only state: never read by the game core (architecture principle 2). */
export const effectsStore = createStore<EffectsState>()((set) => ({
  bursts: [],
  addBurst: (impact, victim) =>
    set((state) => {
      const id = nextId++;
      const bursts: Burst[] = [...state.bursts, { id, impact, victim, seed: id * 7919 }];
      let excess = bursts.filter((burst) => !burst.debrisDone).length - DEFAULT_EFFECTS_CONFIG.debris.maxSimultaneousBursts;
      return {
        bursts: bursts.map((burst) => {
          if (excess <= 0 || burst.debrisDone) return burst;
          excess--;
          return { ...burst, debrisDone: true };
        }).filter((burst) => !(burst.dustDone && burst.debrisDone)),
      };
    }),
  removeBurst: (id) => set((state) => ({ bursts: state.bursts.filter((burst) => burst.id !== id) })),
  finishEffect: (id, effect) => set((state) => ({
    bursts: state.bursts.map((burst) => burst.id === id
      ? { ...burst, [effect === "dust" ? "dustDone" : "debrisDone"]: true }
      : burst).filter((burst) => !(burst.dustDone && burst.debrisDone)),
  })),
  clear: () => set({ bursts: [] }),
}));

export function useEffectsStore<T>(selector: (state: EffectsState) => T): T {
  return useStore(effectsStore, selector);
}

// Development-only handle for browser checks (scripts/capture-sequence.mjs).
if (import.meta.env.DEV) Object.assign(globalThis, { __effectsStore: effectsStore });
