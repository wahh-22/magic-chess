import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A small popover for the presentation toggles; Escape or a click outside closes it. */
export function SettingsMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="settings-menu" ref={root}>
      <button type="button" className="hud-button settings-trigger" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(!open)}>
        <svg className="icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Settings
      </button>
      {open && <div className="settings-popover" id={panelId} role="group" aria-label="Settings">{children(() => setOpen(false))}</div>}
    </div>
  );
}
