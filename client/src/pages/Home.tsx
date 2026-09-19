import * as React from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AmazonLogo } from "@/components/AmazonSmile";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExampleChips, ExampleChipsSkeleton } from "@/components/discovery/ExampleChips";
import { HowItHappens } from "@/components/discovery/HowItHappens";
import { MentorPreview } from "@/components/discovery/MentorPreview";
import { NeedsList } from "@/components/discovery/NeedsList";
import { SearchIntent } from "@/components/discovery/SearchIntent";
import { useIsPhone } from "@/components/discovery/useMediaQuery";
import { useMentors } from "@/components/discovery/useMentors";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { EXAMPLE_CHIP_LIMIT, topTags, trustStats } from "@/lib/discovery";
import { ROUTES, discoveryUrl } from "@/lib/routes";

/**
 * Landing `/` (spec §5 as amended by P0-6/C1/C2, P0-7, P1-13, P1-14, P1-16,
 * P2-8, C19). Sections, in order: hero (search is the primary action; the
 * request-rail card is the product artifact) → "Mentors you can talk to" →
 * "What people come with" → FAQ → final CTA band → compact footer.
 *
 * The page sits on `--background`; only the CTA band changes surface. The
 * hero search submit is the ONE orange fill above the fold, the CTA band
 * button the one below it. Every number on the page is computed from the
 * `mentors_public` list; nothing is invented, nothing renders as `0` before
 * data arrives.
 *
 * Phones get a separate composition (P0-7): three example chips on one line,
 * no visible submit, a snap scroller of four compact cards, the rail card
 * after the preview, needs as a 2 x 3 text grid.
 */
const FAQ_KEYS = ["spam", "commitment", "matching", "cancel"] as const;

