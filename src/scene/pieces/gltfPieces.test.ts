import { AnimationClip, Bone, BoxGeometry, Float32BufferAttribute, Int16BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute } from "three";
import { describe, expect, it, vi } from "vitest";
import { createVoronoiFractureProvider } from "../fracture/voronoiFracture";
import { modelBounds, planPieceColliders } from "../effects/pieceColliders";
import { createProceduralPieceProvider } from "./proceduralPieces";
import { extractPedestal, loadPieceModels, parseManifest, validateGeometry } from "./gltfPieces";

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
  it('extracts a board-space pedestal without changing the collider frame or shared materials', () => {
    const root = new Group(); root.scale.setScalar(0.5); root.position.y = 0.1;
    const base = new Group(); base.name = 'piece-pedestal';
    const mesh = new Mesh(new BoxGeometry(0.6, 0.2, 0.6), new MeshStandardMaterial());
    base.add(mesh); root.add(base);
    const pedestal = extractPedestal(root)!;
    expect(pedestal.height).toBeCloseTo(0.15);
    expect(pedestal.object).not.toBe(base);
    expect((pedestal.object.children[0] as Mesh).material).toBe(mesh.material);
    expect(base.parent).toBe(root);
    expect(extractPedestal(new Group())).toBeUndefined();
  });
  it('validates V4 event ordering and stride while retaining legacy entries', () => {
    const attack = { clip: 'attack0', durationMs: 1000, hitMs: 400, activeEndMs: 600, trailStartMs: 300, trailEndMs: 600 };
    const rig = { clips: { idle: 'idle', walk: 'walk', hit: 'hit', attack0: 'attack0', attack: 'attack0' }, attacks: [attack], walkCycle: { durationMs: 1200, strideBoardUnits: 0.3 }, weaponTip: 'weapon_tip.R' };
    const item = { ...entry, skinned: true, clips: rig.clips, hitTimeMs: 400, clipDurationMs: 1000, rig };
    expect(parseManifest({ version: 1, pieces: { p: item } }).p).toEqual(item);
    for (const invalid of [
      { ...rig, walkCycle: { ...rig.walkCycle, strideBoardUnits: 0 } },
      { ...rig, attacks: [{ ...attack, hitMs: NaN }] },
      { ...rig, attacks: [{ ...attack, trailStartMs: 800 }] },
      { ...rig, attacks: [{ ...attack, clip: '../attack' }] },
    ]) expect(parseManifest({ version: 1, pieces: { p: { ...item, rig: invalid } } })).toEqual({});
    expect(parseManifest(manifest).p).toEqual(entry);
  });
  it('accepts the V8 knight rig without a walk clip or stride, but never a half-declared walk', () => {
    const attack = { clip: 'attack0', durationMs: 2150, hitMs: 760, activeEndMs: 890, trailStartMs: 480, trailEndMs: 890 };
    const rig = { clips: { idle: 'idle', hit: 'hit', attack0: 'attack0', attack: 'attack0' }, attacks: [attack], weaponTip: 'rider_weapon_tip_R' };
    const item = { ...entry, file: 'n.glb', skinned: true, clips: rig.clips, hitTimeMs: 760, clipDurationMs: 2150, rig };
    expect(parseManifest({ version: 1, pieces: { n: item } }).n).toEqual(item);
    for (const invalid of [
      { ...rig, clips: { ...rig.clips, walk: 'walk' } },
      { ...rig, walkCycle: { durationMs: 1200, strideBoardUnits: 0 } },
    ]) expect(parseManifest({ version: 1, pieces: { n: { ...item, rig: invalid } } })).toEqual({});
  });
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
    expect(provider.parts?.('p', 'w')).toHaveLength(1);
    // Split once on first use (destruction parts are not built while loading), then cached.
    expect(provider.parts?.('p', 'w')).toBe(provider.parts?.('p', 'w'));
    expect(provider.parts?.('p', 'w')?.[0]?.materials[0]).toBe(mesh.material);
    expect(provider.rig?.("p")?.scene).toBe(root);
    expect(provider.rig?.("p")?.hitTimeMs).toBe(400);
    expect(provider.geometry("p")).not.toBe(geometry);
    expect(validateGeometry(provider.geometry("p"), rigEntry)).toBe(true);
    expect(provider.geometry("p")).toBe(provider.geometry("p"));
  });

  it("bakes quantized skinned positions into float geometry without wrapping above one metre", async () => {
    const geometry = box();
    const input = geometry.getAttribute('position');
    geometry.setAttribute('position', new Int16BufferAttribute(Array.from(input.array, (v) => Math.round(v * 32767)), 3, true));
    const count = input.count;
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
    const bone = new Bone(); mesh.add(bone); mesh.bind(new Skeleton([bone]));
    const root = new Group(); root.add(mesh); root.scale.setScalar(1.5);
    const rigEntry = { ...entry, height: 1.5, footprint: 0.9, skinned: true as const, clips: {}, hitTimeMs: 0, clipDurationMs: 0 };
    const warn = vi.fn();
    const provider = await loadPieceModels({ fetch: fetchManifest({ version: 1, pieces: { p: rigEntry } }), load: async () => ({ scene: root }), warn });
    expect(warn).not.toHaveBeenCalled();
    expect(validateGeometry(provider.geometry('p'), rigEntry)).toBe(true);
  });

  it("loads per-color multi-material variants without tinting and rejects unsafe variant filenames", async () => {
    const white = [new MeshStandardMaterial({ color: '#eeddbb' }), new MeshStandardMaterial({ color: '#ffaa00' })];
    const black = [new MeshStandardMaterial({ color: '#222233' }), new MeshStandardMaterial({ color: '#00ffff' })];
    const colors = { w: { ...entry, file: 'p-w.glb' }, b: { ...entry, file: 'p-b.glb' } };
    const load = vi.fn(async (url: string) => {
      const root = new Group();
      const geometry = box();
      geometry.addGroup(0, 18, 0); geometry.addGroup(18, 18, 1);
      root.add(new Mesh(geometry, url.endsWith('-w.glb') ? white : black));
      return { scene: root };
    });
    const provider = await loadPieceModels({ fetch: fetchManifest({ version: 1, pieces: { p: { colors } } }), load });
    expect(load).toHaveBeenCalledTimes(2);
    expect(provider.material('p', 'w')).toEqual(white);
    expect(provider.material('p', 'b')).toEqual(black);
    expect(provider.geometry('p', 'w')).not.toBe(provider.geometry('p', 'b'));
    expect(parseManifest({ version: 1, pieces: { p: { colors: { ...colors, b: { ...colors.b, file: '../p-b.glb' } } } } })).toEqual({});
  });

  it('loads one shared PBR library for both colors and reuses named materials', async () => {
    const steel = new MeshStandardMaterial({ map: new Texture(), normalMap: new Texture(), roughnessMap: new Texture(), metalnessMap: new Texture(), aoMap: new Texture() });
    steel.name = 'steel';
    const load = vi.fn(async (url: string) => {
      if (url.endsWith('arcana-materials.glb')) return scene(box(), steel);
      const placeholder = new MeshStandardMaterial(); placeholder.name = 'steel';
      return scene(box(), placeholder);
    });
    const colors = { w: { ...entry, file: 'p-w.glb' }, b: { ...entry, file: 'p-b.glb' } };
    const provider = await loadPieceModels({ fetch: fetchManifest({ version: 1, materialLibrary: 'arcana-materials.glb', pieces: { p: { colors } } }), load });
    expect(load.mock.calls.filter(([url]) => url.endsWith('arcana-materials.glb'))).toHaveLength(1);
    expect(provider.material('p', 'w')).toBe(steel);
    expect(provider.material('p', 'b')).toBe(steel);
    await loadPieceModels({ fetch: fetchManifest({ version: 1, materialLibrary: 'arcana-materials.glb', pieces: { p: { colors } } }), load });
    expect(load.mock.calls.filter(([url]) => url.endsWith('arcana-materials.glb'))).toHaveLength(1);
  });

  it('rejects unsafe libraries and falls back when a named shared material is absent', async () => {
    const fallback = createProceduralPieceProvider();
    const load = vi.fn(async () => scene());
    for (const materialLibrary of ['../arcana-materials.glb', 'https://example.com/materials.glb']) {
      expect(await loadPieceModels({ fetch: fetchManifest({ ...manifest, materialLibrary }), load, fallback })).toBe(fallback);
    }
    expect(load).not.toHaveBeenCalled();
    const missing = new MeshStandardMaterial(); missing.name = 'missing';
    const library = new MeshStandardMaterial(); library.name = 'steel';
    const warn = vi.fn();
    const result = await loadPieceModels({ fetch: fetchManifest({ ...manifest, materialLibrary: 'arcana-materials.glb' }), load: async url => scene(box(), url.endsWith('arcana-materials.glb') ? library : missing), fallback, warn });
    expect(result).toBe(fallback);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not load'), expect.objectContaining({ message: 'Missing shared material: missing' }));
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
