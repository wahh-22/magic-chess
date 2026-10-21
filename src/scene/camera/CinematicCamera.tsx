import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Camera, Vector3 } from "three";
import {
  blendCameraPose, cinematicDuration, sampleCinematicShot,
  type CameraPose, type CinematicShot,
} from "./cinematicShots";

// Structural subset keeps this component independent of drei's implementation type.
interface OrbitHandle {
  target: Vector3;
  enabled: boolean;
  enableDamping: boolean;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  update: () => unknown;
}
interface Session {
  shot: CinematicShot;
  original: CameraPose;
  controls: OrbitHandle;
  settings: Pick<OrbitHandle, "enabled" | "enableDamping" | "minDistance" | "maxDistance" | "maxPolarAngle">;
  elapsedMs: number;
  skip?: { from: CameraPose; elapsedMs: number };
}

function readPose(camera: Camera, controls: OrbitHandle): CameraPose {
  return { position: camera.position.toArray(), target: controls.target.toArray() };
}
function applyPose(camera: Camera, controls: OrbitHandle, pose: CameraPose) {
  camera.position.fromArray(pose.position);
  controls.target.fromArray(pose.target);
  camera.lookAt(controls.target);
  controls.update();
}
function restore(camera: Camera, session: Session) {
  applyPose(camera, session.controls, session.original);
  Object.assign(session.controls, session.settings);
}
function lockControls(controls: OrbitHandle, shot: CinematicShot) {
  controls.enabled = false;
  controls.enableDamping = false;
  controls.minDistance = Math.min(controls.minDistance, shot.config.minDistance);
  controls.maxDistance = Math.max(controls.maxDistance, shot.config.maxDistance);
  controls.maxPolarAngle = Math.max(controls.maxPolarAngle, shot.config.maxPolarAngle);
}
function skip(camera: Camera, session: Session | null) {
  if (session && !session.skip) {
    session.skip = { from: readPose(camera, session.controls), elapsedMs: 0 };
  }
}

export interface CinematicCameraProps {
  /** Keep a shot's identity stable (memo/state); publish a fresh object for each new shot. */
  shot?: CinematicShot | null;
  enabled: boolean;
  onShotEnd?: () => void;
}

/** Presentation only. Completion never applies a move or changes authoritative game state. */
export function CinematicCamera({ shot, enabled, onShotEnd }: CinematicCameraProps) {
  const camera = useThree((state) => state.camera);
  // SAFETY: ChessScene installs drei OrbitControls with makeDefault, which implements OrbitHandle.
  const controls = useThree((state) => state.controls) as unknown as OrbitHandle | null;
  const session = useRef<Session | null>(null);
  const lastShot = useRef<CinematicShot | null>(null);
  const endCallback = useRef(onShotEnd);

  useEffect(() => { endCallback.current = onShotEnd; }, [onShotEnd]);

  useEffect(() => {
    if (!enabled || !shot) {
      skip(camera, session.current);
      return;
    }
    if (!controls || shot === lastShot.current) return;
    // A replacement starts from the user's pose, never from an old cinematic view.
    if (session.current) restore(camera, session.current);
    lastShot.current = shot;
    session.current = {
      shot, controls, original: readPose(camera, controls), elapsedMs: 0,
      settings: {
        enabled: controls.enabled, enableDamping: controls.enableDamping,
        minDistance: controls.minDistance, maxDistance: controls.maxDistance,
        maxPolarAngle: controls.maxPolarAngle,
      },
    };
    lockControls(controls, shot);
  }, [shot, enabled, camera, controls]);

  useEffect(() => {
    const onPointerDown = () => skip(camera, session.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip(camera, session.current);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      if (session.current) restore(camera, session.current);
      session.current = null;
      lastShot.current = null;
    };
  }, [camera]);

  useFrame((_, delta) => {
    const active = session.current;
    if (!active) return;
    let done: boolean;
    let pose: CameraPose;
    if (active.skip) {
      active.skip.elapsedMs += delta * 1000;
      done = active.skip.elapsedMs >= active.shot.config.returnMs;
      pose = blendCameraPose(active.skip.from, active.original,
        active.skip.elapsedMs / active.shot.config.returnMs);
    } else {
      active.elapsedMs += delta * 1000;
      done = active.elapsedMs >= cinematicDuration(active.shot);
      pose = sampleCinematicShot(active.shot, active.original, active.elapsedMs);
    }
    applyPose(camera, active.controls, pose);
    if (done) {
      restore(camera, active);
      session.current = null;
      endCallback.current?.();
    }
  }, -0.5); // After OrbitControls (-1), before additive impact shake (0).
  return null;
}
