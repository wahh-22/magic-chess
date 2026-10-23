import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { bakeQuaternionSpring, springProfile } from './arcana-springs.mjs';

// XYZ radians in the source's +Z-facing frame. The integrated weapon remains
// attached to its original hand: queen/bishop LEFT, king/pawn RIGHT.
const arm = (side, shoulder, upper, elbow, wrist) => ({
  [`shoulder.${side}`]: shoulder, [`upper_arm.${side}`]: upper,
  [`forearm.${side}`]: elbow, [`hand.${side}`]: wrist,
});
const brace = arm('L', [-0.08, 0, 0], [-0.35, 0.1, -0.25], [-0.3, 0, 0], [0, 0, 0]);
const balance = arm('R', [-0.06, 0, 0], [-0.22, 0.1, 0.12], [-0.25, 0, 0], [0, 0.08, 0]);
const designs = {
  k: { ms: 1200,
    wind: { chest: [-0.08, -0.24, -0.04], ...brace, ...arm('R', [-0.18, -0.08, -0.12], [-1.65, -0.14, -0.32], [-0.65, 0, 0.08], [-0.25, -0.22, -0.12]) },
    hit: { chest: [0.10, 0.22, 0.04], ...brace, ...arm('R', [-0.12, 0.12, 0.08], [-0.85, 0.14, 0.18], [-0.22, 0.08, 0.06], [-0.25, 0.28, 0.08]) } },
  q: { ms: 1200,
    wind: { chest: [-0.06, 0.18, 0.03], ...balance, ...arm('L', [-0.12, 0.12, 0.12], [-0.65, 0.12, 0.28], [-0.65, 0, 0.08], [0.35, -0.22, 0.12]) },
    hit: { chest: [0.10, -0.18, -0.03], ...balance, ...arm('L', [-0.12, -0.12, -0.06], [-0.85, -0.08, -0.15], [-0.18, 0.06, -0.08], [2.48, 0.22, -0.08]) } },
  b: { ms: 1280,
    wind: { chest: [-0.08, 0.15, 0.03], ...balance, ...arm('L', [-0.12, 0.1, 0.12], [-1.3, 0.1, 0.22], [-0.65, 0, 0.06], [0.65, -0.18, 0.1]) },
    hit: { chest: [0.12, -0.15, -0.03], ...balance, ...arm('L', [-0.14, -0.10, -0.06], [-0.85, -0.08, -0.12], [-0.18, 0.04, -0.04], [2.5, 0.22, -0.08]) } },
  p: { ms: 1100,
    wind: { chest: [-0.06, -0.15, -0.02], ...brace, ...arm('R', [-0.06, -0.12, -0.05], [-0.4, -0.08, -0.08], [-0.65, 0, 0], [1.1, -0.18, -0.1]) },
    hit: { chest: [0.10, 0.15, 0.02], ...brace, ...arm('R', [-0.16, 0.12, 0.04], [-0.95, 0.06, 0.25], [-0.15, 0.04, 0.16], [2.55, 0.20, 0.06]) } },
  r: { ms: 1300,
    wind: { chest: [-0.06, -0.32, -0.04], ...brace, ...arm('R', [-0.12, -0.18, -0.06], [-0.65, -0.08, -0.15], [-0.9, 0, 0.04], [-0.08, -0.2, 0]) },
    hit: { chest: [0.12, 0.28, 0.04], ...brace, ...arm('R', [-0.2, 0.18, 0.04], [-1.05, 0.08, 0.1], [-0.12, 0.04, 0], [0.1, 0.22, 0.06]) } },
  n: { ms: 1320,
    wind: { horse_body: [-0.035, 0, 0], horse_neck: [-0.08, 0.02, 0], horse_head: [0.06, 0, 0], rider_pelvis: [0.04, -0.06, 0], rider_chest: [-0.08, -0.1, 0.02], rider_upper_arm_R: [-0.2, 0.08, 0.08], rider_forearm_R: [-0.3, 0, 0.04], rider_hand_R: [0.08, -0.15, 0], lance: [0.85, 0.02, -0.04], rider_upper_arm_L: [-0.12, 0, 0], rider_forearm_L: [-0.12, 0, 0] },
    hit: { horse_body: [0.02, 0, 0], horse_neck: [0.06, -0.02, 0], horse_head: [-0.05, 0, 0], rider_pelvis: [0.05, 0.05, 0], rider_chest: [0.1, 0.08, -0.02], rider_upper_arm_R: [-0.55, -0.06, -0.04], rider_forearm_R: [-0.08, 0, 0.02], rider_hand_R: [0.05, 0.18, 0.02], lance: [1.75, -0.02, 0.02], rider_upper_arm_L: [-0.20, 0, 0], rider_forearm_L: [-0.18, 0, 0] } },
};
for (const phase of ['wind', 'hit']) designs.r[phase] = Object.fromEntries(Object.entries(designs.r[phase]).map(([n, v]) => [n.replace('.', '_'), v]));
export const ATTACKS = Object.fromEntries(Object.entries(designs).map(([type, d]) => [type, { bones: Object.keys(d.wind), clipDurationMs: d.ms, hitTimeMs: d.ms / 2 }]));
export const weaponBone = type => type === 'n' ? 'lance' : type === 'r' ? 'hand_R' : `hand.${['q', 'b'].includes(type) ? 'L' : 'R'}`;

