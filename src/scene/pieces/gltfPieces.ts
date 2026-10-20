import { Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { BufferGeometry, Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Color, PieceType } from "../../core/types";
import type { PieceModelProvider } from "./PieceModelProvider";
import { createProceduralPieceProvider } from "./proceduralPieces";

const TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];
const TOLERANCE = 0.005;
const BASALT_MULTIPLIER = 0.04; // Linear color space: roughly #34343a against light stone.

export interface ModelEntry {
  file: string;
  height: number;
  footprint: number;
  triangles: number;
  fragmentColor: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ignore unknown types and malformed entries independently, permitting mixed sets. */
export function parseManifest(value: unknown): Partial<Record<PieceType, ModelEntry>> {
  if (!record(value) || value.version !== 1 || !record(value.pieces)) return {};
  const pieces: Partial<Record<PieceType, ModelEntry>> = {};
  for (const type of TYPES) {
    const entry = value.pieces[type];
    if (!record(entry) || entry.file !== `${type}.glb` ||
      typeof entry.height !== "number" || !Number.isFinite(entry.height) || entry.height <= 0 ||
      typeof entry.footprint !== "number" || !Number.isFinite(entry.footprint) || entry.footprint <= 0 || entry.footprint > 1 ||
      typeof entry.triangles !== "number" || !Number.isInteger(entry.triangles) || entry.triangles <= 0 ||
      typeof entry.fragmentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(entry.fragmentColor)) continue;
    pieces[type] = {
      file: entry.file, height: entry.height, footprint: entry.footprint,
      triangles: entry.triangles, fragmentColor: entry.fragmentColor,
    };
  }
  return pieces;
}

/** Bounds validate the normalized frame, not semantic facing (which needs visual review). */
export function validateGeometry(geometry: BufferGeometry, entry: ModelEntry): boolean {
  const positions = geometry.getAttribute("position");
  if (!positions || positions.count < 3) return false;
  for (let i = 0; i < positions.count; i++) {
    if (![positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)) return false;
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  return Math.abs(center.x) <= TOLERANCE && Math.abs(center.z) <= TOLERANCE &&
    Math.abs(bounds.min.y) <= TOLERANCE && Math.abs(size.y - entry.height) <= TOLERANCE &&
    size.x > 0 && size.z > 0 && Math.max(size.x, size.z) <= Math.min(1, entry.footprint) + TOLERANCE;
}

interface LoadOptions {
  fetch?: (url: string) => Promise<Pick<Response, "ok" | "json">>;
  load?: (url: string) => Promise<{ scene: Group }>;
  fallback?: PieceModelProvider;
  warn?: (message: string, error: unknown) => void;
}

function tinted(material: MeshStandardMaterial): MeshStandardMaterial {
  const dark = material.clone();
  dark.color.multiplyScalar(BASALT_MULTIPLIER);
  dark.roughness = Math.max(0, material.roughness - 0.1);
  return dark;
}

/** Optional assets must never prevent a playable game. Dependencies are injectable for synthetic tests. */
export async function loadPieceModels({
  fetch: fetchManifest = (url) => fetch(url, { headers: { Accept: "text/html, application/json" } }),
  load = (url) => new GLTFLoader().loadAsync(url),
  fallback = createProceduralPieceProvider(),
  warn = (message, error) => console.warn(message, error),
}: LoadOptions = {}): Promise<PieceModelProvider> {
  const loaded = new Map<PieceType, {
    geometry: BufferGeometry;
    materials: Record<Color, MeshStandardMaterial>;
    fragments: Record<Color, MeshStandardMaterial>;
  }>();
  try {
    // Vite's HTML fallback gives a quiet 200 when optional public assets are absent;
    // an actual JSON manifest still wins. Invalid JSON/404/network errors mean no models.
    const response = await fetchManifest("/models/manifest.json");
    if (!response.ok) return fallback;
    const entries = parseManifest(await response.json());
    await Promise.all(TYPES.map(async (type) => {
      const entry = entries[type];
      if (!entry) return;
      try {
        const { scene } = await load(`/models/${entry.file}`);
        const meshes: Mesh[] = [];
        scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
        const mesh = meshes[0];
        if (meshes.length !== 1 || !mesh || !(mesh.material instanceof MeshStandardMaterial) ||
          mesh.geometry.groups.length > 1 || mesh.morphTargetInfluences?.length || "isSkinnedMesh" in mesh) {
          throw new Error("Expected one static mesh primitive with one PBR material");
        }
        scene.updateMatrixWorld(true);
        // Reject transforms that would make the mesh's local geometry differ from its visible frame.
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        if (mesh.matrixWorld.elements.some((value, i) => Math.abs(value - identity[i]!) > 1e-6) ||
          !validateGeometry(mesh.geometry, entry)) throw new Error("Geometry violates normalized model bounds");
        const light = mesh.material;
        const fragment = new MeshStandardMaterial({ color: entry.fragmentColor, roughness: light.roughness, metalness: 0 });
        loaded.set(type, {
          geometry: mesh.geometry,
          materials: { w: light, b: tinted(light) },
          fragments: { w: fragment, b: tinted(fragment) },
        });
      } catch (error) {
        warn(`Could not load ${type} model; using procedural piece`, error);
      }
      return undefined;
    }));
  } catch {
    return fallback;
  }
  if (!loaded.size) return fallback;
  return {
    geometry: (type) => loaded.get(type)?.geometry ?? fallback.geometry(type),
    material: (type, color) => loaded.get(type)?.materials[color] ?? fallback.material(type, color),
    fragmentMaterial: (type, color) => loaded.get(type)?.fragments[color] ?? fallback.fragmentMaterial(type, color),
  };
}
