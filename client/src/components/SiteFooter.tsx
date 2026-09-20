import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, Linkedin } from "lucide-react";

import { AmazonLogo } from "@/components/AmazonSmile";
import { Container } from "@/components/layout/Container";
import { IS_LOCAL } from "@/lib/demo";
import { ROUTES } from "@/lib/routes";

/** Routes that carry their own chrome (dashboard shell, auth split-screen, session canvas) and no site footer. */
const NO_FOOTER = [/^\/dashboard(\/|$)/, /^\/analytics(\/|$)/, /^\/login$/, /^\/signup$/, /^\/forgot-password$/, /^\/reset-password$/, /^\/auth\//, /^\/admin(\/|$)/, /^\/mentor-portal(\/|$)/, /^\/mentee-dashboard(\/|$)/];

/**
 * Site footer (ink surface, showcase language): brand + one-line pitch and
 * a CTA, three link columns, then the legal row. Mounted once in the app
 * shell; hidden on routes that carry their own chrome.
 */
export function SiteFooter() {
  const { t } = useTranslation();
  const [location] = useLocation();
  if (NO_FOOTER.some((re) => re.test(location))) return null;
  const year = new Date().getFullYear();
  const col = "flex flex-col gap-3 text-[15px] text-white/75";
  const link = "inline-flex min-h-6 items-center transition-colors duration-fast hover:text-white";

  return (
    <footer className="bg-[var(--sc-ink)] text-white" data-surface="dark">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:py-20">
        <div className="max-w-[360px]">
          <span className="inline-flex items-center gap-2.5">
            <AmazonLogo size="md" onDark />
            <span className="text-[19px] font-bold">MentorConnect</span>
          </span>
          <p className="mt-4 text-[15px] leading-[24px] text-white/75">{t("showcase.footer.pitch")}</p>
          <Link
            href={ROUTES.mentors}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-[12px] bg-white ps-4 pe-2 text-[15px] font-medium text-[var(--sc-ink)] transition-colors duration-fast hover:bg-[var(--sc-peach)]"
          >
            {t("showcase.hero.cta")}
            <span className="inline-flex size-7 items-center justify-center rounded-[6px] bg-[var(--sc-ink)] text-white">
              <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </span>
          </Link>
        </div>

        <nav aria-label={t("showcase.footer.product")} className={col}>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white">{t("showcase.footer.product")}</h2>
          <Link href={ROUTES.mentors} className={link}>
            {t("nav.mentors")}
          </Link>
          <Link href={ROUTES.mentorOnboarding} className={link}>
            {t("nav.becomeMentor")}
          </Link>
          <Link href={ROUTES.menteeRegistration} className={link}>
            {t("showcase.footer.joinAsMentee")}
          </Link>
          {IS_LOCAL && (
            <Link href="/dashboard" className={link}>
              {t("showcase.nav.dashboard")}
            </Link>
          )}
        </nav>

        <nav aria-label={t("showcase.footer.programme")} className={col}>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white">{t("showcase.footer.programme")}</h2>
          <Link href={`${ROUTES.home}#bento-title`} className={link}>
            {t("showcase.footer.howItWorks")}
          </Link>
          <Link href={`${ROUTES.home}#rail-title`} className={link}>
            {t("showcase.footer.meetMentors")}
          </Link>
          <Link href={ROUTES.login} className={link}>
            {t("nav.signIn")}
          </Link>
        </nav>

        <nav aria-label={t("showcase.footer.legal")} className={col}>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white">{t("showcase.footer.legal")}</h2>
          <Link href="/legal" className={link}>
            {t("showcase.legal.terms")}
          </Link>
          <Link href="/legal#privacy" className={link}>
            {t("showcase.legal.privacy")}
          </Link>
          <a href="https://www.linkedin.com/company/brinc-io" target="_blank" rel="noreferrer" className={`${link} gap-2`}>
            <Linkedin className="size-4" aria-hidden="true" />
            LinkedIn
          </a>
        </nav>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-[13px] text-white/60 md:flex-row md:items-center md:justify-between">
          <p>{t("landing.footer.programme")}</p>
          <p>{t("landing.footer.copyright", { year })}</p>
        </Container>
      </div>
    </footer>
  );
}
