import * as React from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowLeft, CalendarCheck, Star, Video, CalendarPlus, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AmazonLogo } from "@/components/AmazonSmile";
import { Container } from "@/components/layout/Container";
import { FEATURED_MENTORS, type FeaturedMentor } from "@/data/featuredMentors";
import { IS_LOCAL } from "@/lib/demo";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Landing `/` — the Figma "verosek explorations page 4" landing, content
 * swapped to MentorConnect: peach hero with the scrolling mentor wall, the
 * six-tile bento on grey, the orange "meet the mentors" rail of dark cards,
 * then the app footer. Every person shown is a curated featured mentor
 * (`data/featuredMentors.ts`); the wall and the rail link to their profiles.
 *
 * Against the database the sample social proof is not shown (design D14):
 * the hero's "4.9 average rating" / "1,000+ sessions booked" chips, the
 * bento's "2X" and "96%" figures with their 5/5 review pills, and the rail's
 * per-mentor session counts are demo-mode content only. The scheduling tile
 * says a request comes first and the time is picked once it is accepted (D4).
 */

function localizedHeadline(m: FeaturedMentor, lang: string) {
  return lang === "ar" ? m.headline_ar : m.headline;
}
function localizedName(m: FeaturedMentor, lang: string) {
  return lang === "ar" && m.name_ar ? m.name_ar : m.name;
}

/* ===================== Hero wall ===================== */

function WallCard({ mentor, lang }: { mentor: FeaturedMentor; lang: string }) {
  return (
    <Link
      href={`/mentor/${mentor.id}`}
      className="block w-[226px] shrink-0 rounded-[12px] bg-white p-[9px] shadow-[0_2px_4px_rgba(0,0,0,0.05)] outline-offset-4 transition-transform duration-fast hover:-translate-y-0.5"
    >
      <div className={cn("sc-duotone aspect-[210/120] rounded-[8px]", `sc-tint-${mentor.tint}`)}>
        <img src={mentor.photo_url} alt="" loading="lazy" />
        <span className="absolute bottom-2 end-2 z-[1] rounded-[24px] bg-black/55 px-3 py-1 text-[13px] font-medium text-white backdrop-blur">
          {mentor.chip}
        </span>
      </div>
      <p className="mt-3 truncate text-[18px] font-bold leading-[28px] text-[var(--sc-ink)]">{localizedName(mentor, lang)}</p>
      <p className="truncate text-[15px] font-medium leading-[24px] text-[var(--sc-ink-soft)]">{localizedHeadline(mentor, lang)}</p>
    </Link>
  );
}

