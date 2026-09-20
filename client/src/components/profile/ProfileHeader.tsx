import * as React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/PageHeader";
import { AvailabilityBadge } from "@/components/profile/AvailabilityBadge";
import { TimeZoneNote } from "@/components/profile/TimeZoneNote";
import { formatList, initials, languageName, type MentorDisplay } from "@/components/profile/localized";
import { headerRowClass } from "@/components/profile/styles";
import type { PublicMentor } from "@/lib/database";
import { formatNumber, localizeCountry } from "@/lib/format";

/** `mentorship_preference` → one honest sentence; the only public "session framing" field. */
export function preferenceLabel(preference: PublicMentor["mentorship_preference"], t: TFunction): string | null {
  switch (preference) {
    case "ongoing":
      return t("mentorProfile.preference.ongoing");
    case "rotating":
      return t("mentorProfile.preference.rotating");
    case "either":
      return t("mentorProfile.preference.either");
    default:
      return null;
  }
}

/**
 * Profile header (P1-17, F-30): spans both columns. Avatar 80 with the 1px
 * black/10 outline, the page's one h1 (via PageHeader, name in `<bdi>`),
 * credential "position · company", a caption meta line (localized country ·
 * languages · session style), the one time-zone line and, only when
 * `total_ratings > 0`, the rating caption with an LTR numeric run plus a
 * screen-reader sentence. The accepting badge renders here only when the
 * request card is not on the page (`showBadge`, mobile) so the status appears
 * once. No separate Ratings or Session style section exists anywhere.
 */
export function ProfileHeader({
  mentor,
  display,
  showBadge = true,
}: {
  mentor: PublicMentor;
  display: MentorDisplay;
  showBadge?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const rating = mentor.average_rating ? Number.parseFloat(String(mentor.average_rating)) : 0;
  const ratingCount = mentor.total_ratings ?? 0;
  const showRating = ratingCount > 0 && Number.isFinite(rating) && rating > 0;
  const ratingText = formatNumber(rating, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const meta = React.useMemo(() => {
    const parts: React.ReactNode[] = [];
    if (mentor.country) parts.push(<span key="country">{localizeCountry(mentor.country, lang)}</span>);
    const languages = (mentor.languages_spoken ?? []).map((l) => languageName(l, lang));
    if (languages.length > 0) parts.push(<span key="lang">{formatList(languages, lang)}</span>);
    const style = preferenceLabel(mentor.mentorship_preference, t);
    if (style) parts.push(<span key="style" data-testid="text-mentor-session-style">{style}</span>);
    return parts;
  }, [mentor.country, mentor.languages_spoken, mentor.mentorship_preference, lang, t]);

  return (
    <div className={headerRowClass}>
      <Avatar className="size-20 shrink-0">
        <AvatarImage src={mentor.photo_url || undefined} alt="" className="object-cover" />
        <AvatarFallback className="bg-muted text-h3 text-foreground">{initials(display.name)}</AvatarFallback>
      </Avatar>
      <PageHeader
        className="min-w-0 flex-1 py-0 md:py-0"
        eyebrow={t("mentorProfile.eyebrow")}
        title={<bdi data-testid="text-mentor-name">{display.name}</bdi>}
        description={
          <span data-testid="text-mentor-position">
            <bdi>{display.position}</bdi>
            {display.company && (
              <>
                {" · "}
                <bdi>{display.company}</bdi>
              </>
            )}
          </span>
        }
      >
        <div className="mt-3 flex flex-col gap-2">
          {meta.length > 0 && (
            <p className="text-caption text-muted-foreground" data-testid="text-mentor-meta">
              {meta.map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span aria-hidden="true"> · </span>}
                  {part}
                </React.Fragment>
              ))}
            </p>
          )}
          <TimeZoneNote mentorTz={mentor.timezone} />
          {(showBadge || showRating) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              {showBadge && <AvailabilityBadge available={mentor.is_available} />}
              {showRating && (
                <p className="text-caption text-muted-foreground" data-testid="text-mentor-rating">
                  <span className="sr-only">{t("mentorProfile.ratingA11y", { rating: ratingText, count: ratingCount })}</span>
                  <span aria-hidden="true">
                    <span dir="ltr" className="tabular-nums text-foreground">
                      <Star
                        className="me-1 inline-block size-3.5 fill-brand-orange align-text-bottom text-brand-orange"
                        strokeWidth={1.5}
                      />
                      {ratingText}
                    </span>
                    {" · "}
                    {t("mentorProfile.ratings", { count: ratingCount })}
                  </span>
                  {" · "}
                  {t("mentorProfile.feedbackPrivate")}
                </p>
              )}
            </div>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
