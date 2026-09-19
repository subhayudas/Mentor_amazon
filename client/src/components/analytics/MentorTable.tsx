import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UNAVAILABLE, formatHours, formatNumber } from "@/lib/format";
import { localizedName, type MentorPerformanceRow } from "@/lib/reporting";
import { cn } from "@/lib/utils";

interface MentorTableProps {
  rows: MentorPerformanceRow[];
  activeMentor: string | null;
  onSelect: (mentor: { id: string; label: string } | null) => void;
}

/**
 * The Mentors tab (spec §9 ranked table): mentors by completed sessions,
 * hours, average mentee rating and requests still awaiting a reply — the
 * "which mentors need support" view. Selecting a mentor lists their bookings.
 */
export function MentorTable({ rows, activeMentor, onSelect }: MentorTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState icon={Users} title={t("analyticsV2.mentors.empty")} role="status" />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="table-mentor-performance" aria-labelledby="mentor-table-title">
      <div className="border-b border-border px-4 py-3">
        <h2 id="mentor-table-title" className="text-h3 text-foreground">{t("analyticsV2.mentors.title")}</h2>
        <p className="mt-0.5 text-caption text-muted-foreground text-pretty">{t("analyticsV2.mentors.definition")}</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("analyticsV2.mentors.table.mentor")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.mentors.table.completed")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.mentors.table.hours")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.mentors.table.rating")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.mentors.table.pending")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.mentors.table.requests")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((mentor) => {
              const active = mentor.id === activeMentor;
              const name = mentor.name ? localizedName(mentor, lang) : t("analytics.unknown");
              return (
                <TableRow key={mentor.id} data-state={active ? "selected" : undefined} data-testid={`row-mentor-${mentor.id}`}>
                  <TableCell className="whitespace-nowrap font-medium">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(active ? null : { id: mentor.id, label: name })}
                      className={cn("rounded-sm text-start text-foreground underline-offset-4 transition-colors duration-fast hover:underline", active && "underline")}
                    >
                      <bdi>{name}</bdi>
                    </button>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(mentor.completed, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatHours(mentor.volunteerMinutes, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {mentor.avgRating === null ? (
                      <span aria-label={t("analyticsV2.mentors.noRating")}>{UNAVAILABLE}</span>
                    ) : (
                      formatNumber(mentor.avgRating, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(mentor.pending, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(mentor.requests, lang)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
