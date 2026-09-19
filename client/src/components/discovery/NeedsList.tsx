import * as React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicMentor } from "@/lib/database";
import { countMatching } from "@/lib/discovery";
import { discoveryUrl } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * "What people come with" (P1-14): a typographic two-column list, not cards.
 * Each row is ONE link to `/mentors?q=<real search term>`; the count is
 * computed with the same `matchesQuery` the results page uses, so the number
 * a visitor clicks is the number they get. Rows with zero matches are
 * omitted once data resolves; with fewer than three rows the whole section
 * is omitted. Skeleton rows hold the geometry until then. On phones the
 * term line is dropped and the list is ONE column of one-line rows — label,
 * count and arrow on the same baseline (F-23): six short rows are shorter
 * than a ragged 2 x 3 grid whose labels wrap to two and three lines.
 */
const NEED_KEYS = ["careers", "interviews", "leadership", "product", "cloud", "founders"] as const;

export interface NeedsListProps {
  mentors: PublicMentor[] | undefined;
  isLoading: boolean;
  className?: string;
}

export function NeedsList({ mentors, isLoading, className }: NeedsListProps) {
  const { t, i18n } = useTranslation();
  const titleId = React.useId();

  const rows = React.useMemo(() => {
    if (!mentors) return [];
    return NEED_KEYS.map((key) => {
      const term = t(`landing.needs.items.${key}.term`);
      return { key, label: t(`landing.needs.items.${key}.label`), term, count: countMatching(mentors, term) };
    }).filter((row) => row.count > 0);
    // `i18n.language` re-runs the terms when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentors, t, i18n.language]);

  if (!isLoading && rows.length < 3) return null;

  return (
    <Container as="section" aria-labelledby={titleId} className={className}>
      <h2 id={titleId} className="text-h2-sm text-foreground md:text-h2">
        {t("landing.needs.title")}
      </h2>
      <p className="mt-2 hidden max-w-prose text-body text-muted-foreground text-pretty md:block">{t("landing.needs.description")}</p>
      {isLoading ? (
        <ul role="status" aria-busy="true" className="mt-4 grid grid-cols-1 md:mt-6 md:grid-cols-2 md:gap-x-12">
          <li className="sr-only">{t("common.loading")}</li>
          {NEED_KEYS.map((key) => (
            <li key={key} className="flex min-h-11 items-center gap-4 border-b border-border py-2.5 md:min-h-[5.5rem] md:py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="hidden h-4 w-1/2 md:block" />
              </div>
              <Skeleton className="h-4 w-14 md:hidden" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 grid grid-cols-1 md:mt-6 md:grid-cols-2 md:gap-x-12">
          {rows.map((row) => (
            <li key={row.key} className="min-w-0 border-b border-border">
              <Link
                href={discoveryUrl({ q: row.term })}
                className="group flex min-h-11 items-center justify-between gap-3 rounded-md py-2.5 transition-colors duration-fast md:min-h-[5.5rem] md:gap-4 md:py-4"
                data-testid={`link-need-${row.key}`}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-base leading-snug text-foreground [font-weight:var(--heading-weight,600)]">{row.label}</h3>
                  <span className="mt-0.5 hidden text-body-sm text-muted-foreground md:block">{t("landing.needs.term", { term: row.term })}</span>
                </div>
                <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                  {t("landing.needs.count", { count: row.count })}
                </span>
                <ArrowRight
                  className={cn("size-4 shrink-0 text-muted-foreground transition-colors duration-fast group-hover:text-foreground rtl:-scale-x-100")}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
