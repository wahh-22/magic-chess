import { MuteToggle } from "../audio/MuteToggle";
import type { SoundProvider } from "../audio/SoundProvider";
import { CinematicToggle } from "../scene/camera/CinematicToggle";
import type { GraphicsQuality } from "../scene/environment/battlefieldConfig";

export interface SettingsProps {
  quality: GraphicsQuality;
  onQuality: (quality: GraphicsQuality) => void;
  cinematic: boolean;
  onCinematic: (enabled: boolean) => void;
  provider?: SoundProvider;
  onCredits?: () => void;
}

/** Graphics, cinematic captures, sound and credits: the same controls on the title and in game. */
export function SettingsFields({ quality, onQuality, cinematic, onCinematic, provider, onCredits }: SettingsProps) {
  return <>
    <label className="setting-row">
      <span>Graphics</span>
      <select aria-label="Graphics quality" value={quality} onChange={(event) => onQuality(event.target.value as GraphicsQuality)}>
        <option value="high">High</option>
        <option value="low">Low</option>
      </select>
    </label>
    <div className="setting-row"><CinematicToggle enabled={cinematic} onChange={onCinematic} /></div>
    <div className="setting-row"><MuteToggle provider={provider} /></div>
    {onCredits && <div className="setting-row">
      <button type="button" onClick={onCredits}>Credits</button>
    </div>}
  </>;
}
