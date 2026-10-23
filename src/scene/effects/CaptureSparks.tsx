import { useMemo, useRef } from "react";
import type { PointLight } from "three";
import type { PieceType } from "../../core/types";
import { DEFAULT_VFX_CONFIG } from "../../config/vfx";
import { reactionFinished } from "../animation/presentationState";
import { readQuality } from "../environment/battlefieldConfig";
import { captureSite, captureSpawn, flashIntensity, poolCapacity, reconcileBursts, type TrackedBurst } from "./captureVfx";
import { effectsStore } from "./effectsStore";
import { EmberParticles } from "./EmberParticles";
import { createEmberPool, spawnEmbers, stepEmbers } from "./embers";
import type { PieceBounds } from "./pieceColliders";

const config = DEFAULT_VFX_CONFIG;

/**
 * Embers and sparks for every capture: a burst at the weapon contact (the burst
 * enters the store exactly at plan.impact) and a second one when the victim breaks
 * after its reaction. Particles belong to their burst, so clearing the store on
 * undo, new game or resume removes them on the next frame.
 */
export function CaptureSparks({ bounds }: { bounds: Readonly<Record<PieceType, PieceBounds>> }) {
  const quality = readQuality();
  const preset = config.presets[quality];
  const pool = useMemo(() => createEmberPool(poolCapacity(quality, config)), [quality]);
  const tracked = useRef(new Map<number, TrackedBurst>());
  // One persistent light (dark between captures): toggling lights would recompile every lit material.
  const light = useRef<PointLight>(null);
  const flash = useRef({ atS: -Infinity, scale: 0 });

  const onFrame = (delta: number, time: number) => {
    const { bursts } = effectsStore.getState();
    reconcileBursts(tracked.current, bursts, pool);
    for (const burst of bursts) {
      let state = tracked.current.get(burst.id);
      if (!state) {
        state = { breakSpawned: false, flashAtS: time, flashScale: 1 };
        tracked.current.set(burst.id, state);
        const spawn = captureSpawn("impact", captureSite(burst, bounds, config), quality, config);
        spawnEmbers(pool, spawn, config);
        flash.current = { atS: time, scale: 1 };
        light.current?.position.set(...spawn.origin);
      }
      if (!state.breakSpawned && reactionFinished(burst.impact)) {
        state.breakSpawned = true;
        spawnEmbers(pool, captureSpawn("break", captureSite(burst, bounds, config), quality, config), config);
        flash.current = { atS: time, scale: config.flash.breakScale };
      }
    }
    if (tracked.current.size === 0) flash.current.scale = 0;
    stepEmbers(pool, delta, time, config);
    if (light.current) light.current.intensity = flashIntensity((time - flash.current.atS) * 1000, config) * flash.current.scale;
  };

  return <>
    <EmberParticles pool={pool} config={config} brightness={preset.brightness} onFrame={onFrame} />
    {preset.light && <pointLight ref={light} intensity={0} color={config.flash.color} distance={config.flash.distance} decay={2} />}
  </>;
}
