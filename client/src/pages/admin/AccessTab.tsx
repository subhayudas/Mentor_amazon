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
  AdminCard,
  AdminCardList,
  CardField,
  CardFields,
  EmptyRow,
  LoadingRows,
  QueueError,
  RoleBadge,
  errorMessage,
  useAdminTable,
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
  const asTable = useAdminTable();

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

  // Row controls shared by the table and the cards (one composition is mounted at a time).
  const roleSelect = (request: AccessRequest, className: string) => (
    <Select value={roleByRequest[request.id] ?? "mentor"} onValueChange={(v) => setRoleByRequest((m) => ({ ...m, [request.id]: v as ApprovedRole }))}>
      <SelectTrigger className={className} aria-label={t("admin.access.role")} data-testid={`select-role-${request.id}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const decisionButtons = (request: AccessRequest, size: "sm" | "md") => (
    <>
      <Button
        size={size}
        variant="secondary"
        className={size === "md" ? "h-11" : undefined}
        onClick={() => approveMutation.mutate({ request, role: roleByRequest[request.id] ?? "mentor" })}
        loading={approveMutation.isPending && approveMutation.variables?.request.id === request.id}
        disabled={busy}
        data-testid={`button-approve-${request.id}`}
      >
        <Check aria-hidden="true" />{t("admin.access.approve")}
      </Button>
      <Button
        size={size}
        variant="outline"
        className={cn("border-destructive/40 text-destructive hover:bg-destructive-soft", size === "md" && "h-11")}
        onClick={() => rejectMutation.mutate(request)}
        loading={rejectMutation.isPending && rejectMutation.variables?.id === request.id}
        disabled={busy}
        data-testid={`button-reject-${request.id}`}
      >
        <X aria-hidden="true" />{t("admin.access.reject")}
      </Button>
    </>
  );

  const toggleButton = (row: ApprovedUser, size: "sm" | "md") => {
    const self = isSelf(row);
    return (
      <>
        <Button
          size={size}
          variant={row.is_active ? "outline" : "secondary"}
          className={cn(row.is_active && "border-destructive/40 text-destructive hover:bg-destructive-soft", self && ARIA_DISABLED_CLASS, size === "md" && "h-11")}
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
      </>
    );
  };

  const approvedStatus = (row: ApprovedUser) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActiveBadge active={row.is_active} activeLabel={t("admin.access.active")} inactiveLabel={t("admin.access.inactive")} />
      {hasAccount(row) && <Badge tone="info">{t("admin.access.hasAccount")}</Badge>}
    </div>
  );

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
        <CardContent className={cn(asTable ? "p-0" : "px-4 pb-4 pt-0")} aria-busy={requestsQuery.isLoading || undefined}>
          {requestsQuery.isError ? (
            <QueueError queue={t("admin.queues.access")} onRetry={() => requestsQuery.refetch()} />
          ) : asTable ? (
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
                pending.map((request) => (
                  <TableRow key={request.id} {...rowProps(request.id)} data-testid={`row-request-${request.id}`}>
                    <TableCell className="font-mono text-body-sm font-medium text-foreground" dir="ltr">
                      <p className="max-w-[13rem] truncate">{request.amazon_alias}</p>
                    </TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">
                      <p className="max-w-[13rem] truncate">{request.email ? <bdi dir="ltr">{request.email}</bdi> : UNAVAILABLE}</p>
                    </TableCell>
                    <TableCell className="text-body-sm">{request.name ? <bdi>{request.name}</bdi> : UNAVAILABLE}</TableCell>
                    <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground tabular-nums">{formatDateTime(request.requested_at)}</TableCell>
                    <TableCell>{roleSelect(request, "h-8 w-32")}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">{decisionButtons(request, "sm")}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          ) : (
            <AdminCardList loading={requestsQuery.isLoading} emptyText={t("admin.access.noPending")} count={pending.length} testId="list-access-requests">
              {pending.map((request) => (
                <AdminCard key={request.id} {...rowProps(request.id)} data-testid={`row-request-${request.id}`}>
                  <p className="break-all font-mono text-body-sm font-medium text-foreground" dir="ltr">{request.amazon_alias}</p>
                  <CardFields className="mt-2">
                    <CardField label={t("admin.colEmail")}>{request.email ? <bdi dir="ltr" className="break-all">{request.email}</bdi> : undefined}</CardField>
                    <CardField label={t("admin.access.name")}>{request.name ? <bdi>{request.name}</bdi> : undefined}</CardField>
                    <CardField label={t("admin.access.requested")}>{formatDateTime(request.requested_at)}</CardField>
                  </CardFields>
                  <div className="mt-3 space-y-1.5">
                    <p className="text-body-sm text-muted-foreground">{t("admin.access.role")}</p>
                    {roleSelect(request, "h-11 w-full")}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{decisionButtons(request, "md")}</div>
                </AdminCard>
              ))}
            </AdminCardList>
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
          ) : asTable ? (
          <div aria-busy={approvedQuery.isLoading || undefined}>
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
                  approved.map((row) => (
                    <TableRow key={row.id} {...rowProps(row.id)} data-testid={`row-approved-${row.id}`}>
                      <TableCell className="font-mono text-body-sm font-medium text-foreground" dir="ltr">
                        <p className="max-w-[13rem] truncate">{row.amazon_alias}</p>
                      </TableCell>
                      <TableCell className="text-body-sm text-muted-foreground">
                        <p className="max-w-[13rem] truncate">{row.email ? <bdi dir="ltr">{row.email}</bdi> : UNAVAILABLE}</p>
                      </TableCell>
                      <TableCell><RoleBadge role={row.role} /></TableCell>
                      <TableCell>{approvedStatus(row)}</TableCell>
                      <TableCell className="text-body-sm text-muted-foreground">
                        <p className="max-w-[12rem] truncate">{row.approved_by ? <bdi dir="ltr">{row.approved_by}</bdi> : UNAVAILABLE}</p>
                        <p className="whitespace-nowrap text-caption tabular-nums">{formatDate(row.approved_at)}</p>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex flex-col items-end gap-1">{toggleButton(row, "sm")}</div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          ) : (
            <div className="px-4 pb-4">
              <AdminCardList loading={approvedQuery.isLoading} emptyText={t("admin.access.noApproved")} count={approved.length} testId="list-approved">
                {approved.map((row) => (
                  <AdminCard key={row.id} {...rowProps(row.id)} data-testid={`row-approved-${row.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all font-mono text-body-sm font-medium text-foreground" dir="ltr">{row.amazon_alias}</p>
                      <RoleBadge role={row.role} />
                    </div>
                    <div className="mt-2">{approvedStatus(row)}</div>
                    <CardFields className="mt-3">
                      <CardField label={t("admin.colEmail")}>{row.email ? <bdi dir="ltr" className="break-all">{row.email}</bdi> : undefined}</CardField>
                      <CardField label={t("admin.access.approvedBy")}>
                        {row.approved_by ? <bdi dir="ltr" className="break-all">{row.approved_by}</bdi> : undefined}
                        <span className="block text-caption text-muted-foreground tabular-nums">{formatDate(row.approved_at)}</span>
                      </CardField>
                    </CardFields>
                    <div className="mt-4 flex flex-col items-start gap-1">{toggleButton(row, "md")}</div>
                  </AdminCard>
                ))}
              </AdminCardList>
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
          <CardContent className={cn(asTable ? "p-0" : "px-4 pb-4 pt-0")}>
            {asTable ? (
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
            ) : (
              <AdminCardList loading={false} emptyText={t("admin.access.noResolved")} count={resolved.length} testId="list-resolved">
                {resolved.map((r) => (
                  <AdminCard key={r.id} {...rowProps(r.id)} data-testid={`row-resolved-${r.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all font-mono text-body-sm text-foreground" dir="ltr">{r.amazon_alias}</p>
                      <ActiveBadge active={r.status === "approved"} activeLabel={t("admin.access.statusApproved")} inactiveLabel={t("admin.access.statusRejected")} />
                    </div>
                    <CardFields className="mt-2">
                      <CardField label={t("admin.colEmail")}>{r.email ? <bdi dir="ltr" className="break-all">{r.email}</bdi> : undefined}</CardField>
                      <CardField label={t("admin.access.resolvedBy")}>{r.resolved_by ? <bdi dir="ltr" className="break-all">{r.resolved_by}</bdi> : undefined}</CardField>
                      <CardField label={t("admin.access.resolvedAt")}>{formatDateTime(r.resolved_at)}</CardField>
                    </CardFields>
                  </AdminCard>
                ))}
              </AdminCardList>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
