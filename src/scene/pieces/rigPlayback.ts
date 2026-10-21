import { AnimationMixer, LoopOnce, Mesh, type Material } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PieceRig } from "./PieceModelProvider";

/** One independent skeleton/mixer per piece; GPU geometry and color materials stay shared. */
export function createRigPlayback(rig: PieceRig, material: Material, phase = 0) {
  const scene = clone(rig.scene);
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = material;
      object.castShadow = object.receiveShadow = true;
      // Animated extremities can exceed the bind-pose bounding sphere.
      object.frustumCulled = false;
    }
  });
  const mixer = new AnimationMixer(scene);
  const idle = rig.clips.idle ? mixer.clipAction(rig.clips.idle) : undefined;
  const attack = rig.clips.attack ? mixer.clipAction(rig.clips.attack).setLoop(LoopOnce, 1) : undefined;
  if (attack) attack.clampWhenFinished = true;
  idle?.play();
  if (idle) idle.time = phase * rig.clips.idle!.duration;
  mixer.update(0);
  let attacking = false, recovered = false;
  return {
    scene,
    resume() { idle?.play(); mixer.update(0); },
    update(delta: number, attackTimeMs?: number) {
      if (attack && attackTimeMs !== undefined && attackTimeMs >= 0) {
        if (!attacking) {
          attacking = true; recovered = false;
          attack.reset().play();
          // Fully weighted by the hit even for attacks that strike immediately.
          if (idle && rig.hitTimeMs > 0) attack.crossFadeFrom(idle, Math.min(0.12, rig.hitTimeMs / 2000), false);
          else idle?.stop();
        }
        if (attackTimeMs < rig.clipDurationMs) {
          mixer.update(delta);
          attack.time = attackTimeMs / 1000;
          mixer.update(0);
          return;
        }
        if (!recovered) {
          recovered = true;
          if (idle) idle.reset().play().crossFadeFrom(attack, 0.15, false);
          else attack.stop();
        }
      } else if (attacking) {
        attack?.stop(); idle?.reset().play().setEffectiveWeight(1);
        attacking = false; recovered = false;
      }
      mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(scene);
      // SkeletonUtils owns cloned skeleton resources, not shared geometry/materials.
      scene.traverse((object) => { if ("skeleton" in object) (object as import("three").SkinnedMesh).skeleton.dispose(); });
    },
  };
}
