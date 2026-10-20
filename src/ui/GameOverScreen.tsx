import { useGameStore } from "./gameStore";
import { describeOutcome } from "./messages";

export function GameOverScreen() {
  const outcome = useGameStore((state) => state.outcome);
  const settings = useGameStore((state) => state.settings);
  const startGame = useGameStore((state) => state.startGame);
  const backToSetup = useGameStore((state) => state.backToSetup);
  if (!outcome) return null;

  return (
    <div className="game-over-overlay">
      <section className="stone-panel game-over-panel" aria-labelledby="outcome-heading">
        <h2 id="outcome-heading">{describeOutcome(outcome)}</h2>
        <div className="panel-actions">
          <button onClick={() => startGame(settings)}>Play again</button>
          <button onClick={backToSetup}>Menu</button>
        </div>
      </section>
    </div>
  );
}
