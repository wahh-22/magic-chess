import { describe, expect, it } from "vitest";
import { ALL_SQUARES, isLightSquare, squareToWorld } from "./coords";

describe("board coordinates", () => {
  it("centers the board on the origin with white at +z", () => {
    expect(squareToWorld("a1")).toEqual([-3.5, 3.5]);
    expect(squareToWorld("h1")).toEqual([3.5, 3.5]);
    expect(squareToWorld("a8")).toEqual([-3.5, -3.5]);
    expect(squareToWorld("e4")).toEqual([0.5, 0.5]);
  });

  it("lists the 64 squares and colors them like a real board", () => {
    expect(ALL_SQUARES).toHaveLength(64);
    expect(new Set(ALL_SQUARES).size).toBe(64);
    expect(isLightSquare("a1")).toBe(false);
    expect(isLightSquare("h1")).toBe(true);
    expect(isLightSquare("d1")).toBe(true);
    expect(isLightSquare("e1")).toBe(false);
  });
});
