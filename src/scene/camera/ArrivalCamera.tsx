import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Camera, Vector3 } from "three";
import { ARRIVAL_MS, arrivalPose } from "./arrival";
import type { CameraPose } from "./cinematicShots";

// Structural subset of drei's OrbitControls (see CinematicCamera).
interface OrbitHandle { target: Vector3; enabled: boolean; update: () => unknown }

/** Extra time after the arrival before it is forced to end (software GL can render < 1 fps). */
const FRAME_GRACE_MS = 1500;

function applyPose(camera: Camera, controls: OrbitHandle, pose: CameraPose) {
  camera.position.fromArray(pose.position);
  controls.target.fromArray(pose.target);
  camera.lookAt(controls.target);
  // A click that skips the arrival is raycast before the next frame: use the new pose.
  camera.updateMatrixWorld();
}

/** One arrival: the frame loop samples it, a skip or the grace timer ends it. */
interface Session { startedAt: number | null; finish: () => void }

/**
 * Camera arrival after the loading screen: from an opening shot onto the play camera in
 * ARRIVAL_MS. A click or key press skips it; it always ends exactly on the play camera,
 * with the orbit controls handed back. Presentation only.
 */
export function ArrivalCamera({ active, onDone }: { active: boolean; onDone: () => void }) {
  const get = useThree((state) => state.get);
  const hasControls = useThree((state) => Boolean(state.controls));
  const session = useRef<Session | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!active || !hasControls) return;
    const { camera, invalidate } = get();
    // SAFETY: ChessScene installs drei OrbitControls with makeDefault, which implements OrbitHandle.
    const controls = get().controls as unknown as OrbitHandle;
    let finished = false;
    const release = () => {
      finished = true;
      session.current = null;
      applyPose(camera, controls, arrivalPose(ARRIVAL_MS));
      controls.enabled = true;
      controls.update();
      invalidate();
    };
    const finish = () => {
      if (finished) return;
      release();
      done.current();
    };
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
    controls.enabled = false;
    applyPose(camera, controls, arrivalPose(0));
    session.current = { startedAt: null, finish };
    const timer = setTimeout(finish, ARRIVAL_MS + FRAME_GRACE_MS);
    const skip = (event: Event) => { if (!(event instanceof KeyboardEvent && event.repeat)) finish(); };
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
      // Deactivated mid-way (e.g. back to the menu): leave the play camera behind.
      if (!finished) release();
    };
  }, [active, hasControls, get]);

  useFrame(({ camera, controls }) => {
    const current = session.current;
    if (!current || !controls) return;
    const now = performance.now();
    current.startedAt ??= now;
    const elapsed = now - current.startedAt;
    if (elapsed >= ARRIVAL_MS) current.finish();
    else applyPose(camera, controls as unknown as OrbitHandle, arrivalPose(elapsed));
  }, -0.5); // After OrbitControls (-1), before additive impact shake (0).
  return null;
}
