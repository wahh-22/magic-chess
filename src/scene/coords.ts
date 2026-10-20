import type { Square } from "../core/types";

const FILES = "abcdefgh";

export const ALL_SQUARES: readonly Square[] = [...FILES].flatMap((file) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}`),
);

/** World [x, z] of a square's center. One square is one unit; white sits at +z. */
export function squareToWorld(square: Square): [number, number] {
  const file = FILES.indexOf(square[0]!);
  const rank = Number(square[1]) - 1;
  return [file - 3.5, 3.5 - rank];
}

export function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0]!);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}
