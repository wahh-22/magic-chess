import { CylinderCollider, Physics, RigidBody, interactionGroups } from "@react-three/rapier";
import { Vector3 } from "three";
import type { MoveEvent, PieceInstance, PieceType } from "../../core/types";
import { createProceduralPieceProvider } from "../pieces/proceduralPieces";
import { planPieceColliders, type PieceBounds } from "./pieceColliders";
import { Suspense } from "react";
import { Debris, DebrisGround } from "./Debris";
import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";

const models = createProceduralPieceProvider();
const types: PieceType[] = ["p", "n", "b", "r", "q", "k"];
const bounds = Object.fromEntries(types.map((type) => {
  const geometry = models.geometry(type);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new Vector3());
  return [type, { width: size.x, height: size.y, depth: size.z }];
})) as Record<PieceType, PieceBounds>;
const pieceGroup = interactionGroups(0, [1]);

/** Only fixed proxies enter Physics; live meshes remain animation-controlled. */
export function DestructionLayer({ pieces, activeEvent }: { pieces: PieceInstance[]; activeEvent?: MoveEvent }) {
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
            <Debris key={burst.id} burst={burst} onDone={() => finishEffect(burst.id, "debris")} />
          ))}
        </Physics>
      </Suspense>
    </group>
  );
}
