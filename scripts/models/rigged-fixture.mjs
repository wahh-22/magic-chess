import { Document } from '@gltf-transform/core';
import { BoxGeometry, Matrix4 } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createIO } from './process.mjs';

/** Deliberately messy frame, common skeleton, and two separately exported clips. */
export function riggedFixture(clip = 'idle') {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  const root = doc.createNode('export-root').setTranslation([19, -42, 8]).setScale([3, 3, 3]).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  doc.createScene().addChild(root);
  const hips = doc.createNode('mixamorig:Hips');
  const arm = doc.createNode('mixamorig:RightArm').setTranslation([0, 0.65, 0]);
  const hand = doc.createNode('mixamorig:RightHand').setTranslation([0.2, 0, 0]);
  root.addChild(hips); hips.addChild(arm); arm.addChild(hand);
  const joints = [hips, arm, hand];
  const skin = doc.createSkin('humanoid').setSkeleton(hips);
  for (const joint of joints) skin.addJoint(joint);
  // glTF skin matrices map mesh-space vertices to each joint's bind frame.
  const rootInverse = new Matrix4().fromArray(root.getWorldMatrix()).invert();
  skin.setInverseBindMatrices(accessor('MAT4', new Float32Array(joints.flatMap((joint) =>
    new Matrix4().multiplyMatrices(rootInverse, new Matrix4().fromArray(joint.getWorldMatrix())).invert().toArray()))));
  const material = doc.createMaterial('stone').setBaseColorFactor([0.8, 0.75, 0.6, 1]);
  const mesh = doc.createMesh('humanoid');
  for (const [i, dimensions] of [[0, [0.26, 1, 0.2]], [1, [0.25, 0.12, 0.12]]]) {
    const geometry = new BoxGeometry(...dimensions, 2, 4, 2);
    geometry.translate(i ? 0.24 : 0, i ? 0.65 : 0.5, 0);
    const count = geometry.attributes.position.count;
    const primitive = doc.createPrimitive().setMaterial(material);
    for (const [semantic, name, type] of [['POSITION', 'position', 'VEC3'], ['NORMAL', 'normal', 'VEC3'], ['TEXCOORD_0', 'uv', 'VEC2']]) {
      primitive.setAttribute(semantic, accessor(type, new Float32Array(geometry.attributes[name].array)));
    }
    primitive.setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(Array.from({ length: count }, () => [i ? 2 : 0, 0, 0, 0]).flat())));
    primitive.setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(Array.from({ length: count }, () => [1, 0, 0, 0]).flat())));
    primitive.setIndices(accessor('SCALAR', new Uint32Array(geometry.index.array)));
    mesh.addPrimitive(primitive);
  }
  root.addChild(doc.createNode('body').setMesh(mesh).setSkin(skin));
  const times = clip === 'attack' ? [0, 0.4, 1] : [0, 1, 2];
  const values = clip === 'attack' ? [0.2, 0, 0, 0.8, 0, 0, 0.2, 0, 0] : [0.2, 0, 0, 0.2, 0.04, 0, 0.2, 0, 0];
  const sampler = doc.createAnimationSampler().setInput(accessor('SCALAR', new Float32Array(times)))
    .setOutput(accessor('VEC3', new Float32Array(values))).setInterpolation('LINEAR');
  doc.createAnimation(clip).addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(hand).setTargetPath('translation').setSampler(sampler));
  return doc;
}

export async function writeRiggedFixture(directory) {
  await mkdir(directory, { recursive: true });
  const io = createIO();
  for (const name of ['idle', 'attack']) await writeFile(join(directory, `pawn-${name}.glb`), await io.writeBinary(riggedFixture(name)));
  const manifest = { pieces: { p: { rotationYDegrees: -90, rigged: { files: ['pawn-*.glb'], clips: { idle: 'idle', attack: 'attack' }, hitTimeMs: null } } }, heights: { p: 0.896 }, maxFootprint: 0.78, maxTriangles: 20000, textureSize: 64 };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
