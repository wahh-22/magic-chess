import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { BufferGeometry, BufferAttribute, Matrix4 } from 'three';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, glob } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';

export function createIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

/**
 * Lossless meshopt compression. Quantization is deliberately not used: it moves scale and
 * offset into the node transform, while the loader contract reads normalized geometry only.
 */
export async function compressDocument(document) {
  await MeshoptEncoder.ready;
  await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

function validateOptions(options) {
  for (const name of ['height', 'maxFootprint', 'maxTriangles', 'textureSize']) {
    if (!Number.isFinite(options[name]) || options[name] <= 0) throw new Error(`${name} must be positive`);
  }
  if (!Number.isInteger(options.maxTriangles) || !Number.isInteger(options.textureSize)) throw new Error('maxTriangles and textureSize must be integers');
  if (!Number.isFinite(options.rotationYDegrees)) throw new Error('rotationYDegrees must be finite');
}

function normalize(geometry, { height, maxFootprint }) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const h = box.max.y - box.min.y;
  const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  if (!(h > 0) || !Number.isFinite(h + footprint)) throw new Error('Model has empty, flat, or non-finite geometry');
  const scale = Math.min(height / h, maxFootprint / footprint);
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
}

const slots = [
  ['BaseColor', [255, 255, 255, 255]],
  ['Normal', [128, 128, 255, 255]],
  ['MetallicRoughness', [255, 255, 255, 255]],
  ['Occlusion', [255, 255, 255, 255]],
];

const WEBP_QUALITY = { Normal: 90, MetallicRoughness: 88 };

// A bounded atlas lets differently textured input primitives share one PBR material.
// Edge padding keeps bilinear sampling inside the correct tile at UV seams.
export async function atlasMaterials(document, materials, textureSize) {
  const grid = Math.ceil(Math.sqrt(materials.length));
  const tile = Math.floor(textureSize / grid);
  if (tile < 5) throw new Error('textureSize too small for the material atlas (need >= 5 pixels per tile)');
  const inner = tile - 4;
  const size = tile * grid;
  const material = document.createMaterial('Stone').setRoughnessFactor(1).setMetallicFactor(1);
  const averages = [];
  for (const [slot, fallback] of slots) {
    if (slot !== 'BaseColor' && !materials.some((m) => m?.[`get${slot}Texture`]()) && slot !== 'MetallicRoughness') continue;
    const images = [];
    for (const [i, source] of materials.entries()) {
      const texture = source?.[`get${slot}Texture`]();
      const info = source?.[`get${slot}TextureInfo`]();
      if (texture && (info.getTexCoord() !== 0 || info.getExtension('KHR_texture_transform'))) {
        throw new Error('Only TEXCOORD_0 without KHR_texture_transform is supported; bake texture coordinates before processing');
      }
      const factor = source?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const pixels = texture
        ? await sharp(texture.getImage()).resize(inner, inner, { fit: 'fill' }).ensureAlpha().raw().toBuffer()
        : Buffer.from(Array.from({ length: inner * inner }, () => fallback).flat());
      const sum = [0, 0, 0];
      for (let p = 0; p < pixels.length; p += 4) {
        if (slot === 'BaseColor') {
          for (let c = 0; c < 4; c++) pixels[p + c] = Math.round(pixels[p + c] * factor[c]);
          for (let c = 0; c < 3; c++) sum[c] += pixels[p + c];
        } else if (slot === 'MetallicRoughness') {
          pixels[p + 1] = Math.round(pixels[p + 1] * (source?.getRoughnessFactor() ?? 1));
          pixels[p + 2] = Math.round(pixels[p + 2] * (source?.getMetallicFactor() ?? 1));
        } else if (slot === 'Normal') {
          const strength = source?.getNormalScale() ?? 1;
          // Scale tangent-space x/y and renormalize.
          let x = (pixels[p] / 127.5 - 1) * strength;
          let y = (pixels[p + 1] / 127.5 - 1) * strength;
          let z = pixels[p + 2] / 127.5 - 1;
          const length = Math.hypot(x, y, z) || 1;
          x /= length; y /= length; z /= length;
          pixels[p] = Math.round((x + 1) * 127.5);
          pixels[p + 1] = Math.round((y + 1) * 127.5);
          pixels[p + 2] = Math.round((z + 1) * 127.5);
        } else if (slot === 'Occlusion') {
          pixels[p] = Math.round(255 + (pixels[p] - 255) * (source?.getOcclusionStrength() ?? 1));
        }
      }
      if (slot === 'BaseColor') averages.push(sum.map((v) => v / (inner * inner)));
      const input = await sharp(pixels, { raw: { width: inner, height: inner, channels: 4 } })
        .extend({ top: 2, bottom: 2, left: 2, right: 2, extendWith: 'copy' }).png().toBuffer();
      images.push({ input, left: (i % grid) * tile, top: Math.floor(i / grid) * tile });
    }
    // Pieces are opaque, so drop alpha. Lossy WebP is ~6-8x smaller than lossless and
    // indistinguishable on stone; normals get a higher quality to avoid shading artifacts.
    const image = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
      .composite(images).removeAlpha().webp({ quality: WEBP_QUALITY[slot] ?? 82 }).toBuffer();
    const texture = document.createTexture(slot).setMimeType('image/webp').setImage(image);
    material[`set${slot}Texture`](texture);
  }
  document.createExtension(EXTTextureWebP).setRequired(true);
  return { material, averages, remap: (uv, i) => [((i % grid) * tile + 2 + uv[0] * inner) / size, (Math.floor(i / grid) * tile + 2 + uv[1] * inner) / size] };
}

