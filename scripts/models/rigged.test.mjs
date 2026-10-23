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

it('writes both color variants with flat PBR materials and only selected clips', async () => {
  await mkdir('.shots', { recursive: true });
  const dir = await mkdtemp(resolve('.shots/arcana-test-'));
  const manifest = await writeRiggedFixture(join(dir, 'source'));
  manifest.pieces.p.rigged = {
    files: { w: ['idle.glb'], b: ['idle.glb'] },
    materials: 'preserve', clips: { idle: 'idle' },
  };
  // Both fixture clips are deliberately present: undeclared attacks must be removed.
  const idleFile = 'pawn-*.glb';
  manifest.pieces.p.rigged.files = { w: [idleFile], b: [idleFile] };
  const result = await processModels({ source: join(dir, 'source'), out: join(dir, 'out'), manifest, log: vi.fn() });
  for (const color of ['w', 'b']) {
    expect(result.pieces.p.colors[color]).toMatchObject({ file: `p-${color}.glb`, skinned: true, clips: { idle: 'idle' } });
    const doc = await createIO().read(join(dir, `out/p-${color}.glb`));
    expect(doc.getRoot().listTextures()).toHaveLength(0);
    expect(doc.getRoot().listMaterials()[0].getBaseColorFactor()).toEqual(riggedFixture().getRoot().listMaterials()[0].getBaseColorFactor());
    expect(doc.getRoot().listAnimations().map((a) => a.getName())).toEqual(['idle']);
  }
  manifest.pieces.p.rigged.files.b = ['missing.glb'];
  await expect(processModels({ source: join(dir, 'source'), out: join(dir, 'missing'), manifest })).rejects.toThrow('Missing rigged p-b');
  manifest.pieces.p.rigged.files = { w: [idleFile] };
  await expect(processModels({ source: join(dir, 'source'), out: join(dir, 'bad'), manifest })).rejects.toThrow('colors');
});

