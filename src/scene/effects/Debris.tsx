import { useFrame } from "@react-three/fiber";
import { ConvexHullCollider, CuboidCollider, interactionGroups, RigidBody, useBeforePhysicsStep } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { pieceMaterials } from "../materials";
import { createProceduralPieceProvider } from "../pieces/proceduralPieces";
import { debrisOpacity, isDebrisFinished, planDebris } from "./debrisPlan";
import type { Burst } from "./effectsStore";

const config = DEFAULT_EFFECTS_CONFIG.debris;
const fractures = createVoronoiFractureProvider(createProceduralPieceProvider());
const groundGroup = interactionGroups(0, [1]);
// Fragments collide with fixed stage/piece proxies, never each other or live meshes.
const debrisGroup = interactionGroups(1, [0]);

/** Fixed stage: tile top y=0; the wider frame top is y=-0.02 (Board.tsx). */
export function DebrisGround() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[4, 0.06, 4]} position={[0, -0.06, 0]} collisionGroups={groundGroup} friction={0.85} />
      <CuboidCollider args={[4.6, 0.12, 4.6]} position={[0, -0.14, 0]} collisionGroups={groundGroup} friction={0.85} />
      {/* Decorative containment at the outside of the frame, including edge captures. */}
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <CuboidCollider args={[0.1, 2, 4.6]} position={[side * 4.7, 1.98, 0]} collisionGroups={groundGroup} restitution={0} />
          <CuboidCollider args={[4.6, 2, 0.1]} position={[0, 1.98, side * 4.7]} collisionGroups={groundGroup} restitution={0} />
        </group>
      ))}
    </RigidBody>
  );
}

/** Only captured fragments enter Rapier; this component never reads/writes the game store. */
export function Debris({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  const fragments = useMemo(() => fractures.fragments(burst.victim.type), [burst.victim.type]);
  const plans = useMemo(
    () => planDebris(fragments, burst.victim, burst.impact, burst.seed, config),
    [fragments, burst.victim, burst.impact, burst.seed],
  );
  const hulls = useMemo(() => fragments.map(({ geometry }) => new Float32Array(geometry.getAttribute("position").array)), [fragments]);
  const material = useMemo(() => {
    const clone = pieceMaterials[burst.victim.color].clone();
    clone.transparent = true;
    return clone;
  }, [burst.victim.color]);
  useEffect(() => () => material.dispose(), [material]);
  // Frame-driven Three resources are mutable, not React render state.
  const fadingMaterial = useRef(material);

  const bodies = useRef(new Map<number, RapierRigidBody>());
  const launched = useRef(new WeakSet<RapierRigidBody>());
  const sinkOrigins = useRef(new Map<RapierRigidBody, number>());
  const startedAt = useRef<number | undefined>(undefined);
  const finished = useRef(false);

  // Collider masses are ready before the first step. WeakSet also protects against
  // duplicate impulses on rerender / StrictMode, while allowing a recreated body.
  useBeforePhysicsStep(() => {
    bodies.current.forEach((body, index) => {
      if (launched.current.has(body)) return;
      const plan = plans[index]!;
      body.applyImpulse({ x: plan.impulse[0], y: plan.impulse[1], z: plan.impulse[2] }, true);
      body.applyTorqueImpulse({ x: plan.angularImpulse[0], y: plan.angularImpulse[1], z: plan.angularImpulse[2] }, true);
      launched.current.add(body);
    });
  });

  useFrame(({ clock }) => {
    if (finished.current) return;
    const now = clock.getElapsedTime() * 1000;
    startedAt.current ??= now;
    const elapsed = now - startedAt.current;
    const material = fadingMaterial.current;
    material.opacity = debrisOpacity(elapsed, config);
    if (elapsed >= config.lifetimeMs) {
      material.depthWrite = false;
      bodies.current.forEach((body) => {
        if (!sinkOrigins.current.has(body)) {
          sinkOrigins.current.set(body, body.translation().y);
          for (let i = 0; i < body.numColliders(); i++) body.collider(i).setSensor(true);
          body.setGravityScale(0, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        const position = body.translation();
        body.setTranslation({ ...position, y: sinkOrigins.current.get(body)! - config.sinkDistance * (1 - material.opacity) }, true);
      });
    }
    if (isDebrisFinished(elapsed, config)) {
      finished.current = true;
      onDone();
    }
  });

  return (
    <group dispose={null}>
      {fragments.map((fragment, index) => {
        const plan = plans[index]!;
        return (
          <RigidBody key={index} ref={(body) => { if (body) bodies.current.set(index, body); else bodies.current.delete(index); }}
            colliders={false} position={plan.position} rotation={plan.rotation}
            ccd linearDamping={0.35} angularDamping={0.65} restitution={0.12}>
            <ConvexHullCollider args={[hulls[index]!]} mass={plan.mass} collisionGroups={debrisGroup} friction={0.85} />
            <mesh geometry={fragment.geometry} material={material} castShadow receiveShadow />
          </RigidBody>
        );
      })}
    </group>
  );
}
