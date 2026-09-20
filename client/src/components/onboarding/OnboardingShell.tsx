import * as React from "react";
import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";

/**
 * Onboarding chrome shared by the mentor and mentee forms (showcase
 * language): peach band with the serif title, the lede and the sections
 * the form walks through, then the white two-column body — the form and a
 * sticky "how it works" aside. The step chips are anchors that highlight
 * the section currently in view (position, not completion — nothing is
 * ticked until the form is submitted).
 */
export interface OnboardingStep {
  id: string;
  label: string;
}

export function OnboardingShell({
  eyebrow,
  title,
  description,
  steps,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  steps: OnboardingStep[];
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = steps.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const index = els.indexOf(visible[0].target as HTMLElement);
        if (index >= 0) setCurrent(index);
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [steps]);

  return (
    <div className="bg-white">
      <section className="bg-[var(--sc-peach)]">
        <Container className="pb-8 pt-10 md:pb-10 md:pt-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--sc-ink-soft)]">{eyebrow}</p>
          <h1 id="page-title" tabIndex={-1} className="font-serif-display mt-3 max-w-[760px] text-[40px] font-normal leading-[1] tracking-[-0.04em] text-[var(--sc-ink)] md:text-[60px]">
            {title}
          </h1>
          {description && <p className="mt-5 max-w-[640px] text-[17px] leading-[28px] text-[var(--sc-ink)] text-pretty">{description}</p>}
          <ol className="mt-8 flex flex-wrap gap-2" aria-label={t("showcase.onboarding.stepsLabel")}>
            {steps.map((s, i) => {
              const active = i === current;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-fast",
                      active ? "border-[var(--sc-ink)] bg-[var(--sc-ink)] text-white" : "border-[var(--sc-ink)]/25 bg-white/50 text-[var(--sc-ink)] hover:bg-white",
                    )}
                  >
                    <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold", active ? "bg-white text-[var(--sc-ink)]" : "bg-[var(--sc-ink)] text-white")} aria-hidden="true">
                      {i + 1}
                    </span>
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>
      <Container className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:py-12">
        <div className="min-w-0">{children}</div>
        {aside && <aside className="rounded-[16px] border border-[var(--sc-hairline)] bg-[var(--sc-sand)] p-6 lg:sticky lg:top-24">{aside}</aside>}
      </Container>
    </div>
  );
}

/** Section card used by the onboarding forms. */
export const onboardingSectionClass = "grid gap-4 rounded-[16px] border border-[var(--sc-hairline)] bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04)] md:p-7";
