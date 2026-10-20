const STORAGE_KEY = "magic-chess.cinematic-captures";

/** Safe as a useState initializer; private browsing/storage denial keeps the default. */
export function readCinematicEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function CinematicToggle({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          try {
            globalThis.localStorage?.setItem(STORAGE_KEY, String(next));
          } catch {
            // A denied preference write must not block the in-memory setting.
          }
          onChange(next);
        }}
      />
      {" Cinematic captures"}
    </label>
  );
}
