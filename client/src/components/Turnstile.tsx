import * as React from "react";
import { useTranslation } from "react-i18next";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cloudflare Turnstile widget (explicit render). Renders nothing unless
 * `VITE_TURNSTILE_SITE_KEY` is set. The script loads once per page; the widget
 * is removed on unmount, and `reset()` on the ref resets it and clears the
 * token. Expiry and errors report `null` so callers never submit a stale token.
 *
 * When the check cannot run — the script is blocked or never arrives (a
 * content blocker, a VPN or company proxy, a network drop), or the widget stops
 * with an error — the component says so in place, with a Retry that loads it
 * again, and reports `failed` through `onStatus` so the form's own message can
 * point here. The booking forms add a further way forward (`fallback`).
 */
export const TURNSTILE_SITE_KEY: string = String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();

export function turnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY !== "";
}

export interface TurnstileHandle {
  reset(): void;
}

/** `loading` until the widget is on the page, `ready` once it is, `failed` when it could not load or stopped with an error. */
export type TurnstileStatus = "loading" | "ready" | "failed";

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  /** Returning true marks the error as handled (Turnstile still retries on its own). */
  "error-callback"?: (code?: string) => boolean | void;
  "unsupported-callback"?: () => void;
}

export interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long the script may take before the widget says it could not load (it still renders if the script arrives later). */
export const TURNSTILE_LOAD_TIMEOUT_MS = 15_000;
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    const attempt: Promise<TurnstileApi> = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      const fail = (message: string) => {
        // Forget this attempt, so Retry injects a fresh script.
        if (scriptPromise === attempt) scriptPromise = null;
        script.remove();
        reject(new Error(message));
      };
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail("turnstile unavailable"));
      script.onerror = () => fail("turnstile script failed to load");
      document.head.appendChild(script);
    });
    scriptPromise = attempt;
  }
  return scriptPromise;
}

type Failure = "load" | "widget";

export interface TurnstileProps {
  onToken(token: string | null): void;
  /** Whether the check can run: the forms word their "complete the check" message accordingly. */
  onStatus?(status: TurnstileStatus): void;
  action?: string;
  /** Classes for the widget's own box (e.g. a reserved min-height). */
  className?: string;
  /** Whose words the failure uses: the booking forms say "security check", the auth forms "bot check". */
  copy: "booking" | "auth";
  /** A further way forward shown with a failure (the booking forms: the programme team's email). */
  fallback?: React.ReactNode;
}

export const Turnstile = React.forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { onToken, onStatus, action, className, copy, fallback },
  ref,
) {
  const { t, i18n } = useTranslation();
  const wrapper = React.useRef<HTMLDivElement>(null);
  const container = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  // Latest callbacks without re-rendering the widget when the parent re-renders.
  const onTokenRef = React.useRef(onToken);
  onTokenRef.current = onToken;
  const onStatusRef = React.useRef(onStatus);
  onStatusRef.current = onStatus;
  const enabled = turnstileEnabled();
  const language = i18n.language;
  const [attempt, setAttempt] = React.useState(0);
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [rendered, setRendered] = React.useState(false);
  const status: TurnstileStatus = failure ? "failed" : rendered ? "ready" : "loading";

  React.useEffect(() => {
    if (enabled) onStatusRef.current?.(status);
  }, [enabled, status]);

  React.useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (widgetId.current && window.turnstile) {
          window.turnstile.reset(widgetId.current);
          // A fresh run of the check: an earlier widget error no longer applies.
          setFailure((current) => (current === "widget" ? null : current));
        }
        onTokenRef.current(null);
      },
    }),
    [],
  );

  React.useEffect(() => {
    if (!enabled || !container.current) return;
    let disposed = false;
    setFailure(null);
    setRendered(false);
    const failed = (why: Failure) => {
      onTokenRef.current(null);
      if (!disposed) setFailure(why);
    };
    // A script that never arrives (a proxy holding the connection) must not leave a blank box.
    const timer = window.setTimeout(() => {
      if (!widgetId.current) failed("load");
    }, TURNSTILE_LOAD_TIMEOUT_MS);
    loadTurnstile()
      .then((api) => {
        if (disposed || !container.current) return;
        window.clearTimeout(timer);
        widgetId.current = api.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language,
          theme: "light",
          callback: (token) => {
            if (!disposed) setFailure(null);
            onTokenRef.current(token);
          },
          "expired-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            failed("widget");
            return true;
          },
          "unsupported-callback": () => failed("widget"),
        });
        setFailure(null);
        setRendered(true);
      })
      .catch(() => {
        if (disposed) return;
        window.clearTimeout(timer);
        failed("load");
      });
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      const id = widgetId.current;
      widgetId.current = null;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [enabled, action, language, attempt]);

  if (!enabled) return null;

  const words =
    copy === "booking"
      ? { load: t("bookingRequest.captchaLoadFailed"), widget: t("bookingRequest.captchaError"), retry: t("bookingRequest.captchaRetry") }
      : { load: t("auth.captcha.loadFailed"), widget: t("auth.captcha.error"), retry: t("auth.captcha.retry") };

  const retry = () => {
    // Keep keyboard focus in place while the Retry button goes away: the next Tab
    // reaches the widget, or the Retry button again if the check still cannot run.
    if (wrapper.current?.contains(document.activeElement)) wrapper.current.focus({ preventScroll: true });
    onTokenRef.current(null);
    setAttempt((n) => n + 1);
  };

  return (
    <div ref={wrapper} tabIndex={-1} className="space-y-2 rounded-lg outline-offset-2" data-testid="turnstile-check" data-status={status}>
      {/* Turnstile owns this box's children; React never renders into it. */}
      <div ref={container} className={cn(className, failure === "load" && "hidden")} data-testid="turnstile" />
      {failure && (
        <Alert variant="destructive" data-testid="turnstile-failed" data-reason={failure}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="flex flex-col items-start gap-2">
            <p className="text-pretty">{failure === "load" ? words.load : words.widget}</p>
            {fallback && <p className="text-pretty">{fallback}</p>}
            <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={retry} data-testid="button-turnstile-retry">
              <RotateCw className="rtl:-scale-x-100" aria-hidden="true" />
              {words.retry}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
});
