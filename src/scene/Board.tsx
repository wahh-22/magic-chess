import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BoxGeometry, CanvasTexture, Matrix4, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { LegalMove, Square } from "../core/types";
import { ALL_SQUARES, isLightSquare, squareToWorld } from "./coords";
import { ARCANA, BOARD_HALF, BORDER_WIDTH, STEP_COUNT, STEP_DEPTH, STEP_HEIGHT } from "./environment/battlefieldConfig";
import { at, block } from "./environment/ruins";
import { useStone } from "./environment/stoneMaterials";

const TILE_HEIGHT = 0.1;
const TILE_SIZE = 0.968;
const BORDER_TOP = 0.04;
// Honed polish: reflections stay soft so slabs read as stone, not mirrors.
const POLISHED_LIGHT = { roughness: 0.5, envMapIntensity: 0.7 } as const;
const POLISHED_DARK = { roughness: 0.55, envMapIntensity: 0.3 } as const;
const CARVED = { roughness: 0.85, envMapIntensity: 0.6 } as const;

// Select the interior of a marble slab, excluding the source texture's grout.
// Idempotent UVs give each square a distinct cut without duplicating materials.
function tileUV(geometry: BoxGeometry, index: number) {
  const uv = geometry.attributes.uv!;
  const row = Math.floor(index / 3) % 4;
  const columns = row % 2 ? [0.2, 0.52, 0.8] : row === 2 ? [0.06, 0.36, 0.68] : [0.06, 0.4, 0.72];
  const jitter = (index * 0.61803398875) % 1 * 0.035;
  for (let vertex = 0; vertex < uv.count; vertex++) {
    const u = vertex % 2, v = 1 - Math.floor((vertex % 4) / 2);
    uv.setXY(vertex, columns[index % 3]! + jitter + (index % 2 ? v : u) * 0.15,
      1 - ([0.025, 0.255, 0.49, 0.755][row]! + (index % 2 ? 1 - u : v) * 0.15));
  }
  return geometry;
}

/** All squares of one colour in a single geometry; picking resolves the square from the hit point. */
function buildSquares(light: boolean) {
  const tiles = ALL_SQUARES.flatMap((square, index) => {
    if (isLightSquare(square) !== light) return [];
    const [x, z] = squareToWorld(square);
    return [tileUV(new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE), index).translate(x, -TILE_HEIGHT / 2, z)];
  });
  const merged = mergeGeometries(tiles);
  tiles.forEach((tile) => tile.dispose());
  return merged;
}

