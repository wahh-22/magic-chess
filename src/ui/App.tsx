import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "zustand";
import { importPgn as parsePgn } from "../core/pgn";
import { loadProgress, sceneLoader } from "../loading/state";
import { readCinematicEnabled } from "../scene/camera/CinematicToggle";
import { QUALITY_KEY, readQuality, type GraphicsQuality } from "../scene/environment/battlefieldConfig";
import { CreditsDialog } from "./CreditsDialog";
import { flowReducer, initialFlow, isMenuScreen, readyToReveal, SECONDARY_WAIT_MS, type EngineStatus } from "./flow";
import { gameStore, useGameStore, type GameSettings } from "./gameStore";
import { LoadingScreen } from "./LoadingScreen";
import { loadingArtFor } from "./loadingTips";
import { browserStorage, readSave } from "./persistence";
import { TitleScreen } from "./TitleScreen";

/** Everything three.js: fetched at Start, or while the title idles (code and bytes, no GPU work). */
const loadMatch = () => import("./Match");
const Match = lazy(() => loadMatch().then((module) => ({ default: module.Match })));

/** Runs `work` once the browser is idle after the title is shown. */
function whenIdle(work: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(work, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(work, 1500);
  return () => clearTimeout(timer);
}

export function App() {
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const [quality, setQualityState] = useState(readQuality);
  // The preset the mounted scene uses: a change on the title applies at the next Start.
  const [sceneQuality, setSceneQuality] = useState(quality);
  const [warmRound, setWarmRound] = useState(0);
  const [cinematic, setCinematic] = useState(readCinematicEnabled);
  const [engine, setEngine] = useState<EngineStatus>("none");
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [matchMounted, setMatchMounted] = useState(false);
  const [softwareGL, setSoftwareGL] = useState(false);
  const pendingStart = useRef<(() => void) | null>(null);
  const criticalReadyAt = useRef(0);
  const stage = useStore(sceneLoader, (state) => state.stage);
  const secondary = useStore(sceneLoader, (state) => state.secondary);
  const gamePhase = useGameStore((state) => state.phase);
  const hasSavedGame = useGameStore((state) => state.hasSavedGame);

  useEffect(() => {
    try { localStorage.setItem(QUALITY_KEY, quality); }
    catch { /* Private browsing can disable storage; the session setting still works. */ }
  }, [quality]);

  // Prefetch while the title is shown: the match code, then its bytes at low priority.
  useEffect(() => whenIdle(() => { void loadMatch().then((module) => module.prefetchSceneBytes()).catch(() => undefined); }), []);

  /** Rebuilds the mounted scene for the preset behind the loading screen. */
  const rewarmScene = (next: GraphicsQuality) => {
    sceneLoader.getState().rewarm();
    setWarmRound((round) => round + 1);
    setSceneQuality(next);
  };
  const changeQuality = (next: GraphicsQuality) => {
    if (next === quality) return;
    setQualityState(next);
    // In play it applies now; on the title it waits for the next Start (no scene work in the menu).
    if (!isMenuScreen(flow.screen) && matchMounted) rewarmScene(next);
  };

  /** Start: the match loads behind the loading screen; `action` starts the game once it is ready. */
  const begin = (action: () => void, vsEngine: boolean) => {
    pendingStart.current = action;
    if (!flow.sceneMounted) {
      setSceneQuality(quality);
      void loadMatch().then((module) => module.preloadCriticalScene(quality));
    } else if (sceneQuality !== quality) {
      rewarmScene(quality);
    }
    if (vsEngine) {
      const id = `build:engine-${flow.matchCount + 1}`;
      loadProgress.add(id, { stage: "critical", phase: "build", total: 1 });
      setEngine("pending");
      void gameStore.getState().prepareEngine().then((ok) => {
        loadProgress.done(id);
        setEngine(ok ? "ready" : "failed");
      });
    } else {
      setEngine("none");
    }
    dispatch({ type: "start" });
  };
  const startGame = (settings: GameSettings) => begin(() => gameStore.getState().startGame(settings), settings.mode === "ai");
  const continueGame = () => begin(() => gameStore.getState().continueGame(), readSave(browserStorage())?.settings.mode === "ai");
  const importGame = (text: string) => {
    try { parsePgn(text); }
    catch (error) { return error instanceof Error ? error.message : "Invalid PGN"; }
    begin(() => { gameStore.getState().importPgn(text); }, false);
    return null;
  };

  // The canvas is created after the loading screen has painted: creating a WebGL context is
  // one long task in software GL, and the screen must already be up when it runs.
  useEffect(() => {
    if (!flow.sceneMounted || matchMounted) return;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setMatchMounted(true)); });
    return () => cancelAnimationFrame(frame);
  }, [flow.sceneMounted, matchMounted]);

  useEffect(() => { if (stage === "ready") criticalReadyAt.current = performance.now(); }, [stage]);

  // The board is revealed (and the game starts) only once everything it needs is prepared.
  useEffect(() => {
    if (flow.screen !== "loading" || stage !== "ready" || engine === "pending") return;
    const waited = performance.now() - criticalReadyAt.current;
    const wait = readyToReveal({ scene: stage, engine, secondary, secondaryWaitMs: waited }) ? 0 : SECONDARY_WAIT_MS - waited;
    const timer = setTimeout(() => {
      const action = pendingStart.current;
      pendingStart.current = null;
      action?.();
      dispatch({ type: "loaded" });
    }, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [flow.screen, stage, engine, secondary]);

  // Menu (HUD or game over) returns the game to setup: back to the title.
  if (gamePhase === "setup" && (flow.screen === "playing" || flow.screen === "reveal")) dispatch({ type: "menu" });

  const onRevealed = useCallback(() => dispatch({ type: "revealed" }), []);
  const onRenderer = useCallback((software: boolean) => setSoftwareGL(software), []);
  const openCredits = useCallback(() => setCreditsOpen(true), []);
  const closeCredits = useCallback(() => setCreditsOpen(false), []);
  const settings = { quality, onQuality: changeQuality, cinematic, onCinematic: setCinematic };
  const rewarming = flow.screen === "playing" && stage !== "ready";

  return (
    // data-renderer="software": overlays over the canvas cut or step instead of fading (see styles.css).
    <div className="app" data-screen={flow.screen} data-renderer={softwareGL ? "software" : undefined}>
      {matchMounted && <Suspense fallback={null}>
        <Match screen={flow.screen} quality={sceneQuality} warmRound={warmRound} onRevealed={onRevealed} onRenderer={onRenderer}
          settings={{ ...settings, onCredits: openCredits }} />
      </Suspense>}
      {isMenuScreen(flow.screen) && <TitleScreen screen={flow.screen} mode={flow.mode} hasSavedGame={hasSavedGame}
        dispatch={dispatch} onStart={startGame} onContinue={continueGame} onImport={importGame} onCredits={openCredits}
        settings={settings} />}
      <LoadingScreen active={flow.screen === "loading" || rewarming} rewarm={rewarming || (warmRound > 0 && stage !== "ready")}
        art={loadingArtFor(flow.matchCount)} seed={flow.matchCount} secondary={flow.screen === "loading" ? secondary : "ready"} />
      {creditsOpen && <CreditsDialog onClose={closeCredits} />}
    </div>
  );
}
