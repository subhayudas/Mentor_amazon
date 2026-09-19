import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
 */
export function BookingsTable({ rows, limit, emptyText, testId = "bookings-table", showMentee = true, showMentor = true }: BookingsTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang));
  const duration = (minutes: number | undefined) =>
    typeof minutes === "number" ? formatNumber(minutes, lang, { style: "unit", unit: "minute", unitDisplay: "narrow" }) : UNAVAILABLE;

  if (visible.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-body-sm text-muted-foreground" data-testid={`${testId}-empty`}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid={testId}>
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
                  <bdi>{row.mentorName ? localizedName({ name: row.mentorName, nameAr: row.mentorNameAr }, lang) : t("analytics.unknown")}</bdi>
                </TableCell>
              )}
              {showMentee && (
                <TableCell data-testid={`text-mentee-${row.id}`}>
                  <div className="leading-tight">
                    <div className="text-foreground">
                      <bdi>{row.menteeName || t("analytics.unknown")}</bdi>
                    </div>
                    <div className="text-caption text-muted-foreground">
                      {row.menteeType === "organization" ? (
                        <bdi>{row.menteeOrganization || t("menteeRegistration.organization")}</bdi>
                      ) : row.menteeType === "individual" ? (
                        t("menteeRegistration.individual")
                      ) : (
                        <bdi dir="ltr">{row.menteeEmail}</bdi>
                      )}
                    </div>
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
  );
}
