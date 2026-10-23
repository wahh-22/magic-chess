import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, interactionGroups, RigidBody, useBeforePhysicsStep } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import type { Material } from 'three';
import { DEFAULT_EFFECTS_CONFIG } from '../../config/effects';
import { debrisOpacity, isDebrisFinished, planDebris } from '../effects/debrisPlan';
import type { Burst } from '../effects/effectsStore';
import type { RigidPart } from '../effects/pieceParts';

const config = DEFAULT_EFFECTS_CONFIG.debris;
const debrisGroup = interactionGroups(1, [0]);

/** Same decorative launch/settle lifecycle as procedural debris, but with armor palettes. */
export function RigidPartsDebris({ burst, parts, onDone }: { burst: Burst; parts: RigidPart[]; onDone: () => void }) {
  const plans = useMemo(() => planDebris(parts, burst.victim, burst.impact, burst.seed, config), [parts, burst]);
  const hulls = useMemo(() => parts.map(({ geometry }) => new Float32Array(geometry.getAttribute('position').array)), [parts]);
  const palette = useMemo(() => {
    const clones = new Map<Material, Material>();
    for (const part of parts) for (const material of part.materials) if (!clones.has(material)) clones.set(material, material.clone());
    clones.forEach((material) => { material.transparent = true; });
    return { unique: [...clones.values()], perPart: parts.map((part) => part.materials.map((material) => clones.get(material)!)) };
  }, [parts]);
  useEffect(() => () => palette.unique.forEach((material) => material.dispose()), [palette]);
  const fadingPalette = useRef(palette);
  useEffect(() => { fadingPalette.current = palette; }, [palette]);
  const bodies = useRef(new Map<number, RapierRigidBody>());
  const launched = useRef(new WeakSet<RapierRigidBody>());
  const sinkOrigins = useRef(new Map<RapierRigidBody, number>());
  const startedAt = useRef<number | undefined>(undefined);
  const finished = useRef(false);

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
    const opacity = debrisOpacity(elapsed, config);
    fadingPalette.current.unique.forEach((material) => { material.opacity = opacity; material.depthWrite = elapsed < config.lifetimeMs; });
    if (elapsed >= config.lifetimeMs) bodies.current.forEach((body) => {
      if (!sinkOrigins.current.has(body)) {
        sinkOrigins.current.set(body, body.translation().y);
        for (let i = 0; i < body.numColliders(); i++) body.collider(i).setSensor(true);
        body.setGravityScale(0, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.setTranslation({ ...body.translation(), y: sinkOrigins.current.get(body)! - config.sinkDistance * (1 - opacity) }, true);
    });
    if (isDebrisFinished(elapsed, config)) { finished.current = true; onDone(); }
  });
  return <group dispose={null} name="rigid-armor-debris">
    {parts.map((part, index) => <RigidBody key={index}
      ref={(body) => { if (body) bodies.current.set(index, body); else bodies.current.delete(index); }}
      colliders={false} position={plans[index]!.position} rotation={plans[index]!.rotation}
      ccd linearDamping={0.35} angularDamping={0.65} restitution={0.12}>
      <ConvexHullCollider args={[hulls[index]!]} mass={plans[index]!.mass} collisionGroups={debrisGroup} friction={0.85} />
      <mesh geometry={part.geometry} material={palette.perPart[index]} castShadow receiveShadow />
    </RigidBody>)}
  </group>;
}
