import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { DEFAULT_ANIMATION_CONFIG } from "../../config/animation";
import type { PieceType } from "../../core/types";
import { sampleImpactShake } from "./impactShake";

export interface ShakeImpulse { atMs: number; type: PieceType }

/** Remove last frame's offset before controls/cinematic updates; add this frame's
 * only after both. Never change the controls target or take ownership of rendering.
 */
export function ImpactShake({ impulse }: { impulse: RefObject<ShakeImpulse | undefined> }) {
  const camera = useThree((state) => state.camera);
  const offset = useRef(new Vector3());
  const reduced = useRef(false);
  useEffect(() => {
    const appliedOffset = offset.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reduced.current = preference.matches; };
    update();
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      camera.position.sub(appliedOffset);
      appliedOffset.set(0, 0, 0);
    };
  }, [camera]);
  useFrame(() => {
    camera.position.sub(offset.current);
    offset.current.set(0, 0, 0);
  }, -3);
  useFrame(({ clock }) => {
    const hit = impulse.current;
    if (!hit) return;
    offset.current.fromArray(sampleImpactShake(clock.getElapsedTime() * 1000 - hit.atMs, hit.type, DEFAULT_ANIMATION_CONFIG.shake, reduced.current));
    camera.position.add(offset.current);
  });
  return null;
}
