import { AnimationClip, Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute } from "three";
import { describe, expect, it, vi } from "vitest";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { modelBounds, planPieceColliders } from "../effects/pieceColliders";
import { createProceduralPieceProvider } from "./proceduralPieces";
import { loadPieceModels, parseManifest, validateGeometry } from "./gltfPieces";

const entry = { file: "p.glb", height: 1, footprint: 0.6, triangles: 12, fragmentColor: "#e9e2d2" };
const manifest = { version: 1, pieces: { p: entry } };
const box = () => {
  const geometry = new BoxGeometry(0.6, 1, 0.6).translate(0, 0.5, 0);
  geometry.clearGroups();
  return geometry;
};
const scene = (geometry = box(), material = new MeshStandardMaterial()) => {
  const root = new Group();
  root.add(new Mesh(geometry, material));
  return { scene: root };
};
const fetchManifest = (value: unknown = manifest) => vi.fn(async () => new Response(JSON.stringify(value)));

describe("glTF pieces (H4 S2, S6)", () => {
  it("loads a rig and caches normalized bind-pose geometry for fracture and colliders", async () => {
    const geometry = box();
    const count = geometry.attributes.position!.count;
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
    const bone = new Bone(); bone.name = "RightHand";
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
    mesh.add(bone); mesh.bind(new Skeleton([bone]));
    const root = new Group(); root.add(mesh);
    root.scale.setScalar(0.5);
    const rigEntry = { ...entry, height: 0.5, footprint: 0.3, skinned: true as const, clips: { idle: "idle", attack: "attack" }, hitTimeMs: 400, clipDurationMs: 1000 };
    const animations = [new AnimationClip("idle", 2, []), new AnimationClip("attack", 1, [])];
    const provider = await loadPieceModels({ fetch: fetchManifest({ version: 1, pieces: { p: rigEntry } }), load: async () => ({ scene: root, animations }) });
    expect(provider.rig?.("p")?.scene).toBe(root);
    expect(provider.rig?.("p")?.hitTimeMs).toBe(400);
    expect(provider.geometry("p")).not.toBe(geometry);
    expect(validateGeometry(provider.geometry("p"), rigEntry)).toBe(true);
    expect(provider.geometry("p")).toBe(provider.geometry("p"));
  });

  it("parses a valid manifest and ignores unknown types", () => {
    expect(parseManifest({ ...manifest, pieces: { p: entry, dragon: {} } })).toEqual({ p: entry });
  });

  it.each([null, {}, { version: 2, pieces: {} }, { version: 1, pieces: [] }])("rejects malformed manifest %j", (value) => {
    expect(parseManifest(value)).toEqual({});
  });

  it("ignores malformed entries without losing valid types", () => {
    expect(parseManifest({ version: 1, pieces: { p: entry, k: { ...entry, file: "../k.glb" } } })).toEqual({ p: entry });
    for (const invalid of [{ height: -1 }, { footprint: 2 }, { triangles: 1.5 }, { fragmentColor: "red" }]) {
      expect(parseManifest({ version: 1, pieces: { p: { ...entry, ...invalid } } })).toEqual({});
    }
  });

  it("accepts normalized geometry with tolerance and rejects off-center, oversized, floating and wrong-height geometry", () => {
    expect(validateGeometry(box(), entry)).toBe(true);
    expect(validateGeometry(box().translate(0.0001, 0, 0), entry)).toBe(true);
    for (const geometry of [box().translate(0.1, 0, 0), box().scale(2, 1, 1), box().translate(0, 0.1, 0), box().scale(1, 2, 1)]) {
      expect(validateGeometry(geometry, entry)).toBe(false);
    }
  });

  it("quietly falls back for a missing, malformed or unavailable manifest and never loads GLBs", async () => {
    const fallback = createProceduralPieceProvider();
    const load = vi.fn();
    const warn = vi.fn();
    for (const fetch of [
      vi.fn(async () => new Response(null, { status: 404 })),
      vi.fn(async () => new Response("<!doctype html>")),
      fetchManifest(null),
      vi.fn(async () => { throw new Error("offline"); }),
    ]) {
      expect(await loadPieceModels({ fetch, load, fallback, warn })).toBe(fallback);
    }
    expect(load).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("loads a mixed set and falls back per type on failed or invalid GLBs", async () => {
    const fallback = createProceduralPieceProvider();
    const loaded = scene();
    const load = vi.fn(async (url: string) => {
      if (url.endsWith("r.glb")) throw new Error("missing");
      return url.endsWith("k.glb") ? scene(box().translate(0.3, 0, 0)) : loaded;
    });
    const warn = vi.fn();
    const provider = await loadPieceModels({ fetch: fetchManifest({ version: 1, pieces: {
      p: entry, r: { ...entry, file: "r.glb" }, k: { ...entry, file: "k.glb" },
    } }), load, fallback, warn });
    expect(provider.geometry("p")).toBe((loaded.scene.children[0] as Mesh).geometry);
    for (const type of ["r", "k", "n"] as const) {
      expect(provider.geometry(type)).toBe(fallback.geometry(type));
      expect(provider.material(type, "b")).toBe(fallback.material(type, "b"));
      expect(provider.fragmentMaterial(type, "w")).toBe(fallback.fragmentMaterial(type, "w"));
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("tints a cached black clone without changing the source and provides UV-free debris stone", async () => {
    const original = new MeshStandardMaterial({ color: "#ded5c0", map: new Texture(), roughnessMap: new Texture(), roughness: 0.7 });
    const before = original.color.clone();
    const provider = await loadPieceModels({ fetch: fetchManifest(), load: async () => scene(box(), original) });
    const black = provider.material("p", "b") as MeshStandardMaterial;
    expect(provider.material("p", "w")).toBe(original);
    expect(black).not.toBe(original);
    expect(black.color.r).toBeLessThan(original.color.r);
    expect(black.roughness).toBeLessThan(original.roughness);
    expect(black.map).toBe(original.map);
    expect(original.color).toEqual(before);
    expect(provider.material("p", "b")).toBe(black);
    for (const color of ["w", "b"] as const) {
      const fragment = provider.fragmentMaterial("p", color) as MeshStandardMaterial;
      expect(fragment.map).toBeNull();
      expect(fragment.roughnessMap).toBeNull();
      expect(fragment.normalMap).toBeNull();
      expect(fragment.metalnessMap).toBeNull();
    }
    expect((provider.fragmentMaterial("p", "b") as MeshStandardMaterial).color.r).toBeLessThan((provider.fragmentMaterial("p", "w") as MeshStandardMaterial).color.r);
  });

  it("rejects multiple primitives, non-PBR materials and transformed contract violations", async () => {
    const fallback = createProceduralPieceProvider();
    const multiple = scene();
    multiple.scene.add(new Mesh(box(), new MeshStandardMaterial()));
    const transformed = scene();
    transformed.scene.position.x = 1;
    const grouped = scene();
    (grouped.scene.children[0] as Mesh).material = [new MeshStandardMaterial()];
    const nonPbr = scene();
    (nonPbr.scene.children[0] as Mesh).material = new MeshBasicMaterial();
    for (const loaded of [multiple, transformed, grouped, nonPbr]) {
      const provider = await loadPieceModels({ fetch: fetchManifest(), load: async () => loaded, fallback, warn: vi.fn() });
      expect(provider.geometry("p")).toBe(fallback.geometry("p"));
    }
  });

  it("derives collider dimensions from the active mixed provider after a model swap", async () => {
    const fallback = createProceduralPieceProvider();
    const loaded = await loadPieceModels({ fetch: fetchManifest(), load: async () => scene(), fallback });
    const before = modelBounds(fallback);
    const after = modelBounds(loaded);
    expect(after.p.height).toBeCloseTo(1);
    expect(after.p.width).toBeCloseTo(0.6);
    expect(after.p.height).not.toBeCloseTo(before.p.height);
    expect(after.n).toEqual(before.n);
    const [collider] = planPieceColliders([{ id: "pawn", type: "p", color: "w", square: "e2" }], undefined, after);
    expect(collider!.halfHeight).toBeCloseTo(0.5);
    expect(collider!.radius).toBeCloseTo(0.3);
  });

  it("does not leak fracture caches across providers after a model swap", async () => {
    const procedural = createProceduralPieceProvider();
    const loaded = await loadPieceModels({ fetch: fetchManifest(), load: async () => scene() });
    const before = createVoronoiFractureProvider(procedural);
    const after = createVoronoiFractureProvider(loaded);
    const fragments = before.fragments("p");
    expect(before.fragments("p")).toBe(fragments);
    expect(after.fragments("p")).not.toBe(fragments);
    expect(after.fragments("p").map((f) => f.center)).not.toEqual(fragments.map((f) => f.center));
  });
});
