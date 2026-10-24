import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
// Written by the art pipeline (scripts/art/render-key-art.mjs).
import manifest from "../../public/art/key-art.json";
import { KEY_ART, LOADING_KEY_ART } from "./keyArtSources";
import { LOADING_ART } from "./loadingTips";

describe("key art", () => {
  it("uses the rendered images and their inline placeholders", () => {
    expect(KEY_ART.title).toEqual({ src: manifest.title.src, lqip: manifest.title.lqip,
      portrait: manifest["title-portrait"].src, portraitLqip: manifest["title-portrait"].lqip });
    const loading = [manifest["loading-1"], manifest["loading-2"]];
    expect(loading.map((entry) => entry.src)).toEqual([...LOADING_ART]);
    for (const entry of loading) expect(LOADING_KEY_ART[entry.src]).toBe(entry.lqip);
  });

  it("paints the title placeholder in the static splash, before any script", () => {
    expect(indexHtml).toContain(manifest.title.lqip);
  });
});
