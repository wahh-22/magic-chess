import { CylinderCollider, Physics, RigidBody, interactionGroups, useBeforePhysicsStep } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { animatedPosition } from "../animation/animatedPositions";
import type { MoveEvent, PieceInstance } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { modelBounds, planPieceColliders, type PieceColliderPlan } from "./pieceColliders";
import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { reactionFinished } from '../animation/presentationState';
import { Debris, DebrisGround } from "./Debris";
import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";
import type { Burst } from './effectsStore';
import type { FractureProvider } from '../fracture/FractureProvider';
import { RigidPartsDebris } from '../fracture/RigidPartsDebris';
import { selectDestructionParts } from './destructionParts';
import { DEFAULT_EFFECTS_CONFIG } from '../../config/effects';
import { readQuality } from '../environment/battlefieldConfig';
import { DEFAULT_VFX_CONFIG } from '../../config/vfx';
import { CaptureSparks } from './CaptureSparks';

function CaptureDebris({ burst, provider, fractures, onDone }: {
  burst: Burst; provider: PieceModelProvider; fractures: FractureProvider; onDone: () => void;
}) {
  const parts = useMemo(() => selectDestructionParts(provider, burst.victim.type, burst.victim.color,
    DEFAULT_EFFECTS_CONFIG.rigidParts[readQuality()]), [provider, burst.victim.type, burst.victim.color]);
  return parts ? <RigidPartsDebris burst={burst} parts={parts} onDone={onDone} />
    : <Debris burst={burst} provider={provider} fractures={fractures} onDone={onDone} />;
}

/** Mount particles/physics only after the live hit reaction, on the plan clock. */
function ReactionGate({ burst, children }: { burst: Burst; children: ReactNode }) {
  const [ready, setReady] = useState(() => reactionFinished(burst.impact));
  useFrame(() => { if (!ready && reactionFinished(burst.impact)) setReady(true); }, -1);
  return ready ? children : null;
}

/** Hold children back for a scene-clock delay, e.g. until the armour parts land. */
function Delay({ ms, children }: { ms: number; children: ReactNode }) {
  const startedAt = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState(ms <= 0);
  useFrame(({ clock }) => {
    if (ready) return;
    const now = clock.getElapsedTime() * 1000;
    startedAt.current ??= now;
    if (now - startedAt.current >= ms) setReady(true);
  });
  return ready ? children : null;
}

const pieceGroup = interactionGroups(0, [1]);

function PieceProxy({ plan, activeEvent }: { plan: PieceColliderPlan; activeEvent?: MoveEvent }) {
  const body = useRef<RapierRigidBody>(null);
  const followMesh = () => {
    if (plan.bodyType !== "kinematicPosition" || !activeEvent) return;
    const position = animatedPosition(activeEvent, plan.id);
    if (position) body.current?.setNextKinematicTranslation({
      x: position.x, y: position.y + plan.halfHeight, z: position.z,
    });
  };
  useFrame(followMesh, -1);
  // Re-submit the same target for every fixed substep on slow render frames.
  // No second animation clock, and no physics feedback to the live mesh.
  useBeforePhysicsStep(followMesh);
  return (
    <RigidBody ref={body} type={plan.bodyType} colliders={false} position={plan.position}>
      <CylinderCollider args={[plan.halfHeight, plan.radius]} collisionGroups={pieceGroup} friction={0.85} restitution={0} />
    </RigidBody>
  );
}

/** Fixed/kinematic proxies only; live meshes remain animation-controlled. */
export function DestructionLayer({ pieces, activeEvent, provider }: {
  pieces: PieceInstance[]; activeEvent?: MoveEvent; provider: PieceModelProvider;
}) {
  const bounds = useMemo(() => modelBounds(provider), [provider]);
  const fractures = useMemo(() => createVoronoiFractureProvider(provider), [provider]);
  const bursts = useEffectsStore((state) => state.bursts);
  const finishEffect = useEffectsStore((state) => state.finishEffect);
  const colliders = planPieceColliders(pieces, activeEvent, bounds);
  return (
    <group>
      {bursts.filter((burst) => !burst.dustDone).map((burst) => (
        <ReactionGate key={burst.id} burst={burst}>
          <Delay ms={DEFAULT_VFX_CONFIG.dustLandDelayMs}>
            <DustBurst burst={burst} onDone={() => finishEffect(burst.id, "dust")} />
          </Delay>
        </ReactionGate>
      ))}
      <CaptureSparks bounds={bounds} />
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
          <DebrisGround />
          {colliders.map((plan) => (
            <PieceProxy key={plan.id} plan={plan} activeEvent={activeEvent} />
          ))}
          {bursts.filter((burst) => !burst.debrisDone).map((burst) => (
            <ReactionGate key={burst.id} burst={burst}>
              <CaptureDebris burst={burst} provider={provider} fractures={fractures} onDone={() => finishEffect(burst.id, "debris")} />
            </ReactionGate>
          ))}
        </Physics>
      </Suspense>
    </group>
  );
}
