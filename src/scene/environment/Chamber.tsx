import { Environment, Lightformer, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BoxGeometry, CanvasTexture, CylinderGeometry, Matrix4, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TorusGeometry, type BufferGeometry, type Group, type PointLight, type Points } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAMERA_KEEP_OUT, DAIS, PILLARS, QUALITY_PRESETS, torchFlicker, WALL_DISTANCE, type GraphicsQuality } from "./chamberConfig";

function useStone(asset: string, repeatX: number, repeatY: number) {
  const maps = useTexture([
    `/environment/${asset}_diff.webp`, `/environment/${asset}_nor_gl.webp`, `/environment/${asset}_rough.webp`,
  ]);
  const material = useMemo(() => {
    const [map, normalMap, roughnessMap] = maps.map((original, index) => {
      const texture = original.clone();
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = 4;
      if (index === 0) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    return new MeshStandardMaterial({ map, normalMap, roughnessMap, color: "#a4a5aa", roughness: 1 });
  }, [maps, repeatX, repeatY]);
  useEffect(() => () => {
    material.map?.dispose(); material.normalMap?.dispose(); material.roughnessMap?.dispose(); material.dispose();
  }, [material]);
  return material;
}

// Box UVs in world units: thin risers must not squeeze four full texture tiles vertically.
function stoneBoxUV(geometry: BoxGeometry) {
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const uv = geometry.attributes.uv!;
  for (let index = 0; index < position.count; index++) {
    const horizontal = Math.abs(normal.getX(index)) > 0.5 ? position.getZ(index) : position.getX(index);
    const vertical = Math.abs(normal.getY(index)) > 0.5 ? position.getZ(index) : position.getY(index);
    uv.setXY(index, horizontal / 3, vertical / 3);
  }
  uv.needsUpdate = true;
}

// Static masonry is one draw call, not hundreds of individual arch stones.
function buildMasonry() {
  const blocks: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, matrix: Matrix4) => { blocks.push(geometry.applyMatrix4(matrix)); };
  const translate = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
  const chord = 44 * Math.sin(Math.PI / 12);
  PILLARS.forEach(({ x, z, angle }, index) => {
    const base = translate(x, -1.35, z).multiply(new Matrix4().makeRotationY(angle));
    add(new BoxGeometry(1.8, 0.8, 1.8), base.clone().multiply(translate(0, 0.4, 0)));
    add(new CylinderGeometry(0.55, 0.7, 4.8, 10), base.clone().multiply(translate(0, 3.2, 0)));
    add(new BoxGeometry(1.6, 0.6, 1.6), base.clone().multiply(translate(0, 5.8, 0)));
    add(new BoxGeometry(1.45, 0.35, 1.45), base.clone().multiply(translate(0, 1, 0)));
    const next = PILLARS[(index + 1) % PILLARS.length]!;
    const arch = translate((x + next.x) / 2, 4.75, (z + next.z) / 2).multiply(new Matrix4().makeRotationY(angle + Math.PI / 12));
    for (let block = 0; block < 17; block++) {
      const theta = (block + 0.5) / 17 * Math.PI;
      add(new BoxGeometry(chord * Math.PI / 34 * 0.96, 0.65, 1), arch.clone()
        .multiply(translate(Math.cos(theta) * chord / 2, Math.sin(theta) * chord / 2, 0))
        .multiply(new Matrix4().makeRotationZ(theta - Math.PI / 2)));
    }
  });
  for (let index = 0; index < 6; index++) {
    add(new TorusGeometry(21.2, 0.23, 5, 40, Math.PI), translate(0, 13.5, 0).multiply(new Matrix4().makeRotationY(index * Math.PI / 6)));
  }
  const merged = mergeGeometries(blocks)!;
  blocks.forEach((geometry) => geometry.dispose());
  return merged;
}

function StoneHall() {
  const floor = useStone("stone_floor", 16, 16);
  const wall = useStone("stone_wall_02", 12, 3);
  const pillar = useStone("stone_wall_02", 1, 3);
  const steps = useStone("stone_floor", 1, 1);
  const masonry = useMemo(() => buildMasonry(), []);
  useEffect(() => () => masonry.dispose(), [masonry]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.36, 0]} receiveShadow material={floor}>
        <planeGeometry args={[60, 60]} />
      </mesh>
      {DAIS.map(({ width, height, y }) => (
        <mesh key={width} position={[0, y, 0]} material={steps} receiveShadow>
          <boxGeometry args={[width, height, width]} onUpdate={stoneBoxUV} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((side) => (
        <group key={side} rotation-y={side * Math.PI / 2}>
          <mesh position={[0, 5.5, -WALL_DISTANCE]} material={wall} receiveShadow>
            <boxGeometry args={[53, 14, 0.8]} />
          </mesh>
          <mesh position={[0, -0.65, -WALL_DISTANCE + 0.5]} material={pillar}>
            <boxGeometry args={[53, 1.3, 0.6]} />
          </mesh>
        </group>
      ))}
      <mesh geometry={masonry} material={pillar} />
    </group>
  );
}

function makeGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,248,205,1)");
  gradient.addColorStop(0.22, "rgba(255,180,60,0.9)");
  gradient.addColorStop(0.5, "rgba(255,80,8,0.3)");
  gradient.addColorStop(1, "rgba(255,40,0,0)");
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

