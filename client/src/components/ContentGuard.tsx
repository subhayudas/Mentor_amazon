import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * Content guard — the strongest capture deterrent a browser allows. It
 * cannot blank an OS-level screenshot or screen recording (nothing on the
 * web can; that needs a native app or DRM video), so it does what is
 * possible:
 *
 * - No right-click, text selection, copy/cut, image drag/save or printing
 *   anywhere except inside form fields (print renders an empty page) — a
 *   page that sets `document.body.dataset.printable = "true"` (the impact
 *   report) is exempt from the print/save block and prints normally.
 * - The page blurs the moment the window loses focus, which is what
 *   capture tools on Windows (Snipping Tool & co.) trigger; PrintScreen
 *   also blanks the page and empties the clipboard.
 * - Focus moving into an embedded frame of the page (the Cal.com calendar,
 *   the Cloudflare Turnstile check) is not a capture: the page stays. The
 *   window then receives no further blur or focus events, so while it is
 *   blurred the guard keeps checking `document.hasFocus()`: switching to
 *   another app from inside such a frame still blanks the page, and coming
 *   back (even straight into the frame) shows it again.
 *
 * The veil is portalled to `<body>`, outside `#root`, so the rule that hides
 * the app while veiled never hides the veil's own message.
 *
 * Opt out per element with `data-guard="off"` (never needed for inputs).
 */
const EDITABLE = "input, textarea, select, [contenteditable='true'], [data-guard='off']";

/** How often focus is re-checked while the window is blurred (a frame may hold focus). */
export const GUARD_FOCUS_POLL_MS = 250;

function inEditable(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(EDITABLE));
}

export function ContentGuard() {
  const { t } = useTranslation();
  const [veiled, setVeiled] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("guard-active");

    const block = (e: Event) => {
      if (inEditable(e.target)) return;
      e.preventDefault();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (inEditable(e.target)) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "");
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.body.dataset.printable === "true") return;
      const mod = e.metaKey || e.ctrlKey;
      // Save page / print / view source / Windows "snip" shortcut / PrintScreen.
      if ((mod && ["s", "p", "u"].includes(e.key.toLowerCase())) || (mod && e.shiftKey && e.key.toLowerCase() === "s") || e.key === "PrintScreen") {
        e.preventDefault();
        setVeiled(true);
        // The clipboard promise rejects when the document is not focused; that is fine.
        navigator.clipboard?.writeText("").catch(() => undefined);
        window.setTimeout(() => setVeiled(false), 1500);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => undefined);
    };

    // A window blur means either a real loss of focus (another app, a capture tool: the
    // document no longer has focus) or focus moving into an embedded frame of this page
    // (the document still has focus; the Turnstile iframe sits in a closed shadow root, so
    // activeElement is its host, never the IFRAME). document.hasFocus() tells them apart.
    let settle: number | undefined;
    let poll: number | undefined;
    const syncWithFocus = () => setVeiled(!document.hasFocus());
    const stopWatching = () => {
      window.clearTimeout(settle);
      window.clearInterval(poll);
      settle = undefined;
      poll = undefined;
    };
    const onBlur = () => {
      stopWatching();
      // Decided once the focus change has settled: some browsers blur the window before
      // the frame has taken focus.
      settle = window.setTimeout(syncWithFocus, 0);
      // While the window is blurred it gets no event when a frame that holds focus loses it
      // to another app, or gets it back; the poll catches both.
      poll = window.setInterval(syncWithFocus, GUARD_FOCUS_POLL_MS);
    };
    const onFocus = () => {
      stopWatching();
      setVeiled(false);
    };
    const onVisibility = () => setVeiled(document.visibilityState !== "visible");

    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopWatching();
      root.classList.remove("guard-active");
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("guard-veiled", veiled);
  }, [veiled]);

  return createPortal(
    <div className="guard-veil" aria-hidden="true" data-testid="guard-veil">
      <p>{t("guard.veiled")}</p>
    </div>,
    document.body,
  );
}