/** Returns a fresh static document; the source is never mutated. */
export async function processDocument(source, options) {
  validateOptions(options);
  const document = new Document();
  const buffer = document.createBuffer();
  const instances = [];
  const scene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  if (!scene) throw new Error('Model contains no scene');
  scene.traverse((node) => {
    if (node.getSkin()) throw new Error('Skinned models must be baked to a static mesh first');
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) throw new Error('Only static TRIANGLES primitives are supported');
      instances.push({ primitive, matrix: new Matrix4().fromArray(node.getWorldMatrix()) });
    }
  });
  if (!instances.length) throw new Error('Model contains no mesh primitives');
  const materials = [...new Set(instances.map(({ primitive }) => primitive.getMaterial()))];
  const atlas = await atlasMaterials(document, materials, options.textureSize);
  const positions = [], normals = [], uvs = [], indices = [];
  const colorSums = [0, 0, 0];
  let totalArea = 0;
  for (const { primitive, matrix } of instances) {
    const position = primitive.getAttribute('POSITION');
    if (!position) throw new Error('Primitive has no POSITION attribute');
    const geometry = new BufferGeometry();
    const materialIndex = materials.indexOf(primitive.getMaterial());
    for (const [semantic, name, width] of [['POSITION', 'position', 3], ['NORMAL', 'normal', 3], ['TEXCOORD_0', 'uv', 2]]) {
      const accessor = primitive.getAttribute(semantic);
      if (accessor) {
        const data = [];
        for (let i = 0; i < accessor.getCount(); i++) data.push(...accessor.getElement(i, []));
        geometry.setAttribute(name, new BufferAttribute(new Float32Array(data), width));
      }
    }
    const inputIndices = primitive.getIndices();
    const ids = inputIndices ? Array.from(inputIndices.getArray()) : Array.from({ length: position.getCount() }, (_, i) => i);
    if (matrix.determinant() < 0) for (let i = 0; i < ids.length; i += 3) [ids[i + 1], ids[i + 2]] = [ids[i + 2], ids[i + 1]];
    geometry.setIndex(ids);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.applyMatrix4(matrix);
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const offset = positions.length / 3;
    for (const value of p.array) positions.push(value);
    for (const value of n.array) normals.push(value);
    for (let i = 0; i < p.count; i++) {
      const coords = uv ? [uv.getX(i), uv.getY(i)] : [0.5, 0.5];
      if (coords.some((v) => v < -1e-5 || v > 1.00001)) throw new Error('Tiled UVs outside [0,1] must be baked before atlasing');
      uvs.push(...atlas.remap(coords.map((v) => Math.max(0, Math.min(1, v))), materialIndex));
    }
    for (const id of ids) indices.push(id + offset);
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i] * 3, b = ids[i + 1] * 3, c = ids[i + 2] * 3;
      const ab = [0, 1, 2].map((j) => p.array[b + j] - p.array[a + j]);
      const ac = [0, 1, 2].map((j) => p.array[c + j] - p.array[a + j]);
      const area = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
      totalArea += area;
      for (let j = 0; j < 3; j++) colorSums[j] += atlas.averages[materialIndex][j] * area;
    }
  }
  const trianglesBefore = indices.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.rotateY(options.rotationYDegrees * Math.PI / 180);
  normalize(geometry, options);
  const primitive = document.createPrimitive().setMaterial(atlas.material);
  for (const [semantic, name, type] of [['POSITION', 'position', 'VEC3'], ['NORMAL', 'normal', 'VEC3'], ['TEXCOORD_0', 'uv', 'VEC2']]) {
    primitive.setAttribute(semantic, document.createAccessor().setBuffer(buffer).setType(type).setArray(geometry.getAttribute(name).array));
  }
  primitive.setIndices(document.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(indices)));
  document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));
  // Weld only identical complete vertices: normal and UV seams are retained.
  await document.transform(weld());
  if (trianglesBefore > options.maxTriangles) {
    await MeshoptSimplifier.ready;
    const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
      primitive.getIndices().getArray(), primitive.getAttribute('POSITION').getArray(), 3,
      primitive.getAttribute('TEXCOORD_0').getArray(), 2, [1, 1], null,
      options.maxTriangles * 3, 1, ['Permissive'],
    );
    if (!simplified.length || simplified.length / 3 > options.maxTriangles) throw new Error(`Cannot reach maxTriangles=${options.maxTriangles} while preserving UV topology`);
    primitive.getIndices().setArray(simplified);
  }
  // Compact unused vertices, then normalize again so reported bounds describe only visible geometry.
  const oldIds = primitive.getIndices().getArray();
  const used = [...new Set(oldIds)];
  const remap = new Map(used.map((id, i) => [id, i]));
  for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
    const accessor = primitive.getAttribute(semantic);
    accessor.setArray(new Float32Array(used.flatMap((id) => accessor.getElement(id, []))));
  }
  primitive.getIndices().setArray(new Uint32Array(Array.from(oldIds, (id) => remap.get(id))));
  geometry.setAttribute('position', new BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
  normalize(geometry, options);
  const box = geometry.boundingBox;
  const fragmentColor = '#' + colorSums.map((v) => Math.round(v / (totalArea || 1)).toString(16).padStart(2, '0')).join('');
  return { document, trianglesBefore, entry: { height: box.max.y - box.min.y, footprint: Math.max(box.max.x - box.min.x, box.max.z - box.min.z), triangles: oldIds.length / 3, fragmentColor } };
}

