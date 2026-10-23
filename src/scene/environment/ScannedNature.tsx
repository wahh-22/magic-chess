import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry, CanvasTexture, Euler, InstancedBufferAttribute, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3,
  type InstancedMesh, type Material, type MeshBasicMaterial, type MeshStandardMaterial,
} from "three";
import { loadGLB, sceneLoader, useGLB } from "../../loading/assets";
import { StreamIn } from "../StreamIn";
import { QUALITY_PRESETS, type GraphicsQuality } from "./battlefieldConfig";
import { usePlacements } from "./environmentData";
import { terrainHeight } from "./landscape";
import { applyReveal } from "./reveal";
import { ruinFootprints } from "./ruins";
import { placementFootprints, SCANNED_MODELS, type Placement, type ScannedModel } from "./scatterLayout";
import { applyFoliage, applyStoneTone, windTime, type FoliageOptions } from "./wind";

const url = (model: ScannedModel) => `/environment/models/${SCANNED_MODELS[model].id}.glb`;

/** Dither fade of every scanned material while the props stream in (see StreamIn). */
const natureReveal = { value: 0 };
const fadeNature = (amount: number) => { natureReveal.value = amount; };
const natureShown = () => sceneLoader.getState().secondaryLoaded();

/** How each scanned model moves and is tinted; rocks stay still. */
const FOLIAGE: Partial<Record<ScannedModel, FoliageOptions>> = {
  oliveTall: { sway: 0.012, dryness: 0.12 },
  oliveGnarled: { sway: 0.012, dryness: 0.12 },
  maquis: { sway: 0.035, dryness: 0.2 },
  dryBush: { sway: 0.05, dryness: 0.3 },
  grassGreen: { sway: 0.22, dryness: 0.72 },
  grassDry: { sway: 0.22, dryness: 0.45 },
};
/** Saturation kept for each scanned rock (desert scans → pale Mediterranean stone). */
const STONE_TONE: Partial<Record<ScannedModel, number>> = {
  boulderPile: 0.4, boulder: 0.3, slab: 0.7, rock: 0.45, stone: 0.4, pebbles: 0.5,
};
/** Only detailed (LOD0) instances of these cast shadows: the far ones are outside the sun's shadow box anyway. */
const CASTS_SHADOW = new Set<ScannedModel>(["boulderPile", "boulder", "slab", "rock", "oliveTall", "oliveGnarled"]);

interface Part { geometry: BufferGeometry; material: Material; matrix: Matrix4 }
interface Variant { height: number; parts: Part[] }

/** Variants × LODs of one GLB: node extras carry { variant, lod, height } from the pipeline. */
function useVariants(model: ScannedModel) {
  // No Draco (the pipeline uses meshopt, decoded in workers), so no decoder is ever fetched from a CDN.
  const gltf = useGLB(url(model), "secondary");
  return useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const table = new Map<string, Variant>();
    for (const node of gltf.scene.children) {
      const { variant, lod, height } = node.userData as { variant?: number; lod?: number; height?: number };
      if (variant === undefined || lod === undefined || !height) continue;
      const parts: Part[] = [];
      node.traverse((object) => {
        if (object instanceof Mesh) parts.push({ geometry: object.geometry, material: object.material as Material, matrix: object.matrixWorld.clone() });
      });
      table.set(`${variant}:${lod}`, { height, parts });
    }
    const foliage = FOLIAGE[model];
    if (foliage) for (const variant of table.values()) for (const part of variant.parts) applyFoliage(part.material, foliage);
    const tone = STONE_TONE[model];
    if (tone !== undefined) for (const variant of table.values()) for (const part of variant.parts) applyStoneTone(part.material, tone);
    for (const variant of table.values()) {
      for (const part of variant.parts) {
        (part.material as MeshStandardMaterial).envMapIntensity = 0.55;
        applyReveal(part.material, natureReveal);
      }
    }
    return table;
  }, [gltf, model]);
}

const up = new Vector3(0, 1, 0);

function placementMatrix(placement: Placement, height: number, target: Matrix4) {
  const scale = placement.size / height;
  const tilt = new Quaternion().setFromEuler(new Euler(placement.tilt[0], 0, placement.tilt[1]));
  const rotation = tilt.multiply(new Quaternion().setFromAxisAngle(up, placement.yaw));
  const ground = terrainHeight(placement.x, placement.z) - placement.sink * placement.size;
  return target.compose(new Vector3(placement.x, ground, placement.z), rotation, new Vector3(scale, scale, scale));
}

