/**
 * Records whether the last user input was a keyboard or a pointer as
 * `html[data-input-modality="keyboard" | "pointer"]` (F-18).
 *
 * Programmatic focus targets — the page `h1` after a route change, the
 * StatusCard heading on mount, `main#main` from the skip link — must show the
 * focus ring only when the person is driving with a keyboard. Chromium's
 * `:focus-visible` heuristic treats script focus on a freshly loaded page (no
 * interaction yet) as keyboard focus, so `:focus:not(:focus-visible)` alone
 * still boxes the heading on load. index.css combines this attribute with
 * `[tabindex="-1"]:focus` to hide the ring outside keyboard modality; real
 * Tab focus is unaffected because keydown lands before focus moves.
 */
const ATTR = "data-input-modality";

export function installInputModalityTracker(doc: Document = document): () => void {
  const root = doc.documentElement;
  const keyboard = () => root.setAttribute(ATTR, "keyboard");
  const pointer = () => root.setAttribute(ATTR, "pointer");
  doc.addEventListener("keydown", keyboard, true);
  doc.addEventListener("pointerdown", pointer, true);
  doc.addEventListener("mousedown", pointer, true);
  doc.addEventListener("touchstart", pointer, { capture: true, passive: true });
  return () => {
    doc.removeEventListener("keydown", keyboard, true);
    doc.removeEventListener("pointerdown", pointer, true);
    doc.removeEventListener("mousedown", pointer, true);
    doc.removeEventListener("touchstart", pointer, { capture: true });
  };
}
