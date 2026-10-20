import { useGameStore } from "./gameStore";
import { describeError, isEngineError, statusLabel } from "./messages";

export function Hud() {
  const state = useGameStore((state) => state);
  const { game, phase, settings, aiThinking, lastError, animationQueue } = state;
  const history = game.history();
  const canRetry = lastError && isEngineError(lastError) && phase === "playing" &&
    settings.mode === "ai" && game.turn() !== settings.humanColor && !aiThinking && animationQueue.length === 0;

  return (
    <aside className="stone-panel hud" aria-label="Game information">
      <p className="turn-label" role="status">{statusLabel(game.turn(), game.inCheck(), state.outcome)}</p>
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
        <button onClick={() => state.startGame(settings)}>New game</button>
        <button onClick={state.backToSetup}>Menu</button>
      </div>
    </aside>
  );
}
