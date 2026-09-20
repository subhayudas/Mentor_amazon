import * as React from "react";
import { Quote, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Auth page chrome shared by sign-in, sign-up, forgot and reset password
 * (Figma "Start your creator business today"): the form column sits on white
 * at the inline-start, anchored to the TOP so validation messages, strength
 * meters and error banners never move the form vertically (the old
 * vertically-centred card jumped every time its height changed); the
 * inline-end half is the peach testimonial wall, hidden below `lg`.
 */
export function AuthPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-h-[calc(100dvh-3.5rem)] bg-white lg:grid-cols-2", className)}>
      <div className="flex justify-center px-4 pb-16 pt-10 sm:px-8 md:pt-16 lg:justify-end lg:pe-[72px] lg:ps-8">{children}</div>
      <TestimonialWall />
    </div>
  );
}

const WALL_QUOTES = [1, 2, 3, 4, 5, 6] as const;

function TestimonialWall() {
  const { t } = useTranslation();
  const Card = ({ n }: { n: (typeof WALL_QUOTES)[number] }) => (
    <figure className="rounded-[24px] bg-white p-7 shadow-[0_2px_0_rgba(33,33,33,0.02)]">
      <Quote className="size-5 text-[#c9c9c9]" aria-hidden="true" />
      <blockquote className="mt-4 text-[18px] leading-[26px] text-[var(--sc-ink)]">{t(`showcase.auth.quotes.${n}.text`)}</blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[15px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
          {t(`showcase.auth.quotes.${n}.name`).slice(0, 1)}
        </span>
        <span>
          <span className="block text-[16px] font-semibold text-[var(--sc-ink)]">{t(`showcase.auth.quotes.${n}.name`)}</span>
          <span className="block text-[14px] text-[var(--sc-ink-soft)]">{t(`showcase.auth.quotes.${n}.role`)}</span>
        </span>
      </figcaption>
    </figure>
  );
  return (
    <aside className="sc-marquee-wrap relative hidden overflow-hidden bg-[var(--sc-peach)] lg:block" aria-hidden="true">
      <div className="sc-wall-fade absolute inset-0 grid grid-cols-2 gap-6 px-6">
        <div className="sc-marquee flex flex-col gap-6 pt-6">
          {[1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3].map((n, i) => (
            <Card key={i} n={n as 1} />
          ))}
        </div>
        <div className="sc-marquee-reverse flex flex-col gap-6 pt-6">
          {[4, 5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 6].map((n, i) => (
            <Card key={i} n={n as 4} />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function AuthCard({
  title,
  description,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className={cn("w-full max-w-[458px] text-card-foreground", className)} {...props}>
      <div className="mb-8">
        <h1 id="page-title" tabIndex={-1} className="text-[36px] font-bold leading-tight text-[var(--sc-ink)] md:text-[44px]">
          {title}
        </h1>
        {description && <p className="mt-3 text-[16px] text-[var(--sc-ink-soft)] text-pretty">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * A link inside a sentence of muted text: navy alone is 1.92:1 against the
 * muted sentence, so the underline is persistent (WCAG 1.4.1 / F73) and only
 * thickens on hover. Standalone links keep underline-on-hover.
 */
export const inlineLinkClass = "font-medium text-secondary underline decoration-1 underline-offset-4 transition-colors duration-fast hover:decoration-2";

/** Input with a decorative leading icon at the inline-start (logical, so it mirrors in Arabic). */
export const IconInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input> & { icon: LucideIcon; trailing?: React.ReactNode }>(
  function IconInput({ icon: Icon, trailing, className, ...props }, ref) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <Input ref={ref} className={cn("ps-10", trailing && "pe-11", className)} {...props} />
        {trailing && <div className="absolute end-1 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    );
  },
);

/** Four-step password strength from the same rules the zod schema enforces. */
export function passwordStrength(password: string): { score: number; label: "weak" | "fair" | "good" | "strong" } {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[a-z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (score <= 25) return { score, label: "weak" };
  if (score <= 50) return { score, label: "fair" };
  if (score <= 75) return { score, label: "good" };
  return { score, label: "strong" };
}

export const STRENGTH_CLASS: Record<"weak" | "fair" | "good" | "strong", string> = {
  weak: "[&>div]:bg-destructive",
  fair: "[&>div]:bg-warning-icon",
  good: "[&>div]:bg-secondary",
  strong: "[&>div]:bg-success",
};
