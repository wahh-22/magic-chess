import { lazy, useCallback, useEffect, useState } from "react";
import type { WebGLRenderer } from "three";
import { useStore } from "zustand";
import { useGameSounds } from "../audio/useGameSounds";
import type { MoveEvent } from "../core/types";
import { isSoftwareGL } from "../loading/assets";
import { sceneLoader } from "../loading/state";
import { planMove } from "../scene/animation/planMove";
import { Board } from "../scene/Board";
import { ArrivalCamera } from "../scene/camera/ArrivalCamera";
import { CinematicCamera } from "../scene/camera/CinematicCamera";
import { planCinematicShot, qualifiesForCinematic, type CinematicShot } from "../scene/camera/cinematicShots";
import { ChessScene } from "../scene/ChessScene";
import { effectsStore } from "../scene/effects/effectsStore";
import type { GraphicsQuality } from "../scene/environment/battlefieldConfig";
import { Pieces } from "../scene/Pieces";
import { usePieceModels, warmPass } from "../scene/sceneAssets";
import type { FlowScreen } from "./flow";
import { GameOverScreen } from "./GameOverScreen";
import { useGameStore } from "./gameStore";
import { GameActions, Hud } from "./Hud";
import { PromotionPicker } from "./PromotionPicker";
import { SettingsFields, type SettingsProps } from "./SettingsFields";
import { SettingsMenu } from "./SettingsMenu";

// The match chunk is loaded at Start (or prefetched while the title is shown): it is all of
// three.js, React Three Fiber and the scene. The title menu never needs it.
export { preloadCriticalScene, prefetchSceneBytes } from "../scene/sceneAssets";

// Physics (Rapier + its WASM) and capture effects are a separate chunk, loaded with the
// critical set: its light and materials are part of the scene the warm-up prepares.
const DestructionLayer = lazy(() =>
  import("../scene/effects/DestructionLayer").then((module) => ({ default: module.DestructionLayer })),
);

/** Pieces and capture effects: they suspend the critical boundary until the models are ready. */
function ScenePieces(props: Omit<Parameters<typeof Pieces>[0], "provider">) {
  const models = usePieceModels();
  return <>
    <Pieces provider={models} {...props} />
    <DestructionLayer pieces={props.pieces} activeEvent={props.activeEvent} provider={models} />
  </>;
}

/**
 * The match: canvas, scene, HUD and in-game commands. Mounted at the first Start behind the
 * loading screen and kept for the session; on the title it is hidden and renders no frames.
 */
export function Match({ screen, quality, warmRound, onRevealed, onRenderer, settings }: {
  screen: FlowScreen;
  /** Preset the scene is built with (a change made on the title applies at the next Start). */
  quality: GraphicsQuality;
  /** Rounds of scene preparation after a graphics change. */
  warmRound: number;
  onRevealed: () => void;
  /** Reports whether the GPU is emulated in software (CI, blocklisted drivers): overlays then avoid composited fades. */
  onRenderer: (software: boolean) => void;
  settings: Omit<SettingsProps, "provider">;
}) {
  const [softwareGL, setSoftwareGL] = useState(false);
  const onCreated = useCallback((gl: WebGLRenderer) => {
    const software = isSoftwareGL(gl);
    setSoftwareGL(software);
    onRenderer(software);
  }, [onRenderer]);
  const stage = useStore(sceneLoader, (state) => state.stage);
  const ready = stage === "ready";
  const shown = screen === "reveal" || screen === "playing";
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
  const [shot, setShot] = useState<CinematicShot | null>(null);
  const [shotSource, setShotSource] = useState<MoveEvent | undefined>(undefined);
  if (activeEvent !== shotSource) {
    setShotSource(activeEvent);
    if (activeEvent && settings.cinematic) {
      // The victim is still in the displayed pieces while its capture is animating.
      const victim = activeEvent.captured && pieces.find((piece) => piece.id === activeEvent.captured!.pieceId);
      if (qualifiesForCinematic(activeEvent, victim ? victim.type : undefined)) {
        setShot(planCinematicShot(activeEvent, planMove(activeEvent).impact));
      }
    }
  }

  return <>
    {/* Hidden, not removed, on the title: the context, programs and uploads survive for a rematch. */}
    <div className={`match-stage${shown ? "" : " is-hidden"}`} aria-hidden={!shown || undefined}>
      <ChessScene quality={quality} frameloop={ready && shown ? "always" : "never"}
        secondary={ready || warmRound > 0} warmPass={warmPass(quality, warmRound)} onCreated={onCreated}>
        <ArrivalCamera active={screen === "reveal"} onDone={onRevealed} />
        <CinematicCamera shot={shot} enabled={settings.cinematic} onShotEnd={() => setShot(null)} />
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
    </div>
    {/*
      * Black after the loading screen, lifting while the camera arrives. Not with software GL: any
      * full-screen layer over the canvas in its first frames stalls the page for seconds there
      * (WebGL and compositing share one CPU-bound GPU process); the loading screen cuts to the scene.
      */}
    {screen === "reveal" && !softwareGL && <div className="reveal-veil" aria-hidden="true" />}
    {screen === "playing" && <div className="match-hud">
      <Hud />
      {phase === "over" && <GameOverScreen />}
      <PromotionPicker />
      <nav className="command-bar" aria-label="Game commands">
        <GameActions />
        <SettingsMenu>{(close) => <SettingsFields {...settings} provider={soundProvider}
          onCredits={settings.onCredits && (() => { close(); settings.onCredits!(); })} />}</SettingsMenu>
      </nav>
    </div>}
  </>;
}
