import { describe, expect, it } from "vitest";
import { CAMERA_BOUNDS, CAMERA_TARGET, DEFAULT_CAMERA } from "../environment/battlefieldConfig";
import { ARRIVAL_MS, arrivalPose } from "./arrival";

const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("arrival camera", () => {
  it("lasts two to three seconds", () => {
    expect(ARRIVAL_MS).toBeGreaterThanOrEqual(2000);
    expect(ARRIVAL_MS).toBeLessThanOrEqual(3000);
  });

  it("starts away from the play camera and lands exactly on it", () => {
    const start = arrivalPose(0);
    expect(distance(start.position, DEFAULT_CAMERA)).toBeGreaterThan(3);
    expect(arrivalPose(ARRIVAL_MS)).toEqual({ position: DEFAULT_CAMERA, target: CAMERA_TARGET });
    expect(arrivalPose(ARRIVAL_MS * 2)).toEqual({ position: DEFAULT_CAMERA, target: CAMERA_TARGET });
  });

  it("approaches steadily and stays above the plaza and inside the ruins", () => {
    let previous = Infinity;
    for (let ms = 0; ms <= ARRIVAL_MS; ms += ARRIVAL_MS / 40) {
      const { position } = arrivalPose(ms);
      const left = distance(position, DEFAULT_CAMERA);
      expect(left).toBeLessThanOrEqual(previous + 1e-9);
      previous = left;
      expect(Math.hypot(position[0], position[2])).toBeLessThanOrEqual(CAMERA_BOUNDS.radius + 1e-9);
      expect(position[1]).toBeGreaterThanOrEqual(CAMERA_BOUNDS.minY);
    }
  });

  it("treats a negative time as the start", () => {
    expect(arrivalPose(-100)).toEqual(arrivalPose(0));
  });
});
