import { poseSheet, SHOTS, type ShotName } from "./shots";
import { renderShot } from "./stage";

/**
 * Development-only key-art stage (tools/key-art.html), rendered by scripts/art/render-key-art.mjs.
 * `?shot=<name>` picks the composition (`?poses=` renders a clip contact sheet); the frame fills the viewport. Completion is published
 * on `globalThis.__keyArt` so the capture script can wait for it.
 */
const params = new URLSearchParams(location.search);
const name = (params.get("shot") ?? "title") as ShotName;
const status = { state: "rendering", error: "" };
Object.assign(globalThis, { __keyArt: status });

const canvas = document.querySelector("canvas")!;
const poses = params.get("poses");
const shot = poses ? poseSheet(poses, Number(params.get("duration") ?? 2500)) : SHOTS[name];
if (!shot) {
  Object.assign(status, { state: "error", error: `Unknown shot "${name}"; expected ${Object.keys(SHOTS).join(", ")}` });
} else {
  // `?ss=` = supersampling factor of the viewport (the capture script downsizes the frame).
  renderShot(shot, canvas, window.innerWidth, window.innerHeight, Number(params.get("ss") ?? 1)).then(
    () => { status.state = "ready"; },
    (error: unknown) => Object.assign(status, { state: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) }),
  );
}
