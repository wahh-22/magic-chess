import { canUndo, useGameStore } from "./gameStore";
import { Emblem } from "./Heraldry";
import { describeOutcome } from "./messages";

export function GameOverScreen() {
  const undo = useGameStore((state) => state.undo);
  const undoAllowed = useGameStore(canUndo);
  const outcome = useGameStore((state) => state.outcome);
  const settings = useGameStore((state) => state.settings);
  const startGame = useGameStore((state) => state.startGame);
  const backToSetup = useGameStore((state) => state.backToSetup);
  if (!outcome) return null;
  const winner = "winner" in outcome ? outcome.winner : null;

  return (
    <div className="game-over-overlay">
      <section className="arcana-panel game-over-panel" aria-labelledby="outcome-heading">
        <div className="game-over-emblems">
          {winner ? <Emblem color={winner} size={56} /> : <><Emblem color="w" size={44} /><Emblem color="b" size={44} /></>}
        </div>
        <h2 id="outcome-heading">{describeOutcome(outcome)}</h2>
        <div className="panel-actions">
          <button type="button" onClick={undo} disabled={!undoAllowed}>Undo</button>
          <button type="button" className="primary" onClick={() => startGame(settings)}>Play again</button>
          <button type="button" onClick={backToSetup}>Menu</button>
        </div>
      </section>
    </div>
  );
}
