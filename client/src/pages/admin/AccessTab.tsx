import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminQueryKeys, adminService, normalizeAlias, type ApprovedRole } from "@/lib/adminService";
import type { AccessRequest, ApprovedUser } from "@/lib/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ActiveBadge,
  EmptyRow,
  LoadingRows,
  RoleBadge,
  errorMessage,
  useFormatters,
  useRowHighlight,
} from "@/pages/admin/shared";

const ROLES: ApprovedRole[] = ["mentor", "admin"];

export default function AccessTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const adminEmail = user?.email ?? "admin";
  const queryClient = useQueryClient();
  const { formatDate, formatDateTime } = useFormatters();
  const { highlight, rowProps } = useRowHighlight();

  const requestsQuery = useQuery({ queryKey: adminQueryKeys.accessRequests, queryFn: adminService.getAccessRequests });
  const approvedQuery = useQuery({ queryKey: adminQueryKeys.approvedUsers, queryFn: adminService.getApprovedUsers });
  const usersQuery = useQuery({ queryKey: adminQueryKeys.users, queryFn: adminService.getUsers });

  const [roleByRequest, setRoleByRequest] = useState<Record<string, ApprovedRole>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [form, setForm] = useState<{ alias: string; email: string; role: ApprovedRole }>({ alias: "", email: "", role: "mentor" });

  const pending = useMemo(() => (requestsQuery.data ?? []).filter((r) => r.status === "pending"), [requestsQuery.data]);
  const resolved = useMemo(() => (requestsQuery.data ?? []).filter((r) => r.status !== "pending").slice(0, 25), [requestsQuery.data]);
  const approved = approvedQuery.data ?? [];

  /** Aliases that have already signed in at least once (a users row exists). */
  const aliasesWithAccount = useMemo(() => {
    const set = new Set<string>();
    (usersQuery.data ?? []).forEach((u) => {
      if (u.amazon_alias) set.add(u.amazon_alias.toLowerCase());
      if (u.email) set.add(u.email.toLowerCase());
    });
    return set;
  }, [usersQuery.data]);

  const hasAccount = (row: ApprovedUser) =>
    aliasesWithAccount.has(row.amazon_alias.toLowerCase()) || (!!row.email && aliasesWithAccount.has(row.email.toLowerCase()));

  /** The signed-in admin's own allow-list row must stay active, otherwise the next login locks them out. */
  const isSelf = (row: ApprovedUser) =>
    row.role === "admin" &&
    ((!!user?.amazon_alias && row.amazon_alias === normalizeAlias(user.amazon_alias)) ||
      (!!row.email && !!user?.email && row.email.toLowerCase() === user.email.toLowerCase()));

  const invalidateAccess = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.accessRequests }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvedUsers }),
    ]);

  const approveMutation = useMutation({
    mutationFn: ({ request, role }: { request: AccessRequest; role: ApprovedRole }) => adminService.approveAccessRequest(request, role, adminEmail),
    onSuccess: async ({ approved: row }) => {
      await invalidateAccess();
      toast.success(t("admin.access.approvedToast", { alias: row.amazon_alias, role: t(`admin.role.${row.role}`) }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  const rejectMutation = useMutation({
    mutationFn: (request: AccessRequest) => adminService.resolveAccessRequest(request.id, "rejected", adminEmail),
    onSuccess: async (row) => {
      await invalidateAccess();
      setShowResolved(true);
      toast.success(t("admin.access.rejectedToast", { alias: row.amazon_alias }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminService.setApprovedUserActive(id, isActive),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvedUsers });
      toast.success(row.is_active ? t("admin.access.reactivatedToast", { alias: row.amazon_alias }) : t("admin.access.deactivatedToast", { alias: row.amazon_alias }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      adminService.upsertApprovedUser({
        amazon_alias: form.alias,
        email: form.email || undefined,
        role: form.role,
        approved_by: adminEmail,
      }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvedUsers });
      setForm({ alias: "", email: "", role: "mentor" });
      toast.success(t("admin.access.addedToast", { alias: row.amazon_alias }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.somethingWentWrong"))),
  });

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!normalizeAlias(form.alias)) return;
    addMutation.mutate();
  };

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Pending requests */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{t("admin.access.pendingTitle")}</CardTitle>
            <Badge variant={pending.length ? "default" : "secondary"} data-testid="badge-pending-count">{pending.length}</Badge>
          </div>
          <CardDescription>{t("admin.access.pendingHint")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">{t("admin.access.alias")}</TableHead>
                <TableHead className="text-start">{t("admin.colEmail")}</TableHead>
                <TableHead className="text-start">{t("admin.access.name")}</TableHead>
                <TableHead className="text-start">{t("admin.access.requested")}</TableHead>
                <TableHead className="text-start">{t("admin.access.role")}</TableHead>
                <TableHead className="text-end"><span className="sr-only">{t("admin.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsQuery.isLoading ? (
                <LoadingRows colSpan={6} rows={2} />
              ) : requestsQuery.isError ? (
                <EmptyRow colSpan={6}>{errorMessage(requestsQuery.error, t("errors.somethingWentWrong"))}</EmptyRow>
              ) : pending.length === 0 ? (
                <EmptyRow colSpan={6}>{t("admin.access.noPending")}</EmptyRow>
              ) : (
                pending.map((request) => {
                  const role = roleByRequest[request.id] ?? "mentor";
                  return (
                    <TableRow key={request.id} {...rowProps(request.id)} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-semibold text-foreground font-mono text-sm">{request.amazon_alias}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{request.email || "—"}</TableCell>
                      <TableCell className="text-sm">{request.name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(request.requested_at)}</TableCell>
                      <TableCell>
                        <Select value={role} onValueChange={(v) => setRoleByRequest((m) => ({ ...m, [request.id]: v as ApprovedRole }))}>
                          <SelectTrigger className="h-8 w-32" aria-label={t("admin.access.role")} data-testid={`select-role-${request.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate({ request, role })}
                            disabled={busy}
                            data-testid={`button-approve-${request.id}`}
                          >
                            <Check className="w-4 h-4 me-1" />{t("admin.access.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[#C40000] border-[#C40000]/40 hover:bg-[#FDECEC]"
                            onClick={() => rejectMutation.mutate(request)}
                            disabled={busy}
                            data-testid={`button-reject-${request.id}`}
                          >
                            <X className="w-4 h-4 me-1" />{t("admin.access.reject")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approved aliases */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{t("admin.access.approvedTitle")}</CardTitle>
            <Badge variant="secondary" data-testid="badge-approved-count">{approved.length}</Badge>
          </div>
          <CardDescription>{t("admin.access.approvedHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <form onSubmit={submitAdd} className="px-6 grid grid-cols-1 sm:grid-cols-[1fr_1fr_10rem_auto] gap-3 items-end" data-testid="form-add-alias">
            <div className="space-y-1.5">
              <Label htmlFor="add-alias">{t("admin.access.alias")}</Label>
              <Input
                id="add-alias"
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="jdoe"
                autoComplete="off"
                spellCheck={false}
                required
                data-testid="input-add-alias"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">{t("admin.colEmail")} <span className="text-muted-foreground font-normal">({t("common.optional")})</span></Label>
              <Input
                id="add-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jdoe@amazon.com"
                autoComplete="off"
                data-testid="input-add-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-role">{t("admin.access.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as ApprovedRole }))}>
                <SelectTrigger id="add-role" data-testid="select-add-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addMutation.isPending || !normalizeAlias(form.alias)} data-testid="button-add-alias">
              <Plus className="w-4 h-4 me-1" />{addMutation.isPending ? t("admin.saving") : t("admin.access.addAlias")}
            </Button>
          </form>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("admin.access.alias")}</TableHead>
                  <TableHead className="text-start">{t("admin.colEmail")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.role")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.status")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.approvedBy")}</TableHead>
                  <TableHead className="text-end"><span className="sr-only">{t("admin.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedQuery.isLoading ? (
                  <LoadingRows colSpan={6} rows={3} />
                ) : approvedQuery.isError ? (
                  <EmptyRow colSpan={6}>{errorMessage(approvedQuery.error, t("errors.somethingWentWrong"))}</EmptyRow>
                ) : approved.length === 0 ? (
                  <EmptyRow colSpan={6}>{t("admin.access.noApproved")}</EmptyRow>
                ) : (
                  approved.map((row) => {
                    const self = isSelf(row);
                    return (
                      <TableRow key={row.id} {...rowProps(row.id)} data-testid={`row-approved-${row.id}`}>
                        <TableCell className="font-semibold text-foreground font-mono text-sm">{row.amazon_alias}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.email || "—"}</TableCell>
                        <TableCell><RoleBadge role={row.role} /></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ActiveBadge active={row.is_active} activeLabel={t("admin.access.active")} inactiveLabel={t("admin.access.inactive")} />
                            {hasAccount(row) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="font-medium">{t("admin.access.hasAccount")}</Badge>
                                </TooltipTrigger>
                                <TooltipContent>{t("admin.access.hasAccountHint")}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <p className="truncate max-w-[12rem]">{row.approved_by || "—"}</p>
                          <p className="text-xs whitespace-nowrap">{formatDate(row.approved_at)}</p>
                        </TableCell>
                        <TableCell className="text-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block">
                                <Button
                                  size="sm"
                                  variant={row.is_active ? "outline" : "default"}
                                  className={cn(row.is_active && "text-[#C40000] border-[#C40000]/40 hover:bg-[#FDECEC]")}
                                  onClick={() => toggleMutation.mutate({ id: row.id, isActive: !row.is_active })}
                                  disabled={toggleMutation.isPending || self}
                                  data-testid={`button-toggle-approved-${row.id}`}
                                >
                                  {row.is_active ? t("admin.access.deactivate") : t("admin.access.reactivate")}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {self && <TooltipContent>{t("admin.access.cannotDeactivateSelf")}</TooltipContent>}
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resolved requests (audit trail) */}
      <Card>
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            aria-expanded={showResolved}
            className="flex items-center gap-2 text-start w-full"
            data-testid="button-toggle-resolved"
          >
            <CardTitle className="text-base">{t("admin.access.resolvedTitle")}</CardTitle>
            <Badge variant="secondary">{resolved.length}</Badge>
            {showResolved ? <ChevronUp className="w-4 h-4 ms-auto text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 ms-auto text-muted-foreground" aria-hidden="true" />}
          </button>
          {!showResolved && <CardDescription>{t("admin.access.resolvedHint")}</CardDescription>}
        </CardHeader>
        {showResolved && (
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("admin.access.alias")}</TableHead>
                  <TableHead className="text-start">{t("admin.colEmail")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.status")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.resolvedBy")}</TableHead>
                  <TableHead className="text-start">{t("admin.access.resolvedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.length === 0 ? (
                  <EmptyRow colSpan={5}>{t("admin.access.noResolved")}</EmptyRow>
                ) : (
                  resolved.map((r) => (
                    <TableRow key={r.id} {...rowProps(r.id)} data-testid={`row-resolved-${r.id}`}>
                      <TableCell className="font-mono text-sm">{r.amazon_alias}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell>
                        <ActiveBadge active={r.status === "approved"} activeLabel={t("admin.access.statusApproved")} inactiveLabel={t("admin.access.statusRejected")} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.resolved_by || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(r.resolved_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
