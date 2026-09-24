import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, CircleAlert, Copy, Eye, EyeOff, Info, RefreshCw, TriangleAlert } from "lucide-react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeCalLink } from "@/lib/calLink";
import {
  CAL_SYNC_POLL_MS,
  calSyncStatus,
  getMyCalWebhook,
  isProductionUrl,
  isSyncUnavailableError,
  maskSecret,
  outcomeCopyKey,
  rotateCalWebhookSecret,
  subscriberUrl,
  triggerCopyKey,
  type CalWebhookInfo,
  type RotatedCalSecret,
  type RpcCall,
} from "@/lib/calSync";
import { IS_LOCAL } from "@/lib/demo";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const rpc: RpcCall = (fn, args) => supabase.rpc(fn, args);

/** Enter in a read-only field must never submit a surrounding profile form. */
const swallowEnter = (event: React.KeyboardEvent) => {
  if (event.key === "Enter") event.preventDefault();
};

/**
 * Mentor-facing Cal.com sync panel (design B11, F08). Shows the mentor their
 * own webhook: the Subscriber URL (`/api/webhooks/cal?mentor=<id>`), the
 * per-mentor secret (masked, with Show and Copy), the numbered Cal.com setup
 * steps, the last delivery and its outcome, and a Rotate action (the old
 * secret keeps working for 24 hours). It polls every 15 s while the tab is
 * visible, so a "Ping test" in Cal.com shows up here within seconds.
 *
 * Only the owning mentor can read the secret (`get_my_cal_webhook`); before
 * the migration exists the panel says sync is not available yet. Nothing
 * renders in demo mode or without a mentor id. Every control is
 * `type="button"`, so the panel can sit inside a profile form.
 */
/**
 * Screen-reader announcement for a new delivery only: the text changes when
 * `last_delivery_at` changes after the panel mounted, never on a poll that
 * brings nothing new (a changing region would re-announce every 15 s).
 */
function DeliveryAnnouncer({ status, message }: { status: ReturnType<typeof calSyncStatus>; message: string }) {
  const at = status.kind === "not_connected" ? "" : status.at;
  const seen = React.useRef(at);
  const [announcement, setAnnouncement] = React.useState("");
  React.useEffect(() => {
    if (at === seen.current) return;
    seen.current = at;
    if (at) setAnnouncement(message);
  }, [at, message]);
  return (
    <p className="sr-only" role="status" aria-live="polite" data-testid="cal-sync-announcer">
      {announcement}
    </p>
  );
}

