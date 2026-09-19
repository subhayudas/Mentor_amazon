import { Trans, useTranslation } from "react-i18next";

import { tzDisplayLabel, tzOffsetLabel, viewerTimeZone } from "@/lib/format";
import { cx } from "@/components/profile/styles";

/**
 * The one time-zone line (F-30): the mentor's zone as a human label
 * ("Gulf Standard Time (GMT+4)") and its offset from the viewer ("Same time
 * zone as you" / "2 h ahead of you"), never a raw IANA id. With `mentorName`
 * it reads "{name}'s time zone: …" (the booking dialog); without, the bare
 * "zone · offset" pair for the profile header's meta line.
 */
export function TimeZoneNote({
  mentorName,
  mentorTz,
  className,
}: {
  mentorName?: string;
  mentorTz: string | null | undefined;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  if (!mentorTz) return null;
  const zone = tzDisplayLabel(mentorTz, lang);
  const relative = tzOffsetLabel(mentorTz, viewerTimeZone(), lang);
  return (
    <p className={cx("text-caption text-muted-foreground text-pretty", className)} data-testid="text-mentor-tz">
      {mentorName ? (
        <Trans
          i18nKey="bookingRequest.tzLine"
          values={{ name: mentorName, zone, relative }}
          components={{ name: <bdi /> }}
        />
      ) : (
        <>
          {zone}
          <span aria-hidden="true"> · </span>
          {relative}
        </>
      )}
    </p>
  );
}
