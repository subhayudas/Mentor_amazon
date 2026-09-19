import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";

import { AvailabilityBadge } from "@/components/profile/AvailabilityBadge";
import { textLinkClass } from "@/components/profile/styles";
import { cn } from "@/lib/utils";

/**
 * Not accepting requests (P1-18): no button at all. Status text + colour, one
 * explanatory sentence and the single escape "Find similar mentors" (the
 * discovery page filtered on the mentor's first expertise tag).
 * `data-testid="mentor-unavailable"` belongs on exactly one block per page,
 * so the caller decides which instance carries it.
 */
export function UnavailableBlock({
  mentorName,
  similarHref,
  testId,
  /** Under the header on mobile the badge already sits in the header, so it is not repeated. */
  showBadge = true,
  className,
}: {
  mentorName: string;
  similarHref: string;
  testId?: string;
  showBadge?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId} className={cn("flex flex-col gap-2", className)}>
      {showBadge && (
        <div>
          <AvailabilityBadge available={false} />
        </div>
      )}
      <p className="text-body-sm text-muted-foreground text-pretty">
        <Trans i18nKey="mentorProfile.notAcceptingBody" values={{ name: mentorName }} components={{ name: <bdi /> }} />
      </p>
      <div>
        <Link href={similarHref} className={textLinkClass} data-testid="link-find-similar">
          {t("mentorProfile.findSimilar")}
        </Link>
      </div>
    </div>
  );
}
