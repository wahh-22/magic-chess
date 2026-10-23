import { cloneDocument, copyToDocument, createDefaultPropertyResolver, joinPrimitives, compactPrimitive, unpartition, prune, quantize, weld } from '@gltf-transform/functions';
import { Matrix4, Vector3, Quaternion, Box3, BufferGeometry, BufferAttribute } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { atlasMaterials } from './process.mjs';
import { authorArcanaAttack } from './arcana-attacks.mjs';
import { simplifyRigidParts } from './simplify-parts.mjs';
import { detachSharedTextures } from './arcana-textures.mjs';
import { appendPedestal, selectContractClips, selectV4Clips } from './arcana-v4.mjs';

/** Shared materials need UVs only: exported tangents and baked vertex colors are never read. */
function dropLibraryAttributes(document) {
  detachSharedTextures(document);
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    primitive.setAttribute('TANGENT', null).setAttribute('COLOR_0', null);
  }
}

/** Set animated bones' rest TRS to the idle clip's first key; inverse bind matrices stay. */
function restInClip(document, name) {
  const animation = document.getRoot().listAnimations().find(a => a.getName() === name || a.getName().endsWith(`__${name}`));
  if (!animation) throw new Error(`Missing idle clip ${name}`);
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler(), path = channel.getTargetPath();
    const value = sampler.getOutput().getElement(sampler.getInterpolation() === 'CUBICSPLINE' ? 1 : 0, []);
    if (path === 'rotation') channel.getTargetNode().setRotation(value);
    else if (path === 'translation') channel.getTargetNode().setTranslation(value);
    else if (path === 'scale') channel.getTargetNode().setScale(value);
  }
}

function namedNodes(doc) {
  const map = new Map();
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName() || map.has(node.getName())) throw new Error('Rig nodes must have unique, nonempty names');
    map.set(node.getName(), node);
  }
  return map;
}

/** Clips may use different node indices, never different bind hierarchies. */
export function mergeRigClips(doc, others) {
  const target = namedNodes(doc);
  for (const source of others) {
    const nodes = namedNodes(source);
    if (nodes.size !== target.size) throw new Error('Skeletons differ: node count');
    for (const [name, node] of nodes) {
      const match = target.get(name);
      if (!match || match.getParentNode()?.getName() !== node.getParentNode()?.getName() ||
        match.getMatrix().some((v, i) => Math.abs(v - node.getMatrix()[i]) > 1e-5)) throw new Error(`Skeletons differ at ${name}`);
    }
    const skins = source.getRoot().listSkins(), targets = doc.getRoot().listSkins();
    if (skins.length !== targets.length || skins.some((skin, i) =>
      skin.listJoints().map((n) => n.getName()).join('|') !== targets[i].listJoints().map((n) => n.getName()).join('|') ||
      JSON.stringify(Array.from(skin.getInverseBindMatrices()?.getArray() ?? [])) !== JSON.stringify(Array.from(targets[i].getInverseBindMatrices()?.getArray() ?? [])))) throw new Error('Skeletons differ: joints or inverse bind matrices');
    const fallback = createDefaultPropertyResolver(doc, source);
    copyToDocument(doc, source, source.getRoot().listAnimations(), (property) => nodes.get(property.getName()) === property ? target.get(property.getName()) : fallback(property));
  }
}

function duration(animation) {
  return Math.max(0, ...animation.listSamplers().map((s) => Math.max(...s.getInput().getArray()))) * 1000;
}

// Evaluate glTF interpolation directly, avoiding a GPU, image decoding or a browser.
function sample(channel, time) {
  const sampler = channel.getSampler(), times = sampler.getInput().getArray(), output = sampler.getOutput();
  let a = 0;
  while (a < times.length - 1 && times[a + 1] <= time) a++;
  const b = Math.min(a + 1, times.length - 1), span = times[b] - times[a];
  const t = span ? Math.max(0, Math.min(1, (time - times[a]) / span)) : 0;
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
  const va = output.getElement(cubic ? a * 3 + 1 : a, []), vb = output.getElement(cubic ? b * 3 + 1 : b, []);
  if (sampler.getInterpolation() === 'STEP' || a === b) return va;
  if (cubic) {
    const out = output.getElement(a * 3 + 2, []), incoming = output.getElement(b * 3, []);
    const result = va.map((v, i) => (2 * t ** 3 - 3 * t ** 2 + 1) * v + (t ** 3 - 2 * t ** 2 + t) * span * out[i] + (-2 * t ** 3 + 3 * t ** 2) * vb[i] + (t ** 3 - t ** 2) * span * incoming[i]);
    return channel.getTargetPath() === 'rotation' ? new Quaternion().fromArray(result).normalize().toArray() : result;
  }
  return channel.getTargetPath() === 'rotation' ? new Quaternion().fromArray(va).slerp(new Quaternion().fromArray(vb), t).toArray() : va.map((v, i) => v + (vb[i] - v) * t);
}

