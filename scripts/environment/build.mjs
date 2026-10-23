// Builds the scanned environment: downloads CC0 sources once (see fetch.mjs), reduces each
// model into ground-centred variants with LODs, converts textures to WebP and writes
// meshopt-compressed GLBs plus tiling textures to public/environment/.
//
//   node scripts/environment/build.mjs            # everything
//   node scripts/environment/build.mjs rock_07    # selected ids
//
// KTX2 would need a Basis encoder that is not installed here; WebP (EXT_texture_webp) keeps
// the download small and decodes natively in every supported browser.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { MODELS, TEXTURES } from './catalog.mjs';
import { assetInfo, polyHavenModel, polyHavenModelMap, polyHavenTexture } from './fetch.mjs';
import { bounds, groundOffset, leafCards, simplifySolid, thinComponents, translate, triangleCount } from './geometry.mjs';

const OUTPUT = resolve('public/environment');
const MODEL_OUTPUT = join(OUTPUT, 'models');
const PIXEL_LIMIT = 16_777_216;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const isAlpha = (material) => material && material.getAlphaMode() !== 'OPAQUE';

/** Raw arrays of one primitive with the node's world transform baked in. */
function readGeo(primitive, matrix) {
  const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), uv = primitive.getAttribute('TEXCOORD_0');
  const count = position.getCount();
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const p = [], n = [], t = [];
  for (let i = 0; i < count; i++) {
    position.getElement(i, p);
    positions.set([
      matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
      matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
      matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14],
    ], i * 3);
    if (normal) {
      normal.getElement(i, n);
      const x = matrix[0] * n[0] + matrix[4] * n[1] + matrix[8] * n[2];
      const y = matrix[1] * n[0] + matrix[5] * n[1] + matrix[9] * n[2];
      const z = matrix[2] * n[0] + matrix[6] * n[1] + matrix[10] * n[2];
      const length = Math.hypot(x, y, z) || 1;
      normals.set([x / length, y / length, z / length], i * 3);
    }
    if (uv) { uv.getElement(i, t); uvs.set(t, i * 2); }
  }
  const indices = primitive.getIndices() ? Uint32Array.from(primitive.getIndices().getArray()) : Uint32Array.from({ length: count }, (_, i) => i);
  return { positions, normals, uvs, indices };
}

async function reduce(part, lod) {
  if (isAlpha(part.material)) {
    const alpha = lod.alpha ?? {};
    let geo = part.geo;
    if (alpha.cards) geo = leafCards(geo);
    if (alpha.keep !== undefined && alpha.keep < 1) geo = thinComponents(geo, alpha.keep, alpha.grow ?? 1, 7);
    if (alpha.simplify) geo = await simplifySolid(geo, alpha.simplify, { error: 0.08 });
    return geo;
  }
  return simplifySolid(part.geo, lod.solid ?? Infinity, { error: lod.solid < 2000 ? 0.2 : 0.06, prune: lod.prune });
}

function writePrimitive(document, buffer, geo, material) {
  const accessor = (type, array) => document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  return document.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', accessor('VEC3', geo.positions))
    .setAttribute('NORMAL', accessor('VEC3', geo.normals))
    .setAttribute('TEXCOORD_0', accessor('VEC2', geo.uvs))
    .setIndices(accessor('SCALAR', geo.positions.length / 3 > 65535 ? geo.indices : Uint16Array.from(geo.indices)));
}

/**
 * The JPEG glTF cannot carry the leaf alpha: merge the published alpha mask into each
 * cut-out material's base colour, and make it alpha-tested (sorting-free) and two-sided.
 */
async function attachAlpha(id, document) {
  const merged = new Map();
  for (const material of document.getRoot().listMaterials()) {
    if (!isAlpha(material)) continue;
    const texture = material.getBaseColorTexture();
    material.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true);
    if (!texture) continue;
    const name = basename(texture.getURI());
    if (!merged.has(name)) {
      const color = texture.getImage();
      const { width, height } = await sharp(color, { limitInputPixels: PIXEL_LIMIT }).metadata();
      const mask = await sharp(await polyHavenModelMap(id, name.replace('_diff_', '_alpha_')), { limitInputPixels: PIXEL_LIMIT })
        .resize(width, height).extractChannel(0).toBuffer();
      // Two steps: sharp orders its operations itself, so removeAlpha would also drop the joined mask.
      const rgb = await sharp(color, { limitInputPixels: PIXEL_LIMIT }).removeAlpha().png().toBuffer();
      const rgba = await sharp(rgb).joinChannel(mask).png().toBuffer();
      if (!(await sharp(rgba).metadata()).hasAlpha) throw new Error(`${id}: alpha merge failed for ${name}`);
      merged.set(name, document.createTexture(`${name.replace(/_1k\.jpg$/, '')}_rgba`).setImage(rgba).setMimeType('image/png').setURI(name.replace('.jpg', '.png')));
    }
    material.setBaseColorTexture(merged.get(name));
  }
  // Opaque bark sharing the same colour image reuses the merged texture (alpha ignored).
  for (const material of document.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    const replacement = texture && merged.get(basename(texture.getURI() ?? ''));
    if (!isAlpha(material) && replacement) material.setBaseColorTexture(replacement);
  }
}

