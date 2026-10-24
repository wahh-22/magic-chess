/**
 * Key art rendered in-engine (docs/art.md, public/art/key-art.json): image paths and the
 * tiny blurred placeholders, inlined so they paint with the first frame (no request).
 * keyArtSources.test.ts keeps them equal to the art pipeline's manifest.
 */
export const KEY_ART = {
  title: {
    src: "/art/title.webp",
    lqip: "data:image/webp;base64,UklGRngAAABXRUJQVlA4IGwAAACwBACdASogABIAPsVQoEunpKMhsAwA8BiJQBjmCv38CHlBh30IdwxN4JbWHh/gAP79me4IEdvZOzgoQALu/Xebuisl1HVmscVBmp1XUiSslwkYHOi1HEmnCHt2I7txW37NWuG2U33vuxkQAAA=",
    portrait: "/art/title-portrait.webp",
    portraitLqip: "data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAADQBQCdASogADkAPtFYpk0oJSOiKBgNUQAaCWUAygBPY3A5ImhKrVHoVxmu1bMY0e89qTyVxiKAAP735h37Vd9LTSVvJI/SjWTBXwfrsGnCdoNj7QOIzJ9gD0z5e2iav+BmEDypqeypqI8adDapoVkNKNDJ/OeoFhmXse4yE26JxHQyipelUuEUULPPdrl1grGDVpMC2uEKxz2GqbV2MTHaYvtyYQAA",
  },
} as const;

/** Placeholder of each loading image (LOADING_ART). */
export const LOADING_KEY_ART: Record<string, string> = {
  "/art/loading-1.webp": "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAACwAwCdASogABIAPtFapE0oJSOiMBgIAQAaCWUAAJkwT59v96lkoAD+9WqCnrJe5UArhpznHcWS1cxbIP2ffPKikDQa9psWUGSysAAA",
  "/art/loading-2.webp": "data:image/webp;base64,UklGRnwAAABXRUJQVlA4IHAAAADQBACdASogABIAPtFQo0woJCMiMBgMAQAaCUAZmgaN/ed7L3P7p08u0tjed8WR4AD++uctqgwOJYaF28hQFLTO10I/bQ8P6gKfhmGI5HjKKFLkXVGZbv6QXZJW4ZcebjGWHfC3giZ+30GSJ6ZL5sAA",
};
