import { useEffect } from "react";
import { Board } from "../scene/Board";
import { ChessScene } from "../scene/ChessScene";
import { Pieces } from "../scene/Pieces";
import { useGameStore } from "./gameStore";
import { PromotionPicker } from "./PromotionPicker";

export function App() {
  const pieces = useGameStore((state) => state.displayedPieces);
  const selected = useGameStore((state) => state.selected);
  const targets = useGameStore((state) => state.legalTargets);
  const selectSquare = useGameStore((state) => state.selectSquare);
  const startGame = useGameStore((state) => state.startGame);
  const activeEvent = useGameStore((state) => state.animationQueue[0]);
  const animationDone = useGameStore((state) => state.animationDone);

  useEffect(() => {
    startGame({ mode: "ai", humanColor: "w", difficultyId: "casual" });
  }, [startGame]);

  return (
    <div className="app">
      <ChessScene>
        <Board selected={selected} targets={targets} onSquareClick={selectSquare} />
        <Pieces
          pieces={pieces}
          activeEvent={activeEvent}
          onAnimationDone={animationDone}
          onPieceClick={selectSquare}
        />
      </ChessScene>
      <PromotionPicker />
    </div>
  );
}
