import { useFrame } from "@react-three/fiber";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3, type Object3D } from "three";
import { createRigPlayback, type RigPlaybackState } from "./pieces/rigPlayback";
import { phaseAt, rigTiming, sampleMotion, stablePhase, type RuntimeRig } from './animation/motion';
import { publishImpactClock, rigState } from './animation/presentationState';
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
import { WeaponTrail } from "./effects/WeaponTrail";
import { PedestalVisual } from './animation/PedestalVisual';
import { pedestalPresentation } from './effects/pedestalFade';

function RiggedVisual({ piece, models, state, trailWindow }: { piece: PieceInstance; models: PieceModelProvider; state: () => RigPlaybackState | undefined; trailWindow: () => { startMs: number; endMs: number } | undefined }) {
  const rig: RuntimeRig = models.rig!(piece.type, piece.color)!;
  const material = models.material(piece.type, piece.color);
  const playback = useMemo(() => {
    // Stable per-piece pseudo-random phase; render remains pure under StrictMode.
    return createRigPlayback(rig, material, stablePhase(piece.id));
  }, [rig, material, piece.id]);
  useEffect(() => { playback.resume(); return () => playback.dispose(); }, [playback]);
  useFrame((_, delta) => playback.update(delta, state()), -1);
  return <>
    <primitive object={playback.scene} dispose={null} />
    {(rig.clips.attack || rig.attacks?.length || rig.clips.attacks?.length) && <WeaponTrail scene={playback.scene} type={piece.type}
      attackTime={() => { const current = state(); return current?.role === 'attack' ? current.timeMs : undefined; }}
      hitTimeMs={rig.hitTimeMs ?? 0} tipBone={rig.weaponTip} window={trailWindow} />}
  </>;
}

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
  const meshes = useRef(new Map<string, Object3D>());
  const attacker = pieces.find((piece) => piece.id === activeEvent?.pieceId);
  const attackerType = attacker?.type;
  const attackerRig = attacker ? models.rig?.(attacker.type, attacker.color) : undefined;
  const rook = pieces.find(piece => piece.id === activeEvent?.rookMove?.pieceId);
  const rookRig = rook ? models.rig?.(rook.type, rook.color) : undefined;
  const bounds = useMemo(() => modelBounds(models), [models]);
  const plan = useMemo(() => (activeEvent
    ? planMove(activeEvent, DEFAULT_ANIMATION_CONFIG, captureContactDistance(pieces, activeEvent, bounds), attackerType, rigTiming(attackerRig), rigTiming(rookRig))
    : undefined), [activeEvent, pieces, bounds, attackerType, attackerRig, rookRig]);
  const playback = useRef<
    { plan: NonNullable<typeof plan>; startedAt?: number; elapsed?: number; impacted: boolean; done: boolean } | undefined
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
    current.elapsed = elapsed;
    if (plan.impact) publishImpactClock(plan.impact, elapsed);

    for (const track of plan.tracks) {
      const mesh = meshes.current.get(track.pieceId);
      if (!mesh) continue;
      const sample = sampleTrack(track, elapsed, DEFAULT_ANIMATION_CONFIG);
      const piece = pieces.find(piece => piece.id === track.pieceId);
      const pedestal = piece ? models.rig?.(piece.type, piece.color)?.pedestal : undefined;
      mesh.position.set(sample.x, sample.y + (pedestal ? pedestalPresentation(track, elapsed, pedestal.height).height : 0), sample.z);
      mesh.visible = sample.visible;
      if (track.motion?.length) mesh.rotation.set(0, sampleMotion(track.motion, elapsed).yaw, 0);
      const reaction = phaseAt(plan.phases?.filter(p => p.pieceId === track.pieceId && p.kind === 'hit') ?? [], elapsed);
      if (reaction) mesh.rotation.set(0, reaction.toYaw, 0);
      if (!track.motion && plan.skeletalAttack?.pieceId === track.pieceId && plan.impact) {
        const [dx, dz] = plan.impact.direction;
        mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
      }
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
        const pedestal = models.rig?.(piece.type, piece.color)?.pedestal;
        return (
          <Fragment key={piece.id}>
          {pedestal && <PedestalVisual pedestal={pedestal} position={[x, z]} yaw={FACING[piece.color]} clock={() => {
            const current = playback.current;
            return { track: current?.plan.tracks.find(track => track.pieceId === piece.id), elapsedMs: current?.elapsed ?? 0 };
          }} />}
          <group
            ref={(mesh) => {
              if (mesh) meshes.current.set(piece.id, mesh);
              else meshes.current.delete(piece.id);
            }}
            position={[x, 0, z]}
            rotation={[0, FACING[piece.color], 0]}
            onClick={(event) => {
              event.stopPropagation();
              onPieceClick?.(piece.square);
            }}
          >
            {models.rig?.(piece.type, piece.color) ? <RiggedVisual
              piece={piece} models={models}
              state={() => {
                const current = playback.current;
                return rigState(current?.plan, piece.id, current?.elapsed);
              }}
              trailWindow={() => {
                const attack = playback.current?.plan.skeletalAttack;
                return attack?.pieceId === piece.id && attack.trailStartMs !== undefined && attack.trailEndMs !== undefined
                  ? { startMs: attack.trailStartMs, endMs: attack.trailEndMs } : undefined;
              }}
            /> : <mesh geometry={models.geometry(piece.type, piece.color)} material={models.material(piece.type, piece.color)} castShadow receiveShadow />}
          </group>
          </Fragment>
        );
      })}
    </group>
  );
}
