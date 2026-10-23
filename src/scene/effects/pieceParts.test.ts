import { Bone, BoxGeometry, Float32BufferAttribute, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { splitRigidParts, budgetRigidParts } from './pieceParts';
import { selectDestructionParts } from './destructionParts';
import { createProceduralPieceProvider } from '../pieces/proceduralPieces';

function fixture(sizes = [0.2, 0.2, 0.2]) {
  const bones = sizes.map(() => new Bone());
  const materials = sizes.map((_, i) => new MeshStandardMaterial({ color: i % 2 ? '#222233' : '#eeddbb' }));
  const meshes = sizes.map((size, bone) => {
    const geometry = new BoxGeometry(size, size, size).translate(bone * 0.25, 0.5, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(Array.from({ length: count }, () => [bone, 0, 0, 0]).flat(), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
    const mesh = new SkinnedMesh(geometry, materials[bone]);
    mesh.bind(new Skeleton(bones));
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  return { meshes, materials };
}

describe('rigid armor parts', () => {
  it('splits N bones, keeps authored materials and reconstructs every vertex without a pop', () => {
    const { meshes, materials } = fixture();
    const parts = splitRigidParts(meshes)!;
    expect(parts).toHaveLength(3);
    expect(parts.flatMap((part) => part.materials)).toEqual(materials);
    parts.forEach((part, i) => {
      part.geometry.computeBoundingBox();
      expect(part.center[0]).toBeCloseTo(i * 0.25);
      expect(part.center[1]).toBeCloseTo(0.5);
      expect(part.geometry.boundingBox!.min.x + part.center[0]).toBeCloseTo(i * 0.25 - 0.1);
      expect(part.geometry.getAttribute('position').count).toBe(36);
    });
  });
  it('retains PBR UVs when splitting and budgeting armor', () => {
    const { meshes } = fixture();
    const expected = meshes.flatMap(mesh => Array.from(mesh.geometry.index!.array).flatMap(id => [mesh.geometry.getAttribute('uv').getX(id), mesh.geometry.getAttribute('uv').getY(id)]));
    const parts = budgetRigidParts(splitRigidParts(meshes)!, 1);
    expect(Array.from(parts[0]!.geometry.getAttribute('uv').array)).toEqual(expected);
  });
  it('merges tiny parts into their nearest neighbor without dropping triangles or materials', () => {
    const { meshes, materials } = fixture([0.2, 0.001, 0.2]);
    const parts = splitRigidParts(meshes)!;
    expect(parts).toHaveLength(2);
    expect(parts.reduce((n, part) => n + part.geometry.getAttribute('position').count, 0)).toBe(108);
    expect(new Set(parts.flatMap((part) => part.materials))).toEqual(new Set(materials));
  });
  it('caps bodies, supports a lower budget and leaves cached source parts untouched', () => {
    const source = splitRigidParts(fixture(Array(45).fill(0.1)).meshes, { maxBodies: 45 })!;
    expect(source).toHaveLength(45);
    expect(budgetRigidParts(source, 40)).toHaveLength(40);
    expect(budgetRigidParts(source, 12)).toHaveLength(12);
    expect(source).toHaveLength(45);
    expect(() => budgetRigidParts(source, 0)).toThrow(RangeError);
  });
  it('keeps material groups on indexed primitives and bakes the posed normalized world frame', () => {
    const { meshes, materials } = fixture();
    const mesh = new SkinnedMesh(meshes[0]!.geometry, [materials[0]!, materials[1]!]);
    mesh.bind(meshes[0]!.skeleton);
    mesh.add(...mesh.skeleton.bones);
    mesh.geometry.clearGroups();
    mesh.geometry.addGroup(0, 18, 0); mesh.geometry.addGroup(18, 18, 1);
    mesh.position.set(1, 0, 0); mesh.scale.setScalar(2); mesh.updateMatrixWorld(true);
    const [part] = splitRigidParts([mesh])!;
    expect(part!.center[0]).toBeCloseTo(1);
    expect(part!.center[1]).toBeCloseTo(1);
    expect(part!.center[2]).toBeCloseTo(0);
    expect(part!.materials).toEqual([materials[0], materials[1]]);
    expect(part!.geometry.groups.map((group) => group.count)).toEqual([18, 18]);
  });
  it('rejects missing skin data without dropping geometry', () => {
    const { meshes } = fixture();
    meshes[0]!.geometry.getAttribute('skinIndex').setX(0, 999);
    expect(splitRigidParts(meshes)).toBeUndefined();
    meshes[0]!.geometry.deleteAttribute('skinIndex');
    expect(splitRigidParts(meshes)).toBeUndefined();
    expect(splitRigidParts([])).toBeUndefined();
  });
  it('bakes blended skinning using dominant ownership without dropping triangles', () => {
    const { meshes } = fixture();
    meshes[0]!.geometry.getAttribute('skinWeight').setXY(0, 0.4, 0.6);
    meshes[0]!.geometry.getAttribute('skinIndex').setXY(0, 1, 0);
    const parts = splitRigidParts(meshes)!;
    expect(parts).toHaveLength(3);
    expect(parts.reduce((sum, part) => sum + part.geometry.getAttribute('position').count, 0)).toBe(108);
  });
  it('selects per-side provider parts when available, otherwise keeps fracture fallback', () => {
    const provider = createProceduralPieceProvider();
    expect(selectDestructionParts(provider, 'p', 'b', 12)).toBeUndefined();
    const source = splitRigidParts(fixture().meshes)!;
    const parts = vi.fn(() => source);
    expect(selectDestructionParts({ ...provider, parts }, 'r', 'b', 12)).toBe(source);
    expect(parts).toHaveBeenCalledWith('r', 'b');
  });
});
