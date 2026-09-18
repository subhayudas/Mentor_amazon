import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Clock, Home, KeyRound, LogIn, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RequestStatus = "pending" | "approved" | "rejected";

/**
 * Landing page for an Amazon sign-in whose alias is not on the allow-list.
 * The SSO callback redirects here with `?alias=` (and optionally `?status=`)
 * after recording an access_requests row; no session exists at this point,
 * so the page is anonymous by design.
 */
export default function RequestAccess() {
  const { t } = useTranslation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const alias = params.get("alias")?.trim() || "";
  const statusParam = params.get("status");
  const status: RequestStatus = statusParam === "rejected" || statusParam === "approved" ? statusParam : "pending";

  const statusTone: Record<RequestStatus, string> = {
    pending: "border-transparent bg-amber-100 text-amber-800",
    approved: "border-transparent bg-[#E6F4F1] text-[#067D62]",
    rejected: "border-transparent bg-[#FDECEC] text-[#C40000]",
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 pb-12">
      <Card className="w-full max-w-lg border-[#D5D9D9]" data-testid="card-request-access">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#232F3E] shrink-0">
              {status === "rejected" ? (
                <XCircle className="w-5 h-5 text-white" aria-hidden="true" />
              ) : (
                <KeyRound className="w-5 h-5 text-white" aria-hidden="true" />
              )}
            </div>
            <CardTitle className="text-xl">{t("access.title")}</CardTitle>
          </div>
          <CardDescription className="pt-2">{t("access.limited")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {alias && (
            <div className="rounded-lg border border-[#D5D9D9] bg-muted/40 p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("access.aliasLabel")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono font-semibold text-foreground" data-testid="text-request-alias">{alias}</p>
                <Badge variant="outline" className={statusTone[status]} data-testid="badge-request-status">
                  <Clock className="w-3 h-3 me-1" aria-hidden="true" />
                  {t(`access.status.${status}`)}
                </Badge>
              </div>
            </div>
          )}

          {/* Without an alias nothing has been recorded yet: the SSO callback is what files the request. */}
          <p className="text-sm text-foreground" data-testid="text-request-recorded">
            {!alias
              ? t("access.noAliasBody")
              : status === "rejected"
                ? t("access.rejectedBody")
                : status === "approved"
                  ? t("access.approvedBody")
                  : t("access.recorded")}
          </p>
          {alias && status === "pending" && <p className="text-sm text-muted-foreground">{t("access.whatNext")}</p>}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button asChild variant="outline" data-testid="link-access-home">
              <Link href="/"><Home className="w-4 h-4 me-2" />{t("access.backHome")}</Link>
            </Button>
            <Button asChild data-testid="link-access-sign-in-again">
              <a href="/api/auth/login/amazon"><LogIn className="w-4 h-4 me-2" />{t("access.signInAgain")}</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
