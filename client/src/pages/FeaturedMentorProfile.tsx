import * as React from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarCheck, CircleAlert, Clock, Globe, Hourglass, Languages, Linkedin, MailCheck, Quote } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveShowcaseMentor, type FeaturedMentor } from "@/data/featuredMentors";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useAuth } from "@/context/AuthContext";
import type { PublicMentor } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { sentMemoryForViewer } from "@/components/booking/requestState";
import { featuredPageState, type FeaturedPageState } from "@/lib/directory";
import { bidi, formatNumber, formatRelativeDay, languageName, localizeCountry } from "@/lib/format";
import { discoveryUrl } from "@/lib/routes";
import { getSentRequest } from "@/lib/sentRequests";
import { mentorService } from "@/lib/services";
import { utcOffsetLabel } from "@/lib/timezones";
import { lastDiscoveryHref } from "@/lib/urlState";
import { cn } from "@/lib/utils";

/**
 * Featured mentor profile `/mentor/:id` (Figma "Ajay Shenoy" page): red
 * identity rail on the inline-start, sand content column with the one 1:1
 * service card (→ the session page), About, FAQ. `:id` is the curated slug or
 * its database id (both resolve here; links keep the slug).
 *
 * Against the database the page reflects the mentor's real row (design B2,
 * F23/F24): availability, name, photo, languages and ratings come from it; the
 * static file only adds the session copy and FAQ. States:
 * - `db`: Book and the heart only while the mentor accepts requests,
 *   otherwise the "not accepting" copy;
 * - `static` (the seed has not run yet): "Requests open soon", no Book, no heart;
 * - `error`: "Couldn't check availability" with Retry, Book disabled.
 * Sample ratings, "1.8k sessions" and testimonials are demo-mode only (D14).
 */

/** The Arabic value in Arabic when there is one; an empty string or list falls back to English. */
export function pickLang<T>(lang: string, en: T, ar: T | undefined): T {
  if (lang !== "ar" || ar === undefined || ar === null) return en;
  if ((typeof ar === "string" || Array.isArray(ar)) && ar.length === 0) return en;
  return ar;
}

/**
 * The curated mentor for `id` plus its page state. Against the database it
 * reads the row by db id under the same `['mentor', id]` key `/mentor/:id`
 * uses; in demo mode it never touches the network.
 */
export function useFeaturedPageMentor(id: string | undefined): {
  base: FeaturedMentor | undefined;
  state: FeaturedPageState | null;
  retry: () => void;
  isFetching: boolean;
} {
  const base = resolveShowcaseMentor(id);
  const isLocal = IS_LOCAL;
  const query = useQuery<PublicMentor | null>({
    queryKey: ["mentor", base?.dbId ?? ""],
    queryFn: () => mentorService.getById(base!.dbId),
    enabled: !isLocal && Boolean(base),
    staleTime: 5 * 60_000,
  });
  const state = base ? featuredPageState({ isLocal, featured: base, query: { status: query.status, data: query.data } }) : null;
  const { refetch } = query;
  const retry = React.useCallback(() => void refetch(), [refetch]);
  return { base, state, retry, isFetching: query.isFetching };
}

function TestimonialCard({ item, onDark }: { item: FeaturedMentor["testimonials"][number]; onDark?: boolean }) {
  return (
    <figure
      className={cn(
        "flex w-[260px] shrink-0 flex-col rounded-[12px] border border-[var(--sc-hairline)] bg-white p-4 md:w-[280px]",
        onDark && "border-transparent",
      )}
    >
      <Quote className="size-4 text-[#b0b0b0]" aria-hidden="true" />
      <blockquote className="mt-2 text-[14px] leading-[22px] text-[var(--sc-ink)]">{item.quote}</blockquote>
      <figcaption className="mt-auto pt-4">
        <p className="text-[13px] font-bold text-[var(--sc-ink)]">{item.name}</p>
        {item.date && <p className="text-[12px] text-[#6c6c84]">{item.date}</p>}
      </figcaption>
    </figure>
  );
}

