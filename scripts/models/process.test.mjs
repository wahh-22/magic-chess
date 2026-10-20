import { describe, it, expect, vi } from 'vitest';
import { Document } from '@gltf-transform/core';
import { BoxGeometry } from 'three';
import sharp from 'sharp';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { compressDocument, processDocument, processModels, createIO } from './process.mjs';

export async function messyDocument({ wide = false, differentMaterials = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture().setImage(await sharp({ create: { width: 8, height: 8, channels: 4, background: '#808080' } }).png().toBuffer()).setMimeType('image/png');
  const material = doc.createMaterial().setBaseColorFactor([0.5, 1, 1, 1]).setBaseColorTexture(texture);
  const scene = doc.createScene();
  const parent = doc.createNode().setTranslation([19, -42, 8]).setScale([37, 37, 37]).setRotation([0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]);
  scene.addChild(parent);
  for (const [i, x] of [0, 0.1].entries()) {
    const geometry = new BoxGeometry(wide ? 4 : 0.2, 1, 0.2, 4, 8, 4);
    geometry.translate(x, 0.5, 0);
    const primitive = doc.createPrimitive().setMaterial(differentMaterials && i ? doc.createMaterial().setBaseColorFactor([1, 0, 0, 1]) : material);
    for (const [semantic, name, type] of [['POSITION', 'position', 'VEC3'], ['NORMAL', 'normal', 'VEC3'], ['TEXCOORD_0', 'uv', 'VEC2']]) {
      primitive.setAttribute(semantic, doc.createAccessor().setBuffer(buffer).setType(type).setArray(new Float32Array(geometry.attributes[name].array)));
    }
    primitive.setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(geometry.index.array)));
    parent.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  }
  return doc;
}
const options = { height: 1, maxFootprint: 0.78, maxTriangles: 20000, textureSize: 16, rotationYDegrees: -90 };
function bounds(doc) {
  const p = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
  return { min: p.getMin([]), max: p.getMax([]) };
}

