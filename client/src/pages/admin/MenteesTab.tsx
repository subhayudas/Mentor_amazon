import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeCheck, Ban, Building2, User as UserIcon } from "lucide-react";
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
  DetailField,
  EmptyRow,
  LoadingRows,
  SearchBox,
  VerificationBadge,
  errorMessage,
  useFormatters,
  useRowHighlight,
} from "@/pages/admin/shared";

const COLS = 6;
const FILTERS = ["all", "pending", "verified", "rejected", "unverified"] as const;
type Filter = (typeof FILTERS)[number];

export default function MenteesTab() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();
  const { highlight, rowProps } = useRowHighlight();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Mentee | null>(null);

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
          ? t("admin.mentees.markedVerified", { name: updated.organization_name || updated.name })
          : t("admin.mentees.markedRejected", { name: updated.organization_name || updated.name }),
      );
      // Keep the changed row on screen: an active status filter would drop it
      // and the anchored highlight would have nothing to point at.
      if (filter !== "all" && filter !== (updated.verification_status ?? "unverified")) {
        setFilter("all");
      }
      highlight(updated.id);
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center w-full sm:w-auto">
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
        <p className="text-sm text-muted-foreground" data-testid="text-mentee-count">
          {t("admin.showingCount", { shown: mentees.length, total: menteesQuery.data?.length ?? 0 })}
        </p>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("admin.mentees.colName")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colType")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colOrganization")}</TableHead>
              <TableHead className="text-start">{t("admin.colCountry")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colVerification")}</TableHead>
              <TableHead className="text-start">{t("admin.mentees.colRegistered")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menteesQuery.isLoading ? (
              <LoadingRows colSpan={COLS} />
            ) : menteesQuery.isError ? (
              <EmptyRow colSpan={COLS}>{errorMessage(menteesQuery.error, t("errors.somethingWentWrong"))}</EmptyRow>
            ) : mentees.length === 0 ? (
              <EmptyRow colSpan={COLS}>{search || filter !== "all" ? t("admin.noMatches") : t("admin.mentees.empty")}</EmptyRow>
            ) : (
              mentees.map((mentee) => {
                const rp = rowProps(mentee.id);
                const isOrg = mentee.user_type === "organization";
                return (
                  <TableRow
                    key={mentee.id}
                    {...rp}
                    className={cn(rp.className, "cursor-pointer")}
                    onClick={() => setDetail(mentee)}
                    data-testid={`row-mentee-${mentee.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[12rem]">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={mentee.photo_url || undefined} alt="" />
                          <AvatarFallback>{mentee.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{mentee.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{mentee.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {isOrg ? <Building2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <UserIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                        {t(`admin.mentees.type.${mentee.user_type}`)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{mentee.organization_name || "—"}</TableCell>
                    <TableCell className="text-sm">{mentee.country || "—"}</TableCell>
                    <TableCell><VerificationBadge status={mentee.verification_status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(mentee.created_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side={isRTL ? "left" : "right"} className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="text-start">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={detail.photo_url || undefined} alt="" />
                    <AvatarFallback>{detail.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{detail.organization_name || detail.name}</SheetTitle>
                    <SheetDescription className="truncate">
                      {detail.organization_name ? `${detail.name} · ${detail.email}` : detail.email}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge variant="secondary">{t(`admin.mentees.type.${detail.user_type}`)}</Badge>
                  <VerificationBadge status={detail.verification_status} />
                </div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.colCountry")}>{detail.country}</DetailField>
                <DetailField label={t("admin.mentees.colRegistered")}>{formatDate(detail.created_at)}</DetailField>
                {detail.user_type === "organization" && (
                  <>
                    <DetailField label={t("admin.mentees.reference")}>{detail.verification_reference}</DetailField>
                    <DetailField label={t("admin.mentees.website")}>
                      {detail.organization_website ? (
                        <a href={detail.organization_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                          {detail.organization_website}
                        </a>
                      ) : undefined}
                    </DetailField>
                    <DetailField label={t("admin.mentees.sector")}>{detail.organization_sector}</DetailField>
                    <DetailField label={t("admin.mentees.size")}>{detail.organization_size}</DetailField>
                    <div className="sm:col-span-2">
                      <DetailField label={t("admin.mentees.mission")}><p className="whitespace-pre-line">{detail.organization_mission}</p></DetailField>
                    </div>
                    <div className="sm:col-span-2">
                      <DetailField label={t("admin.mentees.needs")}><p className="whitespace-pre-line">{detail.organization_needs}</p></DetailField>
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentees.areasExploring")}>
                    {detail.areas_exploring?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.areas_exploring.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}
                      </div>
                    ) : undefined}
                  </DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentees.goals")}><p className="whitespace-pre-line">{detail.goals}</p></DetailField>
                </div>
                {detail.bio && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.mentors.bio")}><p className="whitespace-pre-line">{detail.bio}</p></DetailField>
                  </div>
                )}
              </div>

              {detail.user_type === "organization" && (
                <SheetFooter className="mt-8 flex-col sm:flex-row sm:justify-start gap-2">
                  <Button
                    onClick={() => verifyMutation.mutate({ id: detail.id, status: "verified" })}
                    disabled={verifyMutation.isPending || detail.verification_status === "verified"}
                    className="bg-[#067D62] hover:bg-[#05654f] text-white"
                    data-testid="button-mark-verified"
                  >
                    <BadgeCheck className="w-4 h-4 me-2" />{t("admin.mentees.markVerified")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => verifyMutation.mutate({ id: detail.id, status: "rejected" })}
                    disabled={verifyMutation.isPending || detail.verification_status === "rejected"}
                    className="text-[#C40000] border-[#C40000]/40 hover:bg-[#FDECEC]"
                    data-testid="button-mark-rejected"
                  >
                    <Ban className="w-4 h-4 me-2" />{t("admin.mentees.markRejected")}
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
