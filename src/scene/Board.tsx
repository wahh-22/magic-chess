import type { ThreeEvent } from "@react-three/fiber";
import type { Square } from "../core/types";
import { ALL_SQUARES, isLightSquare, squareToWorld } from "./coords";
import { boardMaterials } from "./materials";

const TILE_HEIGHT = 0.12;
const FRAME_WIDTH = 0.6;

interface BoardProps {
  onSquareClick?: (square: Square) => void;
}

/** Stone tiles inside a carved frame. The top of the tiles is y = 0. */
export function Board({ onSquareClick }: BoardProps) {
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
      <mesh position={[0, -TILE_HEIGHT / 2 - 0.08, 0]} material={boardMaterials.frame} receiveShadow castShadow>
        <boxGeometry args={[8 + FRAME_WIDTH * 2, TILE_HEIGHT + 0.12, 8 + FRAME_WIDTH * 2]} />
      </mesh>
    </group>
  );
}