/** Rest-space rigid weapon endpoint. Shared definition with runtime's extremity
 * scan: sword points down in bind, other weapons up. No guessed hand offset. */
export function weaponTipInDocument(doc, type) {
  const nodes = doc.getRoot().listNodes(), bone = nodes.find(n => n.getName() === weaponBone(type));
  if (!bone) throw new Error(`Missing weapon bone for ${type}`);
  let best = -Infinity;
  const tip = new Vector3();
  for (const node of nodes) {
    if (!node.getSkin() || !node.getMesh()) continue;
    const joint = node.getSkin().listJoints().indexOf(bone);
    if (joint < 0) continue;
    // glTF skinning maps mesh vertices through the inverse bind matrix, NOT
    // through the mesh node's transform (important for quantized output rigs).
    const transform = new Matrix4().fromArray(node.getSkin().getInverseBindMatrices().getElement(joint, []));
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions = primitive.getAttribute('POSITION'), indices = primitive.getAttribute('JOINTS_0'), weights = primitive.getAttribute('WEIGHTS_0');
      if (!indices || !weights) continue;
      for (let i = 0; i < positions.getCount(); i++) {
        if (indices.getElement(i, [])[0] !== joint || weights.getElement(i, [])[0] < 0.9) continue;
        const p = new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(transform);
        const score = p.y * (type === 'k' ? -1 : 1);
        if (score > best) { best = score; tip.copy(p); }
      }
    }
  }
  if (!Number.isFinite(best)) throw new Error(`No rigid weapon vertices for ${type}`);
  return { bone, tip };
}

export function attackWorldMatrix(node, tracks, frame) {
  const rotation = tracks.get(`${node.getName()}/rotation`)?.[frame] ?? node.getRotation();
  const translation = tracks.get(`${node.getName()}/translation`)?.[frame] ?? node.getTranslation();
  const matrix = new Matrix4().compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...node.getScale()));
  return node.getParentNode() ? matrix.premultiply(attackWorldMatrix(node.getParentNode(), tracks, frame)) : matrix;
}

/** Bake independent quaternion springs, then counter-transform the lower-chain
 * roots. Their world matrices stay fixed while the torso transfers weight. */
