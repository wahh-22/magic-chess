import { describe, expect, it } from "vitest";
import { CAMERA_BOUNDS, CAMERA_TARGET, DEFAULT_CAMERA } from "../environment/battlefieldConfig";
import { blendCameraPose, constrainScenePose, type CameraPose } from "./cinematicShots";

describe("battlefield cinematic clearance", () => {
  it("leaves the playable default pose unchanged", () => {
    const pose = { position: DEFAULT_CAMERA, target: CAMERA_TARGET };
    expect(constrainScenePose(pose)).toEqual(pose);
  });
  it("keeps edge-square shots and their full approach/return above the plaza and inside the ruins", () => {
    const original = { position: DEFAULT_CAMERA, target: CAMERA_TARGET };
    for (const x of [-3.5, 3.5]) for (const z of [-3.5, 3.5]) {
      for (const dx of [-14, 14]) for (const dz of [-14, 14]) for (const y of [-2, 2.6, 30]) {
        const shot: CameraPose = { position: [x + dx, y, z + dz], target: [x, 0.5, z] };
        for (let i = 0; i <= 100; i++) {
          const sampled = blendCameraPose(original, shot, i / 100);
          const pose = constrainScenePose(sampled);
          expect(pose.target).toEqual(sampled.target);
          expect(Math.hypot(pose.position[0], pose.position[2])).toBeLessThanOrEqual(CAMERA_BOUNDS.radius + 1e-9);
          expect(pose.position[1]).toBeGreaterThanOrEqual(CAMERA_BOUNDS.minY);
          expect(pose.position[1]).toBeLessThanOrEqual(CAMERA_BOUNDS.maxY);
        }
      }
    }
  });
});
