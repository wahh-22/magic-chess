import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { ALL_SQUARES, squareToWorld } from "../coords";
import { squareAt } from "../Board";
import {
  BOARD_HALF, BORDER_WIDTH, CAMERA_BOUNDS, CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_MAX_POLAR, CAMERA_MIN_DISTANCE,
  CAMERA_TARGET, DEFAULT_CAMERA, PLAZA_Y, parseQuality, QUALITY_PRESETS, RUINS_INNER_RADIUS, SKY,
  SUN_LIGHT_ELEVATION_DEG, sunDirection,
} from "./battlefieldConfig";
import { buildRuins, COLONNADE } from "./ruins";
import { terrainHeight } from "./landscape";
import { onPaving, scatterLayout, TALL_MIN_RADIUS, type Placement } from "./scatterLayout";

const TREES = new Set<Placement["model"]>(["oliveTall", "oliveGnarled"]);
const GROUND_COVER = new Set<Placement["model"]>(["grassDry", "grassGreen", "pebbles", "rock", "stone"]);

function orbitPoses(step = 0.05) {
  const poses: Vector3[] = [];
  for (const distance of [CAMERA_MIN_DISTANCE, (CAMERA_MIN_DISTANCE + CAMERA_MAX_DISTANCE) / 2, CAMERA_MAX_DISTANCE]) {
    for (let polar = 0; polar <= CAMERA_MAX_POLAR + 1e-9; polar += step) {
      for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += step) {
        poses.push(new Vector3(
          CAMERA_TARGET[0] + distance * Math.sin(polar) * Math.sin(azimuth),
          CAMERA_TARGET[1] + distance * Math.cos(polar),
          CAMERA_TARGET[2] + distance * Math.sin(polar) * Math.cos(azimuth),
        ));
      }
    }
  }
  return poses;
}

function defaultCamera() {
  return cameraAt(DEFAULT_CAMERA, CAMERA_TARGET);
}
// A low orbit the player can reach (and the old play view): sky, sun and colonnade fill the top.
const LOW_ORBIT: [number, number, number] = [0, 4.5, 10.3];
const LOW_ORBIT_TARGET: [number, number, number] = [0, 1, -1.7];
function cameraAt(position: [number, number, number], target: [number, number, number]) {
  const camera = new PerspectiveCamera(CAMERA_FOV, 1280 / 800, 0.05, 1200);
  camera.position.fromArray(position);
  camera.lookAt(new Vector3(...target));
  camera.updateMatrixWorld();
  return camera;
}

