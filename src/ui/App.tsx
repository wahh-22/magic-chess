import { lazy, useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import { MuteToggle } from "../audio/MuteToggle";
import { useGameSounds } from "../audio/useGameSounds";
import type { MoveEvent } from "../core/types";
import { planMove } from "../scene/animation/planMove";
import { Board } from "../scene/Board";
import { CinematicCamera } from "../scene/camera/CinematicCamera";
import { planCinematicShot, qualifiesForCinematic, type CinematicShot } from "../scene/camera/cinematicShots";
import { CinematicToggle, readCinematicEnabled } from "../scene/camera/CinematicToggle";
import { effectsStore } from "../scene/effects/effectsStore";
import { ChessScene } from "../scene/ChessScene";
import { QUALITY_KEY, readQuality, type GraphicsQuality } from "../scene/environment/battlefieldConfig";
import { Pieces } from "../scene/Pieces";
import { preloadCriticalScene, usePieceModels, warmPass } from "../scene/sceneAssets";
import { sceneLoader } from "../loading/assets";
import { useGameStore } from "./gameStore";
import { LoadingScreen } from "./LoadingScreen";
import { PromotionPicker } from "./PromotionPicker";
import { SetupScreen } from "./SetupScreen";
import { GameActions, Hud } from "./Hud";
import { CreditsDialog } from "./CreditsDialog";
import { SettingsMenu } from "./SettingsMenu";
import { GameOverScreen } from "./GameOverScreen";

// Physics (Rapier + its WASM) and capture effects are a separate chunk, loaded with the
// critical set: its light and materials are part of the scene the warm-up prepares.
const DestructionLayer = lazy(() =>
  import("../scene/effects/DestructionLayer").then((module) => ({ default: module.DestructionLayer })),
);

// Downloads, the environment worker and code chunks start before the first render.
preloadCriticalScene(readQuality());

/** Pieces and capture effects: they suspend the critical boundary until the models are ready. */
function ScenePieces(props: Omit<Parameters<typeof Pieces>[0], "provider">) {
  const models = usePieceModels();
  return <>
    <Pieces provider={models} {...props} />
    <DestructionLayer pieces={props.pieces} activeEvent={props.activeEvent} provider={models} />
  </>;
}

export function App() {
  const [quality, setQualityState] = useState(readQuality);
  const [warmRound, setWarmRound] = useState(0);
  const setQuality = (next: GraphicsQuality) => {
    if (next === quality) return;
    // A new preset changes lights, shadows and post-processing: prepare it behind the loading screen.
    sceneLoader.getState().rewarm();
    setWarmRound((round) => round + 1);
    setQualityState(next);
  };
  useEffect(() => {
    try { localStorage.setItem(QUALITY_KEY, quality); }
    catch { /* Private browsing can disable storage; the session setting still works. */ }
  }, [quality]);
  // The menu appears once the WebGL context exists, so it is responsive from its first frame.
  const [glReady, setGlReady] = useState(false);
  const onSceneCreated = useCallback(() => setGlReady(true), []);
  const stage = useStore(sceneLoader, (state) => state.stage);
  const startPending = useStore(sceneLoader, (state) => state.startPending);
  const ready = stage === "ready";
  const pieces = useGameStore((state) => state.displayedPieces);
  const selected = useGameStore((state) => state.selected);
  const targets = useGameStore((state) => state.legalTargets);
  const selectSquare = useGameStore((state) => state.selectSquare);
  const phase = useGameStore((state) => state.phase);
  const activeEvent = useGameStore((state) => state.animationQueue[0]);
  const animationDone = useGameStore((state) => state.animationDone);
  const gameId = useGameStore((state) => state.gameId);

  const positionVersion = useGameStore((state) => state.positionVersion);
  const lastUci = useGameStore((state) => state.game.uciHistory().at(-1));
  // Leftover debris and dust belong to the previous position/game.
  useEffect(() => effectsStore.getState().clear(), [gameId, positionVersion]);

  const soundProvider = useGameSounds({ activeEvent });

  // A cinematic shot is decided once per move and outlives the move animation:
  // it ends when the camera has returned (or the player skips it).
  const [cinematicEnabled, setCinematicEnabled] = useState(readCinematicEnabled);
  const [shot, setShot] = useState<CinematicShot | null>(null);
  const [shotSource, setShotSource] = useState<MoveEvent | undefined>(undefined);
  if (activeEvent !== shotSource) {
    setShotSource(activeEvent);
    if (activeEvent && cinematicEnabled) {
      // The victim is still in the displayed pieces while its capture is animating.
      const victim = activeEvent.captured && pieces.find((piece) => piece.id === activeEvent.captured!.pieceId);
      if (qualifiesForCinematic(activeEvent, victim ? victim.type : undefined)) {
        setShot(planCinematicShot(activeEvent, planMove(activeEvent).impact));
      }
    }
  }

  const [creditsOpen, setCreditsOpen] = useState(false);
  const openCredits = useCallback(() => setCreditsOpen(true), []);
  const closeCredits = useCallback(() => setCreditsOpen(false), []);

  return (
    <div className="app" data-loading={ready ? undefined : ""}>
      <ChessScene quality={quality} frameloop={!ready ? "never" : phase === "setup" ? "demand" : "always"}
        secondary={ready || warmRound > 0} warmPass={warmPass(quality, warmRound)} onCreated={onSceneCreated}>
        <CinematicCamera shot={shot} enabled={cinematicEnabled} onShotEnd={() => setShot(null)} />
        <Board
          selected={selected}
          targets={targets}
          lastMove={lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : undefined}
          onSquareClick={selectSquare}
        />
        <ScenePieces
          pieces={pieces}
          activeEvent={activeEvent}
          onAnimationDone={animationDone}
          onImpact={effectsStore.getState().addBurst}
          onPieceClick={selectSquare}
        />
      </ChessScene>
      <LoadingScreen ready={ready} full={!glReady || phase !== "setup" || startPending || warmRound > 0} rewarm={warmRound > 0} />
      {phase === "setup" ? glReady && !startPending && <SetupScreen onCredits={openCredits} /> : <Hud />}
      {phase === "over" && <GameOverScreen />}
      <PromotionPicker />
      <nav className="command-bar" aria-label="Game commands">
        {phase !== "setup" && <GameActions />}
        <SettingsMenu>{(close) => <>
          <label className="setting-row">
            <span>Graphics</span>
            <select aria-label="Graphics quality" value={quality} onChange={(event) => setQuality(event.target.value as GraphicsQuality)}>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
          <div className="setting-row"><CinematicToggle enabled={cinematicEnabled} onChange={setCinematicEnabled} /></div>
          <div className="setting-row"><MuteToggle provider={soundProvider} /></div>
          <div className="setting-row">
            <button type="button" onClick={() => { close(); openCredits(); }}>Credits</button>
          </div>
        </>}</SettingsMenu>
      </nav>
      {creditsOpen && <CreditsDialog onClose={closeCredits} />}
    </div>
  );
}
