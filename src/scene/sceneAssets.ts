import { loadProgress, loadTexture, track } from "../loading/assets";
import { scenePrefetchList } from "../loading/prefetch";
import { resources } from "../loading/resource";
import { prefetched } from "../loading/state";
import { QUALITY_PRESETS, SKY, type GraphicsQuality } from "./environment/battlefieldConfig";
import { preloadEnvironment } from "./environment/environmentData";
import { SCANNED_MODELS } from "./environment/scatterLayout";
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

/** Scanned nature models (the secondary set); same paths as ScannedNature loads. */
const SECONDARY_MODELS = Object.values(SCANNED_MODELS).map(({ id }) => `/environment/models/${id}.glb`);
/** Stockfish (scripts/copy-stockfish.mjs): its worker loads them itself, from the HTTP cache once warmed. */
const ENGINE_FILES = ["/stockfish/stockfish-19-lite-single.js", "/stockfish/stockfish-19-lite-single.wasm"];

let prefetching = false;

/**
 * Behind the title menu: downloads the match's bytes at low priority (Stockfish, critical
 * textures and models, then the secondary set) without decoding or touching the GPU; the
 * loading after Start takes them from the prefetch cache. Skipped when the player asked the
 * browser to save data.
 */
export async function prefetchSceneBytes() {
  if (prefetching || started) return;
  prefetching = true;
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  prefetched.warm(ENGINE_FILES);
  const manifest: unknown = await fetch("/models/manifest.json", { priority: "low", headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);
  // Start pressed meanwhile: the loader is already fetching everything itself.
  if (started) return;
  prefetched.prefetch(scenePrefetchList(manifest, CRITICAL_TEXTURES, SECONDARY_MODELS));
}
