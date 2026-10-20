import { useEffect } from "react";
import { Board } from "../scene/Board";
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

  // Leftover debris and dust belong to the previous game.
  useEffect(() => effectsStore.getState().clear(), [gameId]);

  return (
    <div className="app">
      <ChessScene>
        <Board selected={selected} targets={targets} onSquareClick={selectSquare} />
        <Pieces
          pieces={pieces}
          activeEvent={activeEvent}
          onAnimationDone={animationDone}
          onImpact={effectsStore.getState().addBurst}
          onPieceClick={selectSquare}
        />
        <DestructionLayer />
      </ChessScene>
      {phase === "setup" ? <SetupScreen /> : <Hud />}
      {phase === "over" && <GameOverScreen />}
      <PromotionPicker />
    </div>
  );
}
