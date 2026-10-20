import { beforeAll, expect, it } from "vitest";
import type { RapierContext } from "@react-three/rapier";
import { Quaternion, Euler } from "three";
import { DEFAULT_ANIMATION_CONFIG } from "../../config/animation";
import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import type { MoveEvent, PieceInstance } from "../../core/types";
import { planMove } from "../animation/planMove";
import { sampleTrack } from "../animation/sampleTrack";
import { createProceduralPieceProvider } from "../pieces/proceduralPieces";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { planDebris } from "./debrisPlan";
import { captureContactDistance, modelBounds, planPieceColliders } from "./pieceColliders";

let RAPIER: RapierContext["rapier"];
beforeAll(async () => {
  // pnpm keeps Rapier private to its declared owner; load that installed module
  // directly rather than adding a second dependency or importing the React API.
  const nodeModule = "node:module";
  const { createRequire } = await import(/* @vite-ignore */ nodeModule) as {
    createRequire: (path: string) => { resolve: (id: string) => string };
  };
  const require = createRequire(import.meta.url);
  const rapierPath = createRequire(require.resolve("@react-three/rapier")).resolve("@dimforge/rapier3d-compat");
  RAPIER = (await import(/* @vite-ignore */ rapierPath)).default;
  await RAPIER.init();
});

it("sweeps real pawn debris aside without the late fixed-proxy pop or settled penetration", () => {
  const models = createProceduralPieceProvider();
  const fractures = createVoronoiFractureProvider(models);
  const fragments = fractures.fragments("p");
  const attacker: PieceInstance = { id: "attacker", type: "p", color: "w", square: "e4" };
  const victim: PieceInstance = { id: "victim", type: "p", color: "b", square: "d5" };
  const event: MoveEvent = {
    san: "exd5", uci: "e4d5", color: "w", pieceId: attacker.id, from: "e4", to: "d5",
    captured: { pieceId: victim.id, square: victim.square }, check: false, outcome: null,
  };
  const bounds = modelBounds(models);
  const move = planMove(event, DEFAULT_ANIMATION_CONFIG, captureContactDistance([attacker, victim], event, bounds));
  const track = move.tracks[0]!;
  const impact = move.impact!;
  const plans = planDebris(fragments, victim, impact, 7919, DEFAULT_EFFECTS_CONFIG.debris);
  const proxy = planPieceColliders([attacker, victim], event, bounds).find(({ id }) => id === attacker.id)!;
  const dt = 1 / 60;
  const simulate = (kinematic: boolean) => {
    const impactAt = kinematic ? impact.atMs : planMove(event).impact!.atMs;
    const arrivalStep = Math.ceil((track.durationMs - impactAt) / (dt * 1000));
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = dt;
    const stageGroup = (1 << 16) | 2;
    const debrisGroup = (2 << 16) | 1;
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.06, 4)
      .setTranslation(0, -0.06, 0).setFriction(0.85).setCollisionGroups(stageGroup));
    const bodies = plans.map((plan, i) => {
      const q = new Quaternion().setFromEuler(new Euler(...plan.rotation));
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...plan.position).setRotation(q).setCcdEnabled(true)
        .setLinearDamping(0.35).setAngularDamping(0.65));
      const hull = new Float32Array(fragments[i]!.geometry.getAttribute("position").array);
      world.createCollider(RAPIER.ColliderDesc.convexHull(hull)!
        .setMass(plan.mass).setFriction(0.85).setRestitution(0.12).setCollisionGroups(debrisGroup), body);
      body.applyImpulse({ x: plan.impulse[0], y: plan.impulse[1], z: plan.impulse[2] }, true);
      body.applyTorqueImpulse({ x: plan.angularImpulse[0], y: plan.angularImpulse[1], z: plan.angularImpulse[2] }, true);
      return body;
    });
    const createProxy = (moving: boolean, elapsed: number) => {
      const p = sampleTrack(track, elapsed, DEFAULT_ANIMATION_CONFIG);
      const desc = moving ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
      const body = world.createRigidBody(desc.setTranslation(p.x, p.y + proxy.halfHeight, p.z));
      const collider = world.createCollider(RAPIER.ColliderDesc.cylinder(proxy.halfHeight, proxy.radius)
        .setCollisionGroups(stageGroup).setFriction(0.85).setRestitution(0), body);
      return { body, collider };
    };
    let obstacle = kinematic ? createProxy(true, impactAt) : undefined;
    let maxSpeed = 0;
    for (let step = 0; step < 120; step++) {
      if (!kinematic && step === arrivalStep) obstacle = createProxy(false, track.durationMs);
      if (kinematic) {
        const p = sampleTrack(track, impactAt + (step + 1) * dt * 1000, DEFAULT_ANIMATION_CONFIG);
        obstacle!.body.setNextKinematicTranslation({ x: p.x, y: p.y + proxy.halfHeight, z: p.z });
      }
      const previous = bodies.map((body) => body.translation());
      world.step();
      // Symmetric window around arrival, before ordinary falling can dominate.
      if (step <= arrivalStep + 3 && (kinematic || step >= arrivalStep)) {
        bodies.forEach((body, i) => {
          const p = body.translation(), prev = previous[i]!;
          // Rapier's positional depenetration is not included in linvel().
          // Measure visible world-space displacement so the old pop is counted.
          maxSpeed = Math.max(maxSpeed, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / dt);
        });
      }
    }
    const penetrations = bodies.map((body) => obstacle?.collider.contactCollider(body.collider(0), 0))
      .filter((contact) => contact && contact.distance < -0.005).length;
    world.free();
    return { maxSpeed, penetrations };
  };

  const pop = simulate(false);
  const swept = simulate(proxy.bodyType === "kinematicPosition");
  // A moving body pushes what it hits at roughly its own speed; anything well above the
  // attacker's peak animated speed is a solver pop, not a push.
  let attackerPeak = 0;
  for (let t = 1; t <= track.durationMs; t++) {
    const a = sampleTrack(track, t - 1, DEFAULT_ANIMATION_CONFIG);
    const b = sampleTrack(track, t, DEFAULT_ANIMATION_CONFIG);
    attackerPeak = Math.max(attackerPeak, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000);
  }
  console.info(`attacker regression: pop=${pop.maxSpeed.toFixed(3)}, kinematic=${swept.maxSpeed.toFixed(3)}, attacker peak=${attackerPeak.toFixed(3)} units/s; penetrations=${swept.penetrations}`);
  expect(swept.penetrations).toBe(0);
  expect(swept.maxSpeed).toBeLessThan(pop.maxSpeed);
  expect(swept.maxSpeed).toBeLessThanOrEqual(attackerPeak * 1.25);
});
