import { useState } from "react";
import { TIME_CONTROLS, type TimeControl } from "../core/clock";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { GameSettings } from "./gameStore";
import { useGameStore } from "./gameStore";

export function SetupScreen() {
  const startGame = useGameStore((state) => state.startGame);
  const hasSavedGame = useGameStore((state) => state.hasSavedGame);
  const continueGame = useGameStore((state) => state.continueGame);
  const importPgn = useGameStore((state) => state.importPgn);
  const [importError, setImportError] = useState<string | null>(null);
  const [mode, setMode] = useState<GameSettings["mode"]>("ai");
  const [color, setColor] = useState<"w" | "b" | "random">("w");
  const [difficultyId, setDifficultyId] = useState("casual");
  const [timeControl, setTimeControl] = useState<TimeControl>("none");

  return (
    <div className="setup-backdrop">
      <form className="stone-panel setup-panel" onSubmit={(event) => {
        event.preventDefault();
        startGame({ mode, timeControl, humanColor: color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color, difficultyId });
      }}>
        <h1>Magic Chess</h1>
        {hasSavedGame && <button type="button" onClick={continueGame}>Continue game</button>}
        <label htmlFor="pgn-file">Import PGN (local two-player game, no clock)</label>
        <input id="pgn-file" type="file" accept=".pgn,text/plain,application/x-chess-pgn" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try { setImportError(importPgn(await file.text())); }
          catch { setImportError("Could not read the PGN file."); }
        }} />
        {importError && <p role="alert">{importError}</p>}
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
        <label htmlFor="time-control">Time control</label>
        <select id="time-control" value={timeControl} onChange={(event) => setTimeControl(event.target.value as TimeControl)}>
          {TIME_CONTROLS.map((control) => <option key={control} value={control}>{control === "none" ? "No clock" : control}</option>)}
        </select>
        <button className="start-button" type="submit">Start game</button>
      </form>
    </div>
  );
}
