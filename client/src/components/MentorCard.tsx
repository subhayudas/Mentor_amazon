import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Clock, MailCheck, Star } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicMentor } from "@/lib/database";
import {
  CARD_CHIP_LIMIT,
  firstSentence,
  initialsOf,
  languageLabels,
  localized,
  localizedTags,
} from "@/lib/discovery";
import { UNAVAILABLE, bidi, formatNumber, tzOffsetLabel, viewerTimeZone } from "@/lib/format";
import { localizeCountry } from "@/lib/reporting";
import { ROUTES } from "@/lib/routes";
import { getSentRequest } from "@/lib/sentRequests";
import { cn } from "@/lib/utils";

/**
 * Mentor result card (spec §5 as amended by P1-15, P1-16, P1-21, P1-27, P1-6).
 *
 * Anatomy, fixed row heights so `MentorCardSkeleton` shares the geometry:
 *   1. min-h-14  avatar 48 · name (h3, `<bdi>`, plain text) · status Badge (text + colour; under the name below `sm`)
 *   2. h-6   credential: position · company, one line
 *   3. h-12  helps-with: first sentence of the bio, two lines, `text-pretty`
 *   4. ≥60px up to 3 expertise chips + a "+n" Popover button (keyboard/touch, no `title`)
 *   5. h-10  two caption lines: A languages · country; B tz offset · ★ rating (count)
 *   6. footer: ONE `outline` sm anchor "View profile" whose `after:` overlay makes
 *      the whole card one tab stop named "View profile: {name}". Nothing else on
 *      the card is a link; the "+n" button sits above the overlay (`z-[1]`).
 *
 * No availability strip, no preference line, no quick view, no filled button
 * (navy fill is reserved for page-level actions). Hover = border darkens only;
 * chips/cards are high-frequency surfaces, so nothing else animates.
 */
export interface MentorCardProps {
  mentor: PublicMentor;
  className?: string;
}

const cardSurface =
  "relative isolate flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground";

function useCardFields(mentor: PublicMentor) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return React.useMemo(() => {
    const name = localized(mentor, "name", lang);
    const position = localized(mentor, "position", lang);
    const company = localized(mentor, "company", lang);
    const tags = localizedTags(mentor, "expertise", lang);
    const tz = mentor.timezone ? tzOffsetLabel(mentor.timezone, viewerTimeZone(), lang) : UNAVAILABLE;
    return {
      name,
      position,
      company,
      initials: initialsOf(mentor.name),
      helpsWith: firstSentence(localized(mentor, "bio", lang)),
      tags,
      visibleTags: tags.slice(0, CARD_CHIP_LIMIT),
      hiddenTags: tags.slice(CARD_CHIP_LIMIT),
      languages: languageLabels(mentor, lang),
      country: mentor.country ? localizeCountry(mentor.country, lang) : "",
      tz,
      ratingCount: mentor.total_ratings ?? 0,
      rating: Number.parseFloat(String(mentor.average_rating ?? "")),
      statusLabel: mentor.is_available ? t("mentorCard.accepting") : t("mentorCard.notAccepting"),
    };
  }, [mentor, lang, t]);
}

function Credential({ position, company, className }: { position: string; company: string; className?: string }) {
  return (
    <p className={cn("truncate text-body-sm text-muted-foreground", className)}>
      {position && <bdi>{position}</bdi>}
      {position && company && <span aria-hidden="true"> · </span>}
      {company && <bdi>{company}</bdi>}
    </p>
  );
}