async function buildModel(spec) {
  const info = await assetInfo(spec.id);
  const { json, resources } = await polyHavenModel(spec.id);
  const document = await io.readJSON({ json, resources });
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const buffer = root.listBuffers()[0];
  const sources = root.listNodes().filter((node) => node.getMesh() && (!spec.variants || spec.variants.includes(node.getName())));
  if (spec.variants && sources.length !== spec.variants.length) throw new Error(`${spec.id}: missing variants`);
  const report = [];
  const outputs = [];
  for (const [index, node] of sources.entries()) {
    const matrix = node.getWorldMatrix();
    let parts = node.getMesh().listPrimitives().map((primitive) => ({ material: primitive.getMaterial(), geo: readGeo(primitive, matrix) }));
    const solids = parts.filter((part) => !isAlpha(part.material));
    const offset = groundOffset((solids.length ? solids : parts).map((part) => part.geo), { trunk: spec.role === 'tree' });
    parts = parts.map((part) => ({ ...part, geo: translate(part.geo, offset) }));
    const letter = String.fromCharCode(97 + index);
    for (const [level, lod] of spec.lods.entries()) {
      const mesh = document.createMesh(`${spec.id}_${letter}_lod${level}`);
      let triangles = 0;
      const extent = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const part of parts) {
        const geo = await reduce(part, lod);
        if (!triangleCount(geo)) continue;
        triangles += triangleCount(geo);
        const box = bounds(geo);
        for (let axis = 0; axis < 3; axis++) {
          extent.min[axis] = Math.min(extent.min[axis], box.min[axis]);
          extent.max[axis] = Math.max(extent.max[axis], box.max[axis]);
        }
        mesh.addPrimitive(writePrimitive(document, buffer, geo, part.material));
      }
      const height = extent.max[1];
      const radius = Math.max(...[0, 2].flatMap((axis) => [Math.abs(extent.min[axis]), Math.abs(extent.max[axis])]));
      outputs.push(document.createNode(`${letter}_lod${level}`).setMesh(mesh)
        .setExtras({ variant: index, lod: level, height: +height.toFixed(3), radius: +radius.toFixed(3), triangles }));
      report.push({ variant: letter, lod: level, triangles, height });
    }
  }
  for (const child of scene.listChildren()) scene.removeChild(child);
  for (const node of root.listNodes()) if (!outputs.includes(node)) node.dispose();
  for (const node of outputs) scene.addChild(node);
  await attachAlpha(spec.id, document);
  await document.transform(
    prune(), dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.texture, spec.texture], quality: 82, limitInputPixels: PIXEL_LIMIT }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  await MeshoptEncoder.ready;
  await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await mkdir(MODEL_OUTPUT, { recursive: true });
  const file = join(MODEL_OUTPUT, `${spec.id}.glb`);
  await writeFile(file, await io.writeBinary(document));
  return { ...info, file, bytes: (await stat(file)).size, report };
}

async function buildTexture(spec) {
  const info = await assetInfo(spec.id);
  const outputs = [];
  for (const [map, suffix, size, quality] of [['Diffuse', 'diff', spec.size, 82], ['nor_gl', 'nor_gl', spec.normalSize, 85], ['Rough', 'rough', spec.size / 2, 80]]) {
    const source = await polyHavenTexture(spec.id, map, '1k');
    const file = join(OUTPUT, `${spec.id}_${suffix}.webp`);
    await sharp(source, { limitInputPixels: PIXEL_LIMIT }).resize(size, size).webp({ quality }).toFile(file);
    outputs.push({ file, bytes: (await stat(file)).size });
  }
  return { ...info, outputs };
}

const only = new Set(process.argv.slice(2));
const selected = (spec) => !only.size || only.has(spec.id);
let total = 0;
for (const spec of MODELS.filter(selected)) {
  const result = await buildModel(spec);
  total += result.bytes;
  console.log(`${spec.id}: ${result.bytes} bytes — ${result.authors.join(', ')}`);
  for (const row of result.report) console.log(`  ${row.variant} lod${row.lod}: ${row.triangles} triangles, ${row.height.toFixed(2)} m`);
}
for (const spec of TEXTURES.filter(selected)) {
  const result = await buildTexture(spec);
  for (const output of result.outputs) {
    total += output.bytes;
    console.log(`${basename(output.file)}: ${output.bytes} bytes — ${result.authors.join(', ')}`);
  }
}
console.log(`total written: ${total} bytes`);
