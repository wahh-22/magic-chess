import { expect, it, vi } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Box3, Matrix4, Vector3 } from 'three';
import { processModels, createIO } from './process.mjs';
import { riggedFixture, writeRiggedFixture } from './rigged-fixture.mjs';
import { processRigged } from './rigged.mjs';

it('preserves a normalized skin, merges separate clips, detects the forward hand hit and respects override', async () => {
  await mkdir('.shots', { recursive: true });
  const dir = await mkdtemp(resolve('.shots/rigged-test-'));
  const manifest = await writeRiggedFixture(join(dir, 'source'));
  const run = (out) => processModels({ source: join(dir, 'source'), out: join(dir, out), manifest, log: vi.fn() });
  const output = await run('out');
  expect(output.pieces.p).toMatchObject({ skinned: true, clips: { idle: 'idle', attack: 'attack' }, hitTimeMs: 400, clipDurationMs: 1000 });
  const doc = await createIO().read(join(dir, 'out/p.glb'));
  const nodes = doc.getRoot().listNodes().filter((node) => node.getMesh());
  expect(nodes).toHaveLength(1);
  const node = nodes[0];
  expect(node.getSkin().listJoints()).toHaveLength(3);
  expect(node.getSkin().getInverseBindMatrices().getCount()).toBe(3);
  expect(node.getMesh().listPrimitives()).toHaveLength(1);
  const prim = node.getMesh().listPrimitives()[0];
  const positions = prim.getAttribute('POSITION');
  const weights = prim.getAttribute('WEIGHTS_0');
  const joints = prim.getAttribute('JOINTS_0');
  expect(weights.getCount()).toBe(positions.getCount());
  expect(joints.getCount()).toBe(positions.getCount());
  for (let i = 0; i < positions.getCount(); i++) {
    expect(weights.getElement(i, []).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(joints.getElement(i, []).every((id) => Number.isInteger(id) && id >= 0 && id < 3)).toBe(true);
  }
  const box = new Box3();
  for (let i = 0; i < positions.getCount(); i++) box.expandByPoint(new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix())));
  expect(box.min.y).toBeCloseTo(0, 5);
  expect(box.max.y).toBeCloseTo(0.896, 5);
  expect(box.min.x + box.max.x).toBeCloseTo(0, 5);
  expect(box.min.z + box.max.z).toBeCloseTo(0, 5);
  expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(0.78001);
  expect(doc.getRoot().listAnimations().map((a) => [a.getName(), Math.max(...a.listSamplers()[0].getInput().getArray())]).sort()).toEqual([['attack', 1], ['idle', 2]]);
  manifest.pieces.p.rigged.hitTimeMs = 250;
  manifest.maxTriangles = 100;
  const overridden = await run('override');
  expect(overridden.pieces.p.hitTimeMs).toBe(250);
  expect(overridden.pieces.p.triangles).toBeLessThanOrEqual(100);
  const simplified = await createIO().read(join(dir, 'override/p.glb'));
  const p = simplified.getRoot().listNodes().find((n) => n.getSkin()).getMesh().listPrimitives()[0];
  for (const semantic of p.listSemantics()) expect(p.getAttribute(semantic).getCount()).toBe(p.getAttribute('POSITION').getCount());
  for (let i = 0; i < p.getAttribute('WEIGHTS_0').getCount(); i++) expect(p.getAttribute('WEIGHTS_0').getElement(i, []).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
});

it('rejects mismatched skeletons, missing clips and out-of-range overrides; warns if no hit bone exists', async () => {
  const options = { height: 1, maxFootprint: 0.78, maxTriangles: 20000, textureSize: 16, rotationYDegrees: -90 };
  const settings = { clips: { idle: 'idle', attack: 'attack' }, hitTimeMs: null };
  const bad = riggedFixture('attack');
  bad.getRoot().listNodes().find((n) => /RightHand/.test(n.getName())).setTranslation([99, 0, 0]);
  await expect(processRigged([riggedFixture(), bad], options, settings)).rejects.toThrow('Skeletons differ');
  await expect(processRigged([riggedFixture()], options, settings)).rejects.toThrow('Missing attack clip');
  await expect(processRigged([riggedFixture(), riggedFixture('attack')], options, { ...settings, hitTimeMs: 1001 })).rejects.toThrow('hitTimeMs');
  const sources = [riggedFixture(), riggedFixture('attack')];
  for (const doc of sources) doc.getRoot().listNodes().find((n) => /RightHand/.test(n.getName())).setName('anonymous-end');
  const warn = vi.fn();
  const result = await processRigged(sources, options, settings, warn);
  expect(result.entry.hitTimeMs).toBe(500);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('no right-hand/weapon bone'));
});
