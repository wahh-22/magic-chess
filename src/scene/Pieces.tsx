import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import { DEFAULT_ANIMATION_CONFIG } from "../config/animation";
import type { MoveEvent, PieceInstance, Square } from "../core/types";
import { planMove, type Impact } from "./animation/planMove";
import { sampleTrack } from "./animation/sampleTrack";
import { squareToWorld } from "./coords";
import { pieceMaterials } from "./materials";
import { createProceduralPieceProvider } from "./pieces/proceduralPieces";
import type { PieceModelProvider } from "./pieces/PieceModelProvider";

interface PiecesProps {
  pieces: PieceInstance[];
  /** Move being animated; `pieces` still shows the position before it. */
  activeEvent?: MoveEvent;
  onAnimationDone?: () => void;
  /** Fires once when the attacker reaches the captured piece. */
  onImpact?: (impact: Impact, victim: PieceInstance) => void;
  provider?: PieceModelProvider;
  onPieceClick?: (square: Square) => void;
}

/** Pieces face the opponent: geometry faces +x, white turns to -z and black to +z. */
export const FACING = { w: Math.PI / 2, b: -Math.PI / 2 } as const;

export function Pieces({ pieces, activeEvent, onAnimationDone, onImpact, provider, onPieceClick }: PiecesProps) {
  const models = useMemo(() => provider ?? createProceduralPieceProvider(), [provider]);
  const meshes = useRef(new Map<string, Mesh>());
  const plan = useMemo(() => (activeEvent ? planMove(activeEvent) : undefined), [activeEvent]);
  const playback = useRef<
    { plan: NonNullable<typeof plan>; startedAt?: number; impacted: boolean; done: boolean } | undefined
  >(undefined);

  useFrame(({ clock }) => {
    if (!plan) return;
    if (playback.current?.plan !== plan) playback.current = { plan, impacted: false, done: false };
    const current = playback.current;
    if (current.done) return;
    const now = clock.getElapsedTime() * 1000;
    current.startedAt ??= now;
    const elapsed = now - current.startedAt;

    for (const track of plan.tracks) {
      const mesh = meshes.current.get(track.pieceId);
      if (!mesh) continue;
      const sample = sampleTrack(track, elapsed, DEFAULT_ANIMATION_CONFIG);
      mesh.position.set(sample.x, sample.y, sample.z);
      mesh.visible = sample.visible;
    }

    if (plan.impact && !current.impacted && elapsed >= plan.impact.atMs) {
      current.impacted = true;
      const victim = pieces.find((piece) => piece.id === plan.impact!.pieceId);
      if (victim) onImpact?.(plan.impact, victim);
    }

    if (elapsed >= plan.durationMs) {
      current.done = true;
      onAnimationDone?.();
    }
  });

  return (
    <group>
      {pieces.map((piece) => {
        const [x, z] = squareToWorld(piece.square);
        return (
          <mesh
            key={piece.id}
            ref={(mesh) => {
              if (mesh) meshes.current.set(piece.id, mesh);
              else meshes.current.delete(piece.id);
            }}
            geometry={models.geometry(piece.type)}
            material={pieceMaterials[piece.color]}
            position={[x, 0, z]}
            rotation={[0, FACING[piece.color], 0]}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onPieceClick?.(piece.square);
            }}
          />
        );
      })}
    </group>
  );
}
