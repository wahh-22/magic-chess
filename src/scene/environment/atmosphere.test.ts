import { describe, expect, it } from "vitest";
import { PLAZA_Y } from "./battlefieldConfig";
import { HEIGHT_FOG, heightFogDepth } from "./heightFog";
import { groundBlend } from "./landscape";
import { buildRuins } from "./ruins";

describe("height fog", () => {
  it("matches a numeric integral of the exponential density along the ray", () => {
    const eye = 4.5, deltaY = -4.8, distance = 60;
    let numeric = 0;
    const steps = 4000;
    for (let i = 0; i < steps; i++) {
      const y = eye + deltaY * (i + 0.5) / steps;
      numeric += HEIGHT_FOG.density * Math.exp(-HEIGHT_FOG.falloff * (y - HEIGHT_FOG.baseY)) * distance / steps;
    }
    expect(heightFogDepth(eye, deltaY, distance)).toBeCloseTo(numeric, 6);
  });
  it("is thicker toward the valley floor than toward the sky, and zero at zero distance", () => {
    expect(heightFogDepth(4.5, -4, 50)).toBeGreaterThan(heightFogDepth(4.5, 4, 50));
    expect(heightFogDepth(4.5, 0, 0)).toBe(0);
  });
});

describe("weathered ground and ruins", () => {
  it("blends gravel at the plaza edge, worn soil at ruins and dry grass in the open", () => {
    const sum = (weights: number[]) => weights.reduce((a, b) => a + b, 0);
    const open = groundBlend(60, 60);
    expect(sum(open)).toBeCloseTo(1);
    expect(open[0]).toBeGreaterThan(0.5);
    const ruin = groundBlend(0, -40, [[0, -40, 1]]);
    expect(ruin[1]).toBeGreaterThan(open[1]);
    const edges = [groundBlend(15, 0), groundBlend(0, 15.5), groundBlend(-14.5, 3)];
    expect(Math.max(...edges.map((weights) => weights[2]))).toBeGreaterThan(0.25);
  });
  it("paints the ruins with weathering colours: darker at the foot than on the upper shafts", () => {
    const ruins = buildRuins();
    const position = ruins.attributes.position!, color = ruins.attributes.color!;
    expect(color.count).toBe(position.count);
    let low = 0, lowCount = 0, high = 0, highCount = 0;
    for (let i = 0; i < position.count; i++) {
      const luma = color.getX(i) * 0.3 + color.getY(i) * 0.59 + color.getZ(i) * 0.11;
      expect(luma).toBeGreaterThan(0);
      expect(luma).toBeLessThan(1.2);
      if (position.getY(i) < PLAZA_Y + 0.3) { low += luma; lowCount++; }
      if (position.getY(i) > PLAZA_Y + 4) { high += luma; highCount++; }
    }
    expect(low / lowCount).toBeLessThan(high / highCount);
  });
});
