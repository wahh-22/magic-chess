import { CylinderCollider, Physics, RigidBody, interactionGroups } from "@react-three/rapier";
import type { MoveEvent, PieceInstance } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { modelBounds, planPieceColliders } from "./pieceColliders";
import { Suspense, useMemo } from "react";
import { Debris, DebrisGround } from "./Debris";
import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";

const pieceGroup = interactionGroups(0, [1]);

/** Only fixed proxies enter Physics; live meshes remain animation-controlled. */
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
          {colliders.map(({ id, position, radius, halfHeight }) => (
            <RigidBody key={id} type="fixed" colliders={false} position={position}>
              <CylinderCollider args={[halfHeight, radius]} collisionGroups={pieceGroup} friction={0.85} restitution={0} />
            </RigidBody>
          ))}
          {bursts.filter((burst) => !burst.debrisDone).map((burst) => (
            <Debris key={burst.id} burst={burst} provider={provider} fractures={fractures} onDone={() => finishEffect(burst.id, "debris")} />
          ))}
        </Physics>
      </Suspense>
    </group>
  );
}
