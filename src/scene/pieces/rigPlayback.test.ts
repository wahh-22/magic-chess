import { AnimationClip, Bone, BoxGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, VectorKeyframeTrack } from "three";
import { expect, it } from "vitest";
import { createRigPlayback, sampleAttackClock } from "./rigPlayback";
import { planMove } from "../animation/planMove";

it("freezes exactly at impact without moving the plan's single sync point", () => {
  const plan = planMove({ pieceId: 'a', color: 'w', from: 'e4', to: 'd5', captured: { pieceId: 'b', square: 'd5' } } as Parameters<typeof planMove>[0], undefined, 0.7, 'p', { hitTimeMs: 500, clipDurationMs: 1000 });
  const attack = plan.skeletalAttack!, hit = plan.impact!.atMs;
  expect(sampleAttackClock(hit - 1, attack, hit, 70)).toBeCloseTo(499);
  expect(sampleAttackClock(hit, attack, hit, 70)).toBeCloseTo(500);
  expect(sampleAttackClock(hit + 69, attack, hit, 70)).toBeCloseTo(500);
  expect(sampleAttackClock(hit + 90, attack, hit, 70)).toBeCloseTo(520);
  expect(attack.endMs - attack.startMs).toBe(1070);
  expect(plan.tracks[0]!.hold!.durationMs).toBe(1070);
  expect(plan.tracks[1]!.startMs).toBe(hit);
  expect(sampleAttackClock(attack.startMs - 1, attack, hit, 70)).toBeUndefined();
});

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
  // Mixer evaluation uses absolute clip time, so repeated render frames in the
  // freeze cannot creep past contact, even when the renderer has variable delta.
  for (const elapsed of [400, 420, 469]) {
    a.update(0.02, sampleAttackClock(elapsed, { startMs: 0 }, 400, 70));
    expect(handA.position.x).toBeCloseTo(0.8);
  }
  a.update(0.03, sampleAttackClock(500, { startMs: 0 }, 400, 70));
  expect(handA.position.x).toBeLessThan(0.8);
  a.update(0.6, 1000); a.update(0.2, 1200);
  expect(handA.position.x).toBeCloseTo(0);
  a.update(0.1, undefined);
  expect(handA.position.y).toBeGreaterThan(0);
  const authored = createRigPlayback({ ...rig, preserveMaterials: true }, material);
  expect((authored.scene.children[0] as SkinnedMesh).material).toBe(mesh.material);
  expect((authored.scene.children[0] as SkinnedMesh).material).not.toBe(material);
  authored.update(0.5);
  expect(authored.scene.getObjectByName('RightHand')!.position.y).toBeGreaterThan(0);
  authored.dispose();
  a.dispose(); b.dispose();
});

it('uses the walking cycle clock, blends to a chosen variant, and fully weights the victim hit immediately', () => {
  const scene = new Group(), bone = new Bone(); bone.name = 'joint'; scene.add(bone);
  const clip = (name: string, duration: number, x: number) => new AnimationClip(name, duration, [new VectorKeyframeTrack('joint.position', [0, duration], [x, 0, 0, x, 0, 0])]);
  const rig = { scene, clips: { idle: clip('idle', 2, 0), walk: new AnimationClip('walk', 2, [new VectorKeyframeTrack('joint.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 0, 0, 0])]), hit: clip('hit', 1, -2), attacks: [{ clip: clip('attack0', 1, 3), hitMs: 300, durationMs: 1000 }, { clip: clip('attack1', 1, 4), hitMs: 100, durationMs: 1000 }] } };
  // Match the integrated loader: attacks live beside clips and attack aliases attack0.
  const playback = createRigPlayback({ ...rig, attacks: rig.clips.attacks, clips: { ...rig.clips, attacks: undefined, attack: rig.clips.attacks[0]!.clip } }, new MeshStandardMaterial());
  const joint = playback.scene.getObjectByName('joint')!;
  playback.update(0.2, { role: 'walk', timeMs: 250, cycleMs: 1000 });
  expect(joint.position.x).toBeCloseTo(0.5);
  playback.update(0.01, { role: 'attack', variant: 1, timeMs: 100, hitMs: 100 });
  expect(joint.position.x).toBeCloseTo(4);
  playback.update(0.001, { role: 'hit', timeMs: 0 });
  expect(joint.position.x).toBeCloseTo(-2);
  playback.update(0.016, { role: 'hit', timeMs: 0 });
  expect(joint.position.x).toBeCloseTo(-2);
  playback.update(0.2);
  expect(joint.position.x).toBeCloseTo(0);
  playback.dispose();
});

it('hides only the cloned pedestal, including after reset/resume', () => {
  const scene = new Group(), pedestal = new Group(); pedestal.name = 'piece-pedestal'; scene.add(pedestal);
  const rig = { scene, clips: {}, pedestal: { object: pedestal.clone(), height: 0.08, nodeName: pedestal.name } };
  const playback = createRigPlayback(rig, new MeshStandardMaterial());
  expect(playback.scene.getObjectByName(pedestal.name)!.visible).toBe(false);
  expect(pedestal.visible).toBe(true);
  playback.dispose(); playback.resume(); playback.update(0.1);
  expect(playback.scene.getObjectByName(pedestal.name)!.visible).toBe(false);
  playback.dispose();
});

it('survives React StrictMode effect cleanup then resume', () => {
  const scene = new Group(), bone = new Bone(); bone.name = 'RightHand'; scene.add(bone);
  const rig = { scene, clips: { idle: new AnimationClip('idle', 1, [new VectorKeyframeTrack('RightHand.position', [0, 1], [0, 0, 0, 0, 0.1, 0])]) }, hitTimeMs: 0, clipDurationMs: 0 };
  const playback = createRigPlayback(rig, new MeshStandardMaterial());
  playback.resume(); playback.dispose();
  expect(() => { playback.resume(); playback.update(0.1); }).not.toThrow();
  playback.dispose();
});
