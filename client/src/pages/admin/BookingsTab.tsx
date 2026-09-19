import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BarChart3, Star } from "lucide-react";
import { formatNumber, UNAVAILABLE } from "@/lib/format";
import { localizeCountry } from "@/lib/reporting";
import { FilterChip } from "@/components/discovery/FilterChip";
import { adminQueryKeys, adminService, type AdminBooking } from "@/lib/adminService";
import type { Booking } from "@/lib/database";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  BookingStatusBadge,
  DetailField,
  EmptyRow,
  LoadingRows,
  QueueError,
  SearchBox,
  useFormatters,
} from "@/pages/admin/shared";

const COLS = 7;
const STATUSES: Booking["status"][] = ["pending", "accepted", "confirmed", "completed", "rejected", "canceled"];
type Filter = "all" | Booking["status"];

function Rating({ value, lang }: { value?: number | null; lang: string }) {
  const { t } = useTranslation();
  if (!value) return <>{UNAVAILABLE}</>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
      <Star className="size-3.5 fill-brand-orange text-brand-orange" aria-hidden="true" />
      {t("admin.bookings.ratingOf", { value: formatNumber(value, lang) })}
    </span>
  );
}

export default function BookingsTab() {
  const { t, i18n } = useTranslation();
  const { formatDate, formatDateTime } = useFormatters();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<AdminBooking | null>(null);

  const bookingsQuery = useQuery({ queryKey: adminQueryKeys.bookings, queryFn: adminService.getBookings });

  const counts = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    const c: Record<Filter, number> = { all: rows.length, pending: 0, accepted: 0, confirmed: 0, completed: 0, rejected: 0, canceled: 0 };
    rows.forEach((b) => { c[b.status] = (c[b.status] ?? 0) + 1; });
    return c;
  }, [bookingsQuery.data]);

  const bookings = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (!q) return true;
      return [b.mentor?.name, b.mentor?.email, b.mentee?.name, b.mentee?.email, b.mentee?.organization_name, b.country, b.mentor?.country]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [bookingsQuery.data, search, filter]);

  const chips: Filter[] = ["all", ...STATUSES];

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("admin.bookings.filterLabel")}>
          {chips.map((chip) => (
            <FilterChip
              key={chip}
              role="radio"
              selected={filter === chip}
              onToggle={() => setFilter(chip)}
              count={formatNumber(counts[chip], i18n.language)}
              data-testid={`chip-booking-${chip}`}
            >
              {chip === "all" ? t("common.all") : t(`status.${chip}`)}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder={t("admin.bookings.searchPlaceholder")} testId="input-booking-search" />
          <Button asChild variant="outline" className="shrink-0" data-testid="link-open-analytics">
            <Link href="/analytics"><BarChart3 aria-hidden="true" />{t("admin.bookings.openAnalytics")}</Link>
          </Button>
        </div>
      </div>

      {bookingsQuery.isError ? (
        <QueueError queue={t("admin.queues.bookings")} onRetry={() => bookingsQuery.refetch()} />
      ) : (
      <Card className="overflow-x-auto" aria-busy={bookingsQuery.isLoading || undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("admin.bookings.colCreated")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colMentor")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colMentee")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colStatus")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colScheduled")}</TableHead>
              <TableHead className="text-end">{t("admin.bookings.colDuration")}</TableHead>
              <TableHead className="text-start">{t("admin.colCountry")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookingsQuery.isLoading ? (
              <LoadingRows colSpan={COLS} />
            ) : bookings.length === 0 ? (
              <EmptyRow colSpan={COLS}>{search || filter !== "all" ? t("admin.noMatches") : t("admin.bookings.empty")}</EmptyRow>
            ) : (
              bookings.map((booking) => (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(booking)}
                    data-testid={`row-booking-${booking.id}`}
                  >
                    <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground tabular-nums">{formatDate(booking.created_at)}</TableCell>
                    <TableCell>
                      <p className="max-w-[12rem] truncate font-medium text-foreground">
                        <bdi>{booking.mentor?.name || UNAVAILABLE}</bdi>
                      </p>
                      <p className="max-w-[12rem] truncate text-caption text-muted-foreground">
                        <bdi dir="ltr">{booking.mentor?.email}</bdi>
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[12rem] truncate font-medium text-foreground">
                        <bdi>{booking.mentee?.organization_name || booking.mentee?.name || UNAVAILABLE}</bdi>
                      </p>
                      <p className="max-w-[12rem] truncate text-caption text-muted-foreground">
                        <bdi dir={booking.mentee?.organization_name ? undefined : "ltr"}>{booking.mentee?.organization_name ? booking.mentee.name : booking.mentee?.email}</bdi>
                      </p>
                    </TableCell>
                    <TableCell><BookingStatusBadge status={booking.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-body-sm tabular-nums">{formatDateTime(booking.scheduled_at)}</TableCell>
                    <TableCell className="text-end text-body-sm tabular-nums">{booking.session_duration_minutes != null ? formatNumber(booking.session_duration_minutes, i18n.language) : UNAVAILABLE}</TableCell>
                    <TableCell className="text-body-sm">{localizeCountry(booking.country || booking.mentor?.country || "", i18n.language) || UNAVAILABLE}</TableCell>
                  </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      )}

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader className="text-start">
                <SheetTitle>{t("admin.bookings.detailTitle")}</SheetTitle>
                <SheetDescription>
                  <bdi>{detail.mentor?.name || UNAVAILABLE}</bdi> · <bdi>{detail.mentee?.organization_name || detail.mentee?.name || UNAVAILABLE}</bdi>
                </SheetDescription>
                <div className="pt-2"><BookingStatusBadge status={detail.status} /></div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.bookings.colMentor")}>
                  {detail.mentor ? (
                    <Link href={`/mentor/${detail.mentor.id}`} className="font-medium text-secondary underline-offset-4 hover:underline">
                      <bdi>{detail.mentor.name}</bdi>
                    </Link>
                  ) : undefined}
                  {detail.mentor?.email && (
                    <p className="text-caption text-muted-foreground">
                      <bdi dir="ltr">{detail.mentor.email}</bdi>
                    </p>
                  )}
                </DetailField>
                <DetailField label={t("admin.bookings.colMentee")}>
                  <bdi>{detail.mentee?.organization_name || detail.mentee?.name}</bdi>
                  {detail.mentee?.email && (
                    <p className="text-caption text-muted-foreground">
                      <bdi dir="ltr">{detail.mentee.email}</bdi>
                    </p>
                  )}
                </DetailField>
                <DetailField label={t("admin.bookings.colCreated")}>{formatDateTime(detail.created_at)}</DetailField>
                <DetailField label={t("admin.bookings.colScheduled")}>{formatDateTime(detail.scheduled_at)}</DetailField>
                <DetailField label={t("admin.bookings.responded")}>{formatDateTime(detail.responded_at)}</DetailField>
                <DetailField label={t("admin.bookings.completed")}>{formatDateTime(detail.completed_at)}</DetailField>
                <DetailField label={t("admin.bookings.colDuration")}>
                  {detail.session_duration_minutes ? t("admin.bookings.minutes", { count: detail.session_duration_minutes }) : undefined}
                </DetailField>
                <DetailField label={t("admin.colCountry")}>{localizeCountry(detail.country || detail.mentor?.country || "", i18n.language) || undefined}</DetailField>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.bookings.goal")}><p dir="auto" className="whitespace-pre-line">{detail.goal}</p></DetailField>
                </div>
                <DetailField label={t("admin.bookings.menteeRating")}><Rating value={detail.mentee_rating} lang={i18n.language} /></DetailField>
                <DetailField label={t("admin.bookings.mentorRating")}><Rating value={detail.mentor_rating} lang={i18n.language} /></DetailField>
                {detail.mentee_feedback && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.bookings.menteeFeedback")}><p dir="auto" className="whitespace-pre-line">{detail.mentee_feedback}</p></DetailField>
                  </div>
                )}
                {detail.mentor_feedback && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.bookings.mentorFeedback")}><p dir="auto" className="whitespace-pre-line">{detail.mentor_feedback}</p></DetailField>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
