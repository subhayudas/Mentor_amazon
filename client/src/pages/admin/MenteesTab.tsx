import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeCheck, Ban, Building2, User as UserIcon } from "lucide-react";
import { bidi, UNAVAILABLE } from "@/lib/format";
import { initialsOf } from "@/lib/localized";
import { localizeCountry } from "@/lib/format";
import { adminQueryKeys, adminService } from "@/lib/adminService";
import type { Mentee, VerificationStatus } from "@/lib/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  AdminCard,
  AdminCardList,
  CardField,
  CardFields,
  DetailField,
  EmptyRow,
  LoadingRows,
  QueueError,
  SearchBox,
  VerificationBadge,
  errorMessage,
  useAdminTable,
  useFormatters,
  useRowHighlight,
} from "@/pages/admin/shared";

const COLS = 7;
const FILTERS = ["all", "pending", "verified", "rejected", "unverified"] as const;
type Filter = (typeof FILTERS)[number];

export default function MenteesTab() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();
  const { highlight, rowProps } = useRowHighlight();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Mentee | null>(null);
  const asTable = useAdminTable();

  const menteesQuery = useQuery({ queryKey: adminQueryKeys.mentees, queryFn: adminService.getMentees });

  const counts = useMemo(() => {
    const rows = menteesQuery.data ?? [];
    const c: Record<Filter, number> = { all: rows.length, pending: 0, verified: 0, rejected: 0, unverified: 0 };
    rows.forEach((m) => {
      const s = (m.verification_status ?? "unverified") as Exclude<Filter, "all">;
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [menteesQuery.data]);

  const mentees = useMemo(() => {
    const rows = menteesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((m) => {
      if (filter !== "all" && (m.verification_status ?? "unverified") !== filter) return false;
      if (!q) return true;
      return [m.name, m.email, m.organization_name, m.country, m.verification_reference]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [menteesQuery.data, search, filter]);

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VerificationStatus }) => adminService.setMenteeVerification(id, status),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.mentees });
      setDetail(null);
      toast.success(
        updated.verification_status === "verified"
          ? t("admin.mentees.markedVerified", { name: bidi(updated.organization_name || updated.name) })
          : t("admin.mentees.markedRejected", { name: bidi(updated.organization_name || updated.name) }),
      );
      // Keep the changed row on screen: an active status filter would drop it
      // and the anchored highlight would have nothing to point at.
      if (filter !== "all" && filter !== (updated.verification_status ?? "unverified")) {
        setFilter("all");
      }
      highlight(updated.id);
    },
    onError: (error) => toast.error(errorMessage(error, t)),
  });

  const emptyText = search || filter !== "all" ? t("admin.noMatches") : t("admin.mentees.empty");

  const identity = (mentee: Mentee) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={mentee.photo_url || undefined} alt="" />
        <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(mentee.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">
          <bdi>{mentee.name}</bdi>
        </p>
        <p className="truncate text-caption text-muted-foreground">
          <bdi dir="ltr">{mentee.email}</bdi>
        </p>
      </div>
    </div>
  );

  const typeLabel = (mentee: Mentee) => (
    <span className="inline-flex items-center gap-1.5 text-body-sm">
      {mentee.user_type === "organization" ? (
        <Building2 className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <UserIcon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      )}
      {t(`admin.mentees.type.${mentee.user_type}`)}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder={t("admin.mentees.searchPlaceholder")} testId="input-mentee-search" />
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-full sm:w-56" aria-label={t("admin.mentees.filterLabel")} data-testid="select-verification-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f === "all" ? t("common.all") : t(`admin.verification.${f}`)} ({counts[f]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!menteesQuery.isError && (
        <p className="text-body-sm text-muted-foreground" role="status" data-testid="text-mentee-count">
          {t("admin.showingCount", { shown: mentees.length, total: menteesQuery.data?.length ?? 0 })}
        </p>
        )}
      </div>

      {menteesQuery.isError ? (
        <QueueError queue={t("admin.queues.mentees")} onRetry={() => menteesQuery.refetch()} />
      ) : asTable ? (
      <Card aria-busy={menteesQuery.isLoading || undefined}>
        {/* Country and registration date show from 1280 px, so the table never scrolls sideways at 1024. */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("admin.mentees.colName")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colType")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colOrganization")}</TableHead>
              <TableHead className="hidden text-start xl:table-cell">{t("admin.colCountry")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colVerification")}</TableHead>
              <TableHead className="hidden text-start xl:table-cell">{t("admin.mentees.colRegistered")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("admin.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menteesQuery.isLoading ? (
              <LoadingRows colSpan={COLS} />
            ) : mentees.length === 0 ? (
              <EmptyRow colSpan={COLS}>{emptyText}</EmptyRow>
            ) : (
              mentees.map((mentee) => {
                const rp = rowProps(mentee.id);
                return (
                  <TableRow
                    key={mentee.id}
                    {...rp}
                    className={cn(rp.className, "cursor-pointer")}
                    onClick={() => setDetail(mentee)}
                    data-testid={`row-mentee-${mentee.id}`}
                  >
                    <TableCell>
                      {/* Browsers ignore max-width on table cells; the inner block carries it. */}
                      <div className="max-w-[18rem]">{identity(mentee)}</div>
                    </TableCell>
                    <TableCell>{typeLabel(mentee)}</TableCell>
                    <TableCell className="text-body-sm">
                      <p className="max-w-[14rem] truncate">{mentee.organization_name ? <bdi>{mentee.organization_name}</bdi> : UNAVAILABLE}</p>
                    </TableCell>
                    <TableCell className="hidden text-body-sm xl:table-cell">{mentee.country ? localizeCountry(mentee.country, i18n.language) : UNAVAILABLE}</TableCell>
                    <TableCell><VerificationBadge status={mentee.verification_status} /></TableCell>
                    <TableCell className="hidden whitespace-nowrap text-body-sm text-muted-foreground tabular-nums xl:table-cell">{formatDate(mentee.created_at)}</TableCell>
                    <TableCell className="text-end">
                      {/* The real control (the sheet holds verify/reject); rows also open on click. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetail(mentee);
                        }}
                        aria-label={t("admin.mentees.viewA11y", { name: mentee.organization_name || mentee.name })}
                        data-testid={`button-view-mentee-${mentee.id}`}
                      >
                        {t("admin.viewDetails")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
      ) : (
        <AdminCardList loading={menteesQuery.isLoading} emptyText={emptyText} count={mentees.length} testId="list-mentees">
          {mentees.map((mentee) => {
            const rp = rowProps(mentee.id);
            return (
              <AdminCard key={mentee.id} {...rp} className={rp.className} data-testid={`row-mentee-${mentee.id}`}>
                <div className="flex items-start justify-between gap-3">
                  {identity(mentee)}
                  <VerificationBadge status={mentee.verification_status} />
                </div>
                <CardFields className="mt-3">
                  <CardField label={t("admin.mentees.colType")}>{typeLabel(mentee)}</CardField>
                  {mentee.organization_name && (
                    <CardField label={t("admin.mentees.colOrganization")}><bdi>{mentee.organization_name}</bdi></CardField>
                  )}
                  <CardField label={t("admin.colCountry")}>{mentee.country ? localizeCountry(mentee.country, i18n.language) : undefined}</CardField>
                  <CardField label={t("admin.mentees.colRegistered")}>{formatDate(mentee.created_at)}</CardField>
                </CardFields>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 h-11"
                  onClick={() => setDetail(mentee)}
                  aria-label={t("admin.mentees.viewA11y", { name: mentee.organization_name || mentee.name })}
                  data-testid={`button-view-mentee-${mentee.id}`}
                >
                  {t("admin.viewDetails")}
                </Button>
              </AdminCard>
            );
          })}
        </AdminCardList>
      )}

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader className="text-start">
                <div className="flex items-center gap-3">
                  <Avatar className="size-12">
                    <AvatarImage src={detail.photo_url || undefined} alt="" />
                    <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(detail.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">
                      <bdi>{detail.organization_name || detail.name}</bdi>
                    </SheetTitle>
                    <SheetDescription className="truncate">
                      {detail.organization_name && (
                        <>
                          <bdi>{detail.name}</bdi> ·{" "}
                        </>
                      )}
                      <bdi dir="ltr">{detail.email}</bdi>
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge tone="neutral">{t(`admin.mentees.type.${detail.user_type}`)}</Badge>
                  <VerificationBadge status={detail.verification_status} />
                </div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.colCountry")}>{detail.country ? localizeCountry(detail.country, i18n.language) : undefined}</DetailField>
                <DetailField label={t("admin.mentees.colRegistered")}>{formatDate(detail.created_at)}</DetailField>
                {detail.user_type === "organization" && (
                  <>
                    <DetailField label={t("admin.mentees.reference")}>{detail.verification_reference}</DetailField>
                    <DetailField label={t("admin.mentees.website")}>
                      {detail.organization_website ? (
                        <a href={detail.organization_website} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all font-medium text-secondary underline-offset-4 hover:underline">
                          {detail.organization_website}
                        </a>
                      ) : undefined}
                    </DetailField>
                    <DetailField label={t("admin.mentees.sector")}>{detail.organization_sector}</DetailField>
                    <DetailField label={t("admin.mentees.size")}>{detail.organization_size}</DetailField>
                    <div className="sm:col-span-2">
                      <DetailField label={t("admin.mentees.mission")}>{detail.organization_mission ? <p dir="auto" className="whitespace-pre-line">{detail.organization_mission}</p> : undefined}</DetailField>
                    </div>
                    <div className="sm:col-span-2">
                      <DetailField label={t("admin.mentees.needs")}>{detail.organization_needs ? <p dir="auto" className="whitespace-pre-line">{detail.organization_needs}</p> : undefined}</DetailField>
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentees.areasExploring")}>
                    {detail.areas_exploring?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.areas_exploring.map((x) => <Badge key={x} tone="neutral">{x}</Badge>)}
                      </div>
                    ) : undefined}
                  </DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentees.goals")}>{detail.goals ? <p dir="auto" className="whitespace-pre-line">{detail.goals}</p> : undefined}</DetailField>
                </div>
                {detail.bio && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.mentors.bio")}>{detail.bio ? <p dir="auto" className="whitespace-pre-line">{detail.bio}</p> : undefined}</DetailField>
                  </div>
                )}
              </div>

              {detail.user_type === "organization" && (
                <SheetFooter className="mt-8 flex-col gap-2 sm:flex-row sm:justify-start">
                  {detail.verification_status !== "verified" && (
                    <Button
                      variant="secondary"
                      onClick={() => verifyMutation.mutate({ id: detail.id, status: "verified" })}
                      loading={verifyMutation.isPending && verifyMutation.variables?.status === "verified"}
                      disabled={verifyMutation.isPending}
                      data-testid="button-mark-verified"
                    >
                      <BadgeCheck aria-hidden="true" />{t("admin.mentees.markVerified")}
                    </Button>
                  )}
                  {detail.verification_status !== "rejected" && (
                    <Button
                      variant="outline"
                      onClick={() => verifyMutation.mutate({ id: detail.id, status: "rejected" })}
                      loading={verifyMutation.isPending && verifyMutation.variables?.status === "rejected"}
                      disabled={verifyMutation.isPending}
                      className="border-destructive/40 text-destructive hover:bg-destructive-soft"
                      data-testid="button-mark-rejected"
                    >
                      <Ban aria-hidden="true" />{t("admin.mentees.markRejected")}
                    </Button>
                  )}
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
