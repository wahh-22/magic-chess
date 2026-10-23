// ARCANA V6 (queen, rook), V7 (bishop, pawn, king) and V8 (knight): events live in GLB animation extras.

/** Only the knight ships an integration JSON beside its GLBs. */
export const V678_INTEGRATION = { caballo: 'arcana-v678/V8_Fuentes/integracion/caballo.json' };

const attacksByType = {
  k: ['Corte_espada', 'Estocada_espada'], q: ['Golpe_baculo', 'Canalizar_hechizo'], b: ['Estocada_lanza', 'Corte_lanza'],
  n: ['Estocada_montada', 'Barrido_lanza'], r: ['Tajo_espada', 'Estocada_espada'], p: ['Estocada_lanza', 'Barrido_lanza'],
};

/** Animation extras, named by their `<role>_<side>__` suffix. */
export function readClipExtras(document) {
  return document.getRoot().listAnimations().map(a => ({ name: a.getName().split('__').at(-1), ...a.getExtras() }));
}

export function readRigExtras(document) {
  return document.getRoot().listNodes().find(n => n.getExtras()?.rig)?.getExtras().rig ?? {};
}

const attackEvent = clip => clip?.events?.find(e => ['attack_active', 'attack'].includes(e.type));

/** Same processed contract as V4; the knight has no walk clip (its mount is rigid and glides). */
export function v678Contract(clips, rig, type, scale, integration) {
  const find = name => clips.find(c => c.name === name);
  const get = name => { const clip = find(name); if (!clip) throw new Error(`Missing V6–V8 clip ${name}`); return clip; };
  const knight = type === 'n';
  const selectors = { idle: find('Guardia')?.name ?? get(knight ? 'Reposo_montado' : 'Reposo').name };
  const walk = find('Caminar_en_sitio'), advance = find('Caminar_avance');
  if (walk) selectors.walk = walk.name;
  selectors.hit = get(knight ? 'Impacto_montado' : 'Impacto').name;
  const attacks = attacksByType[type].map((name, i) => {
    const own = get(name);
    // GLB extras win; the integration JSON only fills a clip without an attack window.
    const clip = attackEvent(own) || own.attack_window ? own : integration?.clips?.find(c => c.name === name) ?? own;
    const event = attackEvent(clip);
    const hit = event?.time ?? clip.attack_window?.[0];
    const end = event?.active_end ?? clip.attack_window?.[1];
    const start = clip.events?.find(e => e.type === 'weapon_trail_start')?.time ?? clip.events?.find(e => e.type === 'anticipation')?.time ?? hit;
    const duration = own.duration;
    if (![hit, end, start, duration].every(Number.isFinite) || start > hit || hit > end || end > duration) throw new Error(`Invalid attack events ${name}`);
    selectors[`attack${i}`] = name;
    return { clip: `attack${i}`, durationMs: duration * 1000, hitMs: hit * 1000, activeEndMs: end * 1000, trailStartMs: start * 1000, trailEndMs: end * 1000 };
  });
  const socket = attacksByType[type].map(name => attackEvent(find(name)) ?? attackEvent(integration?.clips?.find(c => c.name === name))).find(e => e?.socket)?.socket;
  const weaponTip = rig.weapons?.primary?.tip_bone ?? socket;
  if (!weaponTip) throw new Error(`Missing weapon tip for ${type}`);
  // Humanoid advance exports hold two in-place cycles: stride is per in-place cycle.
  const walkCycle = walk && advance ? { durationMs: walk.duration * 1000, strideBoardUnits: Math.hypot(...advance.root_motion_distance) * scale * walk.duration / advance.duration } : undefined;
  return { selectors, attacks, ...(walkCycle ? { walkCycle } : {}), weaponTip };
}
