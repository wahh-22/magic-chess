import { useId } from "react";
import type { Color, PieceType } from "../core/types";

const SHIELD = "M5 4h38v19c0 13-8 21-19 26C13 44 5 36 5 23z";
// A crenellated keep: the same charge on both shields, inverted in tone.
const KEEP = "M15 14h4v3h3v-3h4v3h3v-3h4v8l-2.5 2.5V35H33v4H15v-4h2.5V24.5L15 22z";

/** Side emblem: an ivory or obsidian heraldic shield with a gold rim. */
export function Emblem({ color, size = 40 }: { color: Color; size?: number }) {
  const ivory = color === "w";
  // Each shield owns its gradients: ids must stay unique when several emblems share the page.
  const id = `emblem-${color}${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg className="emblem" width={size} height={size * 52 / 48} viewBox="0 0 48 52" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-field`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={ivory ? "#f6eedd" : "#3a3a42"} />
          <stop offset="1" stopColor={ivory ? "#bfae8c" : "#0c0c10"} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d9a0" />
          <stop offset="0.5" stopColor="#b8913f" />
          <stop offset="1" stopColor="#7a5c22" />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${id}-field)`} stroke={`url(#${id}-rim)`} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M9 8h30v15c0 10-6 17-15 21C15 40 9 33 9 23z" fill="none" stroke={ivory ? "#9c8456" : "#6f5a30"}
        strokeWidth="0.8" opacity="0.8" />
      <path d={KEEP} fill={ivory ? "#2b2620" : "#e9dcbd"} opacity={ivory ? 0.82 : 0.9} />
    </svg>
  );
}

const GLYPHS: Record<PieceType, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/** A small chess glyph; U+FE0E keeps platforms from drawing the pawn as an emoji. */
export function PieceGlyph({ type, color }: { type: PieceType; color: Color }) {
  return <span className={`piece-glyph piece-glyph-${color}`} aria-hidden="true">{GLYPHS[type]}{"\uFE0E"}</span>;
}