export function authorArcanaAttack(doc, type) {
  const d = designs[type];
  if (!d) throw new Error(`Unknown ARCANA attack ${type}`);
  const root = doc.getRoot(), buffer = root.listBuffers()[0];
  const nodes = new Map(root.listNodes().map(n => [n.getName(), n]));
  const duration = d.ms / 1000, count = Math.ceil(duration * 60);
  const times = Array.from({ length: count + 1 }, (_, i) => i * duration / count);
  const tracks = new Map();
  const wind = { ...d.wind }, hit = { ...d.hit };
  if (type !== 'n') {
    wind.pelvis = [0, -0.06, 0]; hit.pelvis = [0, 0.07, 0];
    for (const [name, multiplier] of [['spine', 0.25], ['cape_top', -0.5], ['cape_low', -0.7]]) if (nodes.has(name)) {
      wind[name] = wind.chest.map(v => v * multiplier); hit[name] = hit.chest.map(v => v * multiplier);
    }
  } else {
    for (const [name, w, h] of [['horse_jaw', [0.02, 0, 0], [0.10, 0, 0]], ['rider_spine', [-0.03, -0.02, 0], [0.04, 0.02, 0]], ['rider_neck', [0.03, 0, 0], [-0.03, 0, 0]]]) if (nodes.has(name)) { wind[name] = w; hit[name] = h; }
  }
  for (const name of Object.keys(wind)) {
    const node = nodes.get(name);
    if (!node) throw new Error(`Missing ARCANA joint ${name}`);
    const bind = new Quaternion().fromArray(node.getRotation());
    const local = [ [0, 0, 0], wind[name], hit[name], hit[name].map((v, i) => i === 0 ? v * 0.88 : v * 1.12), [0, 0, 0] ];
    const poses = local.map(v => bind.clone().multiply(new Quaternion().setFromEuler(new Euler(...v))).toArray());
    const impactPose = { k: 0.41, q: 0.34, b: 0.33, p: 0.36, r: 0.40, n: 0.36 }[type];
    const profile = springProfile(name);
    // Recovery reverses the chain: wrist retracts before the torso unwinds,
    // avoiding a second, accidental forward maximum during the return.
    const keys = [0, duration * 0.10, duration * impactPose, duration * (impactPose + 0.13), duration * 0.70 - 2 * profile.delay];
    const values = bakeQuaternionSpring(keys, poses, duration, profile);
    // The residual is already tiny after the long spring settle; pin the exact
    // idle endpoint to avoid a loop seam or a drift when the mixer releases it.
    values[values.length - 1] = bind.toArray();
    tracks.set(`${name}/rotation`, values);
  }
  if (type !== 'n') {
    const bind = nodes.get('pelvis').getTranslation();
    // Translate via a spring as well (small angles encode centimetre offsets).
    const q = v => new Quaternion().setFromEuler(new Euler(...v)).toArray();
    const shift = bakeQuaternionSpring([0, duration * 0.10, duration * 0.36, duration * 0.70], [q([0, 0, 0]), q([0, -0.012, -0.025]), q([0, -0.008, 0.045]), q([0, 0, 0])], duration, springProfile('pelvis')).map(v => {
      const e = new Euler().setFromQuaternion(new Quaternion(...v));
      return [bind[0] + e.x, bind[1] + e.y, bind[2] + e.z];
    });
    shift[shift.length - 1] = bind;
    tracks.set('pelvis/translation', shift);
  }
  // Anchor each thigh (or horse leg root) relative to its *animated* parent.
  // Works unchanged with V3 pasterns because their whole descendant chain stays
  // planted. Rider boots remain in their stirrups rather than on the board.
  const anchors = [...nodes.values()].filter(n => type === 'n' ? /^horse_(front|hind)_[LR]_upper$/.test(n.getName()) : /^thigh[._][LR]$/.test(n.getName()));
  for (const node of anchors) {
    const rest = new Matrix4().fromArray(node.getWorldMatrix());
    const translations = [], rotations = [];
    for (let frame = 0; frame <= count; frame++) {
      const local = attackWorldMatrix(node.getParentNode(), tracks, frame).invert().multiply(rest);
      const p = new Vector3(), q = new Quaternion(); local.decompose(p, q, new Vector3());
      translations.push(p.toArray()); rotations.push(q.toArray());
    }
    tracks.set(`${node.getName()}/translation`, translations); tracks.set(`${node.getName()}/rotation`, rotations);
  }
  // Measure contact from the baked weapon, not from an authoring phase label.
  const { bone, tip } = weaponTipInDocument(doc, type);
  const restInverse = new Matrix4().fromArray(nodes.get('root').getWorldMatrix()).invert();
  const path = times.map((_, i) => tip.clone().applyMatrix4(attackWorldMatrix(bone, tracks, i)).applyMatrix4(restInverse));
  const peak = path.reduce((best, p, i) => p.z > path[best].z ? i : best, 0);
  const hitTimeMs = times[peak] * 1000;
  const clip = doc.createAnimation('attack');
  const input = doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array(times));
  for (const [key, values] of tracks) {
    const [name, path] = key.split('/');
    const output = doc.createAccessor().setBuffer(buffer).setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(values.flat()));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    clip.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(name)).setTargetPath(path).setSampler(sampler));
  }
  clip.setExtras({ hitTimeMs, contactWindow: [0.45, 0.55], weaponBone: bone.getName(), weaponTip: tip.toArray(), springBaked: true });
  return { hitTimeMs, clipDurationMs: d.ms };
}
