import { useTexture } from "@react-three/drei";
import { lazy, useEffect, useMemo, Suspense } from "react";
import { Object3D, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { QUALITY_PRESETS, SUN_LIGHT_ELEVATION_DEG, sunDirection, type GraphicsQuality } from "./battlefieldConfig";
import { DustMotes } from "./DustMotes";
import { installHeightFog } from "./heightFog";
import { buildPlaza, buildPlazaEdge, buildTerrain } from "./landscape";
import { buildRuins, ruinFootprints } from "./ruins";
import { placementFootprints, scatterLayout } from "./scatterLayout";
import { Sky } from "./Sky";
import { useStone } from "./stoneMaterials";
import { createTerrainMaterial } from "./terrainMaterial";
import { createTriplanarStone } from "./triplanar";

installHeightFog();

// The scanned props are the heaviest part of the scene: their code and GLBs load lazily,
// behind the setup menu, while the plaza, ruins and sky are already on screen.
const ScannedNature = lazy(() => import("./ScannedNature").then((module) => ({ default: module.ScannedNature })));

const PAVERS = { roughness: 0.9, envMapIntensity: 0.5, vertexColors: true } as const;
const SUN_DISTANCE = 45;
const SHADOW_EXTENT = 15;

function useDisposable<T extends { dispose: () => void }>(build: () => T): T {
  const value = useMemo(() => build(), [build]);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Tiling maps (diffuse sRGB, OpenGL normal, roughness) cloned so cached sources stay untouched. */
function useMaps(asset: string) {
  const sources = useTexture([`/environment/${asset}_diff.webp`, `/environment/${asset}_nor_gl.webp`, `/environment/${asset}_rough.webp`]);
  const maps = useMemo(() => {
    const [map, normalMap, roughnessMap] = sources.map((source, index) => {
      const texture = source.clone();
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 8;
      if (index === 0) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }) as [Texture, Texture, Texture];
    return { map, normalMap, roughnessMap };
  }, [sources]);
  useEffect(() => () => Object.values(maps).forEach((texture) => texture.dispose()), [maps]);
  return maps;
}

/** Terrain with worn soil around every ruin and scattered solid (the layout is quality-independent for solids). */
const buildGround = () => buildTerrain([...ruinFootprints(), ...placementFootprints(scatterLayout({ grassCount: 0, pebbleCount: 0, lodBias: 1, propDensity: 1 }))]);

function Ground() {
  const pavers = useStone("floor_tiles_04", 1, 1, "#d9cdb8", false, PAVERS);
  const grass = useMaps("aerial_grass_rock");
  const dirt = useMaps("dry_ground_rocks");
  const gravel = useMaps("rocks_ground_02");
  const rock = useMaps("worn_rock_natural_01");
  const ruinsStone = useMemo(() => createTriplanarStone(rock, 0.8, 0.45, { envMapIntensity: 0.6 }), [rock]);
  const ground = useMemo(() => createTerrainMaterial({ ...grass, tile: 5 }, { ...dirt, tile: 3.2 }, { ...gravel, tile: 2.4 }), [grass, dirt, gravel]);
  useEffect(() => () => { ruinsStone.dispose(); ground.dispose(); }, [ruinsStone, ground]);
  const ruins = useDisposable(buildRuins);
  const terrain = useDisposable(buildGround);
  const plaza = useDisposable(buildPlaza);
  const plazaEdge = useDisposable(buildPlazaEdge);
  return <group>
    <mesh geometry={terrain} material={ground} receiveShadow />
    <mesh geometry={plaza} material={pavers} receiveShadow />
    <mesh geometry={plazaEdge} material={ruinsStone} castShadow receiveShadow />
    <mesh geometry={ruins} material={ruinsStone} castShadow receiveShadow />
  </group>;
}

function Sun({ quality }: { quality: GraphicsQuality }) {
  const target = useMemo(() => new Object3D(), []);
  const position = useMemo(() => sunDirection(SUN_LIGHT_ELEVATION_DEG).map((value) => value * SUN_DISTANCE) as [number, number, number], []);
  const size = QUALITY_PRESETS[quality].shadowSize;
  return <>
    <primitive object={target} />
    {/* Keyed by size: three only allocates a shadow map once per light. */}
    <directionalLight key={size} position={position} target={target} color="#ffc68a" intensity={5.4} castShadow
      shadow-mapSize={[size, size]}
      shadow-camera-left={-SHADOW_EXTENT} shadow-camera-right={SHADOW_EXTENT}
      shadow-camera-top={SHADOW_EXTENT} shadow-camera-bottom={-SHADOW_EXTENT}
      shadow-camera-near={10} shadow-camera-far={90} shadow-bias={-0.0004} shadow-normalBias={0.03} />
    {/* Sunlit sand and stone bounce warm light up into the shade; the open sky stays cool. */}
    <hemisphereLight args={["#aebfd6", "#c4935e", 0.55]} />
    {/* Cool skylight from the open side keeps backlit obsidian readable. */}
    <directionalLight position={[12, 9, 16]} color="#a9bcd8" intensity={0.45} />
  </>;
}

/**
 * Outdoor battlefield among ancient ruins at sunset. The CC0 HDRI sky lights the scene
 * (ambient + reflections); a warm low sun aligned with the sky's sun casts long shadows;
 * height fog settles in the valleys and glows toward the sun.
 */
export function Battlefield({ quality }: { quality: GraphicsQuality }) {
  const preset = QUALITY_PRESETS[quality];
  const placements = useMemo(() => scatterLayout(preset), [preset]);
  return <>
    <fogExp2 attach="fog" args={["#cdb79a", 0.0036]} />
    <Suspense fallback={null}><Sky intensity={1} environmentIntensity={1} /></Suspense>
    <Sun quality={quality} />
    <Suspense fallback={null}><Ground /></Suspense>
    <Suspense fallback={null}><ScannedNature placements={placements} /></Suspense>
    <DustMotes count={preset.dustCount} />
  </>;
}
