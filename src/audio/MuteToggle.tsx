import { useState } from "react";
import type { SoundProvider } from "./SoundProvider";
import { getSoundProvider } from "./webAudioSampler";

export function MuteToggle({ provider = getSoundProvider() }: { provider?: SoundProvider }) {
  const [muted, setMuted] = useState(() => provider.muted);
  const label = muted ? "Unmute sounds" : "Mute sounds";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={muted}
      onClick={() => {
        void provider.unlock().catch(() => { /* Browser may still require another gesture. */ });
        provider.setMuted(!provider.muted);
        setMuted(provider.muted);
      }}
    >
      {label}
    </button>
  );
}