export async function processModels({ source, out, manifest, warn = console.warn, log = console.log }) {
  const io = createIO();
  const result = { version: 1, pieces: {} };
  // Process everything before writing: malformed sources do not replace the manifest.
  const outputs = [];
  for (const [type, settings] of Object.entries(manifest.pieces)) {
    if (!['p', 'n', 'b', 'r', 'q', 'k'].includes(type)) throw new Error(`Unknown piece type: ${type}`);
    if (settings.rigged) {
      validateOptions({ ...manifest, height: manifest.heights[type], rotationYDegrees: settings.rotationYDegrees });
      const patterns = settings.rigged.files;
      if (!Array.isArray(patterns) || !patterns.length || patterns.some((p) => typeof p !== 'string' || p.includes('..') || p.startsWith('/') || !p.endsWith('.glb'))) throw new Error(`Invalid rigged files for ${type}`);
      const files = new Set();
      for (const pattern of patterns) for await (const file of glob(pattern, { cwd: source })) files.add(file);
      if (!files.size) { warn(`Skipping missing rigged model: ${patterns.join(', ')}`); continue; }
      try {
        const { processRigged } = await import('./rigged.mjs');
        const docs = [];
        for (const file of [...files].sort()) docs.push(await io.read(resolve(source, file)));
        const processed = await processRigged(docs, { ...manifest, height: manifest.heights[type], rotationYDegrees: settings.rotationYDegrees }, settings.rigged, warn);
        await compressDocument(processed.document);
        outputs.push({ type, binary: await io.writeBinary(processed.document), file: [...files].join(', '), before: processed.trianglesBefore, after: processed.entry.triangles });
        result.pieces[type] = { file: `${type}.glb`, ...processed.entry };
      } catch (error) { throw new Error(`Failed to process rigged ${type}: ${error.message}`, { cause: error }); }
      continue;
    }
    if (basename(settings.file) !== settings.file || !settings.file.endsWith('.glb')) throw new Error(`Invalid source filename: ${settings.file}`);
    const file = resolve(source, settings.file);
    let bytes;
    try { bytes = await readFile(file); } catch (error) {
      if (error.code === 'ENOENT') { warn(`Skipping missing model: ${file}`); continue; }
      throw error;
    }
    try {
      const processed = await processDocument(await io.readBinary(new Uint8Array(bytes)), { ...manifest, height: manifest.heights[type], rotationYDegrees: settings.rotationYDegrees });
      await compressDocument(processed.document);
      const binary = await io.writeBinary(processed.document);
      result.pieces[type] = { file: `${type}.glb`, ...processed.entry };
      outputs.push({ type, binary, file, before: processed.trianglesBefore, after: processed.entry.triangles });
    } catch (error) { throw new Error(`Failed to process ${file}: ${error.message}`, { cause: error }); }
  }
  await mkdir(out, { recursive: true });
  for (const { type, binary, file, before, after } of outputs) {
    const destination = join(out, `${type}.glb`);
    await writeFile(destination, binary);
    log(`${file} → ${destination} | triangles ${before} → ${after} | ${(binary.byteLength / 1024).toFixed(1)} KB`);
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
