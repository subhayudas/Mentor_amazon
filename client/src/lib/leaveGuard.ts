/**
 * Unsaved-changes guard shared by the forms that can lose work (mentor
 * availability, profile settings). A form registers `useLeaveGuard(dirty)`;
 * anything that navigates in-app (the dashboard tab row, guarded links) asks
 * `confirmNavigation()` first, which resolves `true` immediately when no dirty
 * form is mounted and otherwise defers to the mounted `UnsavedChangesGuard`
 * prompter (an AlertDialog). `beforeunload` covers reloads and tab closes.
 */
import { useEffect } from "react";

type Prompter = () => Promise<boolean>;

let dirtyCount = 0;
let prompter: Prompter | null = null;

export function isDirty(): boolean {
  return dirtyCount > 0;
}

export function setPrompter(next: Prompter | null): void {
  prompter = next;
}

/** True when it is fine to leave: nothing is dirty, or the person confirmed. */
export async function confirmNavigation(): Promise<boolean> {
  if (dirtyCount === 0) return true;
  if (!prompter) return true;
  return prompter();
}

/** Register the current form's dirty state; adds the beforeunload prompt while dirty. */
export function useLeaveGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    dirtyCount += 1;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by older engines for the prompt to show.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      dirtyCount = Math.max(0, dirtyCount - 1);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);
}
