import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, KeyRound, MoreHorizontal, Star, UserCheck, UserX, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminQueryKeys, adminService, aliasFromEmail, normalizeAlias } from "@/lib/adminService";
import type { Mentor, ApprovedUser } from "@/lib/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ActiveBadge,
  DetailField,
  EmptyRow,
  LoadingRows,
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
  const isRTL = i18n.language === "ar";
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
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
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
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  const openApprove = (mentor: Mentor) => {
    const existing = approvalFor(mentor, approved);
    setAlias(existing?.amazon_alias ?? aliasFromEmail(mentor.email ?? ''));
    setApproving(mentor);
  };

  const displayName = (m: Mentor) => (isRTL && m.name_ar ? m.name_ar : m.name);
  const displayPosition = (m: Mentor) => (isRTL && m.position_ar ? m.position_ar : m.position);

  const renderActions = (mentor: Mentor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("admin.actions")} data-testid={`button-mentor-actions-${mentor.id}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? "start" : "end"} onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setDetail(mentor)}>
          <Eye className="w-4 h-4 me-2" /> {t("admin.viewDetails")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/mentor/${mentor.id}`}>
            <ExternalLink className="w-4 h-4 me-2" /> {t("admin.mentors.openProfile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openApprove(mentor)}>
          <KeyRound className="w-4 h-4 me-2" /> {t("admin.mentors.approveAccess")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {mentor.is_available ? (
          <DropdownMenuItem className="text-[#C40000] focus:text-[#C40000]" onSelect={() => setDeactivating(mentor)}>
            <UserX className="w-4 h-4 me-2" /> {t("admin.mentors.deactivate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => availabilityMutation.mutate({ id: mentor.id, isAvailable: true })}>
            <UserCheck className="w-4 h-4 me-2" /> {t("admin.mentors.reactivate")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <SearchBox value={search} onChange={setSearch} placeholder={t("admin.mentors.searchPlaceholder")} testId="input-mentor-search" />
        <p className="text-sm text-muted-foreground" data-testid="text-mentor-count">
          {t("admin.showingCount", { shown: mentors.length, total: mentorsQuery.data?.length ?? 0 })}
        </p>
      </div>

      <Card className="overflow-x-auto">
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
            ) : mentorsQuery.isError ? (
              <EmptyRow colSpan={COLS}>{errorMessage(mentorsQuery.error, t("errors.somethingWentWrong"))}</EmptyRow>
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
                      <div className="flex items-center gap-3 min-w-[12rem]">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={mentor.photo_url || undefined} alt="" />
                          <AvatarFallback>{mentor.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{displayName(mentor)}</p>
                          <p className="text-xs text-muted-foreground truncate">{displayPosition(mentor) || mentor.company || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{mentor.email}</TableCell>
                    <TableCell className="text-sm">{mentor.country || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ActiveBadge active={mentor.is_available} activeLabel={t("admin.mentors.available")} inactiveLabel={t("admin.mentors.inactive")} />
                        {approval?.is_active && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="font-medium">{t("admin.mentors.ssoApproved")}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>{t("admin.mentors.ssoApprovedHint", { alias: approval.amazon_alias })}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {mentor.total_ratings ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-[#FF9900] fill-[#FF9900]" aria-hidden="true" />
                          {rating.toFixed(1)}
                          <span className="text-muted-foreground">({mentor.total_ratings})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(mentor.created_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{renderActions(mentor)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail sheet */}
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
                    <SheetTitle className="truncate">{displayName(detail)}</SheetTitle>
                    <SheetDescription className="truncate">
                      {[displayPosition(detail), detail.company].filter(Boolean).join(" · ") || detail.email}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label={t("admin.colEmail")}>{detail.email}</DetailField>
                <DetailField label={t("admin.colCountry")}>{detail.country}</DetailField>
                <DetailField label={t("admin.mentors.timezone")}>{detail.timezone}</DetailField>
                <DetailField label={t("admin.mentors.colJoined")}>{formatDate(detail.created_at)}</DetailField>
                <DetailField label={t("admin.mentors.calLink")}>{detail.cal_link}</DetailField>
                <DetailField label={t("admin.mentors.commsOwner")}>
                  {detail.comms_owner === "assistant" ? `${t("admin.mentors.assistant")}: ${detail.assistant_email || "—"}` : t("admin.mentors.mentorThemselves")}
                </DetailField>
                <DetailField label={t("admin.mentors.languages")}>{detail.languages_spoken?.join(", ")}</DetailField>
                <DetailField label={t("admin.mentors.preference")}>{detail.mentorship_preference ? t(`admin.mentors.preferenceValue.${detail.mentorship_preference}`) : undefined}</DetailField>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.expertise")}>
                    {detail.expertise?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.expertise.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}
                      </div>
                    ) : undefined}
                  </DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.industries")}>{detail.industries?.join(", ")}</DetailField>
                </div>
                <div className="sm:col-span-2">
                  <DetailField label={t("admin.mentors.bio")}><p className="whitespace-pre-line">{detail.bio}</p></DetailField>
                </div>
                {detail.why_joined && (
                  <div className="sm:col-span-2">
                    <DetailField label={t("admin.mentors.whyJoined")}><p className="whitespace-pre-line">{detail.why_joined}</p></DetailField>
                  </div>
                )}
              </div>

              <SheetFooter className="mt-8 flex-col sm:flex-row sm:justify-start gap-2">
                <Button asChild variant="outline" data-testid="button-sheet-open-profile">
                  <Link href={`/mentor/${detail.id}`}><ExternalLink className="w-4 h-4 me-2" />{t("admin.mentors.openProfile")}</Link>
                </Button>
                <Button variant="outline" onClick={() => openApprove(detail)} data-testid="button-sheet-approve-access">
                  <KeyRound className="w-4 h-4 me-2" />{t("admin.mentors.approveAccess")}
                </Button>
                {detail.is_available ? (
                  <Button variant="destructive" onClick={() => setDeactivating(detail)} data-testid="button-sheet-deactivate">
                    <UserX className="w-4 h-4 me-2" />{t("admin.mentors.deactivate")}
                  </Button>
                ) : (
                  <Button
                    onClick={() => availabilityMutation.mutate({ id: detail.id, isAvailable: true })}
                    disabled={availabilityMutation.isPending}
                    data-testid="button-sheet-reactivate"
                  >
                    <UserCheck className="w-4 h-4 me-2" />{t("admin.mentors.reactivate")}
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
            <AlertDialogTitle>{t("admin.mentors.deactivateTitle", { name: deactivating ? displayName(deactivating) : "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.mentors.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-deactivate-cancel">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C40000] hover:bg-[#a30000] text-white"
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
            <DialogDescription>{t("admin.mentors.approveAccessBody", { email: approving?.email ?? "" })}</DialogDescription>
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
                required
                data-testid="input-approve-alias"
              />
              <p className="text-xs text-muted-foreground">{t("admin.mentors.aliasHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-email">{t("admin.colEmail")}</Label>
              <Input id="approve-email" value={approving?.email ?? ""} readOnly disabled data-testid="input-approve-email" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApproving(null)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={approveMutation.isPending || !normalizeAlias(alias)} data-testid="button-approve-confirm">
                {approveMutation.isPending ? t("admin.saving") : t("admin.access.approve")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
