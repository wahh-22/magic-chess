import { useEffect, useState } from "react";
import { loadProgress } from "../loading/state";
import type { ProgressSnapshot } from "../loading/progress";
import type { StagedLoaderState } from "../loading/stagedLoader";
import { Emblem } from "./Heraldry";
import { KeyArt } from "./KeyArt";
import { LOADING_KEY_ART } from "./keyArtSources";
import { matchProgress } from "./loadingProgress";
import { LOADING_TIPS, TIP_INTERVAL_MS, tipAt } from "./loadingTips";

const FADE_MS = 700;

/** What the bar is doing, in the game's voice. */
export function loadingLabel(phase: ProgressSnapshot["phase"] | "secondary", rewarm = false): string {
  if (rewarm) return "Applying the new graphics";
  switch (phase) {
    case "download": return "Gathering stone and steel";
    case "build": return "Raising the ruins";
    case "upload": return "Laying out the battlefield";
    case "compile": return "Kindling the arcana";
    case "secondary": return "Growing the olive groves";
    default: return "The battlefield is ready";
  }
}

const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1);

/** Repaints of the bar per second: enough to feel live, few enough not to compete with the GPU work. */
const UPDATE_MS = 250;

/** Latest match progress, a few times per second; the bar never moves backwards. */
function useMatchProgress(secondary: StagedLoaderState["secondary"]) {
  const read = () => {
    const critical = loadProgress.snapshot("critical");
    return { critical, ...matchProgress(critical, loadProgress.snapshot("secondary"), secondary) };
  };
  const [state, setState] = useState(() => { const first = read(); return { ...first, shown: first.fraction }; });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = -Infinity;
    const update = () => {
      timer = undefined;
      last = performance.now();
      const next = read();
      setState((previous) => ({ ...next, shown: Math.max(previous.shown, next.fraction) }));
    };
    // At most one repaint per UPDATE_MS, the first one at once.
    const stop = loadProgress.subscribe(() => { timer ??= setTimeout(update, Math.max(0, last + UPDATE_MS - performance.now())); });
    update();
    return () => { stop(); clearTimeout(timer); };
    // `read` only depends on `secondary`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondary]);
  return state;
}

/** The current tip, changed every TIP_INTERVAL_MS (one re-render per tip, no animation loop). */
function useRotatingTip(seed: number) {
  const [index, setIndex] = useState(() => tipAt(0, seed));
  useEffect(() => {
    const shownAt = performance.now();
    const timer = setInterval(() => setIndex(tipAt(performance.now() - shownAt, seed)), TIP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [seed]);
  return LOADING_TIPS[index]!;
}

function LoadingContent({ ready, rewarm, art, seed, secondary }: {
  ready: boolean; rewarm: boolean; art: string; seed: number; secondary: StagedLoaderState["secondary"];
}) {
  const { critical, phase, shown } = useMatchProgress(secondary);
  const tip = useRotatingTip(seed);
  const percent = Math.round((ready ? 1 : shown) * 100);
  const label = loadingLabel(ready ? "done" : phase, rewarm);
  const bytes = phase === "download" && critical.totalBytes > 1 ? `${megabytes(critical.loadedBytes)} / ${megabytes(critical.totalBytes)} MB` : "";
  return <>
    <KeyArt key={art} className="loading-art" src={art} lqip={LOADING_KEY_ART[art]} />
    <div className="loading-shade" aria-hidden="true" />
    <header className="loading-title">
      <div className="setup-crest" aria-hidden="true"><Emblem color="w" size={26} /><Emblem color="b" size={26} /></div>
      <h1>Magic Chess</h1>
    </header>
    <div className="loading-footer">
      {!rewarm && <p className="loading-tip" key={tip}><span className="loading-tip-mark" aria-hidden="true">◆</span>{tip}</p>}
      <div className="loading-meter">
        <div className="loading-bar" role="progressbar" aria-label="Loading the battlefield" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={percent} aria-valuetext={`${percent}% — ${label}`}>
          <div className="loading-bar-fill" style={{ transform: `scaleX(${rewarm ? 1 : percent / 100})` }} />
        </div>
        <div className="loading-caption">
          <span aria-live="polite">{label}</span>
          {!rewarm && <span className="loading-figures">{bytes}{bytes && " · "}{percent}%</span>}
        </div>
      </div>
    </div>
  </>;
}

/**
 * Full-screen loading screen while a match is prepared: key art, rotating tips, and the real
 * progress (bytes, then build, upload and shader steps, then the secondary set) with its stage. When `active` turns
 * off it fades to black (the reveal veil underneath) and unmounts. No looping animation: every
 * composited frame competes with the scene's GPU work (see docs/performance.md).
 */
export function LoadingScreen({ active, rewarm = false, art, seed, secondary = "ready" }: {
  active: boolean; rewarm?: boolean; art: string; seed: number;
  /** The secondary set's state while the reveal waits for it ("ready" when it does not). */
  secondary?: StagedLoaderState["secondary"];
}) {
  const [gone, setGone] = useState(!active);
  // Shown again for the next match or a graphics change.
  if (active && gone) setGone(false);
  useEffect(() => {
    if (active) return;
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [active]);
  if (gone) return null;
  return (
    <div className={`loading-screen${active ? "" : " is-leaving"}${rewarm ? " is-indeterminate" : ""}`} aria-hidden={!active || undefined}>
      <LoadingContent ready={!active} rewarm={rewarm} art={art} seed={seed} secondary={secondary} />
    </div>
  );
}
