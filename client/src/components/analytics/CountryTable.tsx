import { useTranslation } from "react-i18next";
import { Globe, Info } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UNAVAILABLE, formatHours, formatNumber } from "@/lib/format";
import { NOT_SPECIFIED, localizeCountry, type CountryBreakdownRow } from "@/lib/reporting";
import { cn } from "@/lib/utils";

interface CountryTableProps {
  rows: CountryBreakdownRow[];
  activeCountry: string | null;
  onSelect: (country: string | null) => void;
}

/**
 * The Countries tab: every country with a request or a completed session in
 * the period, as a dense exact-value table (requests, completed sessions,
 * hours, mentors, mentees). A country name toggles the same drill the
 * overview chart uses.
 */
export function CountryTable({ rows, activeCountry, onSelect }: CountryTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState icon={Globe} title={t("analyticsV2.country.empty")} role="status" />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="table-country-breakdown" aria-labelledby="country-table-title">
      <div className="border-b border-border px-4 py-3">
        <h2 id="country-table-title" className="text-h3 text-foreground">{t("analyticsV2.country.tabTitle")}</h2>
        <p className="mt-0.5 text-caption text-muted-foreground text-pretty">{t("analyticsV2.country.tabDefinition")}</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("analyticsV2.country.table.country")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.country.table.requests")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.country.table.sessions")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.country.table.hours")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.country.table.mentors")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.country.table.mentees")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const active = row.country === activeCountry;
              const caveat = row.withoutDuration > 0 ? t("analyticsV2.tiles.withoutDuration", { count: row.withoutDuration }) : null;
              return (
                <TableRow
                  key={row.country}
                  data-state={active ? "selected" : undefined}
                  data-testid={`row-country-${row.country.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <TableCell className="whitespace-nowrap font-medium">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(active ? null : row.country)}
                      className={cn(
                        "rounded-sm text-start text-secondary underline decoration-border underline-offset-4 transition-colors duration-fast hover:decoration-secondary",
                        active && "decoration-secondary",
                      )}
                    >
                      {displayCountry(row.country)}
                    </button>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(row.requests, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(row.completed, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {row.completed > 0 && row.volunteerMinutes === 0 ? UNAVAILABLE : formatHours(row.volunteerMinutes, lang)}
                      {caveat && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="grid size-6 place-items-center rounded-sm text-muted-foreground" aria-label={caveat}>
                              <Info className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{caveat}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(row.uniqueMentors, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(row.uniqueMentees, lang)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