function Torches({ quality }: { quality: GraphicsQuality }) {
  const glow = useMemo(() => makeGlow(), []);
  const lights = useRef<(PointLight | null)[]>([]);
  const flames = useRef<(Group | null)[]>([]);
  useEffect(() => () => glow.dispose(), [glow]);
  useFrame(({ clock }) => {
    lights.current.forEach((light, index) => {
      const flicker = torchFlicker(clock.elapsedTime, index);
      if (light) light.intensity = 95 * flicker;
    });
    flames.current.forEach((flame, index) => {
      const flicker = torchFlicker(clock.elapsedTime, index);
      flame?.scale.set(0.8 + flicker * 0.2, flicker, 1);
    });
  });
  return PILLARS.map(({ x, z }, index) => (
    <group key={index} position={[x * 0.94, 2.8, z * 0.94]}>
      {index % QUALITY_PRESETS[quality].torchStride === 0 && <pointLight ref={(light) => { lights.current[index] = light; }} color="#ffad57" intensity={95} distance={15} decay={2}
        castShadow={index % 6 === 0 && index / 6 < QUALITY_PRESETS[quality].torchShadows} shadow-mapSize={[256, 256]} shadow-camera-far={15} shadow-bias={-0.003} shadow-normalBias={0.04} />}
      <mesh position={[0, -0.5, 0]}><cylinderGeometry args={[0.07, 0.1, 0.8, 7]} /><meshStandardMaterial color="#251a12" roughness={0.9} /></mesh>
      <mesh position={[0, -0.1, 0]}><coneGeometry args={[0.25, 0.22, 8]} /><meshStandardMaterial color="#24252a" metalness={0.7} roughness={0.65} /></mesh>
      <group ref={(group) => { flames.current[index] = group; }}>
        <sprite position={[0, 0.2, 0]} scale={[0.65, 1.25, 1]}>
          <spriteMaterial map={glow} color={[4, 1.5, 0.3]} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
        <sprite position={[0, 0.05, 0]} scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={glow} color="#ff751a" opacity={0.25} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      </group>
    </group>
  ));
}

function Dust({ count }: { count: number }) {
  const points = useRef<Points>(null);
  const positions = useMemo(() => Float32Array.from({ length: count * 3 }, (_, index) => {
    const seed = Math.sin((index + 1) * 127.1) * 43758.5453;
    const value = seed - Math.floor(seed);
    return index % 3 === 1 ? value * 9 : (value - 0.5) * CAMERA_KEEP_OUT * 2;
  }), [count]);
  useFrame(({ clock }) => {
    if (!points.current) return;
    points.current.rotation.y = clock.elapsedTime * 0.008;
    points.current.position.y = Math.sin(clock.elapsedTime * 0.12) * 0.3;
  });
  return (
    <points ref={points} raycast={() => null}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#cbbf9f" size={0.025} transparent opacity={0.32} depthWrite={false} sizeAttenuation />
    </points>
  );
}

/** Presentation only: never reads or changes the game state. Lightformers are a local interior reflection rig. */
export function Chamber({ quality }: { quality: GraphicsQuality }) {
  return (
    <>
      <color attach="background" args={["#10151e"]} />
      <fogExp2 attach="fog" args={["#10151e", 0.023]} />
      <hemisphereLight args={["#a7b9dd", "#30251b", 0.45]} />
      <spotLight position={[6, 12, 5]} intensity={650} angle={0.65} penumbra={0.85} distance={35} color="#ffe8ce" castShadow
        shadow-mapSize={[QUALITY_PRESETS[quality].shadowSize, QUALITY_PRESETS[quality].shadowSize]}
        shadow-camera-near={1} shadow-camera-far={35}
        shadow-bias={-0.0004} shadow-normalBias={0.025} />
      <spotLight position={[-8, 10, -7]} intensity={400} angle={0.7} penumbra={1} distance={35} color="#a0b9ff" />
      <spotLight position={[0, 8, 6]} intensity={150} angle={0.65} penumbra={1} distance={25} color="#cedaff" />
      <directionalLight position={[0, 18, -20]} intensity={0.25} color="#8da8dc" />
      <Environment resolution={128} environmentIntensity={0.65}>
        <Lightformer intensity={1.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer intensity={0.6} color="#ffd9a8" position={[8, 2, 0]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer intensity={0.4} color="#9fb4ff" position={[-8, 2, 0]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
      <Suspense fallback={null}><StoneHall /></Suspense>
      <Torches quality={quality} />
      <Dust count={QUALITY_PRESETS[quality].dustCount} />
    </>
  );
}
