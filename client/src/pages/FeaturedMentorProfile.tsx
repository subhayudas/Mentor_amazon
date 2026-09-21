import * as React from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarCheck, Clock, Globe, Languages, Quote, Linkedin } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FEATURED_MENTORS, resolveShowcaseMentor, type FeaturedMentor } from "@/data/featuredMentors";
import { lastDiscoveryHref } from "@/lib/urlState";
import { FavoriteButton } from "@/components/FavoriteButton";
import { utcOffsetLabel } from "@/lib/timezones";
import { cn } from "@/lib/utils";

/**
 * Featured mentor profile `/mentor/:id` (Figma "Ajay Shenoy" page): red
 * identity rail on the inline-start, sand content column with the
 * testimonial carousel, the one 1:1 service card (→ the session page with
 * the Cal.com embed), About, FAQ. Only curated mentors render here; DB
 * mentors keep the standard profile.
 */

export function pickLang<T>(lang: string, en: T, ar: T | undefined): T {
  return lang === "ar" && ar !== undefined ? ar : en;
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

export default function FeaturedMentorProfile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useParams<{ id?: string }>();
  const mentor = resolveShowcaseMentor(params.id) ?? FEATURED_MENTORS[0];
  const name = pickLang(lang, mentor.name, mentor.name_ar);
  const headline = pickLang(lang, mentor.headline, mentor.headline_ar);
  const bio = pickLang(lang, mentor.bio, mentor.bio_ar);
  const sessionTitle = pickLang(lang, mentor.session.title, mentor.session.title_ar);
  const bookHref = `/mentor/${mentor.id}/book`;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--sc-sand)] lg:flex-row">
      {/* Identity rail */}
      <aside className="bg-[var(--sc-red)] px-6 py-8 text-white lg:w-[410px] lg:shrink-0 lg:px-8 lg:py-10">
        <Link href={lastDiscoveryHref()} className="inline-flex items-center gap-2 text-[14px] text-white/85 hover:text-white" data-testid="link-back">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("mentorProfile.backToMentors")}
        </Link>
        <div className="relative mt-8 size-[120px]">
          <img src={mentor.photo_url} alt="" className="size-full rounded-full border-4 border-white object-cover" />
          <span className="absolute -bottom-1 end-1 inline-flex size-8 items-center justify-center rounded-full bg-[#f5a623] text-white ring-2 ring-[var(--sc-red)]" title={t("showcase.profile.verified")}>
            <BadgeCheck className="size-5" aria-hidden="true" />
            <span className="sr-only">{t("showcase.profile.verified")}</span>
          </span>
        </div>
        <h1 id="page-title" tabIndex={-1} className="mt-6 text-[26px] font-bold leading-tight">
          {name}
        </h1>
        <p className="mt-2 text-[15px] leading-[22px] text-white/90">
          {headline} | {mentor.country}
        </p>
        <p className="mt-5 text-[13px] leading-[22px] text-white/90">
          {mentor.ratings > 0 ? (
            <>
              <strong className="font-bold">{mentor.rating}</strong> · {t("showcase.profile.ratings", { count: mentor.ratings })} ·{" "}
              <strong className="font-bold">{mentor.bookings}</strong> {t("showcase.profile.sessions")}
            </>
          ) : (
            t("showcase.profile.newMentor")
          )}
        </p>
        {/* Tangible facts only: what the mentor speaks, where they are, whether they accept requests. */}
        <ul className="mt-5 flex flex-wrap items-center gap-2" aria-label={t("showcase.profile.facts")}>
          <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold">
            <Languages className="size-3.5" aria-hidden="true" />
            {mentor.languages_spoken.join(" · ")}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold">
            <Globe className="size-3.5" aria-hidden="true" />
            {mentor.timezone.replace(/_/g, " ")} · {utcOffsetLabel(mentor.timezone)}
          </li>
          {mentor.is_available && (
            <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold">
              <Clock className="size-3.5" aria-hidden="true" />
              {t("mentorCard.accepting")}
            </li>
          )}
        </ul>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href={bookHref}
            data-testid="link-book-session-rail"
            className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-white px-4 text-[14px] font-bold text-[var(--sc-ink)] hover:bg-[var(--sc-peach)]"
          >
            <CalendarCheck className="size-4" aria-hidden="true" />
            {t("showcase.profile.book", { minutes: mentor.session.minutes })}
          </Link>
          <FavoriteButton mentorId={mentor.id} mentorName={name} className="border-white/60 bg-transparent text-white hover:bg-white/10 aria-pressed:bg-white aria-pressed:text-[#d5534d]" />
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
        <Link
          href={bookHref}
          data-testid="link-book-session"
          className="block max-w-[440px] overflow-hidden rounded-[12px] border border-[var(--sc-hairline)] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.05)] transition-transform duration-fast hover:-translate-y-0.5"
        >
          <div className="bg-[var(--sc-sand)] p-5">
            <p className="text-[13px] text-[#6c6c84]">{t("showcase.profile.serviceKind")}</p>
            <p className="mt-1 text-[18px] font-bold leading-[24px] text-[var(--sc-ink)]">{sessionTitle}</p>
          </div>
          <div className="flex items-center justify-between gap-3 p-5">
            <p className="text-[16px] font-bold text-[var(--sc-ink)]">
              {t("showcase.session.free")} · {t("showcase.rail.minutes", { minutes: mentor.session.minutes })}
            </p>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--sc-ink)] text-white">
              <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </span>
          </div>
        </Link>

        <section aria-labelledby="about-title" className="mt-12 max-w-[900px]">
          <h2 id="about-title" className="text-[26px] font-bold text-[var(--sc-ink)]">
            {t("showcase.profile.about")}
          </h2>
          <p className="mt-6 text-[16px] leading-[28px] text-[var(--sc-ink)] text-pretty">{bio}</p>
        </section>

        {mentor.testimonials.length > 0 && (
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
                <AccordionTrigger className="py-4 text-[15px] font-bold text-[var(--sc-ink)]">{f.q}</AccordionTrigger>
                <AccordionContent className="text-[14px] leading-[22px] text-[var(--sc-ink-soft)]">{f.a}</AccordionContent>
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
