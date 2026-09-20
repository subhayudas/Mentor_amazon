import { Building2, ShieldAlert, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Mentee, VerificationStatus } from "@/lib/database";

type MenteeType = Mentee["user_type"];

export interface VerificationBadgeProps {
  /** Falls back to 'unverified' when the row predates the verification columns. */
  status?: VerificationStatus | null;
  type?: MenteeType | null;
  size?: "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

interface StatusPresentation {
  icon: LucideIcon;
  labelKey: string;
  tone: BadgeTone;
}

// Info (neutral-blue) = not yet confirmed but still allowed to use the
// platform — deliberately NOT the warning tone + clock that the booking
// status "Awaiting mentor" owns (F-19), so an organisation's paperwork never
// reads as a session waiting on someone; success = confirmed, danger = the
// programme team declined the organisation. Text + icon + colour, never
// colour alone; the explanation lives next to the badge where it matters
// (inbox note, dashboard banner), so no hover-only tooltip.
const PRESENTATION: Record<VerificationStatus, StatusPresentation> = {
  pending: { icon: Building2, labelKey: "verification.badge.pending", tone: "info" },
  unverified: { icon: ShieldAlert, labelKey: "verification.badge.unverified", tone: "info" },
  rejected: { icon: ShieldX, labelKey: "verification.badge.rejected", tone: "danger" },
  verified: { icon: ShieldCheck, labelKey: "verification.badge.verified", tone: "success" },
};

/** True when the mentee is an organisation the programme team has not confirmed. */
export function isUnverifiedOrganization(mentee?: Pick<Mentee, "user_type" | "verification_status"> | null): boolean {
  return mentee?.user_type === "organization" && mentee.verification_status !== "verified";
}

/**
 * Organisation verification pill. Renders nothing for individual mentees, because
 * verification only applies to NGOs / organisations. A static Badge (P1-6):
 * not focusable, no tooltip.
 */
export function VerificationBadge({
  status,
  type,
  size = "md",
  className,
  "data-testid": testId,
}: VerificationBadgeProps) {
  const { t } = useTranslation();

  if (type !== "organization") return null;

  const resolved: VerificationStatus = status ?? "unverified";
  const { icon: Icon, labelKey, tone } = PRESENTATION[resolved];

  return (
    <Badge
      tone={tone}
      className={cn(size === "sm" && "px-2 py-0", className)}
      data-testid={testId ?? `badge-verification-${resolved}`}
      data-verification-status={resolved}
    >
      <Icon aria-hidden="true" strokeWidth={2} />
      {t(labelKey)}
    </Badge>
  );
}

export default VerificationBadge;