/** Reduced-motion aware, once-per-session hero fade (spec §2: one 200 ms opacity + 8px travel on first paint). */
let heroPlayed = false;
function useHeroEnter(ref: React.RefObject<HTMLElement>) {
  // Layout effect: the first keyframe applies before the first paint, so the
  // hero never flashes at full opacity before fading in.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || heroPlayed || typeof el.animate !== "function") return;
    heroPlayed = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "none" },
    );
  }, [ref]);
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [, navigate] = useLocation();
  const isPhone = useIsPhone();
  const heroRef = React.useRef<HTMLDivElement>(null);
  useHeroEnter(heroRef);

  const mentorsQuery = useMentors();
  const mentors = mentorsQuery.data;
  const [query, setQuery] = React.useState("");

  const stats = React.useMemo(() => (mentors ? trustStats(mentors) : null), [mentors]);
  const exampleTags = React.useMemo(
    () => (mentors ? topTags(mentors, "expertise", EXAMPLE_CHIP_LIMIT, lang) : []),
    [mentors, lang],
  );

  const trustLine = stats
    ? [
        t("landing.trust.mentors", { count: stats.mentors }),
        stats.languages > 0 ? t("landing.trust.languages", { count: stats.languages }) : "",
        stats.countries > 0 ? t("landing.trust.countries", { count: stats.countries }) : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const year = new Date().getFullYear();
  const faqId = React.useId();
  const ctaId = React.useId();

  return (
    <div className="flex flex-col">
      {/* ===== Hero ===== */}
      <section aria-labelledby="page-title" className="pb-6 pt-6 md:pb-12 md:pt-14">
        <Container className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-12">
          <div ref={heroRef} className="hero-enter">
            <PageHeader
              size="display"
              className="py-0 md:py-0"
              eyebrow={t("landing.hero.eyebrow")}
              title={t("landing.hero.title")}
              description={t("landing.hero.lede")}
            >
              <div className="mt-6 max-w-2xl">
                <SearchIntent
                  id="hero-search"
                  size="lg"
                  value={query}
                  onChange={setQuery}
                  onSubmit={(value) => navigate(discoveryUrl({ q: value }))}
                  label={t("landing.hero.searchLabel")}
                  placeholder={t("landing.hero.searchPlaceholder")}
                  submitLabel={isPhone ? undefined : t("landing.hero.search")}
                  primaryAction
                  chips={
                    exampleTags.length > 0 ? (
                      <ExampleChips tags={exampleTags} label={t("landing.hero.examples")} />
                    ) : mentorsQuery.isLoading ? (
                      <ExampleChipsSkeleton />
                    ) : undefined
                  }
                />
              </div>
              <p className="mt-3 min-h-5 text-caption text-muted-foreground tabular-nums" data-testid="text-trust-line">
                {trustLine}
              </p>
              <p className="mt-3 flex min-h-6 flex-wrap items-center gap-x-5 gap-y-1 text-body-sm">
                <Link
                  href={ROUTES.mentors}
                  className="inline-flex min-h-6 items-center gap-1 font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:underline"
                  data-testid="link-browse-all"
                >
                  {stats ? t("landing.hero.browseAll", { count: stats.mentors }) : t("landing.hero.browseAllNoCount")}
                  <ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} aria-hidden="true" />
                </Link>
                {isPhone && (
                  <a
                    href="#how-it-works"
                    className="inline-flex min-h-6 items-center text-muted-foreground underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline"
                  >
                    {t("landing.hero.howItWorks")}
                  </a>
                )}
              </p>
            </PageHeader>
          </div>
          {!isPhone && <HowItHappens className="mt-10 lg:mt-0" />}
        </Container>
      </section>

      {/* ===== Mentors you can talk to ===== */}
      <Container className="py-6 md:py-14">
        <MentorPreview
          mentors={mentors}
          isLoading={mentorsQuery.isLoading}
          isError={mentorsQuery.isError && !mentors}
          isFetching={mentorsQuery.isFetching}
          onRetry={() => void mentorsQuery.refetch()}
          isPhone={isPhone}
        />
      </Container>

      {/* ===== Request rail (phones: after the preview, as a vertical list) ===== */}
      {isPhone && (
        <Container className="pb-6">
          <HowItHappens size="sm" />
        </Container>
      )}

      {/* ===== What people come with (renders nothing, padding included, under 3 rows) ===== */}
      <NeedsList mentors={mentors} isLoading={mentorsQuery.isLoading} className="py-6 md:py-14" />

      {/* ===== FAQ ===== */}
      <section aria-labelledby={faqId}>
        <Container className="py-6 md:py-14">
          <h2 id={faqId} className="text-h2-sm text-foreground md:text-h2">
            {t("landing.faq.title")}
          </h2>
          <Accordion type="single" collapsible className="mt-4 max-w-3xl rounded-lg border border-border bg-card px-4 md:mt-6 md:px-6">
            {FAQ_KEYS.map((key, index) => (
              <AccordionItem key={key} value={key} className={index === FAQ_KEYS.length - 1 ? "border-b-0" : undefined}>
                <AccordionTrigger className="py-3 text-body md:py-4">{t(`landing.faq.${key}Question`)}</AccordionTrigger>
                <AccordionContent className="max-w-prose text-body-sm text-muted-foreground text-pretty">
                  {t(`landing.faq.${key}Answer`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </section>

      {/* ===== Final CTA band (the only surface change on the page) ===== */}
      <section aria-labelledby={ctaId} data-surface="dark" className="bg-secondary text-secondary-foreground">
        <Container className="flex flex-col gap-5 py-10 md:flex-row md:items-center md:justify-between md:py-16">
          <div className="min-w-0">
            <h2 id={ctaId} className="text-h2-sm md:text-h2">
              {t("landing.cta.title")}
            </h2>
            <p className="mt-2 max-w-prose text-body text-secondary-foreground/80 text-pretty">{t("landing.cta.body")}</p>
          </div>
          <Button asChild variant="primary" size="lg" className="shrink-0 md:self-center">
            <Link href={ROUTES.mentors} data-testid="link-cta-browse">
              {t("landing.cta.button")}
            </Link>
          </Button>
        </Container>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-border bg-background">
        <Container className="flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between md:py-8">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
            <span className="inline-flex items-center gap-2">
              <AmazonLogo size="sm" />
              <span className="font-medium text-foreground">MentorConnect</span>
            </span>
            <span className="hidden text-muted-foreground md:inline" aria-hidden="true">
              ·
            </span>
            <span className="basis-full text-muted-foreground md:basis-auto">{t("landing.footer.programme")}</span>
          </div>
          <nav aria-label={t("landing.footer.nav")}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
              <li>
                <Link href={ROUTES.mentors} className="inline-flex min-h-6 items-center text-foreground underline-offset-4 hover:underline">
                  {t("nav.mentors")}
                </Link>
              </li>
              <li>
                <Link
                  href={ROUTES.mentorOnboarding}
                  className="inline-flex min-h-6 items-center text-foreground underline-offset-4 hover:underline"
                >
                  {t("nav.becomeMentor")}
                </Link>
              </li>
              <li>
                <Link href={ROUTES.login} className="inline-flex min-h-6 items-center text-foreground underline-offset-4 hover:underline">
                  {t("nav.signIn")}
                </Link>
              </li>
            </ul>
          </nav>
          <p className="text-caption text-muted-foreground">{t("landing.footer.copyright", { year })}</p>
        </Container>
      </footer>
    </div>
  );
}
