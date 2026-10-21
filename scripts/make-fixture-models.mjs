// Node 24 strips TypeScript; resolve extensionless relative TS imports used by the Vite app.
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || extname(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const { createProceduralPieceProvider } = await import('../src/scene/pieces/proceduralPieces.ts');
import { Document } from '@gltf-transform/core';
import { weld } from '@gltf-transform/functions';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createIO } from './models/process.mjs';

if (process.argv.includes('--rigged')) {
  const { writeRiggedFixture } = await import('./models/rigged-fixture.mjs');
  await writeRiggedFixture('assets/models/fixtures/rigged');
  console.log('Wrote assets/models/fixtures/rigged (idle + attack, hit at 400 ms)');
  process.exit(0);
}

const directory = 'assets/models/fixtures';
await mkdir(directory, { recursive: true });
let manifest;
try {
  manifest = JSON.parse(await readFile('assets/models/manifest.json', 'utf8'));
} catch (error) {
  throw new Error(`Cannot read fixture settings assets/models/manifest.json: ${error.message}`, { cause: error });
}
const provider = createProceduralPieceProvider();
// Deterministic mottling: fixtures are small, reproducible, and contain no external assets.
const pixels = Buffer.alloc(16 * 16 * 4);
for (let i = 0; i < 256; i++) {
  const shade = 160 + ((i * 73 + Math.floor(i / 16) * 17) % 60);
  pixels.set([shade, shade - 3, shade - 8, 255], i * 4);
}
const image = await sharp(pixels, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
for (const [type, settings] of Object.entries(manifest.pieces)) {
  settings.rotationYDegrees = -90;
  const document = new Document();
  const buffer = document.createBuffer();
  const texture = document.createTexture('stone').setMimeType('image/png').setImage(image);
  const material = document.createMaterial('stone').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.95);
  const geometry = provider.geometry(type);
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = flat.getAttribute('position').count;
  // ExtrudeGeometry uses planar UVs (including negatives); fit the fixture texture to that chart.
  const uv = flat.getAttribute('uv');
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (let i = 0; i < uv.count; i++) for (let c = 0; c < 2; c++) {
    min[c] = Math.min(min[c], uv.array[i * 2 + c]);
    max[c] = Math.max(max[c], uv.array[i * 2 + c]);
  }
  for (let i = 0; i < uv.count; i++) for (let c = 0; c < 2; c++) uv.array[i * 2 + c] = (uv.array[i * 2 + c] - min[c]) / (max[c] - min[c] || 1);
  const split = Math.floor(count / 6) * 3;
  const parent = document.createNode('messy-frame').setTranslation([12, -23, 9]).setScale([37, 37, 37]).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  document.createScene().addChild(parent);
  for (const [start, end] of [[0, split], [split, count]]) {
    const primitive = document.createPrimitive().setMaterial(material);
    // Compensate a different translation on each child to exercise nested transform baking.
    const shift = start ? -0.17 : 0.23;
    for (const [semantic, name, width, accessorType] of [['POSITION', 'position', 3, 'VEC3'], ['NORMAL', 'normal', 3, 'VEC3'], ['TEXCOORD_0', 'uv', 2, 'VEC2']]) {
      const values = new Float32Array(flat.getAttribute(name).array.slice(start * width, end * width));
      if (name === 'position') for (let i = 0; i < values.length; i += 3) values[i] -= shift;
      primitive.setAttribute(semantic, document.createAccessor().setBuffer(buffer).setType(accessorType).setArray(values));
    }
    parent.addChild(document.createNode('split-part').setTranslation([shift, 0, 0]).setMesh(document.createMesh().addPrimitive(primitive)));
  }
  const output = `${directory}/${settings.file}`;
  await document.transform(weld());
  const binary = await createIO().writeBinary(document);
  await writeFile(output, binary);
  console.log(`${output} | ${(binary.byteLength / 1024).toFixed(1)} KB`);
}
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