it('retains distinct flat material factors and simplifies complete skinned vertices', async () => {
  const source = riggedFixture();
  const gold = source.createMaterial('gold').setBaseColorFactor([0.9, 0.6, 0.1, 1]).setMetallicFactor(0.8).setRoughnessFactor(0.3);
  source.getRoot().listMeshes()[0].listPrimitives()[1].setMaterial(gold);
  const result = await processRigged([source], { height: 1.24, maxFootprint: 0.98, maxTriangles: 100, textureSize: 16, rotationYDegrees: 90 }, { materials: 'preserve', clips: { idle: 'idle' } });
  expect(result.entry.triangles).toBeLessThanOrEqual(100);
  expect(result.document.getRoot().listTextures()).toHaveLength(0);
  expect(result.document.getRoot().listMaterials().map((m) => [m.getName(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor()])).toContainEqual(['gold', [0.9, 0.6, 0.1, 1], 0.8, 0.3]);
  expect(result.document.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(2);
  for (const p of result.document.getRoot().listMeshes()[0].listPrimitives()) {
    expect(p.getAttribute('POSITION').getNormalized()).toBe(true);
    expect(p.getAttribute('JOINTS_0').getCount()).toBe(p.getAttribute('POSITION').getCount());
    for (let i = 0; i < p.getAttribute('WEIGHTS_0').getCount(); i++) expect(p.getAttribute('WEIGHTS_0').getElement(i, []).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  }
});

it('keeps rigid triangles on their original bone while sharing textured materials', async () => {
  const source = riggedFixture();
  const sharp = (await import('sharp')).default;
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#8899aa' } }).png().toBuffer();
  const texture = source.createTexture('steel_basecolor').setMimeType('image/png').setImage(image);
  source.getRoot().listMaterials()[0].setBaseColorTexture(texture);
  // Exported tangents and baked vertex colors are not read by the shared library materials.
  for (const p of source.getRoot().listMeshes()[0].listPrimitives()) {
    const count = p.getAttribute('POSITION').getCount();
    p.setAttribute('TANGENT', source.createAccessor().setType('VEC4').setBuffer(source.getRoot().listBuffers()[0]).setArray(new Float32Array(count * 4).fill(1)));
    p.setAttribute('COLOR_0', source.createAccessor().setType('VEC4').setBuffer(source.getRoot().listBuffers()[0]).setArray(new Float32Array(count * 4).fill(1)));
  }
  const result = await processRigged([source], { height: 1, maxFootprint: 0.98, maxTriangles: 100, textureSize: 16, rotationYDegrees: 90 }, { materials: 'shared', clips: { idle: 'idle' } });
  expect(result.document.getRoot().listTextures()).toHaveLength(0);
  expect(result.entry.triangles).toBeLessThanOrEqual(100);
  for (const mesh of result.document.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    // Textures are detached into the library, but their UVs must still ship.
    expect(p.getAttribute('TEXCOORD_0')?.getCount()).toBe(p.getAttribute('POSITION').getCount());
    expect(p.getAttribute('TANGENT')).toBeNull();
    expect(p.getAttribute('COLOR_0')).toBeNull();
    const ids = p.getIndices().getArray();
    for (let i = 0; i < ids.length; i += 3) {
      const owners = Array.from(ids.slice(i, i + 3), id => {
        const weights = p.getAttribute('WEIGHTS_0').getElement(id, []);
        expect(weights.filter(w => w > 0)).toEqual([1]);
        return p.getAttribute('JOINTS_0').getElement(id, [])[weights.indexOf(1)];
      });
      expect(new Set(owners).size).toBe(1);
    }
  }
});

it('preserves blended and cross-bone triangles in the shared path', async () => {
  const options = { height: 1, maxFootprint: 0.98, maxTriangles: 100, textureSize: 16, rotationYDegrees: 90 };
  const blended = riggedFixture();
  blended.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('WEIGHTS_0').setElement(0, [0.5, 0.5, 0, 0]);
  const result = await processRigged([blended], options, { materials: 'shared' });
  expect(result.document.getRoot().listMeshes().flatMap(m => m.listPrimitives()).some(p => Array.from(p.getAttribute('WEIGHTS_0').getArray()).some(w => w > 0 && w < 255))).toBe(true);
  const crossed = riggedFixture();
  const primitive = crossed.getRoot().listMeshes()[0].listPrimitives()[0];
  const id = primitive.getIndices().getElement(0, [])[0];
  const joint = primitive.getAttribute('JOINTS_0').getElement(id, []);
  joint[0] = (joint[0] + 1) % 3;
  primitive.getAttribute('JOINTS_0').setElement(id, joint);
  await expect(processRigged([crossed], options, { materials: 'shared' })).resolves.toHaveProperty('entry.skinned', true);
});

it('deduplicates shared images across named palettes without losing normal or ORM slots', async () => {
  const { createMaterialLibrary } = await import('./arcana-textures.mjs');
  const sharp = (await import('sharp')).default;
  const library = createMaterialLibrary();
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#8888ff' } }).png().toBuffer();
  for (const color of ['marfil', 'obsidiana']) {
    const source = riggedFixture();
    const texture = source.createTexture('steel_normal').setMimeType('image/png').setImage(image);
    source.getRoot().listMaterials()[0].setName(`${color}_steel`).setNormalTexture(texture).setMetallicRoughnessTexture(texture).setOcclusionTexture(texture);
    library.add(source);
    library.add(source);
  }
  const doc = await library.finish(16);
  expect(doc.getRoot().listTextures()).toHaveLength(1);
  expect(doc.getRoot().listTextures()[0].getMimeType()).toBe('image/webp');
  expect(doc.getRoot().listMaterials().map(m => m.getName())).toEqual(['marfil_steel', 'obsidiana_steel']);
  for (const material of doc.getRoot().listMaterials()) {
    expect(material.getNormalTexture()).toBe(doc.getRoot().listTextures()[0]);
    expect(material.getMetallicRoughnessTexture()).toBe(material.getNormalTexture());
    expect(material.getOcclusionTexture()).toBe(material.getNormalTexture());
  }
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

it('rests a contract rig in its idle guard so bounds, colliders and debris match what plays', async () => {
  const idle = riggedFixture('idle');
  // The exported rest pose differs from the guard's first key (V6–V8 hold weapons forward at rest).
  idle.getRoot().listAnimations()[0].listSamplers()[0].getOutput().setArray(new Float32Array([0.5, 0, 0, 0.5, 0.04, 0, 0.5, 0, 0]));
  const attack = { clip: 'attack0', durationMs: 1000, hitMs: 400, activeEndMs: 500, trailStartMs: 300, trailEndMs: 500 };
  const contract = () => ({ selectors: { idle: 'idle', attack0: 'attack' }, attacks: [attack], weaponTip: 'mixamorig:RightHand' });
  const options = { height: 1, maxFootprint: 0.98, maxTriangles: 20000, textureSize: 16, rotationYDegrees: 90 };
  const result = await processRigged([idle, riggedFixture('attack')], options, { materials: 'shared', contract });
  const hand = result.document.getRoot().listNodes().find(n => n.getName() === 'mixamorig:RightHand');
  expect(hand.getTranslation()).toEqual([0.5, 0, 0]);
  expect(result.entry.rig.attacks).toEqual([attack]);
  expect(result.document.getRoot().listAnimations().map(a => a.getName()).sort()).toEqual(['attack0', 'idle']);
});
