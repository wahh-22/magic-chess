import { useEffect, useState } from "react";
import { MuteToggle } from "../audio/MuteToggle";
import { useGameSounds } from "../audio/useGameSounds";
import type { MoveEvent } from "../core/types";
import { planMove } from "../scene/animation/planMove";
import { Board } from "../scene/Board";
import { CinematicCamera } from "../scene/camera/CinematicCamera";
import { planCinematicShot, qualifiesForCinematic, type CinematicShot } from "../scene/camera/cinematicShots";
import { CinematicToggle, readCinematicEnabled } from "../scene/camera/CinematicToggle";
import { DestructionLayer } from "../scene/effects/DestructionLayer";
import { effectsStore } from "../scene/effects/effectsStore";
import { ChessScene } from "../scene/ChessScene";
import { Pieces } from "../scene/Pieces";
import { useGameStore } from "./gameStore";
import { PromotionPicker } from "./PromotionPicker";
import { SetupScreen } from "./SetupScreen";
import { Hud } from "./Hud";
import { GameOverScreen } from "./GameOverScreen";

export function App() {
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
      <ChessScene>
        <CinematicCamera shot={shot} enabled={cinematicEnabled} onShotEnd={() => setShot(null)} />
        <Board
          selected={selected}
          targets={targets}
          lastMove={lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : undefined}
          onSquareClick={selectSquare}
        />
        <Pieces
          pieces={pieces}
          activeEvent={activeEvent}
          onAnimationDone={animationDone}
          onImpact={effectsStore.getState().addBurst}
          onPieceClick={selectSquare}
        />
        <DestructionLayer pieces={pieces} activeEvent={activeEvent} />
      </ChessScene>
      {phase === "setup" ? <SetupScreen /> : <Hud />}
      {phase === "over" && <GameOverScreen />}
      <PromotionPicker />
      <div className="settings-bar">
        <CinematicToggle enabled={cinematicEnabled} onChange={setCinematicEnabled} />
        <MuteToggle provider={soundProvider} />
      </div>
    </div>
  );
}