export function TestimonialRail({ items, className }: { items: FeaturedMentor["testimonials"]; className?: string }) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = document.documentElement.dir === "rtl";
    el.scrollBy({ left: dir * (rtl ? -300 : 300), behavior: "smooth" });
  };
  const btn = "inline-flex size-8 items-center justify-center rounded-full border border-[var(--sc-hairline)] bg-white text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]";
  return (
    <div className={className}>
      <div ref={ref} className="sc-rail flex gap-4 overflow-x-auto pb-1" tabIndex={0}>
        {items.map((item, i) => (
          <TestimonialCard key={i} item={item} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btn} onClick={() => scroll(-1)} aria-label={t("showcase.rail.prev")}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </button>
        <button type="button" className={btn} onClick={() => scroll(1)} aria-label={t("showcase.rail.next")}>
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** A note on the red identity rail (not accepting, opening soon, availability unknown). */
export function RailNotice({
  icon: Icon,
  title,
  children,
  testId,
  role,
}: {
  icon: typeof Clock;
  title: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} data-testid={testId} className="mt-8 rounded-[12px] bg-black/25 p-4 text-[14px] leading-[22px] text-white">
      <p className="flex items-center gap-2 font-bold">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {title}
      </p>
      {children && <div className="mt-2 space-y-3 text-white/90">{children}</div>}
    </div>
  );
}

const railButton =
  "inline-flex h-11 items-center gap-2 rounded-[8px] px-4 text-[14px] font-bold transition-colors duration-fast";

export default function FeaturedMentorProfile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { base, state, retry, isFetching } = useFeaturedPageMentor(params.id);
  // App.tsx only routes curated ids here; anything else is the standard profile.
  if (!base || !state) return null;

  const mentor = state.mentor;
  const name = pickLang(lang, mentor.name, mentor.name_ar);
  const headline = pickLang(lang, mentor.headline, mentor.headline_ar);
  const bio = pickLang(lang, mentor.bio, mentor.bio_ar);
  const sessionTitle = pickLang(lang, mentor.session.title, mentor.session.title_ar);
  const bookHref = `/mentor/${mentor.id}/book`;
  // The per-browser "request sent" memory; a signed-in viewer only sees one sent from their own address.
  const sent = sentMemoryForViewer(getSentRequest(state.requestId), user?.email);
  const similarHref = discoveryUrl({ expertise: mentor.expertise?.[0] ? [mentor.expertise[0]] : [] });

  const ratingCount = Number(mentor.total_ratings ?? 0);
  const ratingValue = Number.parseFloat(String(mentor.average_rating ?? ""));
  const ratingLine = state.showShowcaseProof ? (
    mentor.ratings > 0 ? (
      <>
        <strong className="font-bold">{mentor.rating}</strong> · {t("showcase.profile.ratings", { count: mentor.ratings })} ·{" "}
        <strong className="font-bold">{mentor.bookings}</strong> {t("showcase.profile.sessions")}
      </>
    ) : (
      t("showcase.profile.newMentor")
    )
  ) : state.kind === "db" ? (
    // Only a real row has ratings; loading, not-seeded and error states show none (D14).
    ratingCount > 0 && Number.isFinite(ratingValue) ? (
      <>
        <strong className="font-bold" dir="ltr">
          {formatNumber(ratingValue, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </strong>{" "}
        · {t("mentorProfile.ratings", { count: ratingCount })}
      </>
    ) : (
      t("showcase.profile.noRatings")
    )
  ) : null;

  const bookable = state.bookable;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--sc-sand)] lg:flex-row" data-page-state={state.kind}>
      {/* Identity rail */}
      <aside className="bg-[var(--sc-red)] px-6 py-8 text-white lg:w-[410px] lg:shrink-0 lg:px-8 lg:py-10">
        <Link href={lastDiscoveryHref()} className="inline-flex items-center gap-2 text-[14px] text-white/85 hover:text-white" data-testid="link-back">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("mentorProfile.backToMentors")}
        </Link>
        <div className="relative mt-8 size-[120px]">
          {mentor.photo_url ? (
            <img src={mentor.photo_url} alt="" className="size-full rounded-full border-4 border-white object-cover" />
          ) : (
            <span className="inline-flex size-full items-center justify-center rounded-full border-4 border-white bg-[var(--sc-ink)] text-[40px] font-bold text-white" aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
          <span className="absolute -bottom-1 end-1 inline-flex size-8 items-center justify-center rounded-full bg-[#f5a623] text-white ring-2 ring-[var(--sc-red)]" title={t("showcase.profile.verified")}>
            <BadgeCheck className="size-5" aria-hidden="true" />
            <span className="sr-only">{t("showcase.profile.verified")}</span>
          </span>
        </div>
        <h1 id="page-title" tabIndex={-1} className="mt-6 text-[26px] font-bold leading-tight">
          <bdi>{name}</bdi>
        </h1>
        <p className="mt-2 text-[15px] leading-[22px] text-white/90">
          {headline}
          {mentor.country ? ` | ${localizeCountry(mentor.country, lang)}` : ""}
        </p>
        {ratingLine && (
          <p className="mt-5 text-[13px] leading-[22px] text-white/90" data-testid="featured-rating-line">
            {ratingLine}
          </p>
        )}
        {/* Tangible facts only: what the mentor speaks, where they are, whether they accept requests. */}
        <ul className="mt-5 flex flex-wrap items-center gap-2" aria-label={t("showcase.profile.facts")}>
          <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold">
            <Languages className="size-3.5" aria-hidden="true" />
            {mentor.languages_spoken.map((l) => languageName(l, lang)).join(" · ")}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold">
            <Globe className="size-3.5" aria-hidden="true" />
            <span dir="ltr">
              {mentor.timezone.replace(/_/g, " ")} · {utcOffsetLabel(mentor.timezone)}
            </span>
          </li>
          {state.accepting && (
            <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold" data-testid="fact-accepting">
              <Clock className="size-3.5" aria-hidden="true" />
              {t("mentorCard.accepting")}
            </li>
          )}
        </ul>

        {sent && (state.kind === "db" || state.kind === "local") && (
          <p className="mt-6 flex items-start gap-2 text-[13px] leading-[20px] text-white" data-testid="featured-request-sent" role="status">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">{t("bookingRequest.status.sent")}</strong>
              {" · "}
              <Trans
                i18nKey="bookingRequest.status.sentFrom"
                values={{ when: formatRelativeDay(sent.sentAt, lang), email: sent.email }}
                components={{ email: <bdi dir="ltr" /> }}
              />
            </span>
          </p>
        )}

        {state.kind === "static" && (
          <RailNotice icon={Hourglass} title={t("showcase.profile.openingSoonTitle")} testId="featured-opening-soon" role="status">
            <p>{t("showcase.profile.openingSoonBody", { name: bidi(name) })}</p>
          </RailNotice>
        )}
        {state.kind === "db" && !state.accepting && (
          <RailNotice icon={Clock} title={t("mentorProfile.notAcceptingShort")} testId="mentor-unavailable">
            <p>
              <Trans i18nKey="mentorProfile.notAcceptingBody" values={{ name }} components={{ name: <bdi /> }} />
            </p>
            <Link href={similarHref} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4 hover:text-white">
              {t("mentorProfile.findSimilar")}
            </Link>
          </RailNotice>
        )}
        {state.kind === "error" && (
          <RailNotice icon={CircleAlert} title={t("showcase.profile.checkError")} testId="featured-check-error" role="alert">
            <button
              type="button"
              onClick={retry}
              disabled={isFetching}
              aria-busy={isFetching || undefined}
              className={cn(railButton, "bg-white text-[var(--sc-ink)] hover:bg-[var(--sc-peach)] disabled:opacity-70")}
              data-testid="button-retry-availability"
            >
              {t("common.tryAgain")}
            </button>
          </RailNotice>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          {bookable ? (
            <Link href={bookHref} data-testid="link-book-session-rail" className={cn(railButton, "bg-white text-[var(--sc-ink)] hover:bg-[var(--sc-peach)]")}>
              <CalendarCheck className="size-4" aria-hidden="true" />
              {t("showcase.profile.book", { minutes: mentor.session.minutes })}
            </Link>
          ) : state.kind === "loading" ? (
            <span role="status" className="inline-flex items-center" data-testid="featured-checking">
              <span className="sr-only">{t("showcase.profile.checking")}</span>
              <Skeleton className="h-11 w-44 rounded-[8px] bg-white/30" />
            </span>
          ) : state.kind === "error" ? (
            <button type="button" disabled aria-disabled="true" className={cn(railButton, "cursor-not-allowed bg-white/40 text-[var(--sc-ink)]")} data-testid="button-book-disabled">
              <CalendarCheck className="size-4" aria-hidden="true" />
              {t("showcase.profile.book", { minutes: mentor.session.minutes })}
            </button>
          ) : null}
          {state.canFavorite && (
            <FavoriteButton
              mentorId={state.requestId}
              mentorName={name}
              className="border-white/60 bg-transparent text-white hover:bg-white/10 aria-pressed:bg-white aria-pressed:text-[#d5534d]"
            />
          )}
          {mentor.linkedin && (
            <a
              href={mentor.linkedin}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/60 px-4 text-[14px] font-semibold text-white hover:bg-white/10"
            >
              <Linkedin className="size-4" aria-hidden="true" />
              LinkedIn
            </a>
          )}
        </div>
      </aside>

      {/* Content column */}
      <div className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-[60px] lg:py-6">
        {/* The one service card — the artifact this page exists to book. */}
        {bookable ? (
          <Link
            href={bookHref}
            data-testid="link-book-session"
            className="block max-w-[440px] overflow-hidden rounded-[12px] border border-[var(--sc-hairline)] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.05)] transition-transform duration-fast hover:-translate-y-0.5"
          >
            <ServiceCardBody title={sessionTitle} minutes={mentor.session.minutes} action />
          </Link>
        ) : (
          <div className="max-w-[440px] overflow-hidden rounded-[12px] border border-[var(--sc-hairline)] bg-white" data-testid="service-card-static">
            <ServiceCardBody title={sessionTitle} minutes={mentor.session.minutes} />
          </div>
        )}

        <section aria-labelledby="about-title" className="mt-12 max-w-[900px]">
          <h2 id="about-title" className="text-[26px] font-bold text-[var(--sc-ink)]">
            {t("showcase.profile.about")}
          </h2>
          <p className="mt-6 text-[16px] leading-[28px] text-[var(--sc-ink)] text-pretty">{bio}</p>
        </section>

        {state.showShowcaseProof && mentor.testimonials.length > 0 && (
          <section aria-labelledby="ft-title" className="mt-12 max-w-[900px]">
            <h2 id="ft-title" className="text-[26px] font-bold text-[var(--sc-ink)]">
              {t("showcase.profile.testimonialsTitle")}
            </h2>
            <TestimonialRail items={mentor.testimonials} className="mt-6" />
          </section>
        )}

        {mentor.faq.length > 0 && (
          <section aria-labelledby="faq-title" className="mt-12 max-w-[900px]">
            <h2 id="faq-title" className="text-[26px] font-bold text-[var(--sc-ink)]">
              {t("landing.faq.title")}
            </h2>
            <Accordion type="single" collapsible className="mt-6 flex flex-col gap-3">
              {mentor.faq.map((f, i) => (
                <AccordionItem key={i} value={`q${i}`} className="rounded-[12px] border border-[var(--sc-hairline)] bg-white px-4 last:border-b">
                  <AccordionTrigger className="py-4 text-[15px] font-bold text-[var(--sc-ink)]">{pickLang(lang, f.q, f.q_ar)}</AccordionTrigger>
                  <AccordionContent className="text-[14px] leading-[22px] text-[var(--sc-ink-soft)]">{pickLang(lang, f.a, f.a_ar)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        <p className="mt-12 border-t border-[var(--sc-hairline)] pt-6 text-[12px] text-[#6c6c84]">
          <Link href="/legal" className="underline underline-offset-4 hover:text-[var(--sc-ink)]">
            {t("showcase.legal.terms")}
          </Link>{" "}
          |{" "}
          <Link href="/legal#privacy" className="underline underline-offset-4 hover:text-[var(--sc-ink)]">
            {t("showcase.legal.privacy")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function ServiceCardBody({ title, minutes, action = false }: { title: string; minutes: number; action?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="bg-[var(--sc-sand)] p-5">
        <p className="text-[13px] text-[#6c6c84]">{t("showcase.profile.serviceKind")}</p>
        <p className="mt-1 text-[18px] font-bold leading-[24px] text-[var(--sc-ink)]">{title}</p>
      </div>
      <div className="flex items-center justify-between gap-3 p-5">
        <p className="text-[16px] font-bold text-[var(--sc-ink)]">
          {t("showcase.session.free")} · {t("showcase.rail.minutes", { minutes })}
        </p>
        {action && (
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--sc-ink)] text-white">
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );
}