describe('model cleanup', () => {
  it('bakes messy nodes, joins primitives, normalizes frame and writes the manifest contract', async () => {
    const { document, entry, trianglesBefore } = await processDocument(await messyDocument(), options);
    const { min, max } = bounds(document);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(max[1]).toBeCloseTo(1, 6);
    expect(min[0] + max[0]).toBeCloseTo(0, 6);
    expect(min[2] + max[2]).toBeCloseTo(0, 6);
    expect(Math.max(max[0] - min[0], max[2] - min[2])).toBeLessThanOrEqual(0.780001);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(document.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(1);
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) expect(primitive.getAttribute(name)).toBeTruthy();
    expect(document.getRoot().listMaterials()).toHaveLength(1);
    expect(entry).toMatchObject({ height: expect.any(Number), footprint: expect.any(Number), triangles: trianglesBefore, fragmentColor: '#408080' });
    const image = document.getRoot().listTextures()[0];
    expect(image.getMimeType()).toBe('image/webp');
    expect((await sharp(image.getImage()).metadata()).width).toBeLessThanOrEqual(16);
    const roundtrip = await createIO().readBinary(await createIO().writeBinary(document));
    expect(roundtrip.getRoot().listMeshes()).toHaveLength(1);
  });
  it('rotates an asymmetric +x-side marker back to +x', async () => {
    const doc = await messyDocument();
    // First vertex on the second box is on its +x side before the messy parent rotation.
    const { document } = await processDocument(doc, options);
    const positions = document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
    expect(positions.getElement(positions.getCount() / 2, [])[0]).toBeGreaterThan(0);
    const { min, max } = bounds(document);
    expect(max[0] - min[0]).toBeCloseTo(0.3, 5);
    expect(max[2] - min[2]).toBeCloseTo(0.2, 5);
  });
  it('caps wide pieces uniformly instead of forcing target height', async () => {
    const { document, entry } = await processDocument(await messyDocument({ wide: true }), options);
    const { min, max } = bounds(document);
    expect(entry.footprint).toBeCloseTo(0.78, 5);
    expect(max[1] - min[1]).toBeLessThan(1);
  });
  it('simplifies while preserving UVs and obeying a hard triangle budget', async () => {
    const { document, entry, trianglesBefore } = await processDocument(await messyDocument(), { ...options, maxTriangles: 100 });
    expect(trianglesBefore).toBeGreaterThan(100);
    expect(entry.triangles).toBeLessThanOrEqual(100);
    expect(entry.triangles).toBeGreaterThan(0);
    expect(document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('TEXCOORD_0')).toBeTruthy();
  });
  it('atlases distinct PBR materials into one primitive/material', async () => {
    const { document } = await processDocument(await messyDocument({ differentMaterials: true }), options);
    expect(document.getRoot().listMaterials()).toHaveLength(1);
    expect(document.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(1);
  });
  it('generates missing normals/UVs, and rejects invalid bounds or unsupported tiled UVs clearly', async () => {
    const doc = await messyDocument();
    for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      primitive.setAttribute('NORMAL', null).setAttribute('TEXCOORD_0', null);
    }
    const { document } = await processDocument(doc, options);
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(primitive.getAttribute('NORMAL').getCount()).toBe(primitive.getAttribute('POSITION').getCount());
    expect(primitive.getAttribute('TEXCOORD_0').getCount()).toBe(primitive.getAttribute('POSITION').getCount());
    await expect(processDocument(doc, { ...options, height: 0 })).rejects.toThrow('height must be positive');
    const tiled = await messyDocument();
    tiled.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('TEXCOORD_0').setElement(0, [2, 0]);
    await expect(processDocument(tiled, options)).rejects.toThrow('Tiled UVs');
  });
  it('preserves optional PBR maps and material factors in its bounded WebP atlases', async () => {
    const doc = await messyDocument();
    const material = doc.getRoot().listMaterials()[0];
    const texture = doc.getRoot().listTextures()[0];
    material.setNormalTexture(texture).setNormalScale(0.5).setMetallicRoughnessTexture(texture)
      .setMetallicFactor(0.25).setRoughnessFactor(0.5).setOcclusionTexture(texture).setOcclusionStrength(0.5);
    const { document } = await processDocument(doc, options);
    const output = document.getRoot().listMaterials()[0];
    for (const name of ['BaseColor', 'Normal', 'MetallicRoughness', 'Occlusion']) {
      const image = output[`get${name}Texture`]();
      expect(image).toBeTruthy();
      const meta = await sharp(image.getImage()).metadata();
      expect(meta.width).toBeLessThanOrEqual(16);
      expect(meta.height).toBeLessThanOrEqual(16);
    }
    const mr = await sharp(output.getMetallicRoughnessTexture().getImage()).raw().toBuffer();
    // Lossy WebP may shift packed channel values slightly; ±4 of 255 is visually irrelevant.
    expect(Math.abs(mr[1] - 64)).toBeLessThanOrEqual(4);
    expect(Math.abs(mr[2] - 32)).toBeLessThanOrEqual(4);
  });
  it('compresses geometry with meshopt and keeps shape and triangles after decoding', async () => {
    const { document, entry } = await processDocument(await messyDocument(), options);
    const before = bounds(document);
    await compressDocument(document);
    const binary = await createIO().writeBinary(document);
    const decoded = await createIO().readBinary(binary);
    expect(decoded.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain('EXT_meshopt_compression');
    const primitive = decoded.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(primitive.getIndices().getCount() / 3).toBe(entry.triangles);
    const after = bounds(decoded);
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(after.min[axis] - before.min[axis])).toBeLessThan(0.002);
      expect(Math.abs(after.max[axis] - before.max[axis])).toBeLessThan(0.002);
    }
  });
  it('writes lossy, opaque WebP textures so models stay small', async () => {
    const doc = await messyDocument();
    doc.getRoot().listMaterials()[0].setNormalTexture(doc.getRoot().listTextures()[0]);
    const { document } = await processDocument(doc, { ...options, textureSize: 64 });
    const material = document.getRoot().listMaterials()[0];
    for (const name of ['BaseColor', 'Normal']) {
      const bytes = Buffer.from(material[`get${name}Texture`]().getImage());
      // RIFF chunk ids: 'VP8 ' is lossy, 'VP8L' is lossless, 'ALPH' is an alpha channel.
      expect(bytes.includes(Buffer.from('VP8 '))).toBe(true);
      expect(bytes.includes(Buffer.from('VP8L'))).toBe(false);
      expect(bytes.includes(Buffer.from('ALPH'))).toBe(false);
    }
  });
  it('skips missing files with warnings; names invalid GLB files clearly', async () => {
    await mkdir('.shots', { recursive: true });
    const dir = await mkdtemp(resolve('.shots/models-test-'));
    const source = join(dir, 'source');
    await mkdir(source);
    const manifest = { pieces: { p: { file: 'pawn.glb', rotationYDegrees: -90 }, k: { file: 'king.glb', rotationYDegrees: 0 } }, heights: { p: 0.8, k: 1.45 }, maxFootprint: 0.78, maxTriangles: 20000, textureSize: 16 };
    await writeFile(join(source, 'pawn.glb'), await createIO().writeBinary(await messyDocument()));
    const warn = vi.fn();
    const output = await processModels({ source, out: join(dir, 'out'), manifest, warn, log: vi.fn() });
    expect(Object.keys(output.pieces)).toEqual(['p']);
    expect(output.pieces.p.file).toBe('p.glb');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('king.glb'));
    expect(JSON.parse(await readFile(join(dir, 'out/manifest.json'), 'utf8'))).toEqual(output);
    await writeFile(join(source, 'pawn.glb'), 'not a glb');
    await expect(processModels({ source, out: join(dir, 'invalid-out'), manifest, warn, log: vi.fn() })).rejects.toThrow(/pawn\.glb/);
  });
});
