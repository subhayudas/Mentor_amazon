import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BarChart3, Star } from "lucide-react";
import { adminQueryKeys, adminService, type AdminBooking } from "@/lib/adminService";
import type { Booking } from "@/lib/database";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BookingStatusBadge,
  DetailField,
  EmptyRow,
  LoadingRows,
  SearchBox,
  errorMessage,
  useFormatters,
} from "@/pages/admin/shared";

const COLS = 7;
const STATUSES: Booking["status"][] = ["pending", "accepted", "confirmed", "completed", "rejected", "canceled"];
type Filter = "all" | Booking["status"];

function Rating({ value }: { value?: number | null }) {
  if (!value) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="w-3.5 h-3.5 text-[#FF9900] fill-[#FF9900]" aria-hidden="true" />
      {value}/5
    </span>
  );
}

export default function BookingsTab() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
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
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.bookings.filterLabel")}>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setFilter(chip)}
              aria-pressed={filter === chip}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === chip
                  ? "bg-[#232F3E] text-white border-[#232F3E]"
                  : "bg-background text-muted-foreground border-[#D5D9D9] hover:text-foreground hover:bg-muted",
              )}
              data-testid={`chip-booking-${chip}`}
            >
              {chip === "all" ? t("common.all") : t(`admin.bookingStatus.${chip}`)}
              <span className={cn("tabular-nums", filter === chip ? "text-white/80" : "text-muted-foreground")}>{counts[chip]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchBox value={search} onChange={setSearch} placeholder={t("admin.bookings.searchPlaceholder")} testId="input-booking-search" />
          <Button asChild variant="outline" className="shrink-0" data-testid="link-open-analytics">
            <Link href="/analytics"><BarChart3 className="w-4 h-4 me-2" />{t("admin.bookings.openAnalytics")}</Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
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
            ) : bookingsQuery.isError ? (
              <EmptyRow colSpan={COLS}>{errorMessage(bookingsQuery.error, t("errors.somethingWentWrong"))}</EmptyRow>
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
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(booking.created_at)}</TableCell>
                    <TableCell>
                      <p className="font-semibold text-foreground truncate max-w-[12rem]">{booking.mentor?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[12rem]">{booking.mentor?.email}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-foreground truncate max-w-[12rem]">{booking.mentee?.organization_name || booking.mentee?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[12rem]">{booking.mentee?.organization_name ? booking.mentee.name : booking.mentee?.email}</p>
                    </TableCell>
                    <TableCell><BookingStatusBadge status={booking.status} /></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(booking.scheduled_at)}</TableCell>
                    <TableCell className="text-sm text-end tabular-nums">{booking.session_duration_minutes ?? "—"}</TableCell>
                    <TableCell className="text-sm">{booking.country || booking.mentor?.country || "—"}</TableCell>
                  </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side={isRTL ? "left" : "right"} className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="text-start">
                <SheetTitle>{t("admin.bookings.detailTitle")}</SheetTitle>
                <SheetDescription>
                  {detail.mentor?.name || "—"} · {detail.mentee?.organization_name || detail.mentee?.name || "—"}
                </SheetDescription>
                <div className="pt-2"><BookingStatusBadge status={detail.status} /></div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.bookings.colMentor")}>
                  {detail.mentor ? (
                    <Link href={`/mentor/${detail.mentor.id}`} className="text-primary hover:underline">{detail.mentor.name}</Link>
                  ) : undefined}
                  {detail.mentor?.email && <p className="text-xs text-muted-foreground">{detail.mentor.email}</p>}
                </DetailField>
                <DetailField label={t("admin.bookings.colMentee")}>
                  {detail.mentee?.organization_name || detail.mentee?.name}
                  {detail.mentee?.email && <p className="text-xs text-muted-foreground">{detail.mentee.email}</p>}
                </DetailField>
                <DetailField label={t("admin.bookings.colCreated")}>{formatDateTime(detail.created_at)}</DetailField>
                <DetailField label={t("admin.bookings.colScheduled")}>{formatDateTime(detail.scheduled_at)}</DetailField>
                <DetailField label={t("admin.bookings.responded")}>{formatDateTime(detail.responded_at)}</DetailField>
                <DetailField label={t("admin.bookings.completed")}>{formatDateTime(detail.completed_at)}</DetailField>
                <DetailField label={t("admin.bookings.colDuration")}>
                  {detail.session_duration_minutes ? t("admin.bookings.minutes", { count: detail.session_duration_minutes }) : undefined}
                </DetailField>
                <DetailField label={t("admin.colCountry")}>{detail.country || detail.mentor?.country}</DetailField>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.bookings.goal")}><p className="whitespace-pre-line">{detail.goal}</p></DetailField>
                </div>
                <DetailField label={t("admin.bookings.menteeRating")}><Rating value={detail.mentee_rating} /></DetailField>
                <DetailField label={t("admin.bookings.mentorRating")}><Rating value={detail.mentor_rating} /></DetailField>
                {detail.mentee_feedback && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.bookings.menteeFeedback")}><p className="whitespace-pre-line">{detail.mentee_feedback}</p></DetailField>
                  </div>
                )}
                {detail.mentor_feedback && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.bookings.mentorFeedback")}><p className="whitespace-pre-line">{detail.mentor_feedback}</p></DetailField>
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