export function detectHitTime(document, animation, warn = console.warn) {
  const candidates = document.getRoot().listNodes().filter((node) => /righthand|right.*weapon|weapon.*right|sword/i.test(node.getName()));
  const end = duration(animation);
  if (!candidates.length) { warn('Cannot detect attack hit: no right-hand/weapon bone found; using clip midpoint. Set rigged.hitTimeMs manually.'); return end / 2; }
  const channels = animation.listChannels();
  let best = -Infinity, hit = 0;
  const frames = Math.ceil(end / 1000 * 60);
  for (let frame = 0; frame <= frames; frame++) {
    const time = Math.min(frame / 60, end / 1000);
    const locals = new Map();
    for (const channel of channels) {
      const node = channel.getTargetNode();
      if (!locals.has(node)) locals.set(node, { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() });
      locals.get(node)[channel.getTargetPath()] = sample(channel, time);
    }
    const worlds = new Map();
    const world = (node) => {
      if (worlds.has(node)) return worlds.get(node);
      const trs = locals.get(node);
      const matrix = trs ? new Matrix4().compose(new Vector3().fromArray(trs.translation), new Quaternion().fromArray(trs.rotation), new Vector3().fromArray(trs.scale)) : new Matrix4().fromArray(node.getMatrix());
      if (node.getParentNode()) matrix.premultiply(world(node.getParentNode()));
      worlds.set(node, matrix); return matrix;
    };
    const extent = Math.max(...candidates.map((node) => world(node).elements[12]));
    if (extent > best + 1e-8) { best = extent; hit = time * 1000; }
  }
  return Math.round(hit * 1000) / 1000;
}

function bindBounds(nodes) {
  const box = new Box3();
  for (const node of nodes) for (const primitive of node.getMesh().listPrimitives()) {
    const p = primitive.getAttribute('POSITION'), skin = node.getSkin();
    const weights = primitive.getAttribute('WEIGHTS_0'), joints = primitive.getAttribute('JOINTS_0');
    for (const id of new Set(primitive.getIndices()?.getArray() ?? Array.from({ length: p.getCount() }, (_, i) => i))) {
      const vertex = new Vector3().fromArray(p.getElement(id, []));
      if (skin) {
        const result = new Vector3(), w = weights.getElement(id, []), j = joints.getElement(id, []);
        for (let c = 0; c < 4; c++) if (w[c]) result.addScaledVector(vertex.clone().applyMatrix4((skin.getInverseBindMatrices() ? new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(j[c], [])) : new Matrix4()).premultiply(new Matrix4().fromArray(skin.listJoints()[j[c]].getWorldMatrix()))), w[c]);
        box.expandByPoint(result);
      } else box.expandByPoint(vertex.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix())));
    }
  }
  return box;
}

