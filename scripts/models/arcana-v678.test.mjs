import { describe, it, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
import { readFileSync, existsSync } from 'node:fs';
import { Quaternion } from 'three';
import { readClipExtras, readRigExtras, v678Contract } from './arcana-v678.mjs';
import { createIO } from './process.mjs';

const attack = (name, duration, extra = {}) => ({ name, duration, events: [
  { time: 0.36, type: 'anticipation' }, { time: 0.72, type: 'weapon_trail_start', socket: 'weapon_socket.R' },
  { time: 0.864, type: 'attack_active', socket: 'weapon_socket.R', active_end: 1.026 }, { time: 1.026, type: 'attack_end' },
], ...extra });
const humanoid = (attacks) => [
  { name: 'Reposo', duration: 4 }, { name: 'Guardia', duration: 4 }, { name: 'Impacto', duration: 1.25 },
  { name: 'Caminar_en_sitio', duration: 1.2 }, { name: 'Caminar_avance', duration: 2.4, root_motion_distance: [0, 0, 1.6] },
  { name: 'Bloqueo', duration: 1.65 }, ...attacks.map(name => attack(name, 1.8)),
];

describe('V6–V8 event contract from animation extras (S16)', () => {
  it('reads clip extras under their unprefixed names and the rig from the root node', () => {
    const document = new Document();
    document.createAnimation('rey_marfil__Guardia').setExtras({ duration: 4, loop: true, events: [] });
    document.createScene().addChild(document.createNode('rey_marfil').setExtras({ rig: { role: 'rey', weapons: { primary: { tip_bone: 'weapon_tip.R' } } } }));
    expect(readClipExtras(document)).toEqual([{ name: 'Guardia', duration: 4, loop: true, events: [] }]);
    expect(readRigExtras(document).role).toBe('rey');
  });

  it('maps the S16 attack sets, guard idle, hit and the halved two-cycle stride', () => {
    const rig = { weapons: { primary: { tip_bone: 'weapon_tip.R' } } };
    const sets = { k: ['Corte_espada', 'Estocada_espada'], q: ['Golpe_baculo', 'Canalizar_hechizo'], b: ['Estocada_lanza', 'Corte_lanza'], r: ['Tajo_espada', 'Estocada_espada'], p: ['Estocada_lanza', 'Barrido_lanza'] };
    for (const [type, names] of Object.entries(sets)) {
      const result = v678Contract(humanoid(names), rig, type, 0.5);
      expect(result.selectors).toEqual({ idle: 'Guardia', walk: 'Caminar_en_sitio', hit: 'Impacto', attack0: names[0], attack1: names[1] });
      expect(result.walkCycle).toEqual({ durationMs: 1200, strideBoardUnits: 0.4 });
    }
    const result = v678Contract(humanoid(sets.k), rig, 'k', 0.5);
    expect(result.attacks[0]).toEqual({ clip: 'attack0', durationMs: 1800, hitMs: 864, activeEndMs: 1026, trailStartMs: 720, trailEndMs: 1026 });
    expect(result.weaponTip).toBe('weapon_tip.R');
    expect(() => v678Contract(humanoid(['Golpe_baculo', 'Canalizar_hechizo']), rig, 'b', 0.5)).toThrow('Estocada_lanza');
  });

  it('keeps each rig its own tip name (rook underscores, queen left-hand staff)', () => {
    expect(v678Contract(humanoid(['Tajo_espada', 'Estocada_espada']), { weapons: { primary: { tip_bone: 'weapon_tip_R' } } }, 'r', 1).weaponTip).toBe('weapon_tip_R');
    expect(v678Contract(humanoid(['Golpe_baculo', 'Canalizar_hechizo']), { weapons: { primary: { tip_bone: 'weapon_tip.L' } } }, 'q', 1).weaponTip).toBe('weapon_tip.L');
  });

  it('gives the rigid-mount knight its attack contact, anticipation trail start and no walk', () => {
    const lance = (name, duration, at, end, anticipation) => ({ name, duration, events: [{ time: anticipation, type: 'anticipation' }, { time: at, type: 'attack', socket: 'rider_weapon_tip_R', active_end: end }, { time: 1.04, type: 'recovery' }] });
    const clips = [
      { name: 'Reposo_montado', duration: 4 }, { name: 'Guardia_escudo', duration: 2.1 }, { name: 'Impacto_montado', duration: 1.6 },
      { name: 'Desplazamiento_magico', duration: 3, root_motion: true, root_motion_distance: [0, 0, 2.45] },
      lance('Estocada_montada', 2.15, 0.76, 0.89, 0.48), lance('Barrido_lanza', 2.5, 0.92, 1.07, 0.6),
    ];
    const result = v678Contract(clips, { weapons: { primary: { bone: 'lance' } } }, 'n', 0.36);
    expect(result.selectors).toEqual({ idle: 'Reposo_montado', hit: 'Impacto_montado', attack0: 'Estocada_montada', attack1: 'Barrido_lanza' });
    expect(result.walkCycle).toBeUndefined();
    expect(result.attacks).toEqual([
      { clip: 'attack0', durationMs: 2150, hitMs: 760, activeEndMs: 890, trailStartMs: 480, trailEndMs: 890 },
      { clip: 'attack1', durationMs: 2500, hitMs: 920, activeEndMs: 1070, trailStartMs: 600, trailEndMs: 1070 },
    ]);
    expect(result.weaponTip).toBe('rider_weapon_tip_R');
  });

  it('falls back to the integration JSON only when the GLB extras lack attack windows', () => {
    const clips = [{ name: 'Reposo_montado', duration: 4 }, { name: 'Impacto_montado', duration: 1.6 }, { name: 'Estocada_montada', duration: 2.15 }, { name: 'Barrido_lanza', duration: 2.5 }];
    const integration = { clips: [
      { name: 'Estocada_montada', duration: 2.15, events: [{ time: 0.76, type: 'attack', socket: 'rider_weapon_tip_R', active_end: 0.89 }] },
      { name: 'Barrido_lanza', duration: 2.5, events: [{ time: 0.92, type: 'attack', socket: 'rider_weapon_tip_R', active_end: 1.07 }] },
    ] };
    expect(v678Contract(clips, {}, 'n', 1, integration).attacks[1]).toEqual({ clip: 'attack1', durationMs: 2500, hitMs: 920, activeEndMs: 1070, trailStartMs: 920, trailEndMs: 1070 });
    expect(() => v678Contract(clips, {}, 'n', 1)).toThrow('Invalid attack events Estocada_montada');
  });
});

describe('shipped V6–V8 pieces', () => {
  const manifest = JSON.parse(readFileSync('public/models/manifest.json', 'utf8'));
  const sources = JSON.parse(readFileSync('assets/models/manifest.json', 'utf8'));
  it('ship every declared clip, tip, static pedestal, UVs and four-weight skins for both sides', async () => {
    for (const [type, piece] of Object.entries(manifest.pieces)) for (const entry of Object.values(piece.colors)) {
      const doc = await createIO().read(`public/models/${entry.file}`);
      const names = doc.getRoot().listAnimations().map(a => a.getName());
      expect(names.sort()).toEqual([...new Set(Object.values(entry.rig.clips))].sort());
      expect(doc.getRoot().listNodes().some(n => n.getName() === entry.rig.weaponTip)).toBe(true);
      expect(doc.getRoot().listNodes().some(n => n.getName() === 'piece-pedestal' && n.listChildren().length)).toBe(true);
      for (const attack of entry.rig.attacks) {
        const clip = doc.getRoot().listAnimations().find(a => a.getName() === attack.clip);
        expect(Math.max(...clip.listSamplers().flatMap(s => Array.from(s.getInput().getArray()))) * 1000).toBeCloseTo(attack.durationMs, 2);
        expect(attack.trailStartMs).toBeLessThanOrEqual(attack.hitMs);
        expect(attack.activeEndMs).toBeLessThanOrEqual(attack.durationMs);
      }
      expect(entry.rig.attacks).toHaveLength(2);
      if (type === 'n') expect([entry.rig.clips.walk, entry.rig.walkCycle]).toEqual([undefined, undefined]);
      else expect(entry.rig.walkCycle.strideBoardUnits).toBeGreaterThan(0);
      expect(entry.triangles).toBeGreaterThanOrEqual(type === 'n' ? 30000 : 25000);
      expect(entry.triangles).toBeLessThanOrEqual(type === 'n' ? 40000 : 35000);
      const uvTypes = new Set();
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
        expect(p.getAttribute('TEXCOORD_0')?.getCount()).toBe(p.getAttribute('POSITION').getCount());
        expect(p.getAttribute('JOINTS_1')).toBeNull();
        uvTypes.add(p.getAttribute('TEXCOORD_0').getComponentType());
      }
      // The runtime merges every primitive for its bind bake: UV arrays must share one type.
      expect([...uvTypes], entry.file).toHaveLength(1);
    }
    expect(Object.values(sources.pieces).every(piece => piece.rigged.arcana)).toBe(true);
  }, 30000);

  it('assigns every piece material from the textured shared library, read through shipped UVs', async () => {
    const library = await createIO().read(`public/models/${manifest.materialLibrary}`);
    const materials = new Map(library.getRoot().listMaterials().map(m => [m.getName(), m]));
    for (const piece of Object.values(manifest.pieces)) for (const entry of Object.values(piece.colors)) {
      const doc = await createIO().read(`public/models/${entry.file}`);
      expect(doc.getRoot().listTextures()).toHaveLength(0);
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
        const shared = materials.get(p.getMaterial().getName());
        expect(shared, p.getMaterial().getName()).toBeDefined();
        // Untextured accents (magic glow, horse eyes/nostrils) are flat by design.
        if (/magic|eye|nostril/.test(shared.getName())) continue;
        for (const slot of ['BaseColor', 'Normal', 'MetallicRoughness', 'Occlusion']) expect(shared[`get${slot}Texture`](), `${shared.getName()} ${slot}`).not.toBeNull();
        expect(p.getAttribute('TEXCOORD_0'), `${entry.file} ${shared.getName()} UVs`).not.toBeNull();
      }
    }
  }, 30000);

  it('keeps compressed motion within 1.8 degrees / 2 mm board-space of the 60 Hz source', async () => {
    if (!existsSync('assets/models/source/arcana-v678/V7_Rey_marfil')) return;
    const evaluate = (channel, time) => {
      const sampler = channel.getSampler(), times = sampler.getInput().getArray(), out = sampler.getOutput();
      let a = 0;
      while (a < times.length - 1 && times[a + 1] <= time) a++;
      const b = Math.min(a + 1, times.length - 1), t = times[b] > times[a] ? Math.min(1, Math.max(0, (time - times[a]) / (times[b] - times[a]))) : 0;
      const x = out.getElement(a, []), y = out.getElement(b, []);
      return channel.getTargetPath() === 'rotation' ? new Quaternion(...x).slerp(new Quaternion(...y), t).toArray() : x.map((v, i) => v + (y[i] - v) * t);
    };
    for (const [type, piece] of Object.entries(sources.pieces)) {
      const source = await createIO().read(`assets/models/source/${piece.rigged.files.w[0]}`);
      const shipped = await createIO().read(`public/models/${type}-w.glb`);
      const scale = shipped.getRoot().listNodes().find(n => n.getName() === 'piece-normalization').getScale()[0];
      const { selectors } = v678Contract(readClipExtras(source), readRigExtras(source), type, 1);
      for (const [key, name] of Object.entries(selectors)) {
        const original = source.getRoot().listAnimations().find(a => a.getName().endsWith(`__${name}`));
        const output = shipped.getRoot().listAnimations().find(a => a.getName() === key);
        const duration = original.getExtras().duration;
        for (const channel of output.listChannels()) {
          const input = original.listChannels().find(c => c.getTargetNode().getName() === channel.getTargetNode().getName() && c.getTargetPath() === channel.getTargetPath());
          for (let time = 0; time <= duration; time += 1 / 60) {
            const a = evaluate(input, time), b = evaluate(channel, time);
            const error = channel.getTargetPath() === 'rotation' ? new Quaternion(...a).angleTo(new Quaternion(...b)) : Math.hypot(...a.map((v, i) => v - b[i])) * scale;
            expect(error, `${type}/${key}/${channel.getTargetNode().getName()}`).toBeLessThan(channel.getTargetPath() === 'rotation' ? 0.032 : 0.002);
          }
        }
      }
    }
  }, 120000);
});
