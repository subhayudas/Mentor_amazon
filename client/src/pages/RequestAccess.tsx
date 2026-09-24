import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Home, KeyRound, LogIn, XCircle, type LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusCard, StatusPage, type StatusTone } from "@/components/StatusCard";
import { ROUTES } from "@/lib/routes";
import { ssoLoginHref } from "@/lib/ssoClient";

type RequestStatus = "pending" | "approved" | "rejected";

const STATUS: Record<RequestStatus, { tone: BadgeTone; card: StatusTone; icon: LucideIcon }> = {
  pending: { tone: "warning", card: "warning", icon: Clock },
  approved: { tone: "success", card: "success", icon: CheckCircle2 },
  rejected: { tone: "danger", card: "danger", icon: XCircle },
};

/**
 * Landing page for an Amazon sign-in that was refused. The SSO callback
 * redirects here with `?alias=<alias>&status=rejected` when an admin has
 * deactivated the alias; no session exists at this point, so the page is
 * anonymous by design. Access is open to every Amazon employee (C12, F49):
 * without a refusal the page says to sign in with Amazon again and promises
 * no review. The card heading takes focus on mount.
 */
export default function RequestAccess() {
  const { t } = useTranslation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const alias = params.get("alias")?.trim() || "";
  const statusParam = params.get("status");
  const status: RequestStatus = statusParam === "rejected" || statusParam === "approved" ? statusParam : "pending";
  const { tone, card, icon } = STATUS[status];

  const body = !alias
    ? t("access.noAliasBody")
    : status === "rejected"
      ? t("access.rejectedBody")
      : status === "approved"
        ? t("access.approvedBody")
        : t("access.recorded");

  return (
    <StatusPage>
      <StatusCard
        titleAs="h1"
        tone={alias ? card : "neutral"}
        icon={alias ? icon : KeyRound}
        title={t("access.title")}
        description={t("access.limited")}
        data-testid="card-request-access"
        actions={
          <>
            <Button asChild variant="outline" data-testid="link-access-home">
              <Link href={ROUTES.home}>
                <Home aria-hidden="true" />
                {t("access.backHome")}
              </Link>
            </Button>
            <a href={ssoLoginHref()} className={buttonVariants({ variant: "secondary" })} data-testid="link-access-sign-in-again">
              <LogIn className="rtl:-scale-x-100" aria-hidden="true" />
              {t("access.signInAgain")}
            </a>
          </>
        }
      >
        <div className="space-y-4">
          {alias && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-caption text-muted-foreground">{t("access.aliasLabel")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono font-medium text-foreground" dir="ltr" data-testid="text-request-alias">
                  <bdi>{alias}</bdi>
                </p>
                {/* No review queue exists any more, so there is no "pending review" state to show. */}
                {status !== "pending" && (
                  <Badge tone={tone} data-testid="badge-request-status">
                    {status === "approved" ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                    {t(`access.status.${status}`)}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Without an alias nothing has been recorded yet: the SSO callback is what files the request. */}
          <p className="text-body-sm text-foreground text-pretty" data-testid="text-request-recorded">
            {body}
          </p>
          {alias && status === "pending" && <p className="text-body-sm text-muted-foreground text-pretty">{t("access.whatNext")}</p>}
        </div>
      </StatusCard>
    </StatusPage>
  );
}
