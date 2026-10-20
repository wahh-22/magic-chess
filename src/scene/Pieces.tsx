import { useMemo } from "react";
import type { PieceInstance } from "../core/types";
import { squareToWorld } from "./coords";
import { pieceMaterials } from "./materials";
import { createProceduralPieceProvider } from "./pieces/proceduralPieces";
import type { PieceModelProvider } from "./pieces/PieceModelProvider";

interface PiecesProps {
  pieces: PieceInstance[];
  provider?: PieceModelProvider;
}

/** Pieces face the opponent: geometry faces +x, white turns to -z and black to +z. */
export const FACING = { w: Math.PI / 2, b: -Math.PI / 2 } as const;

export function Pieces({ pieces, provider }: PiecesProps) {
  const models = useMemo(() => provider ?? createProceduralPieceProvider(), [provider]);
  return (
    <group>
      {pieces.map((piece) => {
        const [x, z] = squareToWorld(piece.square);
        return (
          <mesh
            key={piece.id}
            geometry={models.geometry(piece.type)}
            material={pieceMaterials[piece.color]}
            position={[x, 0, z]}
            rotation={[0, FACING[piece.color], 0]}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}
