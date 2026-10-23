import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { Material, SkinnedMesh } from 'three';
import type { Fragment } from '../fracture/FractureProvider';

/** Shared immutable geometry/materials in the normalized piece frame. */
export interface RigidPart extends Fragment {
  materials: Material[];
}
interface Triangle {
  positions: number[];
  uvs: number[];
  material: Material;
}

function makePart(triangles: Triangle[]): RigidPart {
  const geometry = new BufferGeometry();
  const materials = [...new Set(triangles.map((triangle) => triangle.material))];
  const positions: number[] = [], uvs: number[] = [];
  // Keep one draw group per material, even when different bones are merged.
  for (const material of materials) {
    const start = positions.length / 3;
    for (const triangle of triangles) if (triangle.material === material) {
      positions.push(...triangle.positions);
      uvs.push(...triangle.uvs);
    }
    geometry.addGroup(start, positions.length / 3 - start, materials.indexOf(material));
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  const size = geometry.boundingBox!.getSize(new Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  // Box volume is stable for disconnected armor plates and thin/open accessories.
  const volume = Math.max(size.x * size.y * size.z, 0.000001);
  return { geometry, center: center.toArray(), volume, materials };
}

function trianglesOf(part: RigidPart): Triangle[] {
  const positions = part.geometry.getAttribute('position');
  const triangles: Triangle[] = [];
  for (const group of part.geometry.groups) for (let i = group.start; i < group.start + group.count; i += 3) {
    const values: number[] = [];
    for (let j = i; j < i + 3; j++) values.push(positions.getX(j) + part.center[0], positions.getY(j) + part.center[1], positions.getZ(j) + part.center[2]);
    const uv = part.geometry.getAttribute('uv');
    const uvs = Array.from({ length: 3 }, (_, offset) => [uv.getX(i + offset), uv.getY(i + offset)]).flat();
    triangles.push({ positions: values, uvs, material: part.materials[group.materialIndex ?? 0]! });
  }
  return triangles;
}

/** Smallest parts attach to the closest body; no geometry or palette entries are lost. */
export function budgetRigidParts(source: RigidPart[], maxBodies: number, tinyRatio = 0): RigidPart[] {
  if (!Number.isInteger(maxBodies) || maxBodies < 1) throw new RangeError('maxBodies must be positive');
  const parts = [...source];
  const generated = new Set<RigidPart>();
  const total = parts.reduce((sum, part) => sum + part.volume, 0);
  while (parts.length > 1) {
    let smallest = 0;
    for (let i = 1; i < parts.length; i++) if (parts[i]!.volume < parts[smallest]!.volume) smallest = i;
    if (parts.length <= maxBodies && parts[smallest]!.volume >= total * tinyRatio) break;
    const removed = parts.splice(smallest, 1)[0]!;
    const center = new Vector3(...removed.center);
    let nearest = 0;
    for (let i = 1; i < parts.length; i++) {
      if (center.distanceToSquared(new Vector3(...parts[i]!.center)) < center.distanceToSquared(new Vector3(...parts[nearest]!.center))) nearest = i;
    }
    const neighbor = parts[nearest]!;
    const merged = makePart([...trianglesOf(neighbor), ...trianglesOf(removed)]);
    for (const old of [neighbor, removed]) if (generated.delete(old)) old.geometry.dispose();
    generated.add(merged);
    parts[nearest] = merged;
  }
  return parts.every((part, i) => part === source[i]) && parts.length === source.length ? source : parts;
}

/** CPU bake all influences; dominant vertex bones determine debris ownership. */
export function splitRigidParts(meshes: SkinnedMesh[], { maxBodies = 40, tinyRatio = 0.002 } = {}): RigidPart[] | undefined {
  const bones = new Map<string, Triangle[]>();
  const vertex = new Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const skin = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    if (!skin || !weights) return undefined;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const count = geometry.index?.count ?? geometry.getAttribute('position').count;
    for (let i = 0; i < count; i += 3) {
      const positions: number[] = [], uvs: number[] = [];
      const owners: number[] = [];
      for (let j = i; j < i + 3; j++) {
        const index = geometry.index ? geometry.index.getX(j) : j;
        let owner: number | undefined, strongest = 0;
        for (let slot = 0; slot < 4; slot++) {
          const weight = weights.getComponent(index, slot);
          if (weight > strongest) { strongest = weight; owner = skin.getComponent(index, slot); }
        }
        if (owner === undefined || !mesh.skeleton.bones[owner]) return undefined;
        owners.push(owner);
        mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
        positions.push(vertex.x, vertex.y, vertex.z);
        const uv = geometry.getAttribute('uv');
        uvs.push(uv?.getX(index) ?? 0, uv?.getY(index) ?? 0);
      }
      const bone = owners.find(owner => owners.filter(value => value === owner).length >= 2) ?? owners[0]!;
      const key = mesh.skeleton.bones[bone]!.uuid;
      const materialIndex = Array.isArray(mesh.material) ? geometry.groups.find((group) => i >= group.start && i < group.start + group.count)?.materialIndex ?? 0 : 0;
      const material = materials[materialIndex];
      if (!material) return undefined;
      if (!bones.has(key)) bones.set(key, []);
      bones.get(key)!.push({ positions, uvs, material });
    }
  }
  if (!bones.size) return undefined;
  const raw = [...bones.values()].map(makePart);
  const parts = budgetRigidParts(raw, maxBodies, tinyRatio);
  for (const part of raw) if (!parts.includes(part)) part.geometry.dispose();
  return parts;
}
