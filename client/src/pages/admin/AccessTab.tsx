import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { formatNumber, UNAVAILABLE } from "@/lib/format";
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
import { cn } from "@/lib/utils";
import { ARIA_DISABLED_CLASS } from "@/pages/mentee/shared";
import {
  ActiveBadge,
  EmptyRow,
  LoadingRows,
  QueueError,
  RoleBadge,
  errorMessage,
  useFormatters,
  useRowHighlight,
} from "@/pages/admin/shared";

const ROLES: ApprovedRole[] = ["mentor", "admin"];

export default function AccessTab() {
  const { t, i18n } = useTranslation();
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
    onError: (error) => toast.error(errorMessage(error, t)),
  });

  const rejectMutation = useMutation({
    mutationFn: (request: AccessRequest) => adminService.resolveAccessRequest(request.id, "rejected", adminEmail),
    onSuccess: async (row) => {
      await invalidateAccess();
      setShowResolved(true);
      toast.success(t("admin.access.rejectedToast", { alias: row.amazon_alias }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminService.setApprovedUserActive(id, isActive),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvedUsers });
      toast.success(row.is_active ? t("admin.access.reactivatedToast", { alias: row.amazon_alias }) : t("admin.access.deactivatedToast", { alias: row.amazon_alias }));
      highlight(row.id);
    },
    onError: (error) => toast.error(errorMessage(error, t)),
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
    onError: (error) => toast.error(errorMessage(error, t)),
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
            <CardTitle className="text-h3">{t("admin.access.pendingTitle")}</CardTitle>
            <Badge tone={pending.length ? "warning" : "neutral"} data-testid="badge-pending-count">{formatNumber(pending.length, i18n.language)}</Badge>
          </div>
          <CardDescription>{t("admin.access.pendingHint")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0" aria-busy={requestsQuery.isLoading || undefined}>
          {requestsQuery.isError ? (
            <QueueError queue={t("admin.queues.access")} onRetry={() => requestsQuery.refetch()} />
          ) : (
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
              ) : pending.length === 0 ? (
                <EmptyRow colSpan={6}>{t("admin.access.noPending")}</EmptyRow>
              ) : (
                pending.map((request) => {
                  const role = roleByRequest[request.id] ?? "mentor";
                  return (
                    <TableRow key={request.id} {...rowProps(request.id)} data-testid={`row-request-${request.id}`}>
                      <TableCell className="font-mono text-body-sm font-medium text-foreground" dir="ltr">{request.amazon_alias}</TableCell>
                      <TableCell className="text-body-sm text-muted-foreground">{request.email ? <bdi dir="ltr">{request.email}</bdi> : UNAVAILABLE}</TableCell>
                      <TableCell className="text-body-sm">{request.name ? <bdi>{request.name}</bdi> : UNAVAILABLE}</TableCell>
                      <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground tabular-nums">{formatDateTime(request.requested_at)}</TableCell>
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
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => approveMutation.mutate({ request, role })}
                            loading={approveMutation.isPending && approveMutation.variables?.request.id === request.id}
                            disabled={busy}
                            data-testid={`button-approve-${request.id}`}
                          >
                            <Check aria-hidden="true" />{t("admin.access.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive-soft"
                            onClick={() => rejectMutation.mutate(request)}
                            loading={rejectMutation.isPending && rejectMutation.variables?.id === request.id}
                            disabled={busy}
                            data-testid={`button-reject-${request.id}`}
                          >
                            <X aria-hidden="true" />{t("admin.access.reject")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* Approved aliases */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-h3">{t("admin.access.approvedTitle")}</CardTitle>
            <Badge tone="neutral" data-testid="badge-approved-count">{formatNumber(approved.length, i18n.language)}</Badge>
          </div>
          <CardDescription>{t("admin.access.approvedHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <form onSubmit={submitAdd} className="grid grid-cols-1 items-end gap-3 px-6 sm:grid-cols-[1fr_1fr_10rem_auto]" data-testid="form-add-alias">
            <div className="space-y-1.5">
              <Label htmlFor="add-alias">{t("admin.access.alias")}</Label>
              <Input
                id="add-alias"
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder={t("admin.access.aliasPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                className="text-start"
                required
                data-testid="input-add-alias"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">{t("admin.colEmail")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></Label>
              <Input
                id="add-email"
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t("admin.access.emailPlaceholder")}
                autoComplete="off"
                dir="ltr"
                className="text-start"
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
            <Button type="submit" variant="secondary" loading={addMutation.isPending} aria-disabled={!normalizeAlias(form.alias) || undefined} data-testid="button-add-alias">
              <Plus aria-hidden="true" />{t("admin.access.addAlias")}
            </Button>
          </form>

          {approvedQuery.isError ? (
            <QueueError queue={t("admin.queues.approved")} onRetry={() => approvedQuery.refetch()} />
          ) : (
          <div className="overflow-x-auto" aria-busy={approvedQuery.isLoading || undefined}>
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
                ) : approved.length === 0 ? (
                  <EmptyRow colSpan={6}>{t("admin.access.noApproved")}</EmptyRow>
                ) : (
                  approved.map((row) => {
                    const self = isSelf(row);
                    return (
                      <TableRow key={row.id} {...rowProps(row.id)} data-testid={`row-approved-${row.id}`}>
                        <TableCell className="font-mono text-body-sm font-medium text-foreground" dir="ltr">{row.amazon_alias}</TableCell>
                        <TableCell className="text-body-sm text-muted-foreground">{row.email ? <bdi dir="ltr">{row.email}</bdi> : UNAVAILABLE}</TableCell>
                        <TableCell><RoleBadge role={row.role} /></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ActiveBadge active={row.is_active} activeLabel={t("admin.access.active")} inactiveLabel={t("admin.access.inactive")} />
                            {hasAccount(row) && <Badge tone="info">{t("admin.access.hasAccount")}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-body-sm text-muted-foreground">
                          <p className="max-w-[12rem] truncate">{row.approved_by ? <bdi dir="ltr">{row.approved_by}</bdi> : UNAVAILABLE}</p>
                          <p className="whitespace-nowrap text-caption tabular-nums">{formatDate(row.approved_at)}</p>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex flex-col items-end gap-1">
                            <Button
                              size="sm"
                              variant={row.is_active ? "outline" : "secondary"}
                              className={cn(row.is_active && "border-destructive/40 text-destructive hover:bg-destructive-soft", self && ARIA_DISABLED_CLASS)}
                              onClick={() => !self && toggleMutation.mutate({ id: row.id, isActive: !row.is_active })}
                              loading={toggleMutation.isPending && toggleMutation.variables?.id === row.id}
                              aria-disabled={self || undefined}
                              aria-describedby={self ? `self-note-${row.id}` : undefined}
                              data-testid={`button-toggle-approved-${row.id}`}
                            >
                              {row.is_active ? t("admin.access.deactivate") : t("admin.access.reactivate")}
                            </Button>
                            {self && (
                              <span id={`self-note-${row.id}`} className="text-caption text-muted-foreground">
                                {t("admin.access.cannotDeactivateSelf")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Resolved requests (audit trail) */}
      <Card>
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            aria-expanded={showResolved}
            className="flex min-h-11 w-full items-center gap-2 rounded-md text-start"
            data-testid="button-toggle-resolved"
          >
            <CardTitle className="text-h3">{t("admin.access.resolvedTitle")}</CardTitle>
            <Badge tone="neutral">{formatNumber(resolved.length, i18n.language)}</Badge>
            {showResolved ? <ChevronUp className="ms-auto size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="ms-auto size-4 text-muted-foreground" aria-hidden="true" />}
          </button>
          {!showResolved && <CardDescription>{t("admin.access.resolvedHint")}</CardDescription>}
        </CardHeader>
        {showResolved && (
          <CardContent className="overflow-x-auto p-0">
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
                      <TableCell className="font-mono text-body-sm" dir="ltr">{r.amazon_alias}</TableCell>
                      <TableCell className="text-body-sm text-muted-foreground">{r.email ? <bdi dir="ltr">{r.email}</bdi> : UNAVAILABLE}</TableCell>
                      <TableCell>
                        <ActiveBadge active={r.status === "approved"} activeLabel={t("admin.access.statusApproved")} inactiveLabel={t("admin.access.statusRejected")} />
                      </TableCell>
                      <TableCell className="text-body-sm text-muted-foreground">{r.resolved_by ? <bdi dir="ltr">{r.resolved_by}</bdi> : UNAVAILABLE}</TableCell>
                      <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground tabular-nums">{formatDateTime(r.resolved_at)}</TableCell>
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