describe("battlefield presentation contract", () => {
  it("defaults invalid or absent saved quality to high", () => {
    expect(parseQuality(null)).toBe("high");
    expect(parseQuality("invalid")).toBe("high");
    expect(parseQuality("high")).toBe("high");
    expect(parseQuality("low")).toBe("low");
  });
  it("keeps the low preset cheap: no post stack or god rays, fewer motes and props, lighter LODs, smaller shadows and pixels", () => {
    expect(QUALITY_PRESETS.high.postprocessing).toBe(true);
    expect(QUALITY_PRESETS.low.postprocessing).toBe(false);
    expect(QUALITY_PRESETS.high.godRays).toBe(true);
    expect(QUALITY_PRESETS.low.godRays).toBe(false);
    expect(QUALITY_PRESETS.low.dustCount).toBeLessThan(QUALITY_PRESETS.high.dustCount);
    expect(QUALITY_PRESETS.low.grassCount).toBeLessThan(QUALITY_PRESETS.high.grassCount);
    expect(QUALITY_PRESETS.low.propDensity).toBeLessThan(QUALITY_PRESETS.high.propDensity);
    expect(QUALITY_PRESETS.low.lodBias).toBeLessThan(QUALITY_PRESETS.high.lodBias);
    expect(QUALITY_PRESETS.low.shadowSize).toBeLessThan(QUALITY_PRESETS.high.shadowSize);
    expect(QUALITY_PRESETS.low.dpr).toBeLessThan(QUALITY_PRESETS.high.dpr);
    const high = scatterLayout(QUALITY_PRESETS.high), low = scatterLayout(QUALITY_PRESETS.low);
    expect(low.length).toBeLessThan(high.length / 3);
    const meanLod = (list: Placement[]) => {
      const trees = list.filter((p) => TREES.has(p.model));
      return trees.reduce((sum, p) => sum + p.lod, 0) / trees.length;
    };
    expect(meanLod(low)).toBeGreaterThan(meanLod(high));
  });
  it("aims the low sunset light along the HDRI's baked sun, behind Black's ranks", () => {
    const sky = new Vector3(...sunDirection());
    const light = new Vector3(...sunDirection(SUN_LIGHT_ELEVATION_DEG));
    expect(sky.length()).toBeCloseTo(1);
    // three's equirect lookup u = atan2(z, x) / 2π + 0.5 must land on the baked sun column.
    expect(Math.atan2(sky.z, sky.x) / (Math.PI * 2) + 0.5).toBeCloseTo(SKY.sunU, 6);
    expect(Math.atan2(light.z, light.x)).toBeCloseTo(Math.atan2(sky.z, sky.x), 6);
    expect(SUN_LIGHT_ELEVATION_DEG).toBeGreaterThan(SKY.sunElevationDeg);
    expect(SUN_LIGHT_ELEVATION_DEG).toBeLessThan(20);
    expect(light.z).toBeLessThan(0);
  });
  it("keeps every permitted orbit above the plaza and inside the ring of ruins", () => {
    for (const pose of orbitPoses()) {
      expect(Math.hypot(pose.x, pose.z)).toBeLessThanOrEqual(CAMERA_BOUNDS.radius + 1e-9);
      expect(pose.y).toBeGreaterThanOrEqual(CAMERA_BOUNDS.minY);
      expect(pose.y).toBeGreaterThan(terrainHeight(pose.x, pose.z) + 0.5);
      expect(pose.y).toBeLessThanOrEqual(CAMERA_BOUNDS.maxY);
    }
    const distance = new Vector3(...DEFAULT_CAMERA).distanceTo(new Vector3(...CAMERA_TARGET));
    expect(distance).toBeGreaterThan(CAMERA_MIN_DISTANCE);
    expect(distance).toBeLessThan(CAMERA_MAX_DISTANCE);
  });
  it("puts every tall ruin and scanned prop outside the camera cylinder; only low rubble and ground cover come closer", () => {
    const position = buildRuins().attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      expect(radius).toBeGreaterThan(BOARD_HALF + BORDER_WIDTH + 6);
      if (position.getY(i) > PLAZA_Y + 0.7) expect(radius).toBeGreaterThanOrEqual(RUINS_INNER_RADIUS - 0.01);
      expect(radius > CAMERA_BOUNDS.radius || position.getY(i) < 1).toBe(true);
    }
    const placements = scatterLayout(QUALITY_PRESETS.high);
    expect(placements.filter((p) => TREES.has(p.model)).length).toBeGreaterThan(60);
    expect(TALL_MIN_RADIUS).toBeGreaterThan(CAMERA_BOUNDS.radius);
    for (const p of placements) {
      const radius = Math.hypot(p.x, p.z);
      if (TREES.has(p.model)) expect(radius).toBeGreaterThan(RUINS_INNER_RADIUS + 4);
      if (radius <= CAMERA_BOUNDS.radius + 0.5) expect(PLAZA_Y + p.size * (1 - p.sink)).toBeLessThan(1);
      if (p.size > 0.7) expect(radius).toBeGreaterThanOrEqual(TALL_MIN_RADIUS);
    }
  });
  it("scatters ground cover deterministically, off the intact paving and away from the board", () => {
    const placements = scatterLayout(QUALITY_PRESETS.high);
    expect(placements).toEqual(scatterLayout(QUALITY_PRESETS.high));
    const grass = placements.filter((p) => p.model === "grassDry" || p.model === "grassGreen");
    expect(grass.length).toBeGreaterThan(QUALITY_PRESETS.high.grassCount * 0.9);
    for (const p of placements) {
      if (!GROUND_COVER.has(p.model)) continue;
      expect(onPaving(p.x, p.z)).toBe(false);
      expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(BOARD_HALF + BORDER_WIDTH + 6);
    }
  });
  it("switches scanned trees to lighter LODs with distance", () => {
    const trees = scatterLayout(QUALITY_PRESETS.high).filter((p) => TREES.has(p.model))
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (let i = 1; i < trees.length; i++) expect(trees[i]!.lod).toBeGreaterThanOrEqual(trees[i - 1]!.lod);
    expect(new Set(trees.map((p) => p.lod))).toEqual(new Set([0, 1, 2]));
  });
  it("keeps the ground flat where the plaza and ruins stand, rising into hills far away", () => {
    for (let radius = 0; radius <= RUINS_INNER_RADIUS + 8; radius += 0.5) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
        const height = terrainHeight(Math.cos(angle) * radius, Math.sin(angle) * radius);
        expect(height).toBeLessThan(PLAZA_Y + 0.1);
        expect(height).toBeGreaterThan(PLAZA_Y - 0.1);
      }
    }
    expect(terrainHeight(0, -150)).toBeGreaterThan(PLAZA_Y + 1);
  });
  it("shows sky above the ruins and sets the sun just behind the temple entablature from a low orbit", () => {
    const camera = cameraAt(LOW_ORBIT, LOW_ORBIT_TARGET);
    const eye = new Vector3(...LOW_ORBIT);
    // The low orbit is a permitted pose.
    const offset = eye.clone().sub(new Vector3(...LOW_ORBIT_TARGET));
    expect(offset.length()).toBeLessThanOrEqual(CAMERA_MAX_DISTANCE);
    expect(Math.acos(offset.y / offset.length())).toBeLessThanOrEqual(CAMERA_MAX_POLAR);
    const horizon = eye.clone().add(new Vector3(0, 0, -1000)).project(camera);
    expect(horizon.y).toBeGreaterThan(0.3);
    expect(horizon.y).toBeLessThan(0.8);
    // The sun's line of sight crosses the colonnade plane between standing columns, above their capitals.
    const sun = new Vector3(...sunDirection());
    const crossing = eye.clone().addScaledVector(sun, (COLONNADE[0]!.z - eye.z) / sun.z);
    expect(crossing.x).toBeGreaterThan(-12);
    expect(crossing.x).toBeLessThan(-3);
    expect(crossing.y).toBeGreaterThan(PLAZA_Y + 0.84 + 7.2);
    expect(crossing.y).toBeLessThan(PLAZA_Y + 0.84 + 7.2 + 2.4);
    expect(SKY.sunU).not.toBe(SKY.bakedSunU);
  });
  it("frames the whole carved board and the rear kings at 1280 by 800", () => {
    const camera = defaultCamera();
    const edge = BOARD_HALF + BORDER_WIDTH;
    for (const x of [-edge, edge]) {
      for (const z of [-edge, edge]) {
        const projected = new Vector3(x, 0.04, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.96);
        expect(Math.abs(projected.y)).toBeLessThan(0.96);
      }
      const head = new Vector3(x, 1.3, -3.5).project(camera);
      expect(Math.abs(head.y)).toBeLessThan(0.96);
    }
    // The near edge spans most of the width: a playable board, not a distant diorama.
    expect(new Vector3(edge, 0, edge).project(camera).x).toBeGreaterThan(0.7);
    // The colonnade is framed from a low orbit (see the sky test); the play view keeps
    // the board large and every pawn clickable (L13 playability fix).
  });
  // Playability: from the default view every White pawn's upper body is visible above the
  // back rank (the smoke test clicked e2 and hit the king on e1 with a 29° camera). Pieces are
  // approximated by their body cylinders (radius 0.3) at their shipped heights.
  it("shows every second-rank pawn's upper body above the back-rank pieces in the play view", () => {
    const eye = new Vector3(...DEFAULT_CAMERA);
    const heights: Record<string, number> = { p: 0.8, n: 0.94, b: 1.08, r: 1.0, q: 1.16, k: 1.24 };
    const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
    const radius = 0.3;
    for (let file = 0; file < 8; file++) {
      const [x, z] = squareToWorld(`${"abcdefgh"[file]}2` as never);
      const head = new Vector3(x, heights.p! * 0.7, z);
      for (let other = 0; other < 8; other++) {
        const [bx, bz] = squareToWorld(`${"abcdefgh"[other]}1` as never);
        // Sample the ray between the eye and the pawn head; it must clear every back-rank cylinder.
        for (let t = 0; t <= 1; t += 0.002) {
          const point = eye.clone().lerp(head, t);
          if (Math.hypot(point.x - bx, point.z - bz) < radius) expect(point.y).toBeGreaterThan(heights[backRank[other]!]!);
        }
      }
    }
  });
  it("resolves every square from a point on its slab", () => {
    for (const square of ALL_SQUARES) {
      const [x, z] = squareToWorld(square);
      expect(squareAt(x, z)).toBe(square);
      expect(squareAt(x + 0.45, z - 0.45)).toBe(square);
      expect(squareAt(x - 0.45, z + 0.45)).toBe(square);
    }
  });
});
