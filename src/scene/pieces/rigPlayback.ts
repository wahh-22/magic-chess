import { AnimationMixer, LoopOnce, Mesh, type AnimationAction, type Material } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFAULT_ANIMATION_CONFIG } from '../../config/animation';
import type { RuntimeRig } from '../animation/motion';

/** Absolute plan time -> clip time. Only recovery is delayed; contact never drifts. */
export function sampleAttackClock(elapsedMs: number, attack: { startMs: number; rate?: number }, impactMs: number, hitstopMs: number): number | undefined {
  if (elapsedMs < attack.startMs) return undefined;
  return (elapsedMs - attack.startMs - Math.min(hitstopMs, Math.max(0, elapsedMs - impactMs))) * (attack.rate ?? 1);
}
export interface RigPlaybackState {
  role: 'idle' | 'walk' | 'trot' | 'attack' | 'hit';
  timeMs: number;
  variant?: number;
  cycleMs?: number;
  hitMs?: number;
}

/** Independent mixers and absolute action clocks; GPU geometry/materials stay shared. */
export function createRigPlayback(rig: RuntimeRig, material: Material | Material[], phase = 0) {
  const scene = clone(rig.scene);
  if (rig.pedestal) {
    const pedestal = scene.getObjectByName(rig.pedestal.nodeName);
    if (pedestal) pedestal.visible = false;
  }
  scene.traverse(object => {
    if (object instanceof Mesh) {
      if (!rig.preserveMaterials) object.material = material;
      object.castShadow = object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });
  const mixer = new AnimationMixer(scene);
  function actions() {
    const result = new Map<string, AnimationAction>();
    for (const role of ['idle', 'walk', 'trot', 'hit', 'attack'] as const) {
      const clip = rig.clips[role];
      if (clip && !(role === 'attack' && (rig.attacks ?? rig.clips.attacks)?.length)) result.set(role, mixer.clipAction(clip));
    }
    (rig.attacks ?? rig.clips.attacks)?.forEach((entry, i) => result.set(`attack${i}`, mixer.clipAction(entry.clip)));
    for (const [key, action] of result) {
      if (key.startsWith('attack') || key === 'hit') { action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; }
      action.setEffectiveWeight(0).play();
    }
    const idle = result.get('idle');
    if (idle) { idle.time = phase * idle.getClip().duration; idle.setEffectiveWeight(1); }
    return result;
  }
  let all = actions(), active = 'idle', transitionMs = 0, disposed = false;
  let initialWeights = new Map<string, number>();
  mixer.update(0);
  return {
    scene,
    resume() {
      if (disposed) {
        all = actions(); active = 'idle'; transitionMs = 0; disposed = false;
        initialWeights.clear();
      }
      mixer.update(0);
    },
    update(delta: number, input?: number | RigPlaybackState) {
      const state: RigPlaybackState = typeof input === 'number'
        ? input < (rig.clipDurationMs ?? 0) ? { role: 'attack', timeMs: input, hitMs: rig.hitTimeMs } : { role: 'idle', timeMs: 0 }
        : input ?? { role: 'idle', timeMs: 0 };
      let key = state.role === 'attack' && state.variant !== undefined ? `attack${state.variant}` : state.role;
      if (key === 'attack' && !all.has(key) && all.has('attack0')) key = 'attack0';
      if (!all.has(key)) key = 'idle'; // Missing roles deliberately keep the old resting pose.
      if (key !== active) {
        initialWeights = new Map([...all].map(([name, action]) => [name, action.getEffectiveWeight()]));
        active = key; transitionMs = 0;
        const action = all.get(key);
        if (action && key !== 'idle') action.reset().play();
      }
      transitionMs += delta * 1000;
      // Hit reactions are fully weighted at impact; attacks must be fully weighted
      // at their hit event even on the first frame after a slow render.
      const contact = state.role === 'hit' || (state.role === 'attack' && state.timeMs >= (state.hitMs ?? rig.hitTimeMs ?? 0));
      const fade = contact ? 1 : Math.min(1, transitionMs / DEFAULT_ANIMATION_CONFIG.crossfadeMs);
      for (const [name, action] of all) {
        const weight = (initialWeights.get(name) ?? (name === 'idle' ? 1 : 0)) * (1 - fade) + (name === key ? fade : 0);
        action.enabled = true;
        action.setEffectiveWeight(weight);
      }
      mixer.update(delta);
      const action = all.get(key);
      if (action && key !== 'idle') {
        const duration = action.getClip().duration;
        const loop = state.role === 'walk' || state.role === 'trot';
        action.paused = false;
        action.time = loop ? ((state.timeMs / (state.cycleMs ?? duration * 1000)) % 1) * duration : Math.min(duration, Math.max(0, state.timeMs / 1000));
        mixer.update(0);
      }
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(scene); disposed = true;
      scene.traverse(object => { if ('skeleton' in object) (object as import('three').SkinnedMesh).skeleton.dispose(); });
    },
  };
}
