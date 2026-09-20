import { useTranslation } from "react-i18next";
import { CircleCheck, CirclePause } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cx } from "@/components/profile/styles";

/**
 * `is_available` as text + colour + icon, never colour alone (spec §0):
 * success "Accepting requests" / neutral "Not accepting requests right now".
 * The wrapper carries the caption role because `cn()` inside Badge drops
 * `text-caption` next to the tone colour (see styles.ts).
 */
export function AvailabilityBadge({ available, className }: { available: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cx("inline-flex text-caption", className)}>
      <Badge tone={available ? "success" : "neutral"} data-available={available}>
        {available ? (
          <CircleCheck aria-hidden="true" strokeWidth={2} />
        ) : (
          <CirclePause aria-hidden="true" strokeWidth={2} />
        )}
        {available ? t("mentorProfile.accepting") : t("mentorProfile.notAccepting")}
      </Badge>
    </span>
  );
}
