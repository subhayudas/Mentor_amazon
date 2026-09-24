import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BarChart3, Inbox, Mail, Star } from "lucide-react";
import { formatNumber, UNAVAILABLE } from "@/lib/format";
import { localizeCountry } from "@/lib/format";
import { ChipRadio, ChipRadioGroup, FilterChip } from "@/components/discovery/FilterChip";
import { adminQueryKeys, adminService, isProgrammeRequest, type AdminBooking } from "@/lib/adminService";
import { isBookingNotPendingError, type Booking } from "@/lib/database";
import { bookingService } from "@/lib/services";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AdminCard,
  AdminCardList,
  BookingStatusBadge,
  CardField,
  CardFields,
  DetailField,
  EmptyRow,
  LoadingRows,
  QueueError,
  SearchBox,
  useAdminTable,
  useFormatters,
} from "@/pages/admin/shared";

const COLS = 6;
const STATUSES: Booking["status"][] = ["pending", "accepted", "confirmed", "completed", "rejected", "canceled"];
type Filter = "all" | Booking["status"];
type Decision = { booking: AdminBooking; action: "accept" | "decline" };

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

/** Recorded duration and the session's country, under its time; nothing when neither is known. */
function SessionMeta({ booking, lang }: { booking: AdminBooking; lang: string }) {
  const { t } = useTranslation();
  const country = localizeCountry(booking.country || booking.mentor?.country || "", lang);
  const parts = [
    booking.session_duration_minutes != null ? t("admin.bookings.minutes", { count: booking.session_duration_minutes }) : null,
    country || null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="block text-caption text-muted-foreground">{parts.join(" · ")}</span>;
}

const menteeLabel = (b: AdminBooking) => b.mentee?.organization_name || b.mentee?.name || UNAVAILABLE;
const mentorLabel = (b: AdminBooking) => b.mentor?.name || UNAVAILABLE;
/** The mentee's second line: the person behind an organisation, else their address. */
const menteeDetail = (b: AdminBooking) => (b.mentee?.organization_name ? b.mentee.name : b.mentee?.email);

/**
 * Admin bookings (design B5, F07). Besides the full list with status chips
 * and search, admins answer requests to the programme-managed (curated)
 * mentors here: a "Programme-managed" filter, a callout counting the pending
 * ones, and Accept / Decline (behind a confirmation) on exactly those rows and
 * in their detail sheet. Accepting notifies the mentee; the programme team
 * then emails them to arrange a time (the sheet shows the address).
 * Non-managed rows have no actions — their mentors answer them.
 */
export default function BookingsTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { formatDate, formatDateTime } = useFormatters();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [programmeOnly, setProgrammeOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const asTable = useAdminTable();

  const bookingsQuery = useQuery({ queryKey: adminQueryKeys.bookings, queryFn: adminService.getBookings });
  const rows = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const detail = useMemo(() => (detailId ? rows.find((b) => b.id === detailId) ?? null : null), [rows, detailId]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, pending: 0, accepted: 0, confirmed: 0, completed: 0, rejected: 0, canceled: 0 };
    rows.forEach((b) => {
      if (programmeOnly && !b.mentor?.managed_by_programme) return;
      c.all += 1;
      c[b.status] = (c[b.status] ?? 0) + 1;
    });
    return c;
  }, [rows, programmeOnly]);
  const programmeCount = useMemo(() => rows.filter((b) => b.mentor?.managed_by_programme).length, [rows]);
  const programmePending = useMemo(() => rows.filter(isProgrammeRequest).length, [rows]);

  const bookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (programmeOnly && !b.mentor?.managed_by_programme) return false;
      if (!q) return true;
      return [b.mentor?.name, b.mentor?.email, b.mentee?.name, b.mentee?.email, b.mentee?.organization_name, b.country, b.mentor?.country]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, search, filter, programmeOnly]);

  const decide = useMutation({
    mutationFn: ({ booking, action }: Decision) => (action === "accept" ? bookingService.accept(booking.id) : bookingService.decline(booking.id)),
    onSuccess: (_row, { action }) => {
      toast.success(action === "accept" ? t("admin.bookings.acceptedToast") : t("admin.bookings.declinedToast"));
    },
    // Someone else answered it first: say so (the refetch below shows its status), not "check your connection".
    onError: (error) => toast.error(isBookingNotPendingError(error) ? t("admin.bookings.decisionStale") : t("admin.bookings.decisionError")),
    onSettled: () => {
      for (const key of [adminQueryKeys.bookings, ["notifications"], ["dashboard"], ["analytics"]]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const busyId = decide.isPending ? decide.variables?.booking.id : undefined;

  const chips: Filter[] = ["all", ...STATUSES];
  const emptyText = search || filter !== "all" || programmeOnly ? t("admin.noMatches") : t("admin.bookings.empty");

  const actionButtons = (booking: AdminBooking, size: "sm" | "md" = "sm") =>
    isProgrammeRequest(booking) ? (
      <>
        <Button
          type="button"
          size={size}
          variant="secondary"
          className="max-md:h-11"
          loading={busyId === booking.id && decide.variables?.action === "accept"}
          disabled={busyId === booking.id}
          onClick={(event) => {
            event.stopPropagation();
            setDecision({ booking, action: "accept" });
          }}
          aria-label={t("admin.bookings.acceptA11y", { mentee: menteeLabel(booking), mentor: mentorLabel(booking) })}
          data-testid={`button-accept-booking-${booking.id}`}
        >
          {t("admin.bookings.accept")}
        </Button>
        <Button
          type="button"
          size={size}
          variant="outline"
          className="max-md:h-11"
          loading={busyId === booking.id && decide.variables?.action === "decline"}
          disabled={busyId === booking.id}
          onClick={(event) => {
            event.stopPropagation();
            setDecision({ booking, action: "decline" });
          }}
          aria-label={t("admin.bookings.declineA11y", { mentee: menteeLabel(booking), mentor: mentorLabel(booking) })}
          data-testid={`button-decline-booking-${booking.id}`}
        >
          {t("admin.bookings.decline")}
        </Button>
      </>
    ) : null;

  return (
    <div className="space-y-4">
      {programmePending > 0 && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-warning-border bg-warning p-4 text-warning-foreground sm:flex-row sm:items-center sm:justify-between"
          data-testid="programme-callout"
        >
          <div className="flex items-start gap-3">
            <Inbox className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-body-sm font-medium">{t("admin.bookings.programmeCallout", { count: programmePending })}</p>
              <p className="text-body-sm text-pretty">{t("admin.bookings.programmeCalloutBody")}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 max-md:h-11"
            onClick={() => {
              setProgrammeOnly(true);
              setFilter("pending");
            }}
            data-testid="button-show-programme-pending"
          >
            {t("admin.bookings.programmeShow")}
          </Button>
        </div>
      )}

      {/* Status chips on their own row (one line at 1280 px), then the other filter, search and analytics. */}
      <div className="space-y-3">
        <ChipRadioGroup aria-label={t("admin.bookings.filterLabel")} value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          {chips.map((chip) => (
            <ChipRadio key={chip} value={chip} count={formatNumber(counts[chip], lang)} data-testid={`chip-booking-${chip}`}>
              {chip === "all" ? t("common.all") : t(`status.${chip}`)}
            </ChipRadio>
          ))}
        </ChipRadioGroup>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterChip
            selected={programmeOnly}
            onToggle={setProgrammeOnly}
            count={formatNumber(programmeCount, lang)}
            className="self-start sm:self-auto"
            data-testid="chip-booking-programme"
          >
            {t("admin.bookings.programmeFilter")}
          </FilterChip>
          <div className="flex flex-col gap-3 sm:ms-auto sm:flex-row sm:items-center">
            {/* A set width: inside this auto-width row the box would shrink to its content and cut the placeholder. */}
            <div className="w-full sm:w-80">
              <SearchBox value={search} onChange={setSearch} placeholder={t("admin.bookings.searchPlaceholder")} testId="input-booking-search" />
            </div>
            <Button asChild variant="outline" className="shrink-0 max-md:h-11" data-testid="link-open-analytics">
              <Link href="/analytics"><BarChart3 aria-hidden="true" />{t("admin.bookings.openAnalytics")}</Link>
            </Button>
          </div>
        </div>
      </div>

      {bookingsQuery.isError ? (
        <QueueError queue={t("admin.queues.bookings")} onRetry={() => bookingsQuery.refetch()} />
      ) : asTable ? (
      <Card aria-busy={bookingsQuery.isLoading || undefined}>
        {/* Fits 1024 px and up without scrolling sideways: duration and country sit under the session
            time, and the creation date (also in the sheet) shows from 1280 px. */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-start xl:table-cell">{t("admin.bookings.colCreated")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colMentor")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colMentee")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colStatus")}</TableHead>
              <TableHead className="text-start">{t("admin.bookings.colScheduled")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("admin.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookingsQuery.isLoading ? (
              <LoadingRows colSpan={COLS} />
            ) : bookings.length === 0 ? (
              <EmptyRow colSpan={COLS}>{emptyText}</EmptyRow>
            ) : (
              bookings.map((booking) => (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(booking.id)}
                    data-testid={`row-booking-${booking.id}`}
                    data-programme={booking.mentor?.managed_by_programme ? "true" : undefined}
                  >
                    <TableCell className="hidden whitespace-nowrap text-body-sm text-muted-foreground tabular-nums xl:table-cell">{formatDate(booking.created_at)}</TableCell>
                    <TableCell>
                      <p className="max-w-[12rem] truncate font-medium text-foreground">
                        <bdi>{booking.mentor?.name || UNAVAILABLE}</bdi>
                      </p>
                      {booking.mentor?.managed_by_programme ? (
                        <Badge tone="info" className="mt-0.5">{t("admin.bookings.programmeBadge")}</Badge>
                      ) : (
                        <p className="max-w-[12rem] truncate text-caption text-muted-foreground">
                          <bdi dir="ltr">{booking.mentor?.email}</bdi>
                        </p>
                      )}
                      {/* Next to the mentor: the programme team's actions are never in a clipped column. */}
                      {isProgrammeRequest(booking) && <div className="mt-2 flex flex-wrap gap-2">{actionButtons(booking)}</div>}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[12rem] truncate font-medium text-foreground">
                        <bdi>{menteeLabel(booking)}</bdi>
                      </p>
                      <p className="max-w-[12rem] truncate text-caption text-muted-foreground">
                        <bdi dir={booking.mentee?.organization_name ? undefined : "ltr"}>{menteeDetail(booking)}</bdi>
                      </p>
                    </TableCell>
                    <TableCell><BookingStatusBadge status={booking.status} /></TableCell>
                    <TableCell>
                      <p className="whitespace-nowrap text-body-sm tabular-nums">{formatDateTime(booking.scheduled_at)}</p>
                      <SessionMeta booking={booking} lang={lang} />
                    </TableCell>
                    <TableCell className="text-end">
                      {/* The real control: rows also open on click as a pointer convenience. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailId(booking.id);
                        }}
                        aria-label={t("admin.bookings.viewA11y", { mentor: mentorLabel(booking), mentee: menteeLabel(booking) })}
                        data-testid={`button-view-booking-${booking.id}`}
                      >
                        {t("admin.viewDetails")}
                      </Button>
                    </TableCell>
                  </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      ) : (
        <AdminCardList loading={bookingsQuery.isLoading} emptyText={emptyText} count={bookings.length} testId="list-bookings">
          {bookings.map((booking) => (
            <AdminCard
              key={booking.id}
              data-testid={`row-booking-${booking.id}`}
              data-programme={booking.mentor?.managed_by_programme ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-3">
                <BookingStatusBadge status={booking.status} />
                <span className="text-caption text-muted-foreground tabular-nums">{formatDate(booking.created_at)}</span>
              </div>
              <CardFields className="mt-3">
                <CardField label={t("admin.bookings.colMentor")}>
                  <bdi className="font-medium">{mentorLabel(booking)}</bdi>
                  {booking.mentor?.managed_by_programme && <Badge tone="info" className="ms-2 align-middle">{t("admin.bookings.programmeBadge")}</Badge>}
                </CardField>
                <CardField label={t("admin.bookings.colMentee")}>
                  <bdi className="font-medium">{menteeLabel(booking)}</bdi>
                  {menteeDetail(booking) && (
                    <span className="block break-all text-caption text-muted-foreground">
                      <bdi dir={booking.mentee?.organization_name ? undefined : "ltr"}>{menteeDetail(booking)}</bdi>
                    </span>
                  )}
                </CardField>
                <CardField label={t("admin.bookings.colScheduled")}>
                  <span className="tabular-nums">{formatDateTime(booking.scheduled_at)}</span>
                  <SessionMeta booking={booking} lang={lang} />
                </CardField>
              </CardFields>
              <div className="mt-4 flex flex-wrap gap-2">
                {actionButtons(booking, "md")}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setDetailId(booking.id)}
                  aria-label={t("admin.bookings.viewA11y", { mentor: mentorLabel(booking), mentee: menteeLabel(booking) })}
                  data-testid={`button-view-booking-${booking.id}`}
                >
                  {t("admin.viewDetails")}
                </Button>
              </div>
            </AdminCard>
          ))}
        </AdminCardList>
      )}

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader className="text-start">
                <SheetTitle>{t("admin.bookings.detailTitle")}</SheetTitle>
                <SheetDescription>
                  <bdi>{mentorLabel(detail)}</bdi> · <bdi>{menteeLabel(detail)}</bdi>
                </SheetDescription>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <BookingStatusBadge status={detail.status} />
                  {detail.mentor?.managed_by_programme && <Badge tone="info">{t("admin.bookings.programmeBadge")}</Badge>}
                </div>
              </SheetHeader>

              {detail.mentor?.managed_by_programme && (
                <div className="mt-5 space-y-3 rounded-lg border border-border bg-muted/40 p-4" data-testid="programme-explain">
                  <p className="text-body-sm text-foreground text-pretty">{t("admin.bookings.programmeExplain")}</p>
                  <div className="flex flex-wrap gap-2">
                    {actionButtons(detail, "md")}
                    {detail.mentee?.email && (
                      <a
                        href={`mailto:${encodeURIComponent(detail.mentee.email)}`}
                        className={buttonVariants({ variant: "ghost" })}
                        data-testid="link-email-mentee"
                      >
                        <Mail aria-hidden="true" />
                        {t("admin.bookings.emailMentee")}
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.bookings.colMentor")}>
                  {detail.mentor ? (
                    <Link href={`/mentor/${detail.mentor.id}`} className="font-medium text-secondary underline-offset-4 hover:underline">
                      <bdi>{detail.mentor.name}</bdi>
                    </Link>
                  ) : undefined}
                  {detail.mentor?.email && !detail.mentor.managed_by_programme && (
                    <p className="text-caption text-muted-foreground">
                      <bdi dir="ltr">{detail.mentor.email}</bdi>
                    </p>
                  )}
                </DetailField>
                <DetailField label={t("admin.bookings.colMentee")}>
                  <bdi>{detail.mentee?.organization_name || detail.mentee?.name}</bdi>
                  {detail.mentee?.email && (
                    <p className="text-caption text-muted-foreground">
                      <span className="sr-only">{t("admin.bookings.menteeEmail")}: </span>
                      <bdi dir="ltr" data-testid="text-mentee-email">{detail.mentee.email}</bdi>
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
                <DetailField label={t("admin.colCountry")}>{localizeCountry(detail.country || detail.mentor?.country || "", lang) || undefined}</DetailField>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.bookings.goal")}><p dir="auto" className="whitespace-pre-line">{detail.goal}</p></DetailField>
                </div>
                <DetailField label={t("admin.bookings.menteeRating")}><Rating value={detail.mentee_rating} lang={lang} /></DetailField>
                <DetailField label={t("admin.bookings.mentorRating")}><Rating value={detail.mentor_rating} lang={lang} /></DetailField>
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

      <AlertDialog open={!!decision} onOpenChange={(open) => !open && setDecision(null)}>
        <AlertDialogContent data-testid="dialog-confirm-decision">
          {decision && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {decision.action === "accept" ? t("admin.bookings.acceptTitle") : t("admin.bookings.declineTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {decision.action === "accept"
                    ? t("admin.bookings.acceptBody", { mentee: menteeLabel(decision.booking), mentor: mentorLabel(decision.booking), email: decision.booking.mentee?.email ?? UNAVAILABLE })
                    : t("admin.bookings.declineBody", { mentee: menteeLabel(decision.booking), mentor: mentorLabel(decision.booking) })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-decision-keep">{t("admin.bookings.keepPending")}</AlertDialogCancel>
                <AlertDialogAction
                  className={decision.action === "decline" ? buttonVariants({ variant: "destructive" }) : undefined}
                  onClick={() => {
                    decide.mutate(decision);
                    setDecision(null);
                  }}
                  data-testid="button-decision-confirm"
                >
                  {decision.action === "accept" ? t("admin.bookings.acceptConfirm") : t("admin.bookings.declineConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
