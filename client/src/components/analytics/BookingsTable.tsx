import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NOT_SPECIFIED, type BookingRow, type StatusGroup } from "@/lib/reporting";

interface BookingsTableProps {
  rows: BookingRow[];
  /** Rows beyond this are not rendered; the caller shows a "showing X of Y" line. */
  limit?: number;
  emptyText: string;
  testId?: string;
}

const STATUS_VARIANT: Record<StatusGroup, "default" | "secondary" | "outline"> = {
  clicked: "outline",
  scheduled: "default",
  completed: "secondary",
  canceled: "outline",
};

function formatDate(value: string | undefined, language: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  // Locale-aware so Arabic readers get Arabic month names, matching the admin tables.
  return new Intl.DateTimeFormat(language === "ar" ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Dense booking records: mentor, mentee, status, dates, duration, country. Used by drill-downs and the Bookings tab. */
export function BookingsTable({ rows, limit, emptyText, testId = "bookings-table" }: BookingsTableProps) {
  const { t, i18n } = useTranslation();
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : country);

  if (visible.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("analytics.tableHeaders.mentor")}</TableHead>
            <TableHead>{t("analytics.tableHeaders.mentee")}</TableHead>
            <TableHead>{t("analytics.tableHeaders.status")}</TableHead>
            <TableHead>{t("analytics.tableHeaders.clickedAt")}</TableHead>
            <TableHead>{t("analytics.tableHeaders.scheduledAt")}</TableHead>
            <TableHead className="text-end">{t("analytics.tableHeaders.duration")}</TableHead>
            <TableHead>{t("analytics.tableHeaders.country")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.id} data-testid={`row-booking-${row.id}`}>
              <TableCell className="font-medium text-[#0F1111]" data-testid={`text-mentor-${row.id}`}>
                {row.mentorName || t("analytics.unknown")}
              </TableCell>
              <TableCell data-testid={`text-mentee-${row.id}`}>
                <div className="leading-tight">
                  <div className="text-[#0F1111]">{row.menteeName || t("analytics.unknown")}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.menteeType === "organization"
                      ? row.menteeOrganization || t("menteeRegistration.organization")
                      : row.menteeType === "individual"
                        ? t("menteeRegistration.individual")
                        : row.menteeEmail}
                  </div>
                </div>
              </TableCell>
              <TableCell data-testid={`status-${row.id}`}>
                <Badge variant={STATUS_VARIANT[row.statusGroup]}>{t(`analytics.chartLabels.${row.statusGroup}`)}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.clickedAt, i18n.language)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.scheduledAt, i18n.language)}</TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground">
                {typeof row.durationMinutes === "number" ? t("analytics.minutesShort", { count: row.durationMinutes }) : "-"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{displayCountry(row.country)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
