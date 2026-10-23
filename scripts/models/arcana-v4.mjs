import { copyToDocument, createDefaultPropertyResolver, resample, dedup } from '@gltf-transform/functions';
import { Box3, Vector3 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

const attacksByType = { k: ['Corte_espada', 'Estocada_espada'], q: ['Golpe_baculo', 'Canalizar_hechizo'], b: ['Golpe_baculo', 'Canalizar_hechizo'], n: ['Estocada_montada'], r: ['Puno_pesado', 'Martillo_doble'], p: ['Estocada_lanza', 'Barrido_lanza'] };
export function v4Contract(data, type, scale) {
  const get = name => { const clip = data.clips.find(c => c.name === name); if (!clip) throw new Error(`Missing integration clip ${name}`); return clip; };
  const idle = data.clips.find(c => c.name === 'Guardia')?.name ?? (type === 'n' ? 'Reposo_montado' : 'Reposo');
  const walk = get(type === 'n' ? 'Paso_en_sitio' : 'Caminar_en_sitio');
  const advance = get(type === 'n' ? 'Paso_avance' : 'Caminar_avance');
  const selectors = { idle, walk: walk.name, hit: type === 'n' ? 'Impacto_montado' : 'Impacto', ...(type === 'n' ? { trot: 'Trote_en_sitio' } : {}) };
  const attacks = attacksByType[type].map((name, i) => {
    const clip = get(name), event = clip.events.find(e => ['attack_active', 'attack'].includes(e.type));
    const hit = event?.time ?? clip.attack_window?.[0];
    const end = event?.active_end ?? clip.attack_window?.[1];
    const start = clip.events.find(e => e.type === 'weapon_trail_start')?.time ?? clip.events.find(e => e.type === 'anticipation')?.time ?? hit;
    if (![hit, end, start].every(Number.isFinite) || start > hit || hit > end || end > clip.duration) throw new Error(`Invalid attack events ${name}`);
    selectors[`attack${i}`] = name;
    return { clip: `attack${i}`, durationMs: clip.duration * 1000, hitMs: hit * 1000, activeEndMs: end * 1000, trailStartMs: start * 1000, trailEndMs: end * 1000 };
  });
  const socket = get(attacksByType[type][0]).events.find(e => ['attack_active', 'attack'].includes(e.type))?.socket;
  return { selectors, attacks, walkCycle: { durationMs: walk.duration * 1000, strideBoardUnits: Math.hypot(...advance.root_motion_distance) * scale * walk.duration / advance.duration }, weaponTip: data.rig.weapons.primary?.tip_bone ?? socket };
}

/** Pedestal remains a static mesh, sharing geometry among runtime clones. */
export async function appendPedestal(document, source) {
  await MeshoptSimplifier.ready;
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const from = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  const map = copyToDocument(document, source, from.listChildren(), createDefaultPropertyResolver(document, source));
  const pedestal = document.createNode('piece-pedestal');
  for (const child of from.listChildren()) pedestal.addChild(map.get(child));
  scene.addChild(pedestal);
  const bounds = new Box3();
  pedestal.traverse(node => {
    node.setSkin(null);
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      p.setAttribute('JOINTS_0', null); p.setAttribute('WEIGHTS_0', null);
      const ids = p.getIndices(), positions = p.getAttribute('POSITION');
      if (ids && ids.getCount() > 1200) {
        const [reduced] = MeshoptSimplifier.simplify(ids.getArray(), positions.getArray(), 3, Math.max(12, Math.floor(ids.getCount() * 0.25 / 3) * 3), 0.01);
        ids.setArray(reduced);
      }
    }
  });
  pedestal.traverse(node => { for (const p of node.getMesh()?.listPrimitives() ?? []) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) bounds.expandByPoint(new Vector3(...a.getElement(i, []))); } });
  // Source pedestal is centered around zero; place its top at the authored sole plane.
  pedestal.setTranslation([0, -bounds.max.y, 0]);
  return pedestal;
}

export async function selectV4Clips(document, data, type, scale) {
  return selectContractClips(document, v4Contract(data, type, scale));
}

/** Rename the contract's source clips to runtime roles, drop the rest and compress motion. */
export async function selectContractClips(document, contract, { decimate = true, tolerance = 0.00001 } = {}) {
  const selected = new Set(), clips = {};
  for (const [role, name] of Object.entries(contract.selectors)) {
    const animation = document.getRoot().listAnimations().find(a => a.getName() === name || a.getName().endsWith(`__${name}`));
    if (!animation) throw new Error(`Missing source clip ${name}`);
    animation.setName(role); clips[role] = role; selected.add(animation);
  }
  for (const animation of document.getRoot().listAnimations()) if (!selected.has(animation)) animation.dispose();
  // Keep endpoints and every other 60 Hz source key (30 Hz); interpolation
  // remains quaternion-linear and all event times stay at source playback rate.
  for (const animation of decimate ? selected : []) for (const sampler of animation.listSamplers()) {
    const input = sampler.getInput(), output = sampler.getOutput();
    if (sampler.getInterpolation() !== 'LINEAR' || input.getCount() < 3) continue;
    const ids = Array.from({ length: input.getCount() }, (_, i) => i).filter(i => i % 2 === 0 || i === input.getCount() - 1);
    const buffer = document.getRoot().listBuffers()[0];
    sampler.setInput(document.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array(ids.map(i => input.getElement(i, [])[0]))));
    sampler.setOutput(document.createAccessor().setBuffer(buffer).setType(output.getType()).setArray(new Float32Array(ids.flatMap(i => output.getElement(i, [])))));
  }
  await document.transform(resample({ tolerance }), dedup());
  compactAccessors(document);
  const { selectors: _selectors, ...rig } = contract;
  return { clips: { ...clips, attack: 'attack0' }, ...rig };
}

export function compactAccessors(document) {
  // Disposed source animations can leave orphan samplers holding their accessors.
  // Keep only accessors reachable from the shipped scenes, skins and clips.
  const used = new Set();
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    primitive.listAttributes().forEach(a => used.add(a));
    if (primitive.getIndices()) used.add(primitive.getIndices());
  }
  for (const skin of document.getRoot().listSkins()) if (skin.getInverseBindMatrices()) used.add(skin.getInverseBindMatrices());
  for (const animation of document.getRoot().listAnimations()) for (const sampler of animation.listSamplers()) { used.add(sampler.getInput()); used.add(sampler.getOutput()); }
  for (const accessor of document.getRoot().listAccessors()) if (!used.has(accessor)) accessor.dispose();
}
