import { describe, expect, it } from "vitest";
import { nextFocus } from "./menuFocus";

describe("menu focus navigation", () => {
  it("moves down and up, wrapping around like a console menu", () => {
    expect(nextFocus(0, 5, "ArrowDown")).toBe(1);
    expect(nextFocus(4, 5, "ArrowDown")).toBe(0);
    expect(nextFocus(0, 5, "ArrowUp")).toBe(4);
    expect(nextFocus(3, 5, "ArrowUp")).toBe(2);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextFocus(2, 5, "Home")).toBe(0);
    expect(nextFocus(2, 5, "End")).toBe(4);
  });

  it("enters the menu from nowhere (no item focused)", () => {
    expect(nextFocus(-1, 5, "ArrowDown")).toBe(0);
    expect(nextFocus(-1, 5, "ArrowUp")).toBe(4);
  });

  it("ignores other keys and empty menus", () => {
    expect(nextFocus(2, 5, "Enter")).toBeNull();
    expect(nextFocus(2, 5, "a")).toBeNull();
    expect(nextFocus(0, 0, "ArrowDown")).toBeNull();
  });
});
