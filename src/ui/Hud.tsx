import { useEffect, useState } from "react";
import { formatTime, remainingAt } from "../core/clock";
import { exportPgn } from "../core/pgn";
import { DIFFICULTIES } from "../core/engine/difficulty";
import { canUndo, useGameStore } from "./gameStore";
import { describeError, isEngineError, statusLabel } from "./messages";

export function Hud() {
  const state = useGameStore((state) => state);
  const { game, phase, settings, aiThinking, lastError, animationQueue, tick } = state;
  const history = game.history();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => { tick(); setNow(Date.now()); }, 100);
    return () => window.clearInterval(timer);
  }, [tick]);
  const times = state.clock && remainingAt(state.clock, now);
  const downloadPgn = () => {
    const difficulty = DIFFICULTIES.find((item) => item.id === settings.difficultyId)?.label ?? "Casual";
    const name = (color: "w" | "b") => settings.mode === "local" ? (color === "w" ? "White" : "Black") :
      color === settings.humanColor ? "You" : `Stockfish (${difficulty})`;
    const text = exportPgn(game, { white: name("w"), black: name("b"), date: new Date(), outcome: state.outcome });
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url; link.download = "magic-chess.pgn"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const canRetry = lastError && isEngineError(lastError) && phase === "playing" &&
    settings.mode === "ai" && game.turn() !== settings.humanColor && !aiThinking && animationQueue.length === 0;

  return (
    <aside className="stone-panel hud" aria-label="Game information">
      <p className="turn-label" role="status">{statusLabel(game.turn(), game.inCheck(), state.outcome)}</p>
      {times && <div aria-label="Chess clocks">
        {(["w", "b"] as const).map((color) => <p key={color}
          aria-label={`${color === "w" ? "White" : "Black"} clock`}
          style={{ fontWeight: state.clock?.running === color ? "bold" : "normal", color: state.clock?.running === color ? "#e8c67a" : "inherit" }}>
          {color === "w" ? "White" : "Black"}: {formatTime(times[color])}
        </p>)}
      </div>}
      {aiThinking && <p role="status">Engine is thinking…</p>}
      {lastError && <div className="game-error" role="alert">
        <p>{describeError(lastError)}</p>
        {canRetry && <button onClick={state.retryAiMove}>Retry</button>}
      </div>}
      <h2 id="moves-heading">Moves</h2>
      <div className="move-history" role="region" aria-labelledby="moves-heading" tabIndex={0}>
        {history.length === 0 ? <p className="empty-history">No moves yet.</p> : <ol>
          {history.filter((_, index) => index % 2 === 0).map((white, index) => (
            <li key={index}><span>{white}</span><span>{history[index * 2 + 1] ?? ""}</span></li>
          ))}
        </ol>}
      </div>
      <div className="panel-actions">
        <button onClick={downloadPgn}>Export PGN</button>
        <button onClick={state.undo} disabled={!canUndo(state)}>Undo</button>
        <button onClick={() => state.startGame(settings)}>New game</button>
        <button onClick={state.backToSetup}>Menu</button>
      </div>
    </aside>
  );
}
