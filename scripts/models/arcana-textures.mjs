import { Document } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { copyToDocument, createDefaultPropertyResolver } from '@gltf-transform/functions';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

/** One library for both palettes. Only image bytes are decoded; source code is never executed. */
export function createMaterialLibrary() {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene('shared-materials');
  const mesh = document.createMesh('material-swatches');
  scene.addChild(document.createNode().setMesh(mesh));
  const position = document.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const indices = document.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array([0, 1, 2]));
  const materials = new Map(), textures = new Map();
  return {
    document,
    add(source) {
      const fallback = createDefaultPropertyResolver(document, source);
      for (const material of source.getRoot().listMaterials()) {
        if (materials.has(material.getName())) continue;
        const resolver = property => {
          if (property.propertyType === 'Texture') {
            const key = createHash('sha256').update(property.getImage()).digest('hex');
            if (textures.has(key)) return textures.get(key);
            const copy = fallback(property);
            textures.set(key, copy);
            return copy;
          }
          return fallback(property);
        };
        const copied = copyToDocument(document, source, [material], resolver).get(material);
        materials.set(material.getName(), copied);
        mesh.addPrimitive(document.createPrimitive().setMaterial(copied).setAttribute('POSITION', position).setIndices(indices));
      }
    },
    async finish(size = 1024) {
      for (const texture of document.getRoot().listTextures()) {
        const normal = /normal/i.test(texture.getName());
        const dimension = normal ? Math.min(size, 512) : size;
        const image = await sharp(texture.getImage()).resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true }).removeAlpha().webp({ quality: normal ? 95 : 88 }).toBuffer();
        texture.setImage(image).setMimeType('image/webp').setURI('');
      }
      document.createExtension(EXTTextureWebP).setRequired(true);
      return document;
    },
  };
}

/** Preserve names/factors/UVs in each piece, but ship images only in the library. */
export function detachSharedTextures(document) {
  for (const material of document.getRoot().listMaterials()) {
    for (const slot of ['BaseColor', 'Normal', 'MetallicRoughness', 'Occlusion', 'Emissive']) material[`set${slot}Texture`](null);
  }
  for (const texture of document.getRoot().listTextures()) texture.dispose();
}
