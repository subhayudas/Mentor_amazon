import * as React from "react";
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

 * Opt out per element with `data-guard="off"` (never needed for inputs).
 */
const EDITABLE = "input, textarea, select, [contenteditable='true'], [data-guard='off']";

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
    // Focus moving into an embedded frame (the Cal.com calendar) also fires window blur; that is not a capture.
    const veil = () => {
      if (document.activeElement?.tagName === "IFRAME") return;
      setVeiled(true);
    };
    const unveil = () => setVeiled(false);
    const onVisibility = () => setVeiled(document.visibilityState !== "visible");

    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", veil);
    window.addEventListener("focus", unveil);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      root.classList.remove("guard-active");
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", veil);
      window.removeEventListener("focus", unveil);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("guard-veiled", veiled);
  }, [veiled]);

  return (
    <div className="guard-veil" aria-hidden="true">
      <p>{t("guard.veiled")}</p>
    </div>
  );
}
