import { Clock, ShieldAlert, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  tooltipKey: string;
  className: string;
}

// Amber = not yet confirmed (still allowed to use the platform), brand green = confirmed,
// brand red = the programme team declined the organisation.
const PRESENTATION: Record<VerificationStatus, StatusPresentation> = {
  pending: {
    icon: Clock,
    labelKey: "verification.badge.pending",
    tooltipKey: "verification.tooltip.pending",
    className: "border-amber-400 bg-amber-50 text-amber-800",
  },
  unverified: {
    icon: ShieldAlert,
    labelKey: "verification.badge.unverified",
    tooltipKey: "verification.tooltip.unverified",
    className: "border-amber-400 bg-amber-50 text-amber-800",
  },
  rejected: {
    icon: ShieldX,
    labelKey: "verification.badge.rejected",
    tooltipKey: "verification.tooltip.rejected",
    className: "border-[#C40000]/40 bg-[#C40000]/5 text-[#C40000]",
  },
  verified: {
    icon: ShieldCheck,
    labelKey: "verification.badge.verified",
    tooltipKey: "verification.tooltip.verified",
    className: "border-[#067D62]/40 bg-[#067D62]/10 text-[#067D62]",
  },
};

const SIZE_CLASSES: Record<NonNullable<VerificationBadgeProps["size"]>, string> = {
  sm: "gap-1 px-1.5 py-0 text-[11px] [&>svg]:h-3 [&>svg]:w-3",
  md: "gap-1.5 px-2.5 py-0.5 text-xs [&>svg]:h-3.5 [&>svg]:w-3.5",
};

/** True when the mentee is an organisation the programme team has not confirmed. */
export function isUnverifiedOrganization(mentee?: Pick<Mentee, "user_type" | "verification_status"> | null): boolean {
  return mentee?.user_type === "organization" && mentee.verification_status !== "verified";
}

/**
 * Organisation verification pill. Renders nothing for individual mentees, because
 * verification only applies to NGOs / organisations.
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
  const { icon: Icon, labelKey, tooltipKey, className: statusClassName } = PRESENTATION[resolved];
  const label = t(labelKey);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          aria-label={label}
          className={cn("font-medium shadow-none", statusClassName, SIZE_CLASSES[size], className)}
          data-testid={testId ?? `badge-verification-${resolved}`}
          data-verification-status={resolved}
        >
          <Icon aria-hidden="true" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-start">
        {t(tooltipKey)}
      </TooltipContent>
    </Tooltip>
  );
}

export default VerificationBadge;
