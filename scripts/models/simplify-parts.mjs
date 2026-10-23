import { compactPrimitive, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Rigid triangles group by their joint; blended or crossing ones by their dominant joint. */
function partition(primitive) {
  const joints = primitive.getAttribute('JOINTS_0'), weights = primitive.getAttribute('WEIGHTS_0');
  const owner = (id) => {
    const w = weights.getElement(id, []), j = joints.getElement(id, []);
    const dominant = j[w.indexOf(Math.max(...w))];
    return { rigid: w.filter(v => v > 0).length === 1 && w.includes(1), dominant };
  };
  const groups = new Map(), ids = primitive.getIndices().getArray();
  for (let i = 0; i < ids.length; i += 3) {
    const owners = [owner(ids[i]), owner(ids[i + 1]), owner(ids[i + 2])];
    const rigid = owners.every(o => o.rigid && o.dominant === owners[0].dominant);
    const dominant = owners.find(o => owners.filter(other => other.dominant === o.dominant).length >= 2)?.dominant ?? owners[0].dominant;
    const key = rigid ? `rigid:${dominant}` : `blended:${dominant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ids[i], ids[i + 1], ids[i + 2]);
  }
  return groups;
}

const positionKey = (p, i) => `${Math.round(p[i * 3] * 1e5)},${Math.round(p[i * 3 + 1] * 1e5)},${Math.round(p[i * 3 + 2] * 1e5)}`;

/**
 * Simplify every rigid part and every blended layer (per dominant joint) under one absolute
 * geometric error, searched so the whole piece meets maxTriangles. Collapses only remove
 * vertices: survivors keep their exact four-weight skinning. Positions shared by two parts
 * (articulations, cloth seams, material borders) are locked so nothing opens or cracks.
 */
export async function simplifyRigidParts(document, primitives, maxTriangles) {
  await MeshoptSimplifier.ready;
  const parts = [];
  const before = primitives.reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
  for (const primitive of primitives) {
    for (const indices of partition(primitive).values()) {
      const part = document.createPrimitive().setMaterial(primitive.getMaterial());
      for (const semantic of primitive.listSemantics()) part.setAttribute(semantic, primitive.getAttribute(semantic));
      part.setIndices(document.createAccessor().setBuffer(document.getRoot().listBuffers()[0]).setType('SCALAR').setArray(new Uint32Array(indices)));
      compactPrimitive(part);
      parts.push({ part });
    }
  }
  if (before > maxTriangles) {
    const owners = new Map();
    parts.forEach(({ part }, index) => {
      const p = part.getAttribute('POSITION').getArray();
      for (let i = 0; i < p.length / 3; i++) {
        const key = positionKey(p, i);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(index);
      }
    });
    let extent = 0;
    const inputs = parts.map(({ part }) => {
      const position = part.getAttribute('POSITION'), p = position.getArray();
      const uv = part.getAttribute('TEXCOORD_0'), normal = part.getAttribute('NORMAL');
      const weights = part.getAttribute('WEIGHTS_0');
      const attrs = new Float32Array(position.getCount() * 6), lock = new Uint8Array(position.getCount());
      for (let i = 0; i < position.getCount(); i++) {
        // UV, normal and dominant weight keep texture, shading and skin gradients.
        attrs.set([...(uv?.getElement(i, []) ?? [0, 0]), ...(normal?.getElement(i, []) ?? [0, 0, 0]), Math.max(...weights.getElement(i, []))], i * 6);
        lock[i] = owners.get(positionKey(p, i)).size > 1 ? 1 : 0;
        for (let c = 0; c < 3; c++) extent = Math.max(extent, Math.abs(p[i * 3 + c]));
      }
      return { indices: part.getIndices().getArray(), positions: p, attrs, lock };
    });
    const simplify = (error) => inputs.map(({ indices, positions, attrs, lock }) => {
      // Tiny accessories keep at least a tetrahedron's worth of triangles.
      const target = Math.min(indices.length, 12);
      return MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, 6, [0.05, 0.05, 0.1, 0.1, 0.1, 1], lock, target, error, ['ErrorAbsolute'])[0];
    });
    const count = (result) => result.reduce((n, ids) => n + ids.length / 3, 0);
    // Bisect the shared error (log scale): the finest geometry that fits the budget.
    let low = extent * 1e-6, high = extent * 0.05;
    let best = simplify(high);
    if (count(best) <= maxTriangles) {
      for (let i = 0; i < 14; i++) {
        const middle = Math.sqrt(low * high), result = simplify(middle);
        if (count(result) <= maxTriangles) { high = middle; best = result; } else low = middle;
      }
    }
    best.forEach((ids, i) => {
      // A degenerate sliver may collapse away entirely; keep such parts as authored.
      if (!ids.length) return;
      parts[i].part.getIndices().setArray(ids);
      compactPrimitive(parts[i].part);
    });
  }
  const materials = [...new Set(parts.map(({ part }) => part.getMaterial()))];
  return materials.map(material => joinPrimitives(parts.filter(({ part }) => part.getMaterial() === material).map(({ part }) => part)));
}
