import { Trans } from "react-i18next";

import { viewerTimeZone } from "@/lib/format";
import { cx } from "@/components/profile/styles";

/**
 * "Your time zone: Asia/Dubai · Layla Haddad's: Asia/Riyadh". IANA ids are
 * code-like runs, so each sits in its own `dir="ltr"` span and the name in a
 * `<bdi>` (P1-27); the sentence itself follows the page direction.
 */
export function TimeZoneNote({
  mentorName,
  mentorTz,
  className,
}: {
  mentorName: string;
  mentorTz: string | null | undefined;
  className?: string;
}) {
  if (!mentorTz) return null;
  return (
    <p className={cx("text-caption text-muted-foreground text-pretty", className)}>
      <Trans
        i18nKey="mentorProfile.tzNote"
        values={{ viewer: viewerTimeZone(), name: mentorName, mentor: mentorTz }}
        components={{
          viewer: <span dir="ltr" className="inline-block" />,
          name: <bdi />,
          mentor: <span dir="ltr" className="inline-block" />,
        }}
      />
    </p>
  );
}
