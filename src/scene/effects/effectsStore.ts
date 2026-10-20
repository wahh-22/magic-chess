import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { PieceInstance } from "../../core/types";
import type { Impact } from "../animation/planMove";

/** One capture's destruction: dust now, fragments once the debris layer renders them. */
export interface Burst {
  id: number;
  impact: Impact;
  victim: PieceInstance;
  /** Seed for every random choice of this burst, so it can be reproduced. */
  seed: number;
}

interface EffectsState {
  bursts: Burst[];
  addBurst(impact: Impact, victim: PieceInstance): void;
  removeBurst(id: number): void;
  clear(): void;
}

let nextId = 1;

/** Presentation-only state: never read by the game core (architecture principle 2). */
export const effectsStore = createStore<EffectsState>()((set) => ({
  bursts: [],
  addBurst: (impact, victim) =>
    set((state) => {
      const id = nextId++;
      return { bursts: [...state.bursts, { id, impact, victim, seed: id * 7919 }] };
    }),
  removeBurst: (id) => set((state) => ({ bursts: state.bursts.filter((burst) => burst.id !== id) })),
  clear: () => set({ bursts: [] }),
}));

export function useEffectsStore<T>(selector: (state: EffectsState) => T): T {
  return useStore(effectsStore, selector);
}

// Development-only handle for browser checks (scripts/capture-sequence.mjs).
if (import.meta.env.DEV) Object.assign(globalThis, { __effectsStore: effectsStore });
