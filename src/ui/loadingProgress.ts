import type { ProgressSnapshot } from "../loading/progress";
import type { StagedLoaderState } from "../loading/stagedLoader";

/** Part of the bar for the secondary set (scanned nature) when the reveal waits for it. */
export const SECONDARY_SHARE = 0.15;

type Snapshot = Pick<ProgressSnapshot, "fraction" | "items" | "phase">;

/**
 * Bar position and stage for a match: the critical set, then — while the reveal waits for it —
 * the secondary set, which registers its items only once its downloads start (an empty stage
 * is not finished) and counts as done only when prepared.
 */
export function matchProgress(critical: Snapshot, secondary: Snapshot, state: StagedLoaderState["secondary"]):
  { fraction: number; phase: ProgressSnapshot["phase"] | "secondary" } {
  if (state === "ready") return { fraction: critical.fraction, phase: critical.phase };
  const streamed = secondary.items ? Math.min(secondary.fraction, 0.99) : 0;
  return {
    fraction: critical.fraction * (1 - SECONDARY_SHARE) + streamed * SECONDARY_SHARE,
    phase: critical.phase === "done" ? "secondary" : critical.phase,
  };
}
