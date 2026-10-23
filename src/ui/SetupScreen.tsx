import { useState } from "react";
import { TIME_CONTROLS, type TimeControl } from "../core/clock";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { GameSettings } from "./gameStore";
import { useGameStore } from "./gameStore";
import { Emblem } from "./Heraldry";

export function SetupScreen({ onCredits }: { onCredits: () => void }) {
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
      <form className="arcana-panel setup-panel" onSubmit={(event) => {
        event.preventDefault();
        startGame({ mode, timeControl, humanColor: color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color, difficultyId });
      }}>
        <div className="setup-crest" aria-hidden="true"><Emblem color="w" size={28} /><Emblem color="b" size={28} /></div>
        <h1>Magic Chess</h1>
        <p className="setup-subtitle">Ivory against obsidian</p>
        {hasSavedGame && <button type="button" className="continue-button" onClick={continueGame}>Continue game</button>}
        <fieldset>
          <legend>Game mode</legend>
          <div className="mode-choices">
            <label><input type="radio" name="mode" checked={mode === "ai"} onChange={() => setMode("ai")} /> Play vs the engine</label>
            <label><input type="radio" name="mode" checked={mode === "local"} onChange={() => setMode("local")} /> Two players on this computer</label>
          </div>
        </fieldset>
        {mode === "ai" && <>
          <fieldset>
            <legend>Your color</legend>
            <div className="color-choices">
              {([ ["w", "White"], ["b", "Black"], ["random", "Random"] ] as const).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="color" checked={color === value} onChange={() => setColor(value)} />
                  {value === "random"
                    ? <span className="random-emblem" aria-hidden="true"><Emblem color="w" size={15} /><Emblem color="b" size={15} /></span>
                    : <Emblem color={value} size={20} />}
                  {" "}{label}
                </label>
              ))}
            </div>
          </fieldset>
        </>}
        <div className="setup-row">
          {mode === "ai" && <div>
            <label className="field-label" htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)}>
              {DIFFICULTIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>}
          <div>
            <label className="field-label" htmlFor="time-control">Time control</label>
            <select id="time-control" value={timeControl} onChange={(event) => setTimeControl(event.target.value as TimeControl)}>
              {TIME_CONTROLS.map((control) => <option key={control} value={control}>{control === "none" ? "No clock" : control}</option>)}
            </select>
          </div>
        </div>
        <button className="start-button primary" type="submit">Start game</button>
        <div className="setup-footer">
          <label className="field-label" htmlFor="pgn-file">Import PGN (local two-player game, no clock)</label>
          <input id="pgn-file" type="file" accept=".pgn,text/plain,application/x-chess-pgn" onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try { setImportError(importPgn(await file.text())); }
            catch { setImportError("Could not read the PGN file."); }
          }} />
          {importError && <p className="setup-error" role="alert">{importError}</p>}
          <button type="button" className="link-button" onClick={onCredits}>Credits</button>
        </div>
      </form>
    </div>
  );
}
