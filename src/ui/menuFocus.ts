/**
 * Console-style menu navigation: arrows move the focus and wrap around, Home/End jump to the
 * ends. Returns the item to focus, or null when the key does not navigate.
 * `current` is -1 when no item has the focus.
 */
export function nextFocus(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown": return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp": return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}
