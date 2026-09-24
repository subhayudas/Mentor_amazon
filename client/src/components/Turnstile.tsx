import * as React from "react";
import { useTranslation } from "react-i18next";

/**
 * Cloudflare Turnstile widget (explicit render). Renders nothing unless
 * `VITE_TURNSTILE_SITE_KEY` is set. The script loads once per page; the widget
 * is removed on unmount, and `reset()` on the ref resets it and clears the
 * token. Expiry and errors report `null` so callers never submit a stale token.
 */
export const TURNSTILE_SITE_KEY: string = String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();

export function turnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY !== "";
}

export interface TurnstileHandle {
  reset(): void;
}

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
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
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile unavailable")));
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error("turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface TurnstileProps {
  onToken(token: string | null): void;
  action?: string;
  className?: string;
}

export const Turnstile = React.forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onToken, action, className }, ref) {
  const { i18n } = useTranslation();
  const container = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  // Latest callback without re-rendering the widget when the parent re-renders.
  const onTokenRef = React.useRef(onToken);
  onTokenRef.current = onToken;
  const enabled = turnstileEnabled();
  const language = i18n.language;

  React.useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        onTokenRef.current(null);
      },
    }),
    [],
  );

  React.useEffect(() => {
    if (!enabled || !container.current) return;
    let disposed = false;
    loadTurnstile()
      .then((api) => {
        if (disposed || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language,
          theme: "light",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!disposed) onTokenRef.current(null);
      });
    return () => {
      disposed = true;
      const id = widgetId.current;
      widgetId.current = null;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [enabled, action, language]);

  if (!enabled) return null;
  return <div ref={container} className={className} data-testid="turnstile" />;
});
