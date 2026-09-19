import { useTranslation } from "react-i18next";
import { Building2, Clock, ShieldX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VerificationBadge } from "@/components/VerificationBadge";
import type { Mentee } from "@/lib/database";

// Optional programme contact surfaced on the "not approved" banner; falls back to a generic line.
const PROGRAMME_CONTACT_EMAIL: string | undefined = import.meta.env.VITE_PROGRAMME_CONTACT_EMAIL || undefined;

/**
 * Compact verification state for organisation mentees. Pending and rejected
 * get a banner; verified only gets the badge next to the organisation name.
 * Nothing is ever blocked here — unverified organisations can still browse
 * mentors and request sessions.
 */
export function OrganizationVerificationStatus({ mentee }: { mentee: Mentee }) {
  const { t } = useTranslation();

  if (mentee.user_type !== "organization") return null;

  const status = mentee.verification_status ?? "unverified";
  const orgName = mentee.organization_name || mentee.name;

  return (
    <div className="space-y-3" data-testid="section-organization-verification">
      <div className="flex flex-wrap items-center gap-2 text-body-sm" data-testid="row-organization-identity">
        <Building2 className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="font-medium text-foreground" data-testid="text-organization-name">
          <bdi>{orgName}</bdi>
        </span>
        <VerificationBadge status={status} type="organization" size="sm" />
      </div>

      {status === "pending" && (
        <Alert variant="warning" role="status" data-testid="banner-verification-pending">
          <Clock aria-hidden="true" />
          <AlertTitle className="leading-snug">{t("verification.inReviewTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t("verification.dashboardPendingBody")}</p>
            {mentee.verification_reference && (
              <p className="mt-1 text-caption" data-testid="text-verification-reference">
                {t("verification.referenceSubmitted", { reference: mentee.verification_reference })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {status === "rejected" && (
        <Alert variant="destructive" data-testid="banner-verification-rejected">
          <ShieldX aria-hidden="true" />
          <AlertTitle className="leading-snug">{t("verification.rejectedTitle")}</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{t("verification.dashboardRejectedBody")}</p>
            <p className="mt-1">
              {t("verification.contactLine")}
              {PROGRAMME_CONTACT_EMAIL && (
                <>
                  {" "}
                  <a
                    href={`mailto:${PROGRAMME_CONTACT_EMAIL}`}
                    dir="ltr"
                    className="font-medium underline underline-offset-2"
                    data-testid="link-programme-contact"
                  >
                    <bdi>{PROGRAMME_CONTACT_EMAIL}</bdi>
                  </a>
                </>
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
