import { useState } from "react";

/** Narrow, tall screens use the portrait images. */
const PORTRAIT = "(max-aspect-ratio: 4/5)";

/**
 * Key-art background (public/art): the tiny placeholder paints at once, the full image fades in
 * when decoded (at once if it already is, e.g. preloaded by index.html), and a missing file
 * leaves the dark gradient behind it. Decorative. Remount (key) to show another image.
 */
export function KeyArt({ src, portrait, lqip, portraitLqip, className = "" }: {
  src: string;
  portrait?: string;
  /** Tiny blurred stand-in while the full image loads (inline data URI). */
  lqip?: string;
  portraitLqip?: string;
  className?: string;
}) {
  const [image, setImage] = useState<"loading" | "loaded" | "failed">("loading");
  // The placeholder stays under the full image until its fade has ended.
  const [placeholder, setPlaceholder] = useState(Boolean(lqip));
  return (
    <div className={`key-art ${className}`} data-art={image} aria-hidden="true">
      {lqip && placeholder && <picture>
        {portraitLqip && <source media={PORTRAIT} srcSet={portraitLqip} />}
        <img className="key-art-lqip" src={lqip} alt="" onError={() => setPlaceholder(false)} />
      </picture>}
      {image !== "failed" && <picture>
        {portrait && <source media={PORTRAIT} srcSet={portrait} />}
        <img className="key-art-image" src={src} alt="" decoding="async"
          ref={(element) => {
            // Already decoded (cached, or preloaded by index.html): shown at once, no fade.
            if (!element?.complete || !element.naturalWidth) return;
            element.dataset.instant = "";
            setImage("loaded");
            setPlaceholder(false);
          }}
          onLoad={() => setImage("loaded")} onError={() => setImage("failed")}
          onTransitionEnd={() => setPlaceholder(false)} />
      </picture>}
    </div>
  );
}