export function MentorCard({ mentor, className }: MentorCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const nameId = React.useId();
  const f = useCardFields(mentor);
  const sent = React.useMemo(() => getSentRequest(mentor.id), [mentor.id]);
  const hasRating = f.ratingCount > 0 && Number.isFinite(f.rating);
  const ratingText = hasRating ? formatNumber(f.rating, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "";
  const countText = hasRating ? formatNumber(f.ratingCount, lang) : "";

  return (
    <article
      aria-labelledby={nameId}
      data-testid={`card-mentor-${mentor.id}`}
      className={cn(cardSurface, "transition-colors duration-fast hover:border-muted-foreground/40", className)}
    >
      {/*
        Header row. Below `sm` the status badge sits under the name instead of
        beside it, so at 320px the name keeps the full width (the badge would
        otherwise leave it ~90px and clip mid-word); from `sm` the badge trails
        the name on one line. `min-h-14` (not `h-14`) lets the stacked variant
        grow; the skeleton mirrors the same structure.
      */}
      <div className="flex min-h-14 items-center gap-3">
        <Avatar className="size-12">
          <AvatarImage src={mentor.photo_url || undefined} alt="" />
          <AvatarFallback className="bg-muted text-base font-medium text-foreground">{f.initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <h3
            id={nameId}
            data-testid={`text-mentor-name-${mentor.id}`}
            className="line-clamp-2 min-w-0 text-base leading-snug text-foreground [font-weight:var(--heading-weight,600)] [overflow-wrap:anywhere] sm:flex-1"
          >
            <bdi>{f.name}</bdi>
          </h3>
          <Badge
            tone={mentor.is_available ? "success" : "neutral"}
            className="self-start sm:self-auto sm:shrink-0"
            data-status={mentor.is_available ? "accepting" : "closed"}
          >
            {f.statusLabel}
          </Badge>
        </div>
      </div>

      <Credential position={f.position} company={f.company} className="h-6 leading-6" />

      <p className="line-clamp-2 h-12 text-body-sm leading-6 text-foreground text-pretty">{f.helpsWith}</p>

      <div className="flex min-h-[3.75rem] flex-wrap content-start gap-2">
        {f.visibleTags.map((tag, i) => (
          <Badge key={tag.key} tone="neutral" className="max-w-full" data-testid={`badge-expertise-${i}`}>
            <span className="truncate">{tag.label}</span>
          </Badge>
        ))}
        {f.hiddenTags.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("mentorCard.moreExpertise", { count: f.hiddenTags.length })}
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "relative z-[1] min-h-6 cursor-pointer text-secondary transition-colors duration-fast hover:border-secondary hover:bg-muted coarse:after:absolute coarse:after:-inset-2 coarse:after:content-['']",
                )}
              >
                <span dir="ltr">+{formatNumber(f.hiddenTags.length, lang)}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3">
              <p className="mb-2 text-caption text-muted-foreground">{t("mentorCard.moreExpertiseTitle")}</p>
              <ul className="flex flex-wrap gap-2">
                {f.hiddenTags.map((tag) => (
                  <li key={tag.key} className="contents">
                    <Badge tone="neutral" className="max-w-full">
                      <span className="truncate">{tag.label}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="h-10 text-caption text-muted-foreground">
        <p className="h-5 truncate leading-5">
          {f.languages.length > 0 && <span>{f.languages.join(t("mentorCard.listSeparator"))}</span>}
          {f.languages.length > 0 && f.country && <span aria-hidden="true"> · </span>}
          {f.country && <span>{f.country}</span>}
        </p>
        <p className="flex h-5 items-center gap-1 leading-5">
          <Clock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span className="truncate">{f.tz}</span>
          {hasRating && (
            <>
              <span aria-hidden="true"> · </span>
              <span dir="ltr" className="inline-flex shrink-0 items-center gap-1" data-testid={`rating-${mentor.id}`}>
                <Star className="size-3.5 fill-brand-orange text-brand-orange" strokeWidth={1.5} aria-hidden="true" />
                <span aria-hidden="true" className="tabular-nums">
                  {ratingText} ({countText})
                </span>
                <span className="sr-only">{t("mentorCard.ratingA11y", { rating: ratingText, count: f.ratingCount })}</span>
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
        {/*
          The single link. Its `after:` pseudo-element covers the card (the
          article is `relative isolate`), so the whole surface is clickable and
          the ring draws around the card on keyboard focus. The visible button
          is a span inside it (no nested interactive element, and its press
          transform never becomes the overlay's containing block). Both legacy
          test ids survive: `link-mentor-<id>` on the anchor, `button-book-<id>`
          on the label it wraps.
        */}
        <Link
          href={ROUTES.mentor(mentor.id)}
          data-testid={`link-mentor-${mentor.id}`}
          className="group/link inline-flex w-full rounded-lg after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring sm:w-auto"
        >
          <span
            data-testid={`button-book-${mentor.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full group-hover/link:bg-muted sm:w-auto")}
          >
            {t("mentorCard.viewProfile")}
            <span className="sr-only">
              : <bdi>{f.name}</bdi>
            </span>
          </span>
        </Link>
        {sent && (
          <Badge tone="info" className="shrink-0">
            <MailCheck aria-hidden="true" strokeWidth={2} />
            {t("mentorCard.requestSent")}
          </Badge>
        )}
      </div>
    </article>
  );
}

/**
 * Compact card for the mobile landing scroller (P0-7): avatar 40, name,
 * credential, three chips and the tz label — no helps-with, no rating, no
 * button. The whole card is the link, named "View profile: {name}".
 */
export function MentorCardCompact({ mentor, className }: MentorCardProps) {
  const { t } = useTranslation();
  const f = useCardFields(mentor);
  return (
    <Link
      href={ROUTES.mentor(mentor.id)}
      aria-label={t("mentorCard.viewProfileOf", { name: bidi(f.name) })}
      data-testid={`card-mentor-${mentor.id}`}
      className={cn(
        "flex w-[80vw] max-w-[320px] shrink-0 snap-start flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors duration-fast hover:border-muted-foreground/40",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={mentor.photo_url || undefined} alt="" />
          <AvatarFallback className="bg-muted text-sm font-medium text-foreground">{f.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3
            data-testid={`text-mentor-name-${mentor.id}`}
            className="truncate text-base leading-5 text-foreground [font-weight:var(--heading-weight,600)]"
          >
            <bdi>{f.name}</bdi>
          </h3>
          <Credential position={f.position} company={f.company} className="h-5 text-caption leading-5" />
        </div>
      </div>
      <div className="flex h-14 flex-wrap content-start gap-2 overflow-hidden">
        {f.visibleTags.map((tag, i) => (
          <Badge key={tag.key} tone="neutral" className="max-w-full" data-testid={`badge-expertise-${i}`}>
            <span className="truncate">{tag.label}</span>
          </Badge>
        ))}
      </div>
      <p className="flex h-5 items-center gap-1 text-caption leading-5 text-muted-foreground">
        <Clock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="truncate">{f.tz}</span>
      </p>
    </Link>
  );
}

/** Loading twin of `MentorCard`, row for row (P1-16). Decorative; the grid's `role="status"` announces. */
export function MentorCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(cardSurface, className)} aria-hidden="true">
      <div className="flex min-h-14 items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Skeleton className="h-5 w-2/3 sm:flex-1" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-12 w-full" />
      <div className="flex min-h-[3.75rem] flex-wrap content-start gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex h-10 flex-col justify-between">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="mt-auto pt-3">
        <Skeleton className="h-9 w-full sm:w-28" />
      </div>
    </div>
  );
}

/** Loading twin of `MentorCardCompact` for the mobile scroller. */
export function MentorCardCompactSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex w-[80vw] max-w-[320px] shrink-0 snap-start flex-col gap-3 rounded-lg border border-border bg-card p-4", className)}
    >
      <div className="flex h-10 items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex h-14 flex-wrap content-start gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}
