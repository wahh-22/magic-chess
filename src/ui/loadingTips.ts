/** Chess tips and ARCANA lore shown while a match loads. */
export const LOADING_TIPS: readonly string[] = [
  "Control the centre: pieces on d4, e4, d5 and e5 reach the most squares.",
  "Develop knights and bishops before moving the same piece twice.",
  "Castle early. A king left in the centre is the first to fall.",
  "A knight on the rim is dim: from the edge it covers half its squares.",
  "Rooks love open files. Double them and they break any wall.",
  "Before every move, ask what your opponent's last move threatens.",
  "In the endgame the king is a fighting piece. March it forward.",
  "Ivory and obsidian were carved from the same mountain, and have warred ever since.",
  "The stone remembers every battle: a fallen piece shatters, but its dust stays on the field.",
  "Two bishops working together can sweep the whole board.",
];

/** Time each tip stays on screen. */
export const TIP_INTERVAL_MS = 6000;

export const LOADING_ART = ["/art/loading-1.webp", "/art/loading-2.webp"] as const;

const wrap = (value: number, count: number) => ((Math.floor(value) % count) + count) % count;

/** Tip shown `elapsedMs` after the loading screen appeared; `seed` (the match number) picks the first one. */
export function tipAt(elapsedMs: number, seed: number): number {
  const step = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / TIP_INTERVAL_MS : 0;
  return wrap((Number.isFinite(seed) ? seed : 0) + Math.floor(step), LOADING_TIPS.length);
}

/** Key art of the loading screen, alternating between matches. */
export function loadingArtFor(match: number): string {
  return LOADING_ART[wrap(match, LOADING_ART.length)]!;
}
