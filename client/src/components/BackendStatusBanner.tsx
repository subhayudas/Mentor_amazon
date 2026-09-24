import * as React from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, FlaskConical, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IS_LOCAL, backendHealth, probeBackend } from "@/lib/demo";
import { queryClient } from "@/lib/queryClient";

/** Live backend health (database mode), fed by the background probe in lib/demo.ts. */
export function useBackendHealth() {
  return React.useSyncExternalStore(backendHealth.subscribe, backendHealth.get, backendHealth.get);
}

/**
 * Full-width status strip under the header (design C1, F05).
 * - Local (demo) mode: a permanent "Demo mode: nothing you enter here is
 *   saved" notice, so nobody mistakes the browser store for the programme.
 * - Database mode with the project unreachable: "We can't reach
 *   MentorConnect right now…" with Retry, which re-probes; the app keeps
 *   running against the database (never falls back to the browser store) and
 *   every query is refetched once the project answers again.
 */
export function BackendStatusBanner() {
  const { t } = useTranslation();
  const health = useBackendHealth();
  const [retrying, setRetrying] = React.useState(false);
  const previous = React.useRef(health);

  // Recovered (by Retry or the 30 s re-probe): refetch everything the outage broke.
  React.useEffect(() => {
    if (previous.current === "degraded" && health === "ok") void queryClient.invalidateQueries();
    previous.current = health;
  }, [health]);

  if (IS_LOCAL) {
    return (
      <div role="status" className="border-b border-border bg-info text-info-foreground" data-testid="banner-demo-mode">
        <div className="container-page flex items-center gap-3 py-2.5">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 text-body-sm text-pretty">{t("backend.demo.body")}</p>
        </div>
      </div>
    );
  }

  if (health !== "degraded") return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await probeBackend();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div role="alert" className="border-b border-warning-border bg-warning text-warning-foreground" data-testid="banner-backend-degraded">
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        <CloudOff className="size-4 shrink-0 text-warning-icon" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-body-sm text-pretty">{t("backend.degraded.body")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 md:h-9"
          onClick={() => void retry()}
          loading={retrying}
          data-testid="button-backend-retry"
        >
          <RotateCw className="rtl:-scale-x-100" aria-hidden="true" />
          {t("backend.degraded.retry")}
        </Button>
      </div>
    </div>
  );
}
