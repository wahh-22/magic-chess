import { useMemo } from "react";
import { GameState } from "../core/GameState";
import { Board } from "../scene/Board";
import { ChessScene } from "../scene/ChessScene";
import { Pieces } from "../scene/Pieces";

export function App() {
  const pieces = useMemo(() => new GameState().pieces(), []);
  return (
    <div className="app">
      <ChessScene>
        <Board />
        <Pieces pieces={pieces} />
      </ChessScene>
    </div>
  );
}
