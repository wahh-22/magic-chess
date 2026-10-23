import { Box3, AnimationMixer, PropertyBinding, Float32BufferAttribute, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from "three";
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { splitRigidParts, type RigidPart } from '../effects/pieceParts';
import type { AnimationClip, BufferGeometry, Group } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Color, PieceType } from "../../core/types";
import type { PieceAttack, PieceModelProvider, PieceRig } from "./PieceModelProvider";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createProceduralPieceProvider } from "./proceduralPieces";
import { loadGLB } from "../../loading/assets";

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
  clips?: { idle?: string; walk?: string; trot?: string; hit?: string; attack?: string; [role: string]: string | undefined };
  rig?: {
    clips: NonNullable<ModelEntry['clips']>;
    attacks: (Omit<PieceAttack, 'clip'> & { clip: string })[];
    /** Absent when the rig has no walk clip (the V8 knight's rigid mount only glides). */
    walkCycle?: { durationMs: number; strideBoardUnits: number };
    weaponTip: string;
  };
  hitTimeMs?: number;
  clipDurationMs?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ignore unknown types and malformed entries independently, permitting mixed sets. */
export function parseManifest(value: unknown): Partial<Record<PieceType, ModelEntry | { colors: Record<Color, ModelEntry> }>> {
  if (!record(value) || value.version !== 1 || !record(value.pieces)) return {};
  const pieces: Partial<Record<PieceType, ModelEntry | { colors: Record<Color, ModelEntry> }>> = {};
  for (const type of TYPES) {
    const entry = value.pieces[type];
    if (record(entry) && record(entry.colors)) {
      const colors: Partial<Record<Color, ModelEntry>> = {};
      for (const color of ['w', 'b'] as const) {
        const variant = entry.colors[color];
        if (!record(variant) || variant.file !== `${type}-${color}.glb`) continue;
        const parsed = parseManifest({ version: 1, pieces: { [type]: { ...variant, file: `${type}.glb` } } })[type];
        if (parsed && 'file' in parsed) colors[color] = { ...parsed, file: variant.file };
      }
      if (colors.w && colors.b) pieces[type] = { colors: colors as Record<Color, ModelEntry> };
      continue;
    }
    if (!record(entry) || entry.file !== `${type}.glb` ||
      typeof entry.height !== "number" || !Number.isFinite(entry.height) || entry.height <= 0 ||
      typeof entry.footprint !== "number" || !Number.isFinite(entry.footprint) || entry.footprint <= 0 || entry.footprint > 1 ||
      typeof entry.triangles !== "number" || !Number.isInteger(entry.triangles) || entry.triangles <= 0 ||
      typeof entry.fragmentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(entry.fragmentColor)) continue;
    if (entry.skinned === true && (!record(entry.clips) ||
      Object.values(entry.clips).some((name) => typeof name !== "string") ||
      typeof entry.hitTimeMs !== "number" || !Number.isFinite(entry.hitTimeMs) || entry.hitTimeMs < 0 ||
      typeof entry.clipDurationMs !== "number" || !Number.isFinite(entry.clipDurationMs) || entry.clipDurationMs < entry.hitTimeMs)) continue;
    if (entry.rig !== undefined) {
      const rig = entry.rig;
      const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
      const walkCycle = record(rig) ? rig.walkCycle : undefined;
      if (!record(rig) || !record(rig.clips) || Object.values(rig.clips).some(name => typeof name !== 'string') ||
        ((walkCycle !== undefined || rig.clips.walk !== undefined) && (!record(walkCycle) ||
          !finite(walkCycle.durationMs) || walkCycle.durationMs <= 0 ||
          !finite(walkCycle.strideBoardUnits) || walkCycle.strideBoardUnits <= 0)) ||
        typeof rig.weaponTip !== 'string' || !rig.weaponTip || !Array.isArray(rig.attacks) || !rig.attacks.length ||
        rig.attacks.some(a => !record(a) || typeof a.clip !== 'string' || rig.clips === null ||
          (rig.clips as Record<string, unknown>)[a.clip] !== a.clip ||
          ![a.durationMs, a.hitMs, a.activeEndMs, a.trailStartMs, a.trailEndMs].every(finite) ||
          (a.trailStartMs as number) > (a.hitMs as number) || (a.hitMs as number) > (a.activeEndMs as number) ||
          (a.activeEndMs as number) > (a.trailEndMs as number) || (a.trailEndMs as number) > (a.durationMs as number))) continue;
    }
    pieces[type] = {
      file: entry.file, height: entry.height, footprint: entry.footprint,
      triangles: entry.triangles, fragmentColor: entry.fragmentColor,
      ...(entry.skinned === true ? { skinned: true, clips: entry.clips as ModelEntry["clips"], ...(entry.rig ? { rig: entry.rig as ModelEntry['rig'] } : {}), hitTimeMs: entry.hitTimeMs as number, clipDurationMs: entry.clipDurationMs as number } : {}),
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

/** Keep the normalized full-piece bake for bounds; extract only the live visual. */
export function extractPedestal(scene: Group): PieceRig['pedestal'] {
  const node = scene.getObjectByName('piece-pedestal');
  if (!node) return undefined;
  scene.updateMatrixWorld(true);
  const height = new Box3().setFromObject(node).max.y;
  if (!Number.isFinite(height) || height <= 0) return undefined;
  const object = node.clone(true);
  object.matrix.copy(node.matrixWorld);
  object.matrixAutoUpdate = false;
  return { object, height, nodeName: node.name };
}

interface LoadOptions {
  fetch?: (url: string) => Promise<Pick<Response, "ok" | "json">>;
  load?: (url: string) => Promise<{ scene: Group; animations?: AnimationClip[] }>; 
  fallback?: PieceModelProvider;
  warn?: (message: string, error: unknown) => void;
}

/** Browser default: byte progress on the loading bar; one parse per file for the session. */
const loadGLTF: NonNullable<LoadOptions['load']> = typeof window === 'undefined'
  ? url => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)
  : url => loadGLB(url, 'critical');
/** Lets input and paint through between pieces: each bake is a few ms of CPU skinning. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const materialLibraries = new WeakMap<NonNullable<LoadOptions['load']>, Promise<Map<string, MeshStandardMaterial>>>();

function loadMaterialLibrary(load: NonNullable<LoadOptions['load']>) {
  let pending = materialLibraries.get(load);
  if (!pending) {
    pending = load('/models/arcana-materials.glb').then(library => {
      const materials = new Map<string, MeshStandardMaterial>();
      library.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof MeshStandardMaterial) materials.set(material.name, material);
        }
      });
      if (!materials.size) throw new Error('Empty shared material library');
      return materials;
    }).catch(error => {
      materialLibraries.delete(load); // Permit a later retry after an offline load.
      throw error;
    });
    materialLibraries.set(load, pending);
  }
  return pending;
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
  load = loadGLTF,
  fallback = createProceduralPieceProvider(),
  warn = (message, error) => console.warn(message, error),
}: LoadOptions = {}): Promise<PieceModelProvider> {
  const loaded = new Map<string, {
    geometry: BufferGeometry;
    materials: Record<Color, MeshStandardMaterial | MeshStandardMaterial[]>;
    fragments: Record<Color, MeshStandardMaterial>;
    rig?: PieceRig;
    /** Destruction parts are split on first use (or in idle time), not while loading. */
    parts?: () => Record<Color, RigidPart[]> | undefined;
  }>();
  try {
    // Vite's HTML fallback gives a quiet 200 when optional public assets are absent;
    // an actual JSON manifest still wins. Invalid JSON/404/network errors mean no models.
    const response = await fetchManifest("/models/manifest.json");
    if (!response.ok) return fallback;
    const manifest: unknown = await response.json();
    const entries = parseManifest(manifest);
    let shared = new Map<string, MeshStandardMaterial>();
    if (record(manifest) && manifest.materialLibrary !== undefined) {
      // A fixed local filename, never a manifest-provided remote URL or path.
      if (manifest.materialLibrary !== 'arcana-materials.glb') throw new Error('Invalid material library');
      shared = await loadMaterialLibrary(load);
    }
    await Promise.all(TYPES.map(async (type) => {
      const declaration = entries[type];
      if (!declaration) return;
      const variants = 'colors' in declaration ? Object.entries(declaration.colors) as [Color, ModelEntry][] : [[undefined, declaration] as const];
      await Promise.all(variants.map(async ([color, entry]) => {
      try {
        const { scene, animations = [] } = await load(`/models/${entry.file}`);
        await nextTask();
        const meshes: Mesh[] = [];
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          if (shared.size) {
            const assign = (material: import('three').Material) => {
              const replacement = shared.get(material.name);
              if (!replacement) throw new Error(`Missing shared material: ${material.name}`);
              return replacement;
            };
            object.material = Array.isArray(object.material) ? object.material.map(assign) : assign(object.material);
          }
          meshes.push(object);
        });
        const mesh = meshes[0];
        if (!mesh || (!color && meshes.length !== 1) || meshes.some((part) =>
          (Array.isArray(part.material) ? (!color || !part.material.length || part.material.some((m) => !(m instanceof MeshStandardMaterial))) : !(part.material instanceof MeshStandardMaterial)) ||
          (!color && part.geometry.groups.length > 1) || part.morphTargetInfluences?.length || (!entry.skinned && part instanceof SkinnedMesh))) {
          throw new Error("Expected normalized PBR mesh primitives");
        }
        scene.updateMatrixWorld(true);
        // Reject transforms that would make the mesh's local geometry differ from its visible frame.
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        let geometry = mesh.geometry;
        let rig: PieceRig | undefined;
        if (mesh instanceof SkinnedMesh || meshes.length > 1) {
          // CPU skin each material primitive once, in normalized bind-pose space.
          const baked = meshes.map((part) => {
            const result = part.geometry.clone();
            // Quantized normalized integers cannot hold baked coordinates > 1.
            const positions = new Float32BufferAttribute(new Float32Array(result.getAttribute('position').count * 3), 3);
            result.setAttribute('position', positions);
            const vertex = new Vector3();
            for (let i = 0; i < positions.count; i++) {
              part.getVertexPosition(i, vertex).applyMatrix4(part.matrixWorld);
              positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
            result.deleteAttribute('skinIndex'); result.deleteAttribute('skinWeight');
            return result;
          });
          geometry = baked.length === 1 ? baked[0]! : mergeGeometries(baked, true)!;
          if (!geometry) throw new Error('Incompatible material primitive attributes');
          geometry.computeVertexNormals();
        }
        if (mesh instanceof SkinnedMesh) {
          const find = (name?: string) => animations.find((clip) => clip.name === name);
          const idle = find(entry.clips?.idle), attack = find(entry.clips?.attack);
          const walk = find(entry.clips?.walk), trot = find(entry.clips?.trot), hit = find(entry.clips?.hit);
          if (Object.values(entry.clips ?? {}).some(name => !find(name))) throw new Error('Rig is missing a gameplay clip');
          const attacks = entry.rig?.attacks.map(item => {
            const clip = find(item.clip);
            if (!clip || Math.abs(clip.duration * 1000 - item.durationMs) > 2) throw new Error('Invalid attack variant');
            return { ...item, clip };
          });
          if ((entry.clips?.idle && !idle) || (entry.clips?.attack && !attack)) throw new Error("Rig is missing a declared animation clip");
          if (attack && Math.abs(attack.duration * 1000 - entry.clipDurationMs!) > 2) throw new Error("Attack duration differs from manifest");
          rig = { scene, pedestal: extractPedestal(scene), preserveMaterials: !!color, clips: { idle, walk, trot, hit, attack }, attacks, walkCycle: entry.rig?.walkCycle, weaponTip: entry.rig?.weaponTip ? PropertyBinding.sanitizeNodeName(entry.rig.weaponTip) : undefined, hitTimeMs: entry.hitTimeMs!, clipDurationMs: entry.clipDurationMs! };
        } else if (mesh.matrixWorld.elements.some((value, i) => Math.abs(value - identity[i]!) > 1e-6)) throw new Error("Static mesh has unbaked transforms");
        if (!validateGeometry(geometry, entry)) throw new Error(`Geometry violates normalized model bounds: ${JSON.stringify(geometry.boundingBox)}; expected ${entry.height} / ${entry.footprint}`);
        const materials = meshes.flatMap((part) => Array.isArray(part.material) ? part.material : [part.material]) as MeshStandardMaterial[];
        const light = materials.length === 1 ? materials[0]! : materials;
        const fragment = new MeshStandardMaterial({ color: entry.fragmentColor, roughness: materials[0]!.roughness, metalness: 0 });
        // Use a private clone: sampling idle must not alter the live rig or collider bake.
        let split: Record<Color, RigidPart[]> | null | undefined;
        const parts = rig ? () => {
          if (split !== undefined) return split ?? undefined;
          const rest = cloneSkeleton(scene);
          const mixer = new AnimationMixer(rest);
          // Preserve the bind frame used by colliders, including pedestal placement.
          // Runtime idle is sampled independently on the live clone.
          rest.updateMatrixWorld(true);
          const rigidMeshes: SkinnedMesh[] = [];
          rest.traverse((object) => { if (object instanceof SkinnedMesh) rigidMeshes.push(object); });
          const armor = splitRigidParts(rigidMeshes);
          mixer.stopAllAction(); mixer.uncacheRoot(rest);
          split = armor ? { w: armor, b: color ? armor : armor.map((part) => ({ ...part, materials: part.materials.map((material) => tinted(material as MeshStandardMaterial)) })) } : null;
          return split ?? undefined;
        } : undefined;
        loaded.set(color ? `${type}-${color}` : type, {
          geometry, rig, parts,
          materials: { w: light, b: color ? light : tinted(materials[0]!) },
          fragments: { w: fragment, b: color ? fragment : tinted(fragment) },
        });
      } catch (error) {
        warn(`Could not load ${type} model; using procedural piece`, error);
      }
      }));
      return undefined;
    }));
  } catch {
    return fallback;
  }
  if (!loaded.size) return fallback;
  return {
    geometry: (type, color = 'w') => (loaded.get(`${type}-${color}`) ?? loaded.get(type))?.geometry ?? fallback.geometry(type, color),
    parts: (type, color = 'w') => (loaded.get(`${type}-${color}`) ?? loaded.get(type))?.parts?.()?.[color] ?? fallback.parts?.(type, color),
    rig: (type, color = 'w') => (loaded.get(`${type}-${color}`) ?? loaded.get(type))?.rig ?? fallback.rig?.(type, color),
    material: (type, color) => (loaded.get(`${type}-${color}`) ?? loaded.get(type))?.materials[color] ?? fallback.material(type, color),
    fragmentMaterial: (type, color) => (loaded.get(`${type}-${color}`) ?? loaded.get(type))?.fragments[color] ?? fallback.fragmentMaterial(type, color),
  };
}
