export type SoundCue = "slide" | "set-down" | "hit" | "shatter" | "pebbles" | "check" | "game-end";

export interface SoundOptions {
  volume?: number;
  rate?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
}

export interface SoundProvider {
  play(cue: SoundCue, options?: SoundOptions): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Call directly from a user gesture; never from a timer. */
  unlock(): Promise<void>;
}
