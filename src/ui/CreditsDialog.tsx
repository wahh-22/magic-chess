import { useEffect, useRef, useState } from "react";
import { environmentCredits, GAME_CREDITS, type Credit } from "./credits";

const ENVIRONMENT_LICENSE = `${import.meta.env.BASE_URL}environment/LICENSE.md`;

function CreditLine({ credit }: { credit: Credit }) {
  return (
    <li>
      {credit.url ? <a href={credit.url} target="_blank" rel="noreferrer">{credit.asset}</a> : credit.asset}
      <span className="credit-author"> — {credit.author}</span>
      <span className="credit-license">{credit.license}</span>
    </li>
  );
}

/** Model, sound, engine, typeface and environment credits; environment rows come from its LICENSE.md. */
export function CreditsDialog({ onClose }: { onClose: () => void }) {
  const [environment, setEnvironment] = useState<Credit[] | "error" | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    let active = true;
    fetch(ENVIRONMENT_LICENSE)
      .then((response) => response.ok ? response.text() : Promise.reject(new Error(String(response.status))))
      .then((text) => { if (active) setEnvironment(environmentCredits(text)); })
      .catch(() => { if (active) setEnvironment("error"); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { active = false; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="modal-backdrop credits-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="arcana-panel credits-panel" role="dialog" aria-modal="true" aria-labelledby="credits-title">
        <h2 id="credits-title">Credits</h2>
        {GAME_CREDITS.map(({ title, lines }) => (
          <section key={title} className="credits-section">
            <h3>{title}</h3>
            <ul>{lines.map((credit) => <CreditLine key={credit.asset} credit={credit} />)}</ul>
          </section>
        ))}
        <section className="credits-section">
          <h3>Environment</h3>
          {environment === null && <p className="credits-note">Loading…</p>}
          {environment === "error" && <p className="credits-note">The environment credits could not be loaded.</p>}
          {Array.isArray(environment) && <ul>
            {environment.map((credit) => <CreditLine key={`${credit.asset}-${credit.author}`} credit={credit} />)}
          </ul>}
          <p className="credits-note">
            Full sources and licences: <a href={ENVIRONMENT_LICENSE} target="_blank" rel="noreferrer">environment/LICENSE.md</a>
          </p>
        </section>
        <div className="panel-actions">
          <button type="button" ref={close} onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
