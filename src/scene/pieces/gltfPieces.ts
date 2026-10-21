import { Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from "three";
import type { AnimationClip, BufferGeometry, Group } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Color, PieceType } from "../../core/types";
import type { PieceModelProvider, PieceRig } from "./PieceModelProvider";
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
  skinned?: true;
  clips?: { idle?: string; attack?: string };
  hitTimeMs?: number;
  clipDurationMs?: number;
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
    if (entry.skinned === true && (!record(entry.clips) ||
      Object.values(entry.clips).some((name) => typeof name !== "string") ||
      typeof entry.hitTimeMs !== "number" || !Number.isFinite(entry.hitTimeMs) || entry.hitTimeMs < 0 ||
      typeof entry.clipDurationMs !== "number" || !Number.isFinite(entry.clipDurationMs) || entry.clipDurationMs < entry.hitTimeMs)) continue;
    pieces[type] = {
      file: entry.file, height: entry.height, footprint: entry.footprint,
      triangles: entry.triangles, fragmentColor: entry.fragmentColor,
      ...(entry.skinned === true ? { skinned: true, clips: entry.clips as ModelEntry["clips"], hitTimeMs: entry.hitTimeMs as number, clipDurationMs: entry.clipDurationMs as number } : {}),
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
  load?: (url: string) => Promise<{ scene: Group; animations?: AnimationClip[] }>; 
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
  // Processed models use EXT_meshopt_compression (scripts/models/process.mjs).
  load = (url) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url),
  fallback = createProceduralPieceProvider(),
  warn = (message, error) => console.warn(message, error),
}: LoadOptions = {}): Promise<PieceModelProvider> {
  const loaded = new Map<PieceType, {
    geometry: BufferGeometry;
    materials: Record<Color, MeshStandardMaterial>;
    fragments: Record<Color, MeshStandardMaterial>;
    rig?: PieceRig;
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
        const { scene, animations = [] } = await load(`/models/${entry.file}`);
        const meshes: Mesh[] = [];
        scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
        const mesh = meshes[0];
        if (meshes.length !== 1 || !mesh || !(mesh.material instanceof MeshStandardMaterial) ||
          mesh.geometry.groups.length > 1 || mesh.morphTargetInfluences?.length || (mesh instanceof SkinnedMesh) !== !!entry.skinned) {
          throw new Error("Expected one static mesh primitive with one PBR material");
        }
        scene.updateMatrixWorld(true);
        // Reject transforms that would make the mesh's local geometry differ from its visible frame.
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        let geometry = mesh.geometry;
        let rig: PieceRig | undefined;
        if (mesh instanceof SkinnedMesh) {
          // CPU skin once in the exported bind pose, in normalized world space.
          geometry = mesh.geometry.clone();
          const positions = geometry.getAttribute("position");
          const vertex = new Vector3();
          for (let i = 0; i < positions.count; i++) {
            mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
            positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
          }
          geometry.deleteAttribute("skinIndex"); geometry.deleteAttribute("skinWeight");
          geometry.computeVertexNormals();
          const find = (name?: string) => animations.find((clip) => clip.name === name);
          const idle = find(entry.clips?.idle), attack = find(entry.clips?.attack);
          if ((entry.clips?.idle && !idle) || (entry.clips?.attack && !attack)) throw new Error("Rig is missing a declared animation clip");
          if (attack && Math.abs(attack.duration * 1000 - entry.clipDurationMs!) > 2) throw new Error("Attack duration differs from manifest");
          rig = { scene, clips: { idle, attack }, hitTimeMs: entry.hitTimeMs!, clipDurationMs: entry.clipDurationMs! };
        } else if (mesh.matrixWorld.elements.some((value, i) => Math.abs(value - identity[i]!) > 1e-6)) throw new Error("Static mesh has unbaked transforms");
        if (!validateGeometry(geometry, entry)) throw new Error("Geometry violates normalized model bounds");
        const light = mesh.material;
        const fragment = new MeshStandardMaterial({ color: entry.fragmentColor, roughness: light.roughness, metalness: 0 });
        loaded.set(type, {
          geometry, rig,
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
    rig: (type) => loaded.get(type)?.rig ?? fallback.rig?.(type),
    material: (type, color) => loaded.get(type)?.materials[color] ?? fallback.material(type, color),
    fragmentMaterial: (type, color) => loaded.get(type)?.fragments[color] ?? fallback.fragmentMaterial(type, color),
  };
}
