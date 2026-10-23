import { useEffect, useState } from "react";
import { loadProgress } from "../loading/assets";
import type { ProgressSnapshot } from "../loading/progress";
import { Emblem } from "./Heraldry";

const FADE_MS = 800;

/** What the bar is doing, in the game's voice. */
export function loadingLabel(snapshot: Pick<ProgressSnapshot, "phase">, rewarm = false): string {
  if (rewarm) return "Applying the new graphics";
  switch (snapshot.phase) {
    case "download": return "Gathering stone and steel";
    case "build": return "Raising the ruins";
    case "upload": return "Laying out the battlefield";
    case "compile": return "Kindling the arcana";
    default: return "The battlefield is ready";
  }
}

const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1);

/** Repaints of the bar per second: enough to feel live, few enough not to compete with the GPU work. */
const UPDATE_MS = 250;

/** Latest critical-stage progress, a few times per second; the bar never moves backwards. */
function useCriticalProgress() {
  const [state, setState] = useState(() => ({ snapshot: loadProgress.snapshot("critical"), shown: 0 }));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      timer = undefined;
      const snapshot = loadProgress.snapshot("critical");
      setState((previous) => ({ snapshot, shown: Math.max(previous.shown, snapshot.fraction) }));
    };
    const stop = loadProgress.subscribe(() => { timer ??= setTimeout(update, UPDATE_MS); });
    update();
    return () => { stop(); clearTimeout(timer); };
  }, []);
  return state;
}

/**
 * Branded loading screen with real progress (bytes, then build, upload and shader steps).
 * Behind the setup menu it only shows the bar, so the menu stays usable while assets load;
 * once "Start game" waits for the scene it takes the full screen. When the critical set is
 * ready it fades out, revealing the scene.
 */
export function LoadingScreen({ ready, full, rewarm = false }: { ready: boolean; full: boolean; rewarm?: boolean }) {
  const { snapshot, shown } = useCriticalProgress();
  const [gone, setGone] = useState(ready);
  // Shown again when the scene is prepared again (e.g. a graphics change).
  if (!ready && gone) setGone(false);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  if (gone) return null;
  const percent = Math.round((ready ? 1 : shown) * 100);
  const label = loadingLabel(ready ? { phase: "done" } : snapshot, rewarm);
  const bytes = snapshot.phase === "download" && snapshot.totalBytes > 1 ? `${megabytes(snapshot.loadedBytes)} / ${megabytes(snapshot.totalBytes)} MB` : "";
  const meter = (
    <div className={`loading-meter${full ? "" : " is-floating"}${ready ? " is-leaving" : ""}`}>
      <div className="loading-bar" role="progressbar" aria-label="Loading the battlefield" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} aria-valuetext={`${percent}% — ${label}`}>
        <div className="loading-bar-fill" style={{ transform: `scaleX(${rewarm ? 1 : percent / 100})` }} />
      </div>
      <div className="loading-caption">
        <span aria-live="polite">{label}</span>
        {!rewarm && <span className="loading-figures">{bytes}{bytes && " · "}{percent}%</span>}
      </div>
    </div>
  );
  // Behind the setup menu the bar floats above the menu's backdrop (it never takes clicks).
  return <>
    <div className={`loading-screen${full ? " is-full" : ""}${ready ? " is-leaving" : ""}${rewarm ? " is-indeterminate" : ""}`} aria-hidden={ready || undefined}>
      {full && <div className="loading-title">
        <div className="setup-crest" aria-hidden="true"><Emblem color="w" size={34} /><Emblem color="b" size={34} /></div>
        <h1>Magic Chess</h1>
        <p className="setup-subtitle">{rewarm ? "One moment" : "The battle begins when the field is ready"}</p>
      </div>}
      {full && meter}
    </div>
    {!full && meter}
  </>;
}
