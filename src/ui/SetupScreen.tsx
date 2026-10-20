import { useState } from "react";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { GameSettings } from "./gameStore";
import { useGameStore } from "./gameStore";

export function SetupScreen() {
  const startGame = useGameStore((state) => state.startGame);
  const [mode, setMode] = useState<GameSettings["mode"]>("ai");
  const [color, setColor] = useState<"w" | "b" | "random">("w");
  const [difficultyId, setDifficultyId] = useState("casual");

  return (
    <div className="setup-backdrop">
      <form className="stone-panel setup-panel" onSubmit={(event) => {
        event.preventDefault();
        startGame({ mode, humanColor: color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color, difficultyId });
      }}>
        <h1>Magic Chess</h1>
        <fieldset>
          <legend>Game mode</legend>
          <label><input type="radio" name="mode" checked={mode === "ai"} onChange={() => setMode("ai")} /> Play vs the engine</label>
          <label><input type="radio" name="mode" checked={mode === "local"} onChange={() => setMode("local")} /> Two players on this computer</label>
        </fieldset>
        {mode === "ai" && <>
          <fieldset>
            <legend>Your color</legend>
            <div className="color-choices">
              {([ ["w", "White"], ["b", "Black"], ["random", "Random"] ] as const).map(([value, label]) => (
                <label key={value}><input type="radio" name="color" checked={color === value} onChange={() => setColor(value)} /> {label}</label>
              ))}
            </div>
          </fieldset>
          <label className="difficulty-label" htmlFor="difficulty">Difficulty</label>
          <select id="difficulty" value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)}>
            {DIFFICULTIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </>}
        <button className="start-button" type="submit">Start game</button>
      </form>
    </div>
  );
}
