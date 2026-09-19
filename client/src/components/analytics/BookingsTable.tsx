import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { UNAVAILABLE, formatDateTime, formatNumber } from "@/lib/format";
import { NOT_SPECIFIED, localizeCountry, localizedName, type BookingRow } from "@/lib/reporting";

interface BookingsTableProps {
  rows: BookingRow[];
  /** Rows beyond this are not rendered; the caller shows a "showing X of Y" line. */
  limit?: number;
  emptyText: string;
  testId?: string;
  /** Hidden for a mentee reading their own sessions (every row is theirs). */
  showMentee?: boolean;
  /** Hidden for a mentor reading their own sessions (every row is theirs). */
  showMentor?: boolean;
}

/**
 * Dense booking records: mentor, mentee, status (text + colour via
 * StatusBadge), localized dates, Intl-formatted duration, localized country.
 * Used by the Bookings tab and every drill-down.
 *
 * Below `md` (N-13) the same records are a list of two-line rows — names and
 * the status badge, then the dates, duration and country as one caption
 * line — instead of a seven-column table pushed into a sideways scroller.
 * From `md` the table's scroller is a named, keyboard-focusable region
 * whenever it actually overflows, with a visible hint under it.
 */
export function BookingsTable({ rows, limit, emptyText, testId = "bookings-table", showMentee = true, showMentor = true }: BookingsTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isPhone = useIsPhone();
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang));
  const duration = (minutes: number | undefined) =>
    typeof minutes === "number" ? formatNumber(minutes, lang, { style: "unit", unit: "minute", unitDisplay: "short" }) : UNAVAILABLE;
  const mentorName = (row: BookingRow) => (row.mentorName ? localizedName({ name: row.mentorName, nameAr: row.mentorNameAr }, lang) : t("analytics.unknown"));
  const menteeDetail = (row: BookingRow) =>
    row.menteeType === "organization" ? (
      <bdi>{row.menteeOrganization || t("menteeRegistration.organization")}</bdi>
    ) : row.menteeType === "individual" ? (
      t("menteeRegistration.individual")
    ) : (
      <bdi dir="ltr">{row.menteeEmail}</bdi>
    );

  // The scroller becomes a tab stop only while there is something to scroll.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || isPhone) {
      setScrollable(false);
      return;
    }
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPhone, visible.length, showMentee, showMentor, lang]);

  if (visible.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-body-sm text-muted-foreground" data-testid={`${testId}-empty`}>
        {emptyText}
      </p>
    );
  }

  if (isPhone) {
    return (
      <ul className="divide-y divide-border" data-testid={testId}>
        {visible.map((row) => (
          <li key={row.id} className="px-4 py-3" data-testid={`row-booking-${row.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 leading-snug">
                {showMentor && (
                  <p className="truncate font-medium text-foreground" data-testid={`text-mentor-${row.id}`}>
                    <bdi>{mentorName(row)}</bdi>
                  </p>
                )}
                {showMentee && (
                  <p className="truncate text-body-sm text-foreground" data-testid={`text-mentee-${row.id}`}>
                    <bdi>{row.menteeName || t("analytics.unknown")}</bdi>
                    <span className="text-muted-foreground">
                      <span aria-hidden="true"> · </span>
                      {menteeDetail(row)}
                    </span>
                  </p>
                )}
              </div>
              <span className="shrink-0" data-testid={`status-${row.id}`}>
                <StatusBadge status={row.status} hideIcon />
              </span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground tabular-nums">
              <span>{t("analyticsV2.bookings.row.requested", { when: formatDateTime(row.clickedAt, lang) })}</span>
              {row.scheduledAt && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>{t("analyticsV2.bookings.row.scheduled", { when: formatDateTime(row.scheduledAt, lang) })}</span>
                </>
              )}
              {typeof row.durationMinutes === "number" && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>{duration(row.durationMinutes)}</span>
                </>
              )}
              <span aria-hidden="true"> · </span>
              <span>{displayCountry(row.country)}</span>
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        className="overflow-x-auto"
        data-testid={testId}
        {...(scrollable ? { role: "region", tabIndex: 0, "aria-label": t("analyticsV2.bookings.scrollRegion") } : {})}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {showMentor && <TableHead>{t("analyticsV2.bookings.table.mentor")}</TableHead>}
              {showMentee && <TableHead>{t("analyticsV2.bookings.table.mentee")}</TableHead>}
              <TableHead>{t("analyticsV2.bookings.table.status")}</TableHead>
              <TableHead>{t("analyticsV2.bookings.table.requested")}</TableHead>
              <TableHead>{t("analyticsV2.bookings.table.scheduled")}</TableHead>
              <TableHead className="text-end">{t("analyticsV2.bookings.table.duration")}</TableHead>
              <TableHead>{t("analyticsV2.bookings.table.country")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id} data-testid={`row-booking-${row.id}`}>
                {showMentor && (
                  <TableCell className="whitespace-nowrap font-medium text-foreground" data-testid={`text-mentor-${row.id}`}>
                    <bdi>{mentorName(row)}</bdi>
                  </TableCell>
                )}
                {showMentee && (
                  <TableCell className="whitespace-nowrap" data-testid={`text-mentee-${row.id}`}>
                    <div className="leading-tight">
                      <div className="text-foreground">
                        <bdi>{row.menteeName || t("analytics.unknown")}</bdi>
                      </div>
                      <div className="text-caption text-muted-foreground">{menteeDetail(row)}</div>
                    </div>
                  </TableCell>
                )}
                <TableCell data-testid={`status-${row.id}`}>
                  <StatusBadge status={row.status} hideIcon />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.clickedAt, lang)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.scheduledAt, lang)}</TableCell>
                <TableCell className="whitespace-nowrap text-end tabular-nums text-muted-foreground">{duration(row.durationMinutes)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{displayCountry(row.country)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {scrollable && (
        <p className="border-t border-border px-4 py-2 text-caption text-muted-foreground" data-testid={`${testId}-scroll-hint`}>
          {t("analyticsV2.bookings.scrollHint")}
        </p>
      )}
    </div>
  );
}
