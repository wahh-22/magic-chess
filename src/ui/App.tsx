import { lazy, Suspense, useEffect, useState } from "react";
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
import { QUALITY_KEY, readQuality, type GraphicsQuality } from "../scene/environment/chamberConfig";
import { Pieces } from "../scene/Pieces";
import { createProceduralPieceProvider } from "../scene/pieces/proceduralPieces";
import { loadPieceModels } from "../scene/pieces/gltfPieces";
import { useGameStore } from "./gameStore";
import { PromotionPicker } from "./PromotionPicker";
import { SetupScreen } from "./SetupScreen";
import { Hud } from "./Hud";
import { GameOverScreen } from "./GameOverScreen";

// Physics (Rapier + its WASM) is only needed at the first capture, so it loads in the
// background instead of delaying the first frame. Bursts wait in the effects store.
const DestructionLayer = lazy(() =>
  import("../scene/effects/DestructionLayer").then((module) => ({ default: module.DestructionLayer })),
);

export function App() {
  const [quality, setQuality] = useState(readQuality);
  useEffect(() => {
    try { localStorage.setItem(QUALITY_KEY, quality); }
    catch { /* Private browsing can disable storage; the session setting still works. */ }
  }, [quality]);
  const [models, setModels] = useState(createProceduralPieceProvider);
  useEffect(() => {
    let active = true;
    void loadPieceModels().then((provider) => { if (active) setModels(provider); });
    return () => { active = false; };
  }, []);
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

  return (
    <div className="app">
      <ChessScene quality={quality} paused={phase === "setup"}>
        <CinematicCamera shot={shot} enabled={cinematicEnabled} onShotEnd={() => setShot(null)} />
        <Board
          selected={selected}
          targets={targets}
          lastMove={lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : undefined}
          onSquareClick={selectSquare}
        />
        <Pieces
          provider={models}
          pieces={pieces}
          activeEvent={activeEvent}
          onAnimationDone={animationDone}
          onImpact={effectsStore.getState().addBurst}
          onPieceClick={selectSquare}
        />
        <Suspense fallback={null}>
          <DestructionLayer pieces={pieces} activeEvent={activeEvent} provider={models} />
        </Suspense>
      </ChessScene>
      {phase === "setup" ? <SetupScreen /> : <Hud />}
      {phase === "over" && <GameOverScreen />}
      <PromotionPicker />
      <div className="settings-bar">
        <label className="graphics-quality">
          Graphics{" "}
          <select aria-label="Graphics quality" value={quality} onChange={(event) => setQuality(event.target.value as GraphicsQuality)}>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
        <CinematicToggle enabled={cinematicEnabled} onChange={setCinematicEnabled} />
        <MuteToggle provider={soundProvider} />
      </div>
    </div>
  );
}