function WallColumn({ mentors, reverse, lang }: { mentors: FeaturedMentor[]; reverse?: boolean; lang: string }) {
  // The list is rendered twice so the marquee loops seamlessly; the copy is decorative.
  return (
    <div className="h-full overflow-hidden">
      <div className={cn("flex flex-col gap-6", reverse ? "sc-marquee-reverse" : "sc-marquee")}>
        {mentors.map((m) => (
          <WallCard key={m.id} mentor={m} lang={lang} />
        ))}
        <div aria-hidden="true" className="flex flex-col gap-6">
          {mentors.map((m) => (
            <WallCard key={`${m.id}-copy`} mentor={m} lang={lang} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const colA = FEATURED_MENTORS;
  const colB = [...FEATURED_MENTORS.slice(2), ...FEATURED_MENTORS.slice(0, 2)];

  return (
    <section aria-labelledby="page-title" className="overflow-hidden bg-[var(--sc-peach)]">
      <Container className="relative flex min-h-[560px] flex-col justify-center py-12 lg:min-h-[732px] lg:py-0">
        <div className="max-w-[700px]">
          <h1
            id="page-title"
            tabIndex={-1}
            className="font-serif-display text-[44px] font-normal leading-[1] tracking-[-0.05em] text-[var(--sc-ink)] md:text-[68px]"
          >
            {t("showcase.hero.titleA")}
            <br />
            {t("showcase.hero.titleB")}
            <strong className="font-bold">{t("showcase.hero.titleBold")}</strong>
          </h1>
          <p className="mt-6 max-w-[640px] text-[18px] leading-[32px] text-[var(--sc-ink)] md:text-[22px]">{t("showcase.hero.lede")}</p>
          <div className="mt-10 flex flex-wrap items-start gap-6">
            <Link
              href={ROUTES.mentors}
              data-testid="link-hero-find"
              className="inline-flex h-[78px] items-center gap-4 rounded-[16px] bg-[var(--sc-ink)] px-6 text-[20px] font-medium text-white transition-transform duration-fast hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {t("showcase.hero.cta")}
              <span className="inline-flex size-10 items-center justify-center rounded-[8px] bg-white text-[var(--sc-ink)]">
                <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              </span>
            </Link>
            {IS_LOCAL && (
            <div className="flex flex-col gap-3" data-testid="hero-demo-proof">
              <div className="inline-flex h-[46px] items-center gap-2 rounded-[8px] border border-[#d9d9d9] bg-white/40 px-4 text-[16px] font-medium text-[var(--sc-ink)]">
                <span>{t("showcase.hero.rating")}</span>
                <span className="inline-flex items-center gap-0.5 text-[#f5a623]" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </span>
                <span>{t("showcase.hero.ratingLabel")}</span>
              </div>
              <div className="inline-flex h-[46px] items-center justify-center rounded-[8px] border border-[#d9d9d9] bg-white/40 px-4 text-[16px] font-medium text-[var(--sc-ink)]">
                {t("showcase.hero.sessions")}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Mentor wall: two counter-scrolling columns on desktop, one snap row on phones. */}
        <div className="sc-marquee-wrap sc-wall-fade absolute inset-y-0 end-0 hidden w-[490px] gap-6 lg:flex" aria-hidden="true">
          <WallColumn mentors={colA} lang={lang} />
          <WallColumn mentors={colB} reverse lang={lang} />
        </div>
        <div className="sc-rail -mx-4 mt-10 flex gap-4 overflow-x-auto px-4 lg:hidden">
          {FEATURED_MENTORS.map((m) => (
            <WallCard key={m.id} mentor={m} lang={lang} />
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ===================== Bento ===================== */

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[42px] items-center gap-2 rounded-[12px] bg-white px-4 text-[15px] font-semibold text-[var(--sc-ink)] shadow-[0_2px_4px_rgba(0,0,0,0.08)]", className)}>
      {children}
    </span>
  );
}

function Bento() {
  const { t } = useTranslation();
  const tile = "relative overflow-hidden rounded-[38px] p-8 min-h-[300px] flex flex-col";
  return (
    <section aria-labelledby="bento-title" className="bg-[var(--sc-grey)] py-16 md:pb-[140px] md:pt-[90px]">
      <Container>
        <h2 id="bento-title" className="text-center text-[36px] font-medium leading-[1.15] text-black md:text-[64px] md:leading-[84px]">
          <strong className="font-black">{t("showcase.bento.titleBold")}</strong> {t("showcase.bento.titleRest")}
        </h2>

        <div className="mt-12 grid gap-5 md:mt-[64px] md:grid-cols-12">
          {/* 1 — dedicated mentor ("2X" is sample showcase copy: demo mode only, D14) */}
          <div className={cn(tile, "bg-[var(--sc-tile-peach)] md:col-span-3")} data-testid="bento-dedicated">
            <ShoppingBag className="size-14 text-[var(--sc-ink)]" strokeWidth={1.5} aria-hidden="true" />
            <div className="mt-auto text-end">
              <p className="text-[56px] font-black leading-none text-[var(--sc-ink)]" dir="ltr">{IS_LOCAL ? "2X" : "1:1"}</p>
              <p className="mt-2 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                {t(IS_LOCAL ? "showcase.bento.t1a" : "showcase.bento.t1dbA")}
                <br />
                <strong className="font-bold">{t(IS_LOCAL ? "showcase.bento.t1b" : "showcase.bento.t1dbB")}</strong>
              </p>
            </div>
          </div>

          {/* 2 — rated sessions in demo mode; against the database there are no
              invented ratings or reviews (D14), so the tile says every request
              starts with the mentee's goal, with sample goals as decoration. */}
          <div className={cn(tile, "bg-[var(--sc-tile-lavender)] md:col-span-5")} data-testid="bento-proof">
            <div className="pointer-events-none absolute inset-x-6 top-8 space-y-4" aria-hidden="true">
              <div className="w-fit -rotate-6 rounded-full bg-white/60 py-2 pe-6 ps-3 text-[13px] text-[var(--sc-ink-soft)]">
                <span className="me-2 inline-block size-6 rounded-full bg-[var(--sc-tile-peach)] align-middle" />{" "}
                {IS_LOCAL ? <>5/5 “{t("showcase.bento.review1")}”</> : t("showcase.bento.goal1")}
              </div>
              <div className="ms-10 w-fit -rotate-6 rounded-full bg-white/60 py-2 pe-6 ps-3 text-[13px] text-[var(--sc-ink-soft)]">
                <span className="me-2 inline-block size-6 rounded-full bg-[var(--sc-tile-green)] align-middle" />{" "}
                {IS_LOCAL ? <>5/5 “{t("showcase.bento.review2")}”</> : t("showcase.bento.goal2")}
              </div>
            </div>
            <div className="mt-auto text-end">
              {IS_LOCAL ? (
                <>
                  <p className="text-[56px] font-black leading-none text-[var(--sc-ink)]">96%</p>
                  <p className="mt-2 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                    {t("showcase.bento.t2a")}
                    <br />
                    <strong className="font-bold">{t("showcase.bento.t2b")}</strong>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[44px] font-black leading-none text-[var(--sc-ink)] md:text-[52px]">{t("showcase.bento.t2dbBig")}</p>
                  <p className="mt-2 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                    {t("showcase.bento.t2dbA")}
                    <br />
                    <strong className="font-bold">{t("showcase.bento.t2dbB")}</strong>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 3 — across MENA */}
          <div className={cn(tile, "bg-[var(--sc-tile-green)] md:col-span-4")}>
            <div className="pointer-events-none absolute -end-16 -top-24 size-64 rounded-full bg-[#8cc152]/70" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -start-10 size-56 rounded-full bg-[#8cc152]/70" aria-hidden="true" />
            <div className="relative flex flex-col items-end gap-3">
              <Pill>🇦🇪 {t("showcase.bento.city1")}</Pill>
              <Pill className="me-24">🇸🇦 {t("showcase.bento.city2")}</Pill>
            </div>
            <div className="relative mt-auto text-end">
              <p className="text-[44px] font-black leading-none text-[var(--sc-ink)] md:text-[52px]">{t("showcase.bento.t3big")}</p>
              <p className="mt-2 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                {t("showcase.bento.t3a")} <strong className="font-bold">{t("showcase.bento.t3b")}</strong>
              </p>
            </div>
          </div>

          {/* 4 — scheduling: a request comes first, the time after it is accepted (D4) */}
          <div className={cn(tile, "bg-[var(--sc-tile-blue)] md:col-span-5")} data-testid="bento-scheduling">
            <div className="flex flex-col items-start gap-3">
              <Pill>
                <Video className="size-4" aria-hidden="true" /> {t("showcase.bento.meet")}
              </Pill>
              <Pill>
                <CalendarPlus className="size-4" aria-hidden="true" /> {t("showcase.bento.invite")}
              </Pill>
            </div>
            <div className="mt-auto">
              <p className="text-[36px] font-black leading-none text-[var(--sc-ink)] md:text-[44px]">{t("showcase.bento.t4requestBig")}</p>
              <p className="mt-3 max-w-[360px] text-[18px] leading-[26px] text-[var(--sc-ink)]">{t("showcase.bento.t4requestA")}</p>
            </div>
          </div>

          {/* 5 — free */}
          <div className={cn(tile, "bg-[var(--sc-tile-sand)] md:col-span-3")}>
            <CalendarCheck className="size-14 text-[#a8894e]" strokeWidth={1.5} aria-hidden="true" />
            <div className="mt-auto text-end">
              <p className="text-[56px] font-black leading-none text-[var(--sc-ink)]">100%</p>
              <p className="mt-2 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                {t("showcase.bento.t5a")}
                <br />
                <strong className="font-bold">{t("showcase.bento.t5b")}</strong>
              </p>
            </div>
          </div>

          {/* 6 — matched */}
          <div className={cn(tile, "bg-[var(--sc-tile-teal)] md:col-span-4")}>
            <div className="flex flex-col items-center gap-1 text-[14px] text-[var(--sc-ink)]" aria-hidden="true">
              <span className="rounded-[12px] bg-white px-4 py-2 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">{t("showcase.bento.you")}</span>
              <span className="h-5 w-px bg-[var(--sc-ink)]/40" />
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-[12px] bg-white/70 px-4 py-2 font-semibold">
                  <AmazonLogo size="sm" /> MentorConnect
                </span>
                <ArrowRight className="size-4 rtl:-scale-x-100" />
                <span className="rounded-[12px] bg-white px-4 py-2 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">{t("showcase.bento.yourSession")}</span>
              </div>
            </div>
            <div className="mt-auto text-end">
              <p className="text-[36px] font-black leading-none text-[var(--sc-ink)] md:text-[44px]">{t("showcase.bento.t6big")}</p>
              <p className="mt-3 text-[18px] leading-[26px] text-[var(--sc-ink)]">
                <strong className="font-bold">{t("showcase.bento.t6a")}</strong> {t("showcase.bento.t6b")}
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ===================== Mentor rail ===================== */

function RailCard({ mentor, lang }: { mentor: FeaturedMentor; lang: string }) {
  const { t } = useTranslation();
  const session = lang === "ar" ? mentor.session.title_ar : mentor.session.title;
  const subtitle = lang === "ar" ? mentor.session.subtitle_ar : mentor.session.subtitle;
  return (
    <article className="flex w-[300px] shrink-0 flex-col bg-[var(--sc-card-dark)] p-7 text-white md:w-[356px]">
      <h3 className="text-[22px] font-bold leading-[1.2] md:text-[25px]">{session}</h3>
      <p className="mt-3 text-[15.5px] leading-[23px] text-white/70">{subtitle}</p>
      <div className="mt-auto flex items-end justify-between gap-4 pt-10">
        <div className="flex flex-col items-start gap-2.5">
          {IS_LOCAL && (
            <span className="rounded-[4px] bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold">
              {t("showcase.rail.mentored", { total: mentor.bookings })}
            </span>
          )}
          <span className="rounded-[4px] border border-white/25 px-3 py-1.5 text-[12.5px] font-semibold">
            {t("showcase.rail.minutes", { minutes: mentor.session.minutes })}
          </span>
        </div>
        <div className="flex w-[145px] shrink-0 flex-col items-center">
          <img src={mentor.photo_url} alt="" className="h-[157px] w-[145px] rounded-[2px] object-cover" loading="lazy" />
          <p className="mt-3 text-center text-[14px] font-semibold">{localizedName(mentor, lang)}</p>
        </div>
      </div>
      <Link
        href={`/mentor/${mentor.id}`}
        className="mt-6 inline-flex h-[46px] items-center justify-center gap-2 bg-white text-[14px] font-bold text-[var(--sc-ink)] transition-colors duration-fast hover:bg-[var(--sc-peach)]"
        data-testid={`link-rail-${mentor.id}`}
      >
        {t("showcase.rail.view")}
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </Link>
    </article>
  );
}

function MentorRail() {
  const { t, i18n } = useTranslation();
  const railRef = React.useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const rtl = document.documentElement.dir === "rtl";
    el.scrollBy({ left: dir * (rtl ? -380 : 380), behavior: "smooth" });
  };
  const arrow = "inline-flex size-[46px] items-center justify-center bg-white text-[var(--sc-ink)] transition-colors duration-fast hover:bg-[var(--sc-peach)]";

  return (
    <section aria-labelledby="rail-title" className="overflow-hidden bg-[var(--sc-orange)] py-16 md:py-[84px]">
      <Container>
        <div className="flex items-end justify-between gap-6">
          <div className="max-w-[700px]">
            <h2 id="rail-title" className="font-serif-soft text-[36px] font-light leading-[1.1] text-[var(--sc-ink)] md:text-[56px]">
              {t("showcase.rail.title")}
            </h2>
            <p className="mt-5 text-[17px] text-[var(--sc-ink)]/80">{t("showcase.rail.lede")}</p>
          </div>
          <div className="hidden gap-1.5 md:flex">
            <button type="button" className={arrow} onClick={() => scrollBy(-1)} aria-label={t("showcase.rail.prev")}>
              <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
            <button type="button" className={arrow} onClick={() => scrollBy(1)} aria-label={t("showcase.rail.next")}>
              <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Container>
      <div className="mx-auto mt-10 w-full max-w-[1200px] px-4 sm:px-6 md:mt-12 lg:px-8">
        <div ref={railRef} className="sc-rail -mx-4 flex gap-6 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" tabIndex={0}>
          {FEATURED_MENTORS.map((m) => (
            <RailCard key={m.id} mentor={m} lang={i18n.language} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== Page ===================== */

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <Bento />
      <MentorRail />

    </div>
  );
}
