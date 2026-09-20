import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarDays, CheckSquare } from "lucide-react";

import { SessionScheduler } from "@/components/booking/SessionScheduler";
import { FEATURED_MENTORS, resolveShowcaseMentor } from "@/data/featuredMentors";
import { TestimonialRail, pickLang } from "@/pages/FeaturedMentorProfile";

/**
 * Session page `/mentor/:id/book` (Figma "Dubai Job Hunt" page): red canvas,
 * the offer card on the inline-start (tinted header, free + duration row,
 * who it is for, what you learn, testimonials) and the design's own
 * scheduling card — day chips, time slots, timezone, Continue — filled with
 * the mentor's details. Continue records the request locally and shows the
 * confirmation; once the mentor has a Cal.com link the same slot opens it.
 */
export default function FeaturedMentorSession() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useParams<{ id?: string }>();
  const mentor = resolveShowcaseMentor(params.id) ?? FEATURED_MENTORS[0];
  const s = mentor.session;
  const name = pickLang(lang, mentor.name, mentor.name_ar);
  const firstName = name.split(" ")[0];
  const title = pickLang(lang, s.title, s.title_ar);
  const intro = pickLang(lang, s.intro, s.intro_ar);
  const bio = pickLang(lang, mentor.bio, mentor.bio_ar);
  const forWho = pickLang(lang, s.forWho, s.forWho_ar);
  const learn = pickLang(lang, s.learn, s.learn_ar);

  return (
    <div className="bg-[var(--sc-red)] px-4 py-6 sm:px-6 lg:px-[105px] lg:py-12">
      <div className="mx-auto grid max-w-[1210px] gap-6 lg:grid-cols-[605fr_505fr] lg:items-start lg:gap-8">
        {/* Offer card */}
        <article className="overflow-hidden rounded-[24px] bg-white lg:rounded-[40px]">
          <header className="bg-[rgba(213,83,77,0.2)] px-6 pb-6 pt-6 lg:px-9 lg:pt-8">
            <Link href={`/mentor/${mentor.id}`} className="inline-flex items-center gap-4 text-[16px] text-[var(--sc-ink)]" data-testid="link-back">
              <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              {name}
            </Link>
            <div className="mt-8 flex items-start justify-between gap-6">
              <h1 id="page-title" tabIndex={-1} className="max-w-[420px] text-[26px] font-bold leading-[1.25] text-[var(--sc-ink)] lg:text-[32px]">
                {title}
              </h1>
              <img src={mentor.photo_url} alt="" className="size-[84px] shrink-0 rounded-full border-4 border-white object-cover lg:size-[104px]" />
            </div>
          </header>

          <div className="grid grid-cols-2 border-b border-[var(--sc-hairline)] text-[16px] text-[var(--sc-ink)]">
            <div className="flex h-16 items-center justify-center gap-2 border-e border-[var(--sc-hairline)] font-bold">
              {t("showcase.session.free")}
              <span className="text-[13px] font-normal text-[#5c5c5c]">{t("showcase.session.volunteer")}</span>
            </div>
            <div className="flex h-16 items-center justify-center gap-2">
              <CalendarDays className="size-5" strokeWidth={1.5} aria-hidden="true" />
              {t("showcase.rail.minutes", { minutes: s.minutes })}
            </div>
          </div>

          <div className="px-6 py-8 text-[16px] leading-[27px] text-[var(--sc-ink-soft)] lg:px-9">
            <p>
              {t("showcase.session.areYou")} <strong className="font-bold text-[var(--sc-ink)]">{title}</strong>?
            </p>
            <p className="mt-4">{intro}</p>

            <h2 className="mt-9 text-[16px] font-bold text-[var(--sc-ink)]">{t("showcase.session.who", { name: firstName })}</h2>
            <p className="mt-4">{bio}</p>

            <h2 className="mt-9 text-[16px] font-bold text-[var(--sc-ink)]">{t("showcase.session.forWho")}</h2>
            <ul className="mt-4 space-y-3">
              {forWho.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckSquare className="mt-1 size-4 shrink-0 text-[#1f9d55]" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>

            <h2 className="mt-9 text-[16px] font-bold text-[var(--sc-ink)]">{t("showcase.session.learn")}</h2>
            <ul className="mt-4 space-y-3">
              {learn.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckSquare className="mt-1 size-4 shrink-0 text-[#1f9d55]" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>

            {/* One real control: on phones the picker sits below the card, so this jumps to it. */}
            <a href="#when-title" className="mt-9 inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-5 text-[15px] font-bold text-white hover:bg-black lg:hidden">
              <CalendarDays className="size-4" aria-hidden="true" />
              {t("showcase.session.bookNow")}
            </a>

            <h2 className="mt-12 text-[24px] font-bold text-[var(--sc-ink)]">{t("showcase.session.testimonials")}</h2>
            <TestimonialRail items={mentor.testimonials} className="mt-5" />

            <p className="mt-10 text-[12px] text-[#6c6c84]">
              <Link href="/legal" className="underline underline-offset-4 hover:text-[var(--sc-ink)]">
                {t("showcase.legal.terms")}
              </Link>{" "}
              |{" "}
              <Link href="/legal#privacy" className="underline underline-offset-4 hover:text-[var(--sc-ink)]">
                {t("showcase.legal.privacy")}
              </Link>
            </p>
          </div>
        </article>

        {/* Scheduling card: the mentor's details + their Cal.com calendar inline (light) */}
        <aside className="rounded-[24px] bg-white p-5 lg:sticky lg:top-24 lg:rounded-[40px] lg:p-8" aria-labelledby="when-title">
          <SessionScheduler mentor={mentor} sessionTitle={title} name={name} />
        </aside>
      </div>
    </div>
  );
}
