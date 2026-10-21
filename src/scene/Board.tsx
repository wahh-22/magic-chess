import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from "three";
import type { LegalMove, Square } from "../core/types";
import { ALL_SQUARES, isLightSquare, squareToWorld } from "./coords";

const TILE_HEIGHT = 0.12;
const FRAME_WIDTH = 0.6;

interface BoardProps {
  onSquareClick?: (square: Square) => void;
  selected?: Square | null;
  targets?: LegalMove[];
  lastMove?: { from: Square; to: Square };
}

function useBoardStone() {
  const textures = useTexture(["marble_01_diff", "marble_01_nor_gl", "marble_01_rough", "marble_016_diff", "marble_016_nor_gl", "marble_016_rough", "stone_floor_diff", "stone_floor_nor_gl", "stone_floor_rough"].map((name) => `/environment/${name}.webp`));
  const materials = useMemo(() => {
    const maps = textures.map((source, index) => {
      const texture = source.clone();
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
      if (index % 3 === 0) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    const [map, normalMap, roughnessMap, darkMap, darkNormal, darkRoughness, frameMap, frameNormal, frameRoughness] = maps;
    const polished = { normalScale: new Vector2(0.08, 0.08), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.22, metalness: 0 };
    return {
      light: new MeshPhysicalMaterial({ ...polished, map, normalMap, roughnessMap, color: "#b9b7b0" }),
      dark: new MeshPhysicalMaterial({ ...polished, map: darkMap, normalMap: darkNormal, roughnessMap: darkRoughness, color: "#a0abbc" }),
      frame: new MeshStandardMaterial({ map: frameMap, normalMap: frameNormal, roughnessMap: frameRoughness, color: "#737781", roughness: 0.85 }),
    };
  }, [textures]);
  useEffect(() => () => {
    const textures = new Set(Object.values(materials).flatMap((material) => [material.map, material.normalMap, material.roughnessMap]));
    textures.forEach((texture) => texture?.dispose());
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);
  return materials;
}

// Sample inside individual slabs (not the source image's grout). Geometry UVs let
// every tile have its own cut/rotation while sharing just two PBR materials.
function tileUV(geometry: BoxGeometry, index: number) {
  const uv = geometry.attributes.uv!;
  const column = index % 3;
  const row = Math.floor(index / 3) % 4;
  const jitter = (index * 0.61803398875) % 1 * 0.035;
  // Slab joints are staggered on alternating rows in Marble 01.
  const columns = row % 2 ? [0.2, 0.52, 0.8] : row === 2 ? [0.06, 0.36, 0.68] : [0.06, 0.4, 0.72];
  for (let vertex = 0; vertex < uv.count; vertex++) {
    // Canonical BoxGeometry UVs: idempotent if R3F calls onUpdate again.
    const u = vertex % 2, v = 1 - Math.floor((vertex % 4) / 2);
    uv.setXY(vertex, columns[column]! + jitter + (index % 2 ? v : u) * 0.15,
      1 - ([0.025, 0.255, 0.49, 0.755][row]! + (index % 2 ? 1 - u : v) * 0.15));
  }
  uv.needsUpdate = true;
}

/** Stone tiles inside a carved frame. The top of the tiles is y = 0. */
export function Board({ onSquareClick, selected, targets = [], lastMove }: BoardProps) {
  const boardMaterials = useBoardStone();
  const handleClick = (square: Square) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSquareClick?.(square);
  };

  return (
    <group>
      {ALL_SQUARES.map((square, index) => {
        const [x, z] = squareToWorld(square);
        return (
          <mesh
            key={square}
            position={[x, -TILE_HEIGHT / 2, z]}
            material={isLightSquare(square) ? boardMaterials.light : boardMaterials.dark}
            receiveShadow
            onClick={handleClick(square)}
          >
            <boxGeometry args={[0.98, TILE_HEIGHT, 0.98]} onUpdate={(geometry) => tileUV(geometry, index)} />
          </mesh>
        );
      })}
      {lastMove && [...new Set([lastMove.from, lastMove.to])].map((square) => {
        const [x, z] = squareToWorld(square);
        return (
          <mesh key={`last-${square}`} position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <planeGeometry args={[0.96, 0.96]} />
            <meshBasicMaterial color="#c88c32" toneMapped={false} transparent opacity={0.2} depthWrite={false} />
            <mesh rotation-z={Math.PI / 4} position-z={0.002} raycast={() => {}}>
              <ringGeometry args={[0.625, 0.69, 4]} />
              <meshBasicMaterial color="#17212b" toneMapped={false} depthWrite={false} />
              <mesh position-z={0.001} raycast={() => {}}>
                <ringGeometry args={[0.64, 0.675, 4]} />
                <meshBasicMaterial color="#d9a35f" toneMapped={false} depthWrite={false} />
              </mesh>
            </mesh>
          </mesh>
        );
      })}
      {selected && (
        <SquareMarker square={selected} ring color="#e3c77e" onSquareClick={onSquareClick} />
      )}
      {targets.map((target) => (
        <SquareMarker
          key={target.to}
          square={target.to}
          ring={target.isCapture}
          color="#94c8b4"
          onSquareClick={onSquareClick}
        />
      ))}
      <mesh position={[0, -TILE_HEIGHT / 2 - 0.08, 0]} material={boardMaterials.frame} receiveShadow castShadow>
        <boxGeometry args={[8 + FRAME_WIDTH * 2, TILE_HEIGHT + 0.12, 8 + FRAME_WIDTH * 2]} />
      </mesh>
    </group>
  );
}

function SquareMarker({ square, ring, color, onSquareClick }: {
  square: Square;
  ring: boolean;
  color: string;
  onSquareClick?: (square: Square) => void;
}) {
  const [x, z] = squareToWorld(square);
  return (
    <mesh
      position={[x, 0.015, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSquareClick?.(square);
      }}
    >
      {ring ? <ringGeometry args={[0.36, 0.43, 48]} /> : <circleGeometry args={[0.12, 32]} />}
      <meshBasicMaterial color="#17212b" toneMapped={false} depthWrite={false} />
      <mesh position-z={0.002} raycast={() => {}}>
        {ring ? <ringGeometry args={[0.375, 0.415, 48]} /> : <circleGeometry args={[0.085, 32]} />}
        <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} />
      </mesh>
    </mesh>
  );
}
