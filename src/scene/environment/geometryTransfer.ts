import { BufferAttribute, BufferGeometry, Sphere, Vector3, type TypedArray } from "three";

/** A BufferGeometry as plain typed arrays, so a worker can hand it over without copying. */
export interface PackedGeometry {
  attributes: Record<string, { array: TypedArray; itemSize: number; normalized: boolean }>;
  index?: TypedArray;
  groups: { start: number; count: number; materialIndex?: number }[];
  boundingSphere?: { center: [number, number, number]; radius: number };
}

export function packGeometry(geometry: BufferGeometry): { packed: PackedGeometry; transfer: ArrayBuffer[] } {
  const buffers = new Set<ArrayBuffer>();
  const attributes: PackedGeometry["attributes"] = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const { array, itemSize, normalized } = attribute as BufferAttribute;
    attributes[name] = { array, itemSize, normalized };
    buffers.add(array.buffer as ArrayBuffer);
  }
  const index = geometry.index?.array;
  if (index) buffers.add(index.buffer as ArrayBuffer);
  // Bounds are computed here too: culling would otherwise walk every vertex on the main thread.
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere!;
  return {
    packed: {
      attributes, index, groups: geometry.groups.map((group) => ({ ...group })),
      boundingSphere: { center: sphere.center.toArray(), radius: sphere.radius },
    },
    transfer: [...buffers],
  };
}

export function unpackGeometry(packed: PackedGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, { array, itemSize, normalized }] of Object.entries(packed.attributes)) {
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
  }
  if (packed.index) geometry.setIndex(new BufferAttribute(packed.index, 1));
  for (const { start, count, materialIndex } of packed.groups) geometry.addGroup(start, count, materialIndex);
  if (packed.boundingSphere) geometry.boundingSphere = new Sphere(new Vector3(...packed.boundingSphere.center), packed.boundingSphere.radius);
  return geometry;
}
