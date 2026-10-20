export interface Difficulty {
  id: string;
  label: string;
  /** Stockfish "Skill Level", 0–20. */
  skillLevel: number;
  /** When set, Stockfish plays at roughly this Elo (supported range ≈1320–3190). */
  elo?: number;
  moveTimeMs: number;
}

/** Ordered from easiest to strongest. Below ≈1320 Elo only Skill Level can weaken the engine. */
export const DIFFICULTIES: readonly Difficulty[] = [
  { id: "beginner", label: "Beginner", skillLevel: 0, moveTimeMs: 300 },
  { id: "casual", label: "Casual", skillLevel: 5, moveTimeMs: 500 },
  { id: "club", label: "Club player", skillLevel: 20, elo: 1800, moveTimeMs: 800 },
  { id: "expert", label: "Expert", skillLevel: 20, elo: 2400, moveTimeMs: 1000 },
  { id: "master", label: "Master", skillLevel: 20, moveTimeMs: 1500 },
];

export const DEFAULT_DIFFICULTY = DIFFICULTIES[1]!;
