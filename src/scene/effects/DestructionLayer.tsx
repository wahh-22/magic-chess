import { CylinderCollider, Physics, RigidBody, interactionGroups, useBeforePhysicsStep } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { animatedPosition } from "../animation/animatedPositions";
import type { MoveEvent, PieceInstance } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { modelBounds, planPieceColliders, type PieceColliderPlan } from "./pieceColliders";
import { Suspense, useMemo, useRef } from "react";
import { Debris, DebrisGround } from "./Debris";
import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";

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
        <DustBurst key={burst.id} burst={burst} onDone={() => finishEffect(burst.id, "dust")} />
      ))}
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
          <DebrisGround />
          {colliders.map((plan) => (
            <PieceProxy key={plan.id} plan={plan} activeEvent={activeEvent} />
          ))}
          {bursts.filter((burst) => !burst.debrisDone).map((burst) => (
            <Debris key={burst.id} burst={burst} provider={provider} fractures={fractures} onDone={() => finishEffect(burst.id, "debris")} />
          ))}
        </Physics>
      </Suspense>
    </group>
  );
}
