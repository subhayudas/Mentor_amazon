import type { Page } from '@playwright/test';

/**
 * Every sonner toast a page shows, recorded from the moment `recordToasts(page)` is called:
 * including toasts that are already gone when the test looks.
 *
 * Negative checks need this (R1-54). Sonner removes a toast after about 6 s, and
 * `expect(locator).toHaveCount(0)` retries for up to the expect timeout (10 s). So a success
 * toast shown too early (before the database answered) is simply waited out, and the
 * check passes. A MutationObserver in the page reports each toast's text to Node through a
 * binding, so `seen()` answers "did this toast EVER appear?" without retrying. It keeps
 * working across reloads and navigations (the observer is an init script).
 *
 *   const toasts = await recordToasts(page);   // before the action
 *   await button.click();
 *   expect(await toasts.seen(successText)).toBe(false);
 */
export interface ToastLog {
  /** Every toast text seen since install (or since the last `clear()`), in order of appearance. */
  texts(): Promise<string[]>;
  /** Whether a toast containing `text` appeared at any moment since install (or the last `clear()`). */
  seen(text: string): Promise<boolean>;
  /** Forget what was recorded so far (toasts already on screen are not recorded again). */
  clear(): Promise<void>;
}

declare global {
  interface Window {
    __mcToastSeen?: (text: string) => Promise<void>;
    __mcToastFlush?: () => Promise<unknown>;
    __mcToastObserver?: MutationObserver;
  }
}

/** Runs in the page (no outer references: it is serialized for addInitScript/evaluate). */
function installToastObserver(): void {
  if (window.__mcToastObserver) return;
  const seen = new WeakMap<Element, string>();
  let pending: Promise<unknown> = Promise.resolve();
  const scan = () => {
    document.querySelectorAll('[data-sonner-toast]').forEach((el) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text || seen.get(el) === text) return;
      seen.set(el, text);
      const report = window.__mcToastSeen;
      if (report) pending = Promise.all([pending, report(text)]);
    });
  };
  window.__mcToastFlush = () => {
    scan();
    return pending;
  };
  window.__mcToastObserver = new MutationObserver(scan);
  window.__mcToastObserver.observe(document, { childList: true, subtree: true, characterData: true });
  scan();
}

export async function recordToasts(page: Page): Promise<ToastLog> {
  const log: string[] = [];
  await page.exposeBinding('__mcToastSeen', (_source, text: string) => {
    log.push(text);
  });
  await page.addInitScript(installToastObserver);
  // A page that is already open gets the observer now (a blank page simply has no toasts yet).
  await page.evaluate(installToastObserver).catch(() => undefined);

  const flush = () => page.evaluate(() => window.__mcToastFlush?.()).catch(() => undefined);
  return {
    async texts() {
      await flush();
      return [...log];
    },
    async seen(text: string) {
      await flush();
      return log.some((entry) => entry.includes(text));
    },
    async clear() {
      await flush();
      log.length = 0;
    },
  };
}