/** One instanced draw call per primitive of a variant/LOD; foliage gets per-instance wind roots. */
function InstancedPart({ part, placements, height, foliage, castShadow }: {
  part: Part; placements: Placement[]; height: number; foliage: boolean; castShadow: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  // Own geometry wrapper (shared attribute buffers) so the per-instance root attribute is ours.
  const geometry = useMemo(() => {
    const wrapper = new BufferGeometry();
    for (const [name, attribute] of Object.entries(part.geometry.attributes)) wrapper.setAttribute(name, attribute);
    wrapper.setIndex(part.geometry.index);
    if (foliage) {
      const roots = new Float32Array(placements.length * 4);
      placements.forEach((placement, index) => {
        roots.set([placement.x, terrainHeight(placement.x, placement.z) - placement.sink * placement.size, placement.z, placement.size], index * 4);
      });
      wrapper.setAttribute("windRoot", new InstancedBufferAttribute(roots, 4));
    }
    return wrapper;
  }, [part, placements, foliage]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new Matrix4();
    placements.forEach((placement, index) => {
      placementMatrix(placement, height, matrix).multiply(part.matrix);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [placements, height, part]);
  return <instancedMesh ref={mesh} args={[geometry, part.material, placements.length]} castShadow={castShadow} receiveShadow raycast={() => null} />;
}

function ScannedModelInstances({ model, placements }: { model: ScannedModel; placements: Placement[] }) {
  const variants = useVariants(model);
  const groups = useMemo(() => {
    const byKey = new Map<string, Placement[]>();
    for (const placement of placements) {
      const key = `${placement.variant}:${placement.lod}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(placement);
    }
    return [...byKey.entries()].flatMap(([key, items]) => {
      const variant = variants.get(key);
      return variant ? [{ key, items, variant }] : [];
    });
  }, [placements, variants]);
  return <>
    {groups.flatMap(({ key, items, variant }) => variant.parts.map((part, index) => (
      <InstancedPart key={`${key}:${index}`} part={part} placements={items} height={variant.height}
        foliage={Boolean(FOLIAGE[model])} castShadow={CASTS_SHADOW.has(model) && items[0]!.lod === 0} />
    )))}
  </>;
}

function shadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(0,0,0,0.62)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.38)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/**
 * Soft contact shade where props and ruins meet the ground (ambient occlusion the sky light
 * cannot produce on its own); works on both quality presets, N8AO refines it on high.
 */
function ContactShade({ footprints }: { footprints: [number, number, number][] }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  // Already transparent: it fades in with the props through its opacity (no recompile).
  useFrame(() => { if (material.current) material.current.opacity = natureReveal.value; });
  const texture = useMemo(() => shadeTexture(), []);
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useEffect(() => () => { texture.dispose(); geometry.dispose(); }, [texture, geometry]);
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new Matrix4(), rotation = new Quaternion();
    footprints.forEach(([x, z, radius], index) => {
      const size = radius * 2.6;
      matrix.compose(new Vector3(x, terrainHeight(x, z) + 0.015, z), rotation, new Vector3(size, 1, size));
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [footprints]);
  return <instancedMesh ref={mesh} args={[geometry, undefined, footprints.length]} renderOrder={-1} raycast={() => null}>
    <meshBasicMaterial ref={material} map={texture} color="#000000" transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
  </instancedMesh>;
}

/**
 * Photoscanned CC0 nature (Poly Haven): olive trees with a far LOD tree line, maquis and dry
 * bushes, wind-swept grass, embedded boulders, rocks and pebbles. The secondary stage: it
 * streams in after the board is on screen (scatter layout built in a worker), is prepared
 * hidden, then fades in; each variant/LOD/primitive is one instanced draw call.
 */
export function ScannedNature({ quality }: { quality: GraphicsQuality }) {
  const placements = usePlacements(quality);
  return <StreamIn key={quality} id={`nature-${quality}`} onFade={fadeNature} onShown={natureShown} postprocessing={QUALITY_PRESETS[quality].postprocessing}>
    <NatureInstances placements={placements} />
  </StreamIn>;
}

function NatureInstances({ placements }: { placements: Placement[] }) {
  const byModel = useMemo(() => {
    const map = new Map<ScannedModel, Placement[]>();
    for (const placement of placements) {
      if (!map.has(placement.model)) map.set(placement.model, []);
      map.get(placement.model)!.push(placement);
    }
    return [...map.entries()];
  }, [placements]);
  const footprints = useMemo(() => [...ruinFootprints(), ...placementFootprints(placements).filter(([x, z]) => Math.hypot(x, z) < 70)], [placements]);
  useFrame(({ clock }) => { windTime.value = clock.elapsedTime; });
  return <>
    {byModel.map(([model, items]) => <ScannedModelInstances key={model} model={model} placements={items} />)}
    <ContactShade footprints={footprints} />
  </>;
}

/** Starts the secondary downloads (after the critical ones, so they do not compete for bandwidth). */
export function preloadScannedNature() {
  for (const model of Object.keys(SCANNED_MODELS) as ScannedModel[]) void loadGLB(url(model), "secondary").catch(() => undefined);
}
