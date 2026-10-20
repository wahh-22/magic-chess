import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import type { PieceType } from "../../core/types";
import { createProceduralPieceProvider } from "./proceduralPieces";

const TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];
const provider = createProceduralPieceProvider();

function bounds(type: PieceType) {
  return new Box3().setFromBufferAttribute(provider.geometry(type).getAttribute("position") as never);
}

describe("procedural pieces", () => {
  it.each(TYPES)("%s sits on the board and fits inside one square", (type) => {
    const box = bounds(type);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.x - box.min.x).toBeLessThan(0.9);
    expect(box.max.z - box.min.z).toBeLessThan(0.9);
    expect(Math.abs((box.max.x + box.min.x) / 2)).toBeLessThan(0.1);
    expect(Math.abs((box.max.z + box.min.z) / 2)).toBeLessThan(0.1);
  });

  it("keeps the classic height order pawn < knight < bishop < queen < king", () => {
    const height = (type: PieceType) => bounds(type).max.y;
    expect(height("p")).toBeLessThan(height("n"));
    expect(height("n")).toBeLessThan(height("b"));
    expect(height("r")).toBeLessThan(height("b"));
    expect(height("b")).toBeLessThan(height("q"));
    expect(height("q")).toBeLessThan(height("k"));
  });

  it("returns renderable geometry with normals and caches it", () => {
    for (const type of TYPES) {
      const geometry = provider.geometry(type);
      expect(geometry.getAttribute("normal")).toBeDefined();
      expect(geometry.getAttribute("position").count).toBeGreaterThan(100);
      expect(provider.geometry(type)).toBe(geometry);
    }
  });
});
