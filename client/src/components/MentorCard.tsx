import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Clock, MailCheck, Star } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicMentor } from "@/lib/database";
import {
  CARD_CHIP_LIMIT,
  firstSentence,
  languageLabels,
  localized,
  localizedTags,
} from "@/lib/discovery";
import { UNAVAILABLE, bidi, formatNumber, localizeCountry, tzOffsetLabel, viewerTimeZone } from "@/lib/format";
import { initialsOf } from "@/lib/localized";
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
 *   4. min-h-8, one row at every breakpoint: up to 3 expertise chips, or 2 +
 *      a "+n" Popover button when there are more than 3 (F-25 — three chips
 *      plus "+n" orphaned the button onto a second row in 380–410px columns;
 *      the popover lists the rest, keyboard/touch, no `title`). The row never
 *      wraps: chips shrink and truncate instead (N-01 — a reserved second row
 *      was a permanent blank band on desktop).
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
  "relative isolate flex h-full flex-col gap-3 rounded-[16px] border border-[var(--sc-hairline)] bg-white p-3 pb-4 text-card-foreground shadow-[0_2px_4px_rgba(0,0,0,0.05)]";


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
      // From the displayed name, so Arabic cards show Arabic initials (F-05).
      initials: initialsOf(name),
      helpsWith: firstSentence(localized(mentor, "bio", lang)),
      tags,
      // Up to CARD_CHIP_LIMIT chips fit one row; with more, two chips + "+n" do (F-25).
      visibleTags: tags.slice(0, tags.length > CARD_CHIP_LIMIT ? CARD_CHIP_LIMIT - 1 : CARD_CHIP_LIMIT),
      hiddenTags: tags.slice(tags.length > CARD_CHIP_LIMIT ? CARD_CHIP_LIMIT - 1 : CARD_CHIP_LIMIT),
      // The compact card has no "+n", so it always shows the first three.
      compactTags: tags.slice(0, CARD_CHIP_LIMIT),
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
      <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-[var(--sc-grey)]">
        {mentor.photo_url ? (
          <img src={mentor.photo_url} alt="" loading="lazy" className="size-full object-cover object-[center_28%]" />
        ) : (
          <div className="grid size-full place-items-center text-3xl font-bold text-[var(--sc-ink-soft)]" aria-hidden="true">
            {f.initials}
          </div>
        )}
        <Badge
          tone={mentor.is_available ? "success" : "neutral"}
          className="absolute bottom-2 start-2 z-[1] shadow-sm"
          data-status={mentor.is_available ? "accepting" : "closed"}
        >
          {f.statusLabel}
        </Badge>
        {f.company && (
          <span className="absolute bottom-2 end-2 z-[1] max-w-[55%] truncate rounded-[24px] bg-black/55 px-3 py-1 text-[12px] font-medium text-white backdrop-blur">
            <bdi>{f.company}</bdi>
          </span>
        )}
      </div>
      <h3
        id={nameId}
        data-testid={`text-mentor-name-${mentor.id}`}
        className="line-clamp-1 min-w-0 px-1 text-[18px] font-bold leading-[28px] text-[var(--sc-ink)] [overflow-wrap:anywhere]"
      >
        <bdi>{f.name}</bdi>
      </h3>

      <Credential position={f.position} company={f.company} className="-mt-3 h-6 px-1 leading-6 text-[var(--sc-ink-soft)]" />

      <p className="line-clamp-2 h-12 px-1 text-body-sm leading-6 text-foreground text-pretty">{f.helpsWith}</p>

      <div className="flex min-h-8 items-start gap-2 px-1">
        {f.visibleTags.map((tag, i) => (
          <Badge key={tag.key} tone="neutral" className="min-w-0 max-w-full shrink" data-testid={`badge-expertise-${i}`}>
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
                  "relative z-[1] min-h-6 shrink-0 cursor-pointer text-secondary transition-colors duration-fast hover:border-secondary hover:bg-muted coarse:after:absolute coarse:after:-inset-2 coarse:after:content-['']",
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

      <div className="h-10 px-1 text-caption text-muted-foreground">
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

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
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
          className="group/link inline-flex w-full rounded-lg after:absolute after:inset-0 after:rounded-[16px] after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring sm:w-auto"
        >
          <span
            data-testid={`button-book-${mentor.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full rounded-[10px] border-transparent bg-[var(--sc-ink)] text-white group-hover/link:bg-black group-hover/link:text-white sm:w-auto")}
          >
            {t("mentorCard.viewProfile")}
            <span className="sr-only">
              : <bdi>{f.name}</bdi>
            </span>
          </span>
        </Link>
        <span className="flex items-center gap-2">
          {sent && (
            <Badge tone="info" className="shrink-0">
              <MailCheck aria-hidden="true" strokeWidth={2} />
              {t("mentorCard.requestSent")}
            </Badge>
          )}
          <FavoriteButton mentorId={mentor.id} mentorName={f.name} size="sm" />
        </span>
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
        {f.compactTags.map((tag, i) => (
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
      <div className="flex min-h-8 items-start gap-2 px-1">
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
      <div className="flex h-14 flex-wrap content-start gap-2 overflow-hidden">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