/** Raised carved border, corner plinths and the steps down to the plaza. */
function buildSurround() {
  const parts: BufferGeometry[] = [];
  const inner = BOARD_HALF, outer = BOARD_HALF + BORDER_WIDTH;
  const borderHeight = BORDER_TOP + STEP_HEIGHT;
  for (let side = 0; side < 4; side++) {
    const yaw = side * Math.PI / 2;
    const rotate = new Matrix4().makeRotationY(yaw);
    parts.push(block(outer * 2, borderHeight, BORDER_WIDTH, rotate.clone().multiply(at(0, BORDER_TOP - borderHeight / 2, -(inner + outer) / 2))));
    // A carved lip just inside the border throws a thin shadow line onto the squares.
    parts.push(block(inner * 2 + 0.02, 0.03, 0.05, rotate.clone().multiply(at(0, BORDER_TOP + 0.012, -(inner + 0.03)))));
    // Corner plinths.
    parts.push(block(BORDER_WIDTH + 0.12, borderHeight + 0.09, BORDER_WIDTH + 0.12, rotate.clone().multiply(at(-(inner + outer) / 2, BORDER_TOP + 0.045 - borderHeight / 2, -(inner + outer) / 2))));
  }
  for (let step = 0; step < STEP_COUNT; step++) {
    const half = outer + STEP_DEPTH * (step + 1);
    const top = -STEP_HEIGHT * (step + 1);
    parts.push(block(half * 2, STEP_HEIGHT, half * 2, at(0, top - STEP_HEIGHT / 2, 0)));
  }
  // Grout bed visible between the slabs.
  parts.push(block(inner * 2, 0.02, inner * 2, at(0, -TILE_HEIGHT + 0.005, 0)));
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

function buildInlay() {
  const parts: BufferGeometry[] = [];
  for (let side = 0; side < 4; side++) {
    const rotate = new Matrix4().makeRotationY(side * Math.PI / 2);
    for (const offset of [0.13, 0.36]) {
      const distance = BOARD_HALF + offset;
      parts.push(new BoxGeometry(distance * 2, 0.008, 0.022).applyMatrix4(rotate.clone().multiply(at(0, BORDER_TOP + 0.002, -distance))));
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

function glowTexture(ring: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) {
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0.05)");
    gradient.addColorStop(0.8, "rgba(255,255,255,1)");
    gradient.addColorStop(0.9, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

function useGlows() {
  const glows = useMemo(() => ({ ring: glowTexture(true), spot: glowTexture(false) }), []);
  useEffect(() => () => { glows.ring.dispose(); glows.spot.dispose(); }, [glows]);
  return glows;
}

/** Inverse of squareToWorld for a point on the playing surface. */
export function squareAt(x: number, z: number): Square {
  const file = Math.min(7, Math.max(0, Math.floor(x + BOARD_HALF)));
  const rank = Math.min(7, Math.max(0, Math.floor(BOARD_HALF - z)));
  return `${"abcdefgh"[file]}${rank + 1}`;
}

interface BoardProps {
  onSquareClick?: (square: Square) => void;
  selected?: Square | null;
  targets?: LegalMove[];
  lastMove?: { from: Square; to: Square };
}

/** Polished light/dark stone slabs in a raised carved border on the plaza; playing surface at y = 0. */
export function Board({ onSquareClick, selected, targets = [], lastMove }: BoardProps) {
  const light = useStone("marble_01", 1, 1, "#e9e0cf", true, POLISHED_LIGHT);
  const dark = useStone("marble_016", 1, 1, "#6e655c", true, POLISHED_DARK);
  const carved = useStone("sandstone_blocks_04", 1, 1, "#e2d3b8", false, CARVED);
  const geometry = useMemo(() => ({ light: buildSquares(true), dark: buildSquares(false), surround: buildSurround(), inlay: buildInlay() }), []);
  useEffect(() => () => Object.values(geometry).forEach((part) => part.dispose()), [geometry]);
  const glows = useGlows();
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSquareClick?.(squareAt(event.point.x, event.point.z));
  };

  return (
    <group>
      <mesh geometry={geometry.light} material={light} receiveShadow onClick={handleClick} />
      <mesh geometry={geometry.dark} material={dark} receiveShadow onClick={handleClick} />
      <mesh geometry={geometry.surround} material={carved} receiveShadow castShadow />
      <mesh geometry={geometry.inlay} receiveShadow>
        <meshStandardMaterial color="#a8834a" metalness={0.85} roughness={0.38} />
      </mesh>
      {lastMove && [...new Set([lastMove.from, lastMove.to])].map((square) => (
        <Glow key={`last-${square}`} square={square} texture={glows.spot} color={ARCANA.gold} size={1.15} opacity={0.62} />
      ))}
      {selected && <SquareMarker square={selected} capture texture={glows} color={ARCANA.cyan} onSquareClick={onSquareClick} />}
      {targets.map((target) => (
        <SquareMarker key={target.to} square={target.to} capture={target.isCapture} texture={glows}
          color={target.isCapture ? ARCANA.gold : ARCANA.cyan} onSquareClick={onSquareClick} />
      ))}
    </group>
  );
}

/** Additive light pooled on the stone, so markers read as magic light rather than stickers. */
function Glow({ square, texture, color, size, opacity, lift = 0.004 }: {
  square: Square; texture: CanvasTexture; color: string; size: number; opacity: number; lift?: number;
}) {
  const [x, z] = squareToWorld(square);
  return (
    <mesh position={[x, lift, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}} renderOrder={2}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function SquareMarker({ square, capture, texture, color, onSquareClick }: {
  square: Square;
  capture: boolean;
  texture: { ring: CanvasTexture; spot: CanvasTexture };
  color: string;
  onSquareClick?: (square: Square) => void;
}) {
  const [x, z] = squareToWorld(square);
  return (
    <group>
      {/* A soft shade under the light keeps it legible on the pale slabs in full sun. */}
      <mesh position={[x, 0.003, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}
        onClick={(event) => { event.stopPropagation(); onSquareClick?.(square); }}>
        <planeGeometry args={capture ? [0.98, 0.98] : [0.5, 0.5]} />
        <meshBasicMaterial map={capture ? texture.ring : texture.spot} color="#0b1218" transparent opacity={capture ? 0.35 : 0.45} depthWrite={false} toneMapped={false} />
      </mesh>
      <Glow square={square} texture={capture ? texture.ring : texture.spot} color={color} size={capture ? 0.98 : 0.5} opacity={1} lift={0.006} />
      <Glow square={square} texture={texture.spot} color={color} size={capture ? 1.2 : 0.95} opacity={capture ? 0.18 : 0.3} lift={0.005} />
    </group>
  );
}