export function CalSyncPanel({ mentorId, calLink }: { mentorId: string; calLink?: string | null }): JSX.Element | null {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const ids = React.useId();
  const enabled = !IS_LOCAL && Boolean(mentorId);
  const queryKey = React.useMemo(() => ["calSync", mentorId] as const, [mentorId]);

  const query = useQuery<CalWebhookInfo>({
    queryKey,
    queryFn: () => getMyCalWebhook(rpc, mentorId),
    enabled,
    staleTime: 10_000,
    retry: (count, error) => !isSyncUnavailableError(error) && count < 1,
    refetchInterval: (q) => (q.state.error ? false : CAL_SYNC_POLL_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const [revealed, setRevealed] = React.useState(false);
  const [fresh, setFresh] = React.useState<RotatedCalSecret | null>(null);
  const [copied, setCopied] = React.useState<"" | "url" | "secret" | "failed">("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const copiedTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const rotate = useMutation({
    mutationFn: () => rotateCalWebhookSecret(rpc, mentorId),
    onSuccess: (result) => {
      setFresh(result);
      setRevealed(true);
      if (result.secret) qc.setQueryData<CalWebhookInfo>(queryKey, (current) => (current ? { ...current, secret: result.secret, rotated_at: result.rotated_at, previous_valid_until: result.previous_valid_until } : current));
      void qc.invalidateQueries({ queryKey });
      toast.success(t("calSync.rotated"));
    },
    onError: () => toast.error(t("calSync.rotateError")),
  });

  if (!enabled) return null;

  const url = subscriberUrl(mentorId);
  const hasLink = normalizeCalLink(calLink) !== "";

  const copy = async (text: string, which: "url" | "secret") => {
    window.clearTimeout(copiedTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      setCopied("failed");
    }
    copiedTimer.current = window.setTimeout(() => setCopied(""), 3000);
  };

  const when = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.abs(diff) < 60_000 ? t("calSync.justNow") : formatRelativeTime(iso, lang);
  };
  const triggerLabel = (trigger: string | null) => {
    const key = triggerCopyKey(trigger);
    return key ? t(key) : String(trigger ?? "");
  };

  let content: React.ReactNode;
  if (query.isPending) {
    content = (
      <div role="status" aria-busy="true" className="space-y-3" data-testid="cal-sync-loading">
        <span className="sr-only">{t("calSync.loading")}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (query.isError && !query.data) {
    content = isSyncUnavailableError(query.error) ? (
      <Alert variant="info" role="status" data-testid="cal-sync-unavailable">
        <Info aria-hidden="true" />
        <AlertDescription>{t("calSync.unavailable")}</AlertDescription>
      </Alert>
    ) : (
      <Alert variant="destructive" data-testid="cal-sync-error">
        <CircleAlert aria-hidden="true" />
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{t("calSync.loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
            {t("common.tryAgain")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else {
    const info = query.data!;
    const status = calSyncStatus(info);
    const secret = info.secret ?? "";
    content = (
      <div className="space-y-5">
        {/* Status: what Cal.com last sent and what it did here. */}
        {/* Not a live region: the relative time re-renders on every 15 s poll. A
            new delivery is announced once by <DeliveryAnnouncer>. */}
        <DeliveryAnnouncer status={status} message={status.kind === "not_connected" ? "" : `${t(status.kind === "working" ? "calSync.connected" : "calSync.needsAttention")}. ${t(outcomeCopyKey(status.outcome))}`} />
        <div className="space-y-1.5" data-testid="cal-sync-status" data-kind={status.kind} data-outcome={status.kind === "not_connected" ? undefined : status.outcome ?? undefined}>
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
            <span>{t("calSync.statusLabel")}</span>
            {status.kind === "not_connected" ? (
              <Badge tone="neutral">{t("calSync.notConnected")}</Badge>
            ) : status.kind === "working" ? (
              <Badge tone="success">
                <Check aria-hidden="true" strokeWidth={2} />
                {t("calSync.connected")}
              </Badge>
            ) : (
              <Badge tone="warning">
                <TriangleAlert aria-hidden="true" strokeWidth={2} />
                {t("calSync.needsAttention")}
              </Badge>
            )}
          </p>
          {status.kind === "not_connected" ? (
            <p className="text-body-sm text-muted-foreground text-pretty">{t("calSync.notConnectedHint")}</p>
          ) : (
            <>
              <p className="text-body-sm text-foreground" data-testid="cal-sync-last-delivery">
                {t("calSync.lastDelivery", { trigger: triggerLabel(status.trigger), when: when(status.at) })}
              </p>
              <p className={status.kind === "attention" ? "text-body-sm text-warning-foreground text-pretty" : "text-caption text-muted-foreground"}>
                {t(outcomeCopyKey(status.outcome))}
              </p>
            </>
          )}
        </div>

        {!hasLink && (
          <Alert variant="warning" role="status" data-testid="cal-sync-no-link">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{t("calSync.noCalLink")}</AlertDescription>
          </Alert>
        )}
        {!isProductionUrl(url) && (
          <Alert variant="info" role="status" data-testid="cal-sync-preview">
            <Info aria-hidden="true" />
            <AlertDescription>{t("calSync.previewHost")}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <label htmlFor={`${ids}-url`} className="text-body-sm font-medium text-foreground">
            {t("calSync.urlLabel")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`${ids}-url`}
              readOnly
              value={url}
              dir="ltr"
              className="min-w-0 flex-1 text-start font-mono text-caption"
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={swallowEnter}
              data-testid="cal-sync-url"
            />
            <Button type="button" variant="outline" className="shrink-0 max-md:h-11" onClick={() => void copy(url, "url")} data-testid="button-copy-cal-url">
              {copied === "url" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied === "url" ? t("calSync.copied") : t("calSync.copyUrl")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p id={`${ids}-secret-label`} className="text-body-sm font-medium text-foreground">
            {t("calSync.secretLabel")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              aria-labelledby={`${ids}-secret-label`}
              dir="ltr"
              className="min-h-10 min-w-0 flex-1 break-all rounded-lg border border-input bg-muted/40 px-3 py-2 text-start font-mono text-caption text-foreground"
              data-testid="cal-sync-secret"
              data-revealed={revealed ? "true" : "false"}
            >
              {revealed ? secret : maskSecret(secret)}
            </code>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                className="max-md:h-11"
                aria-pressed={revealed}
                onClick={() => setRevealed((v) => !v)}
                data-testid="button-toggle-cal-secret"
              >
                {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                {revealed ? t("calSync.hideSecret") : t("calSync.showSecret")}
              </Button>
              <Button type="button" variant="outline" className="max-md:h-11" onClick={() => void copy(secret, "secret")} disabled={!secret} data-testid="button-copy-cal-secret">
                {copied === "secret" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied === "secret" ? t("calSync.copied") : t("calSync.copySecret")}
              </Button>
            </div>
          </div>
          {fresh?.previous_valid_until && (
            <p className="text-caption text-muted-foreground" data-testid="cal-sync-new-secret">
              {t("calSync.newSecretNote", { when: formatDateTime(fresh.previous_valid_until, lang) })}
            </p>
          )}
        </div>
        {/* One live region for both copy buttons (the visible label changes too). */}
        <p className="sr-only" aria-live="polite">
          {copied === "failed" ? t("calSync.copyFailed") : copied ? t("calSync.copied") : ""}
        </p>
        {copied === "failed" && <p className="text-caption text-destructive">{t("calSync.copyFailed")}</p>}

        <div className="space-y-2">
          <h4 className="text-body-sm font-medium text-foreground">{t("calSync.stepsTitle")}</h4>
          <ol className="list-decimal space-y-1.5 ps-5 text-body-sm text-foreground marker:text-muted-foreground" data-testid="cal-sync-steps">
            {(["step1", "step2", "step3", "step4", "step5", "step6"] as const).map((step) => (
              <li key={step} className="text-pretty">
                {t(`calSync.${step}`)}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => setConfirmOpen(true)}
            loading={rotate.isPending}
            data-testid="button-rotate-cal-secret"
          >
            <RefreshCw aria-hidden="true" />
            {t("calSync.rotate")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section id="cal-sync" aria-labelledby={`${ids}-title`} className="scroll-mt-32 space-y-4 rounded-lg border border-border bg-card p-4 md:p-6" data-testid="cal-sync-panel">
      <div className="space-y-1">
        <h3 id={`${ids}-title`} className="text-h3 text-foreground">
          {t("calSync.title")}
        </h3>
        <p className="text-body-sm text-muted-foreground text-pretty">{t("calSync.intro")}</p>
      </div>
      {content}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-rotate-cal-secret">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calSync.rotateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calSync.rotateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("calSync.rotateCancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => rotate.mutate()}
              data-testid="button-confirm-rotate"
            >
              {t("calSync.rotateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
