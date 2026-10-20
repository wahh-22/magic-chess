import type { ThreeEvent } from "@react-three/fiber";
import type { LegalMove, Square } from "../core/types";
import { ALL_SQUARES, isLightSquare, squareToWorld } from "./coords";
import { boardMaterials } from "./materials";

const TILE_HEIGHT = 0.12;
const FRAME_WIDTH = 0.6;

interface BoardProps {
  onSquareClick?: (square: Square) => void;
  selected?: Square | null;
  targets?: LegalMove[];
  lastMove?: { from: Square; to: Square };
}

/** Stone tiles inside a carved frame. The top of the tiles is y = 0. */
export function Board({ onSquareClick, selected, targets = [], lastMove }: BoardProps) {
  const handleClick = (square: Square) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSquareClick?.(square);
  };

  return (
    <group>
      {ALL_SQUARES.map((square) => {
        const [x, z] = squareToWorld(square);
        return (
          <mesh
            key={square}
            position={[x, -TILE_HEIGHT / 2, z]}
            material={isLightSquare(square) ? boardMaterials.light : boardMaterials.dark}
            receiveShadow
            onClick={handleClick(square)}
          >
            <boxGeometry args={[0.98, TILE_HEIGHT, 0.98]} />
          </mesh>
        );
      })}
      {lastMove && [...new Set([lastMove.from, lastMove.to])].map((square) => {
        const [x, z] = squareToWorld(square);
        return (
          <mesh key={`last-${square}`} position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <planeGeometry args={[0.96, 0.96]} />
            <meshStandardMaterial color="#d9a35f" emissive="#d9a35f" emissiveIntensity={0.2} transparent opacity={0.22} depthWrite={false} />
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
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} transparent opacity={0.75} depthWrite={false} />
    </mesh>
  );
}
