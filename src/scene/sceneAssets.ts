import { loadProgress, loadTexture, track } from "../loading/assets";
import { resources } from "../loading/resource";
import { QUALITY_PRESETS, SKY, type GraphicsQuality } from "./environment/battlefieldConfig";
import { preloadEnvironment } from "./environment/environmentData";
import { stoneMapUrls } from "./environment/stoneMaterials";
import { loadPieceModels } from "./pieces/gltfPieces";
import type { PieceModelProvider } from "./pieces/PieceModelProvider";

/** Surfaces of the critical set: board slabs and border, plaza, terrain layers, ruins. */
const CRITICAL_SURFACES = [
  "marble_01", "marble_016", "sandstone_blocks_04",
  "floor_tiles_04", "aerial_grass_rock", "dry_ground_rocks", "rocks_ground_02", "worn_rock_natural_01",
];
export const CRITICAL_TEXTURES = [...CRITICAL_SURFACES.flatMap(stoneMapUrls), SKY.url];

const loadPieces = () => track("build:pieces", "critical", "build", () => loadPieceModels());

/** Suspends until the piece models (or the procedural fallback) are ready. */
export function usePieceModels(): PieceModelProvider {
  return resources.read("pieces", loadPieces);
}

/** Names one round of upload/compile bar items (a graphics change warms the scene again). */
export const warmPass = (quality: GraphicsQuality, round: number) => `${quality}-${round}`;

let started = false;

/**
 * Starts the whole critical set at once, before React mounts anything: textures, piece
 * models, the environment worker and the code-split effect chunks. Their bar items exist
 * from the first frame, so the progress never runs backwards when a later phase appears.
 * The secondary set (scanned nature) starts when the critical downloads are done.
 */
export function preloadCriticalScene(quality: GraphicsQuality) {
  if (started) return;
  started = true;
  const pass = warmPass(quality, 0);
  loadProgress.add(`upload:scene-${pass}`, { stage: "critical", phase: "upload" });
  loadProgress.add(`compile:scene-${pass}`, { stage: "critical", phase: "compile" });
  loadProgress.add(`compile:first-frame-${pass}`, { stage: "critical", phase: "compile" });
  const downloads = [
    ...CRITICAL_TEXTURES.map((url) => loadTexture(url, "critical")),
    resources.preload("pieces", loadPieces),
  ];
  void track("build:environment", "critical", "build", () => preloadEnvironment(quality)).catch(() => undefined);
  void track("build:effects", "critical", "build", () => import("./effects/DestructionLayer")).catch(() => undefined);
  if (QUALITY_PRESETS[quality].postprocessing) {
    void track("build:post", "critical", "build", () => import("./environment/BattlefieldPost")).catch(() => undefined);
  }
  void Promise.allSettled(downloads)
    .then(() => import("./environment/ScannedNature"))
    .then(({ preloadScannedNature }) => preloadScannedNature())
    .catch(() => undefined);
}
