import { describe, it, expect } from 'vitest';
import { v4Contract } from './arcana-v4.mjs';

// The shipped pieces are V6–V8 (arcana-v678.test.mjs); the V4 integration path stays supported.
describe('V4 event contract', () => {
  it('derives event milliseconds and divides two-cycle advance distance correctly', () => {
    const data = { rig: { weapons: { primary: { tip_bone: 'tip' } } }, clips: [
      { name: 'Guardia' }, { name: 'Caminar_en_sitio', duration: 1.2 }, { name: 'Impacto' },
      { name: 'Caminar_avance', duration: 2.4, root_motion_distance: [0, 0, 2] },
      ...['Corte_espada', 'Estocada_espada'].map(name => ({ name, duration: 2, attack_window: [0.8, 1.1], events: [{ type: 'weapon_trail_start', time: 0.6 }, { type: 'attack_active', time: 0.8, active_end: 1.1 }] })),
    ] };
    const result = v4Contract(data, 'k', 0.5);
    expect(result.walkCycle).toEqual({ durationMs: 1200, strideBoardUnits: 0.5 });
    expect(result.attacks[0]).toEqual({ clip: 'attack0', durationMs: 2000, hitMs: 800, activeEndMs: 1100, trailStartMs: 600, trailEndMs: 1100 });
    expect(result.weaponTip).toBe('tip');
  });
});
