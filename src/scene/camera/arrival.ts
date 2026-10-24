import { CAMERA_TARGET, DEFAULT_CAMERA } from "../environment/battlefieldConfig";
import { blendCameraPose, constrainScenePose, type CameraPose } from "./cinematicShots";

/** Length of the camera arrival after the loading screen (skippable). */
export const ARRIVAL_MS = 2600;

const PLAY_POSE: CameraPose = { position: DEFAULT_CAMERA, target: CAMERA_TARGET };

/**
 * Opening shot: high above Black's left corner, looking down on the board; the camera then
 * descends and swings half around the board onto White's play camera. It frames the plaza,
 * not the whole battlefield: a low shot across the land costs several times more to render
 * (seconds per frame in software GL).
 */
const START_POSE: CameraPose = constrainScenePose({ position: [-4.2, 15.5, -3.2], target: [0, 0, 0.3] });

/** Camera pose `elapsedMs` into the arrival; exactly the play camera at the end. */
export function arrivalPose(elapsedMs: number): CameraPose {
  if (elapsedMs >= ARRIVAL_MS) return PLAY_POSE;
  return constrainScenePose(blendCameraPose(START_POSE, PLAY_POSE, Math.max(0, elapsedMs) / ARRIVAL_MS));
}