export async function processRigged(sources, options, settings, warn = console.warn) {
  const document = cloneDocument(sources[0]);
  mergeRigClips(document, sources.slice(1));
  const root = document.getRoot();
  const nodes = root.listNodes().filter((n) => n.getMesh());
  if (!nodes.length || nodes.some((n) => !n.getSkin())) throw new Error('Rigged input must contain skinned meshes only');
  const node = nodes[0];
  if (nodes.some((n) => n.getSkin() !== node.getSkin() || n.getWorldMatrix().some((v, i) => Math.abs(v - node.getWorldMatrix()[i]) > 1e-6))) throw new Error('Rigged mesh parts must share one skin and bind transform');
  const primitives = nodes.flatMap((n) => n.getMesh().listPrimitives());
  for (const p of primitives) {
    if (p.getMode() !== 4 || p.listTargets().length || !p.getAttribute('JOINTS_0') || !p.getAttribute('WEIGHTS_0')) throw new Error('Expected skinned TRIANGLES without morph targets');
    if (p.getAttribute('JOINTS_1')) throw new Error('More than four skin influences are not supported; reduce influences before export');
    const count = p.getAttribute('POSITION')?.getCount();
    if (!count || p.listAttributes().some((a) => a.getCount() !== count)) throw new Error('Rig vertex attribute counts differ');
    for (let i = 0; i < count; i++) {
      const joints = p.getAttribute('JOINTS_0').getElement(i, []), weights = p.getAttribute('WEIGHTS_0').getElement(i, []);
      if (joints.some((j) => !Number.isInteger(j) || j < 0 || j >= node.getSkin().listJoints().length) ||
        weights.some((w) => !Number.isFinite(w) || w < 0) || Math.abs(weights.reduce((sum, w) => sum + w, 0) - 1) > 0.005) throw new Error('Invalid skin joints or weights (weights must sum to 1)');
    }
    if (!p.getAttribute('NORMAL')) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(p.getAttribute('POSITION').getArray(), 3));
      if (p.getIndices()) geometry.setIndex(Array.from(p.getIndices().getArray()));
      geometry.computeVertexNormals();
      p.setAttribute('NORMAL', document.createAccessor().setBuffer(root.listBuffers()[0]).setType('VEC3').setArray(geometry.attributes.normal.array));
    }
  }
  const materials = [...new Set(primitives.map((p) => p.getMaterial()))];
  if (settings.materials !== undefined && !['preserve', 'atlas', 'shared'].includes(settings.materials)) throw new Error('Unknown rigged materials mode');
  const shared = settings.materials === 'shared';
  const preserve = settings.materials === 'preserve' || shared;
  if (shared) {
    dropLibraryAttributes(document);
    // Tangent/color splits made most source vertices unique; weld before simplifying.
    await document.transform(weld());
  }
  const atlas = preserve ? null : await atlasMaterials(document, materials, options.textureSize);
  if (preserve && root.listTextures().length) throw new Error('Preserved materials must be texture-free');
  for (const p of preserve ? [] : primitives) {
    // A source may share an accessor across material primitives; remap each once.
    const sourceUV = p.getAttribute('TEXCOORD_0');
    const uv = document.createAccessor().setType('VEC2').setBuffer(root.listBuffers()[0]).setArray(sourceUV ? new Float32Array(sourceUV.getArray()) : new Float32Array(p.getAttribute('POSITION').getCount() * 2).fill(0.5));
    for (let i = 0; i < uv.getCount(); i++) {
      const value = uv.getElement(i, []);
      if (value.some((v) => v < 0 || v > 1)) throw new Error('Tiled UVs must be baked before atlasing');
      uv.setElement(i, atlas.remap(value, materials.indexOf(p.getMaterial())));
    }
    p.setAttribute('TEXCOORD_0', uv).setMaterial(atlas.material);
  }
  const trianglesBefore = primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  const outputPrimitives = shared ? await simplifyRigidParts(document, primitives, options.maxTriangles) : preserve ? materials.map((material) => joinPrimitives(primitives.filter((p) => p.getMaterial() === material))) : [joinPrimitives(primitives)];
  const mesh = document.createMesh('rigged-piece');
  for (const p of outputPrimitives) mesh.addPrimitive(p);
  node.setMesh(mesh);
  for (const other of nodes.slice(1)) other.setMesh(null).setSkin(null);
  for (const joined of outputPrimitives) {
    if (!shared && trianglesBefore > options.maxTriangles) {
      await MeshoptSimplifier.ready;
      const count = joined.getAttribute('POSITION').getCount();
      const attrs = new Float32Array(count * 10);
      for (let i = 0; i < count; i++) attrs.set([...(joined.getAttribute('TEXCOORD_0')?.getElement(i, []) ?? [0, 0]), ...joined.getAttribute('JOINTS_0').getElement(i, []), ...joined.getAttribute('WEIGHTS_0').getElement(i, [])], i * 10);
      const target = Math.floor(options.maxTriangles * joined.getIndices().getCount() / (trianglesBefore * 3)) * 3;
      const [indices] = MeshoptSimplifier.simplifyWithAttributes(joined.getIndices().getArray(), joined.getAttribute('POSITION').getArray(), 3, attrs, 10, [1, 1, 10, 10, 10, 10, 10, 10, 10, 10], null, target, 1, ['Permissive']);
      if (!indices.length || indices.length > target) throw new Error('Cannot meet rigged triangle budget');
      joined.getIndices().setArray(indices);
    }
    compactPrimitive(joined);
  }
  // Keep every animated local TRS and inverse bind matrix untouched. The common
  // normalization parent changes mesh and joints together, so skinning commutes.
  if (settings.pedestal) {
    await appendPedestal(document, settings.pedestal);
    if (shared) dropLibraryAttributes(document);
  }
  // V6–V8 rest poses hold weapons straight forward, a pose never shown. Rest in the
  // guard instead: normalization, colliders and debris then match the looping idle.
  if (settings.contract) restInClip(document, settings.contract(1).selectors.idle);
  const visibleNodes = root.listNodes().filter(n => n.getMesh());
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const wrapper = document.createNode('piece-normalization').setRotation([0, Math.sin(options.rotationYDegrees * Math.PI / 360), 0, Math.cos(options.rotationYDegrees * Math.PI / 360)]);
  for (const child of scene.listChildren()) wrapper.addChild(child);
  scene.addChild(wrapper);
  let box = bindBounds(visibleNodes);
  const size = box.getSize(new Vector3());
  if (!(size.y > 0) || !Number.isFinite(size.length())) throw new Error('Invalid rigged bind bounds');
  const scale = Math.min(options.height / size.y, options.maxFootprint / Math.max(size.x, size.z));
  wrapper.setScale([scale, scale, scale]).setTranslation([-(box.min.x + box.max.x) / 2 * scale, -box.min.y * scale, -(box.min.z + box.max.z) / 2 * scale]);
  box = bindBounds(visibleNodes);
  const authored = settings.arcanaAttack ? authorArcanaAttack(document, settings.arcanaAttack) : undefined;
  // V6–V8 lance thrusts are too fast for fixed 30 Hz decimation: drop keys by error only.
  // Resampling compares neighbours greedily, so a slow drift needs the strict tolerance.
  const v4 = settings.contract ? await selectContractClips(document, settings.contract(scale), { decimate: false })
    : settings.integration ? await selectV4Clips(document, settings.integration, settings.type, scale) : undefined;
  const clips = v4?.clips ?? {};
  const selected = new Set(v4 ? root.listAnimations() : []);
  for (const role of v4 ? [] : ['idle', 'attack']) {
    const selector = role === 'attack' && authored ? 'attack' : settings.clips?.[role];
    if (selector === undefined || selector === null) continue;
    const animation = typeof selector === 'number' ? root.listAnimations()[selector] : root.listAnimations().find((a) => a.getName() === selector);
    if (!animation) throw new Error(`Missing ${role} clip: ${selector}`);
    animation.setName(role); clips[role] = role; selected.add(animation);
  }
  for (const animation of root.listAnimations()) if (!selected.has(animation)) animation.dispose();
  const attack = root.listAnimations().find((a) => a.getName() === clips.attack);
  const clipDurationMs = attack ? duration(attack) : 0;
  const hitTimeMs = attack ? v4?.attacks[0].hitMs ?? authored?.hitTimeMs ?? settings.hitTimeMs ?? detectHitTime(document, attack, warn) : 0;
  if (!Number.isFinite(hitTimeMs) || hitTimeMs < 0 || hitTimeMs > clipDurationMs) throw new Error('hitTimeMs must be within the attack clip');
  // Remove replaced mesh/material resources without pruning animated bones.
  for (const mesh of root.listMeshes()) if (!visibleNodes.some(n => n.getMesh() === mesh)) mesh.dispose();
  for (const mat of root.listMaterials()) if (!preserve && mat !== atlas.material) mat.dispose();
  // Library materials carry the textures: keep their UVs although pieces hold none.
  await document.transform(prune({ keepLeaves: true, keepAttributes: shared }));
  // Tiled library UVs leave [0, 1] and stay float; never quantize just the in-range few,
  // or the runtime bind bake cannot merge primitives with mixed UV array types.
  if (preserve) await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeWeight: 8, ...(shared ? { pattern: /^(?!TEXCOORD_)/ } : {}) }));
  await document.transform(unpartition());
  return { document, trianglesBefore, entry: { skinned: true, clips, ...(v4 ? { rig: v4 } : {}), hitTimeMs, clipDurationMs, height: box.max.y - box.min.y, footprint: Math.max(box.max.x - box.min.x, box.max.z - box.min.z), triangles: visibleNodes.flatMap(n => n.getMesh().listPrimitives()).reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), fragmentColor: '#' + [0, 1, 2].map((c) => Math.round(preserve ? materials.reduce((sum, m) => sum + (m?.getBaseColorFactor()[c] ?? 1) * 255, 0) / materials.length : atlas.averages.reduce((sum, color) => sum + color[c], 0) / atlas.averages.length).toString(16).padStart(2, '0')).join('') } };
}
