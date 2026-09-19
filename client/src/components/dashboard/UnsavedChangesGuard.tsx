import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { navigate } from "wouter/use-browser-location";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { confirmNavigation, isDirty, setPrompter } from "@/lib/leaveGuard";

/**
 * Mount once per app-shell page. Owns the "Leave without saving?" AlertDialog
 * that `confirmNavigation()` opens, and intercepts same-origin link clicks
 * (capture phase) so a dirty form is never abandoned by a stray click. The
 * dialog opens on the safe choice ("Keep editing", Radix's default focus).
 */
export function UnsavedChangesGuard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const prompt = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    setPrompter(prompt);
    return () => setPrompter(null);
  }, [prompt]);

  const answer = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!isDirty()) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}${url.search}${url.hash}`;
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (to === here) return;
      event.preventDefault();
      event.stopPropagation();
      confirmNavigation().then((ok) => {
        if (ok) navigate(to);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && answer(false)}>
      <AlertDialogContent data-testid="dialog-unsaved-changes">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dashboardV2.unsaved.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("dashboardV2.unsaved.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer(false)}>{t("dashboardV2.unsaved.stay")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer(true)}>{t("dashboardV2.unsaved.leave")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
