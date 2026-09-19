import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, KeyRound, MoreHorizontal, Star, UserCheck, UserX, Eye } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { initialsOf, localizedField } from "@/lib/localized";
import { localizeCountry } from "@/lib/reporting";
import { useAuth } from "@/context/AuthContext";
import { adminQueryKeys, adminService, aliasFromEmail, normalizeAlias } from "@/lib/adminService";
import type { Mentor, ApprovedUser } from "@/lib/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { bidi, UNAVAILABLE } from "@/lib/format";
import {
  ActiveBadge,
  DetailField,
  EmptyRow,
  LoadingRows,
  QueueError,
  SearchBox,
  errorMessage,
  useFormatters,
  useRowHighlight,
} from "@/pages/admin/shared";

const COLS = 7;

function approvalFor(mentor: Mentor, approved: ApprovedUser[]): ApprovedUser | undefined {
  const email = (mentor.email ?? '').toLowerCase();
  return approved.find((a) => a.mentor_id === mentor.id || (a.email && a.email.toLowerCase() === email));
}

export default function MentorsTab() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();
  const { highlight, rowProps } = useRowHighlight();

  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Mentor | null>(null);
  const [deactivating, setDeactivating] = useState<Mentor | null>(null);
  const [approving, setApproving] = useState<Mentor | null>(null);
  const [alias, setAlias] = useState("");

  const mentorsQuery = useQuery({ queryKey: adminQueryKeys.mentors, queryFn: adminService.getMentors });
  const approvedQuery = useQuery({ queryKey: adminQueryKeys.approvedUsers, queryFn: adminService.getApprovedUsers });
  const approved = approvedQuery.data ?? [];

  const mentors = useMemo(() => {
    const rows = mentorsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) =>
      [m.name, m.name_ar, m.email, m.position, m.position_ar, m.company, m.country]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [mentorsQuery.data, search]);

  const availabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) => adminService.setMentorAvailability(id, isAvailable),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.mentors });
      setDetail((d) => (d && d.id === updated.id ? updated : d));
      toast.success(updated.is_available ? t("admin.mentors.reactivated", { name: updated.name }) : t("admin.mentors.deactivated", { name: updated.name }));
      highlight(updated.id);
    },
    onError: (error) => toast.error(errorMessage(error, t)),
  });

  const approveMutation = useMutation({
    mutationFn: (mentor: Mentor) =>
      adminService.upsertApprovedUser({
        amazon_alias: alias,
        email: mentor.email,
        role: "mentor",
        mentor_id: mentor.id,
        approved_by: user?.email ?? "admin",
      }),
    onSuccess: async (row, mentor) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvedUsers });
      setApproving(null);
      toast.success(t("admin.mentors.accessApproved", { alias: row.amazon_alias }));
      highlight(mentor.id);
    },
    onError: (error) => toast.error(errorMessage(error, t)),
  });

  const openApprove = (mentor: Mentor) => {
    const existing = approvalFor(mentor, approved);
    setAlias(existing?.amazon_alias ?? aliasFromEmail(mentor.email ?? ''));
    setApproving(mentor);
  };

  const displayName = (m: Mentor) => localizedField(m, "name", i18n.language) || m.name;
  const displayPosition = (m: Mentor) => localizedField(m, "position", i18n.language) || m.position;

  const renderActions = (mentor: Mentor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("admin.actionsFor", { name: displayName(mentor) })} data-testid={`button-mentor-actions-${mentor.id}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setDetail(mentor)}>
          <Eye className="size-4" aria-hidden="true" /> {t("admin.viewDetails")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/mentor/${mentor.id}`}>
            <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" /> {t("admin.mentors.openProfile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openApprove(mentor)}>
          <KeyRound className="size-4" aria-hidden="true" /> {t("admin.mentors.approveAccess")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {mentor.is_available ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeactivating(mentor)}>
            <UserX className="size-4" aria-hidden="true" /> {t("admin.mentors.deactivate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => availabilityMutation.mutate({ id: mentor.id, isAvailable: true })}>
            <UserCheck className="size-4" aria-hidden="true" /> {t("admin.mentors.reactivate")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox value={search} onChange={setSearch} placeholder={t("admin.mentors.searchPlaceholder")} testId="input-mentor-search" />
        {!mentorsQuery.isError && (
        <p className="text-body-sm text-muted-foreground" role="status" data-testid="text-mentor-count">
          {t("admin.showingCount", { shown: mentors.length, total: mentorsQuery.data?.length ?? 0 })}
        </p>
        )}
      </div>

      {mentorsQuery.isError ? (
        <QueueError queue={t("admin.queues.mentors")} onRetry={() => mentorsQuery.refetch()} />
      ) : (
      <Card className="overflow-x-auto" aria-busy={mentorsQuery.isLoading || undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("admin.mentors.colMentor")}</TableHead>
              <TableHead className="text-start">{t("admin.colEmail")}</TableHead>
              <TableHead className="text-start">{t("admin.colCountry")}</TableHead>
              <TableHead className="text-start">{t("admin.mentors.colAvailability")}</TableHead>
              <TableHead className="text-start">{t("admin.mentors.colRating")}</TableHead>
              <TableHead className="text-start">{t("admin.mentors.colJoined")}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{t("admin.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mentorsQuery.isLoading ? (
              <LoadingRows colSpan={COLS} />
            ) : mentors.length === 0 ? (
              <EmptyRow colSpan={COLS}>{search ? t("admin.noMatches") : t("admin.mentors.empty")}</EmptyRow>
            ) : (
              mentors.map((mentor) => {
                const approval = approvalFor(mentor, approved);
                const rating = Number(mentor.average_rating ?? 0);
                const rp = rowProps(mentor.id);
                return (
                  <TableRow
                    key={mentor.id}
                    {...rp}
                    className={cn(rp.className, "cursor-pointer")}
                    onClick={() => setDetail(mentor)}
                    data-testid={`row-mentor-${mentor.id}`}
                  >
                    <TableCell>
                      <div className="flex min-w-[12rem] items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarImage src={mentor.photo_url || undefined} alt="" />
                          <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(mentor.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            <bdi>{displayName(mentor)}</bdi>
                          </p>
                          <p className="truncate text-caption text-muted-foreground">{displayPosition(mentor) || mentor.company || UNAVAILABLE}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">
                      <bdi dir="ltr">{mentor.email}</bdi>
                    </TableCell>
                    <TableCell className="text-body-sm">{mentor.country ? localizeCountry(mentor.country, i18n.language) : UNAVAILABLE}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ActiveBadge active={mentor.is_available} activeLabel={t("admin.mentors.available")} inactiveLabel={t("admin.mentors.inactive")} />
                        {approval?.is_active && (
                          <Badge tone="info">
                            {t("admin.mentors.ssoApproved")}
                            <span dir="ltr" className="font-mono">({approval.amazon_alias})</span>
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-body-sm">
                      {mentor.total_ratings ? (
                        <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
                          <Star className="size-3.5 fill-brand-orange text-brand-orange" aria-hidden="true" />
                          {formatNumber(rating, i18n.language, { maximumFractionDigits: 1 })}
                          <span className="text-muted-foreground">({formatNumber(mentor.total_ratings, i18n.language)})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{UNAVAILABLE}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground tabular-nums">{formatDate(mentor.created_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{renderActions(mentor)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
      )}

      {/* Detail sheet */}
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
                    <SheetTitle className="truncate">{displayName(detail)}</SheetTitle>
                    <SheetDescription className="truncate">
                      {[displayPosition(detail), detail.company].filter(Boolean).join(" · ") || detail.email}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.colEmail")}>
                  <bdi dir="ltr">{detail.email}</bdi>
                </DetailField>
                <DetailField label={t("admin.colCountry")}>{detail.country ? localizeCountry(detail.country, i18n.language) : undefined}</DetailField>
                <DetailField label={t("admin.mentors.timezone")}>
                  <span dir="ltr">{detail.timezone}</span>
                </DetailField>
                <DetailField label={t("admin.mentors.colJoined")}>{formatDate(detail.created_at)}</DetailField>
                <DetailField label={t("admin.mentors.calLink")}>
                  <span dir="ltr">{detail.cal_link}</span>
                </DetailField>
                <DetailField label={t("admin.mentors.commsOwner")}>
                  {detail.comms_owner === "assistant" ? t("admin.mentors.assistantWithEmail", { email: detail.assistant_email || UNAVAILABLE }) : t("admin.mentors.mentorThemselves")}
                </DetailField>
                <DetailField label={t("admin.mentors.languages")}>{detail.languages_spoken?.join(", ")}</DetailField>
                <DetailField label={t("admin.mentors.preference")}>{detail.mentorship_preference ? t(`admin.mentors.preferenceValue.${detail.mentorship_preference}`) : undefined}</DetailField>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.expertise")}>
                    {detail.expertise?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.expertise.map((x) => <Badge key={x} tone="neutral">{x}</Badge>)}
                      </div>
                    ) : undefined}
                  </DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.industries")}>{detail.industries?.join(", ")}</DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.bio")}>{detail.bio ? <p dir="auto" className="whitespace-pre-line">{detail.bio}</p> : undefined}</DetailField>
                </div>
                {detail.why_joined && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.mentors.whyJoined")}>{detail.why_joined ? <p dir="auto" className="whitespace-pre-line">{detail.why_joined}</p> : undefined}</DetailField>
                  </div>
                )}
              </div>

              <SheetFooter className="mt-8 flex-col gap-2 sm:flex-row sm:justify-start">
                <Button asChild variant="outline" data-testid="button-sheet-open-profile">
                  <Link href={`/mentor/${detail.id}`}><ExternalLink className="rtl:-scale-x-100" aria-hidden="true" />{t("admin.mentors.openProfile")}</Link>
                </Button>
                <Button variant="outline" onClick={() => openApprove(detail)} data-testid="button-sheet-approve-access">
                  <KeyRound aria-hidden="true" />{t("admin.mentors.approveAccess")}
                </Button>
                {detail.is_available ? (
                  <Button variant="destructive" onClick={() => setDeactivating(detail)} data-testid="button-sheet-deactivate">
                    <UserX aria-hidden="true" />{t("admin.mentors.deactivate")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => availabilityMutation.mutate({ id: detail.id, isAvailable: true })}
                    loading={availabilityMutation.isPending}
                    data-testid="button-sheet-reactivate"
                  >
                    <UserCheck aria-hidden="true" />{t("admin.mentors.reactivate")}
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Deactivate confirmation */}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.mentors.deactivateTitle", { name: deactivating ? bidi(displayName(deactivating)) : "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.mentors.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-deactivate-cancel">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (deactivating) availabilityMutation.mutate({ id: deactivating.id, isAvailable: false });
                setDeactivating(null);
              }}
              data-testid="button-deactivate-confirm"
            >
              {t("admin.mentors.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve access: alias confirmation */}
      <Dialog open={!!approving} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.mentors.approveAccess")}</DialogTitle>
            <DialogDescription>{t("admin.mentors.approveAccessBody", { email: bidi(approving?.email ?? "") })}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (approving && normalizeAlias(alias)) approveMutation.mutate(approving);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="approve-alias">{t("admin.access.alias")}</Label>
              <Input
                id="approve-alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                className="text-start"
                required
                aria-describedby="approve-alias-hint"
                data-testid="input-approve-alias"
              />
              <p id="approve-alias-hint" className="text-caption text-muted-foreground">{t("admin.mentors.aliasHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-email">{t("admin.colEmail")}</Label>
              <Input id="approve-email" value={approving?.email ?? ""} readOnly dir="ltr" className="text-start" data-testid="input-approve-email" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApproving(null)}>{t("common.cancel")}</Button>
              <Button type="submit" variant="secondary" loading={approveMutation.isPending} aria-disabled={!normalizeAlias(alias) || undefined} data-testid="button-approve-confirm">
                {t("admin.access.approve")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
