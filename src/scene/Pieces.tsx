import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Quaternion, Vector3, type Mesh } from "three";
import { sampleAttack } from "./animation/attackChoreography";
import { ImpactShake, type ShakeImpulse } from "./camera/CameraImpactShake";
import { DEFAULT_ANIMATION_CONFIG } from "../config/animation";
import type { MoveEvent, PieceInstance, Square } from "../core/types";
import { planMove, type Impact } from "./animation/planMove";
import { sampleTrack } from "./animation/sampleTrack";
import { publishAnimatedPosition } from "./animation/animatedPositions";
import { captureContactDistance, modelBounds } from "./effects/pieceColliders";
import { squareToWorld } from "./coords";
import { FACING } from "./facing";
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


export function Pieces({ pieces, activeEvent, onAnimationDone, onImpact, provider, onPieceClick }: PiecesProps) {
  const models = useMemo(() => provider ?? createProceduralPieceProvider(), [provider]);
  const meshes = useRef(new Map<string, Mesh>());
  const bounds = useMemo(() => modelBounds(models), [models]);
  const plan = useMemo(() => (activeEvent
    ? planMove(activeEvent, DEFAULT_ANIMATION_CONFIG, captureContactDistance(pieces, activeEvent, bounds), pieces.find((piece) => piece.id === activeEvent.pieceId)?.type)
    : undefined), [activeEvent, pieces, bounds]);
  const playback = useRef<
    { plan: NonNullable<typeof plan>; startedAt?: number; impacted: boolean; done: boolean } | undefined
  >(undefined);

  const shake = useRef<ShakeImpulse | undefined>(undefined);
  const tiltAxis = useMemo(() => new Vector3(), []);
  const tilt = useMemo(() => new Quaternion(), []);
  const facing = useMemo(() => new Quaternion(), []);

  useFrame(({ clock }) => {
    if (!plan) {
      if (playback.current) {
        // Undo/reset may cancel a capture mid-windup; no procedural pose survives it.
        for (const piece of pieces) {
          const mesh = meshes.current.get(piece.id);
          if (!mesh) continue;
          const [x, z] = squareToWorld(piece.square);
          mesh.position.set(x, 0, z);
          mesh.rotation.set(0, FACING[piece.color], 0);
          mesh.visible = true;
        }
        playback.current = undefined;
        shake.current = undefined;
      }
      return;
    }
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
      if (plan.attack?.pieceId === track.pieceId && plan.impact) {
        const pose = sampleAttack(plan.attack, elapsed);
        const [dx, dz] = plan.impact.direction;
        mesh.position.x += dx * pose.offset;
        mesh.position.z += dz * pose.offset;
        mesh.position.y = sample.y * (1 - pose.grounding) + pose.height;
        // World-space tilt around the base; preserve the model's colour-facing yaw.
        tiltAxis.set(dz, 0, -dx);
        tilt.setFromAxisAngle(tiltAxis, pose.pitch);
        facing.setFromAxisAngle(tiltAxis.set(0, 1, 0), FACING[activeEvent!.color]);
        mesh.quaternion.copy(tilt).multiply(facing);
      }
      if (activeEvent && track.kind !== "shatter") publishAnimatedPosition(activeEvent, track.pieceId, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, visible: sample.visible });
    }

    if (plan.impact && !current.impacted && elapsed >= plan.impact.atMs) {
      current.impacted = true;
      shake.current = { atMs: now, type: pieces.find((piece) => piece.id === activeEvent?.pieceId)?.type ?? "p" };
      const victim = pieces.find((piece) => piece.id === plan.impact!.pieceId);
      if (victim) onImpact?.(plan.impact, victim);
    }

    if (elapsed >= plan.durationMs) {
      current.done = true;
      onAnimationDone?.();
    }
  }, -2); // Publish before the decorative proxies and the default-priority physics step.

  return (
    <group>
      <ImpactShake impulse={shake} />
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
            material={models.material(piece.type, piece.color)}
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
