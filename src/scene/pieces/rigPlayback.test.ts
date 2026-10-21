import { AnimationClip, Bone, BoxGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, VectorKeyframeTrack } from "three";
import { expect, it } from "vitest";
import { createRigPlayback } from "./rigPlayback";

it("clones independent skeletons, shares color materials, samples the hit and returns to idle", () => {
  const bone = new Bone(); bone.name = "RightHand";
  const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.add(bone); mesh.bind(new Skeleton([bone]));
  const scene = new Group(); scene.add(mesh);
  const rig = { scene, clips: {
    idle: new AnimationClip("idle", 2, [new VectorKeyframeTrack("RightHand.position", [0, 1, 2], [0, 0, 0, 0, 0.1, 0, 0, 0, 0])]),
    attack: new AnimationClip("attack", 1, [new VectorKeyframeTrack("RightHand.position", [0, 0.4, 1], [0, 0, 0, 0.8, 0, 0, 0, 0, 0])]),
  }, hitTimeMs: 400, clipDurationMs: 1000 };
  const material = new MeshStandardMaterial();
  const a = createRigPlayback(rig, material, 0.2), b = createRigPlayback(rig, material, 0.6);
  const handA = a.scene.getObjectByName("RightHand")!, handB = b.scene.getObjectByName("RightHand")!;
  expect(handA).not.toBe(handB);
  expect(handA.position.y).not.toBe(handB.position.y);
  expect((a.scene.children[0] as SkinnedMesh).material).toBe(material);
  expect((b.scene.children[0] as SkinnedMesh).material).toBe(material);
  a.update(0.4, 400);
  expect(handA.position.x).toBeCloseTo(0.8);
  expect(handB.position.x).toBe(0);
  expect(bone.position.x).toBe(0);
  a.update(0.6, 1000); a.update(0.2, 1200);
  expect(handA.position.x).toBeCloseTo(0);
  a.update(0.1, undefined);
  expect(handA.position.y).toBeGreaterThan(0);
  a.dispose(); b.dispose();
});
