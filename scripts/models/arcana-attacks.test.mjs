import { describe, expect, it } from 'vitest';
import { createIO } from './process.mjs';
import { authorArcanaAttack, weaponTipInDocument } from './arcana-attacks.mjs';
import { existsSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const expected = {
  p: ['pelvis', 'chest', 'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'hand.L'],
  k: ['pelvis', 'chest', 'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'hand.L'],
  q: ['pelvis', 'chest', 'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'hand.L'],
  b: ['pelvis', 'chest', 'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'hand.L'],
  r: ['pelvis', 'chest', 'shoulder_R', 'upper_arm_R', 'forearm_R', 'hand_R'],
  n: ['horse_body', 'horse_neck', 'rider_pelvis', 'rider_chest', 'rider_upper_arm_R', 'rider_forearm_R', 'rider_hand_R', 'lance'],
};
function worldAt(node, channels, frame) {
  const trs = { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() };
  for (const c of channels) if (c.getTargetNode() === node) trs[c.getTargetPath()] = c.getSampler().getOutput().getElement(frame, []);
  const matrix = new Matrix4().compose(new Vector3(...trs.translation), new Quaternion(...trs.rotation), new Vector3(...trs.scale));
  return node.getParentNode() ? matrix.premultiply(worldAt(node.getParentNode(), channels, frame)) : matrix;
}

const names = { p: 'peon', n: 'caballo', b: 'alfil', r: 'torre', q: 'reina', k: 'rey' };
describe('authored ARCANA attacks', () => {
  const sourceBase = 'assets/models/source/arcana-realista/ARCANA_Realismo_V3/modelos';
  // Legacy V3 generator regression; shipped V4 clips are verified in arcana-v4.test.mjs.
  const corpora = [sourceBase];
  for (const corpus of corpora) for (const type of Object.keys(names)) it.skipIf(!existsSync(`${sourceBase}/rey_marfil.glb`))(`${corpus}/${type}: local chain, closed pose, planted feet and declared contact`, async () => {
    const sides = [];
    for (const color of ['w', 'b']) {
      // The checked-in rigs are the test corpus: no ignored download required.
      const doc = await createIO().read(corpus === sourceBase ? `${corpus}/${names[type]}_${color === 'w' ? 'marfil' : 'obsidiana'}.glb` : `${corpus}/${type}-${color}.glb`);
      const idle = doc.getRoot().listAnimations().find(a => a.getName() === 'idle' || a.getName().includes('Reposo'));
      const idleStart = new Map(idle.listChannels().map(c => [`${c.getTargetNode().getName()}/${c.getTargetPath()}`, c.getSampler().getOutput().getElement(0, [])]));
      for (const clip of doc.getRoot().listAnimations()) clip.dispose();
      const timing = authorArcanaAttack(doc, type);
      expect(timing.hitTimeMs / timing.clipDurationMs).toBeGreaterThanOrEqual(0.45);
      expect(timing.hitTimeMs / timing.clipDurationMs).toBeLessThanOrEqual(0.55);
      const clip = doc.getRoot().listAnimations().find(a => a.getName() === 'attack');
      const channels = clip.listChannels();
      const sampleCount = channels[0].getSampler().getInput().getCount();
      expect(sampleCount).toBe(Math.ceil(timing.clipDurationMs / 1000 * 60) + 1);
      const { bone: weapon, tip } = weaponTipInDocument(doc, type);
      const rootInverse = new Matrix4().fromArray(doc.getRoot().listNodes().find(n => n.getName() === 'root').getWorldMatrix()).invert();
      const path = Array.from({ length: sampleCount }, (_, i) => tip.clone().applyMatrix4(worldAt(weapon, channels, i)).applyMatrix4(rootInverse));
      const peak = path.reduce((best, p, i) => p.z > path[best].z ? i : best, 0);
      expect(path[peak].z - path[0].z).toBeGreaterThan(0.15);
      expect(peak / (sampleCount - 1)).toBeGreaterThanOrEqual(0.45);
      expect(peak / (sampleCount - 1)).toBeLessThanOrEqual(0.55);
      expect(channels[0].getSampler().getInput().getElement(peak, [])[0] * 1000).toBeCloseTo(timing.hitTimeMs, 3);
      const chord = path[peak].clone().sub(path[0]);
      const curved = path.slice(0, peak).map(p => p.clone().sub(path[0]).cross(chord).length() / chord.length());
      expect(Math.max(...curved)).toBeGreaterThan(0.03);
      // Pronation, not only a single-axis hinge rotation.
      const wrist = channels.find(c => c.getTargetNode().getName() === (type === 'n' ? 'rider_hand_R' : type === 'r' ? 'hand_R' : ['q', 'b'].includes(type) ? 'hand.L' : 'hand.R') && c.getTargetPath() === 'rotation');
      expect(Math.max(...Array.from({ length: sampleCount }, (_, i) => Math.abs(wrist.getSampler().getOutput().getElement(i, [])[1])))).toBeGreaterThan(0.04);
      expect(clip.getExtras().hitTimeMs).toBe(timing.hitTimeMs);
      for (const bone of expected[type]) expect(channels.some(c => c.getTargetNode().getName() === bone)).toBe(true);
      const feet = doc.getRoot().listNodes().filter(n => type === 'n' ? /hoof|horse_.*lower|pastern/.test(n.getName()) : /foot|shin/.test(n.getName()));
      expect(feet.length).toBeGreaterThanOrEqual(2);
      for (const foot of feet) {
        const start = new Vector3().setFromMatrixPosition(worldAt(foot, channels, 0));
        for (let frame = 0; frame < channels[0].getSampler().getInput().getCount(); frame++) {
          const position = new Vector3().setFromMatrixPosition(worldAt(foot, channels, frame));
          expect(position.distanceTo(start)).toBeLessThan(0.00001);
        }
      }
      for (const channel of channels) {
        const sampler = channel.getSampler(), output = sampler.getOutput();
        const first = output.getElement(0, []), last = output.getElement(output.getCount() - 1, []);
        first.forEach((v, i) => expect(last[i]).toBeCloseTo(v, 5));
        // Pinning the loop endpoint must not hide a last-frame snap.
        const previous = output.getElement(output.getCount() - 2, []);
        expect(Math.hypot(...last.map((v, i) => v - previous[i]))).toBeLessThan(0.003);
        const node = channel.getTargetNode();
        const bind = idleStart.get(`${node.getName()}/${channel.getTargetPath()}`) ?? (channel.getTargetPath() === 'rotation' ? node.getRotation() : node.getTranslation());
        first.forEach((v, i) => expect(v).toBeCloseTo(bind[i], 5));
        if (/foot|hoof/.test(node.getName())) {
          for (let i = 0; i < output.getCount(); i++) output.getElement(i, []).forEach((v, j) => expect(Math.abs(v - first[j])).toBeLessThan(0.001));
        }
      }
      sides.push(channels.map(c => Array.from(c.getSampler().getOutput().getArray())));
    }
    expect(sides[0]).toEqual(sides[1]);
  });
});
