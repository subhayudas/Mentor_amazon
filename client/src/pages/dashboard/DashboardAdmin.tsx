import * as React from "react";
import { Link, Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { Ban, BadgeCheck, Building2, Download, ExternalLink, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { DashboardHeader, DashboardShell, Pill, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import { logActivity } from "@/lib/activity";
import { csvFilename, downloadCsv, toCsv, type CsvValue } from "@/lib/csv";
import type { Booking, Mentee, Mentor, VerificationStatus } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, useLocalCollection } from "@/lib/localStore";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Programme admin `/dashboard/admin`. Database mode: everyone is sent to the
 * database-backed `/admin` dashboard (admins see it, other roles see its
 * forbidden card) — this page never reads browser storage there (C3, F14).
 * Local (demo) mode: three queues on the rows people created in this browser:
 * mentors (list / unlist), mentees (approve / reject organisation
 * verification), bookings (cancel, CSV export), each logged to the local feed.
 */
type Tab = "mentors" | "mentees" | "bookings";

export default function DashboardAdmin() {
  if (!IS_LOCAL) return <Redirect to={ROUTES.admin} replace />;
  return <LocalDashboardAdmin />;
}

const td = "px-3 py-3 text-[14px] text-[var(--sc-ink)] align-middle";
const th = "px-3 py-2 text-start text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6c6c84]";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold transition-colors duration-fast";
const primary = `${btn} bg-[var(--sc-ink)] text-white hover:bg-black`;
const outline = `${btn} border border-[#d9d9d9] text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]`;

function verificationTone(status: VerificationStatus | undefined): "success" | "warning" | "destructive" | "neutral" {
  if (status === "verified") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "destructive";
  return "neutral";
}

function LocalDashboardAdmin() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { role, signedIn, displayName } = useDashboardIdentity();
  const mentors = useLocalCollection("mentors");
  const mentees = useLocalCollection("mentees");
  const bookings = useLocalCollection("bookings");
  const [tab, setTab] = React.useState<Tab>(() => (mentees.some((m) => m.verification_status === "pending") ? "mentees" : "mentors"));
  const when = React.useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), [lang]);
  const nf = React.useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const pendingOrgs = mentees.filter((m) => m.user_type === "organization" && m.verification_status === "pending");
  const isAdmin = signedIn && role === "admin";

  const mentorName = (id: string) => mentors.find((m) => m.id === id)?.name ?? FEATURED_MENTORS.find((m) => m.id === id)?.name ?? id;
  const menteeName = (id: string) => mentees.find((m) => m.id === id)?.name ?? t("showcase.bookings.mentee");

  const listMentor = (m: Mentor, listed: boolean) => {
    localStore.update("mentors", m.id, { is_available: listed, updated_at: new Date().toISOString() });
    logActivity({ actor_type: "admin", actor_id: "admin", actor_name: displayName, type: listed ? "mentor_listed" : "mentor_unlisted", subject_type: "mentor", subject_id: m.id, visible_to: [m.id], summary: t(listed ? "showcase.admin.log.listed" : "showcase.admin.log.unlisted", { name: m.name }) });
    toast.success(t(listed ? "showcase.admin.toast.listed" : "showcase.admin.toast.unlisted", { name: m.name }));
  };
  const decideMentee = (m: Mentee, status: "verified" | "rejected") => {
    localStore.update("mentees", m.id, { verification_status: status });
    logActivity({ actor_type: "admin", actor_id: "admin", actor_name: displayName, type: status === "verified" ? "mentee_verified" : "mentee_rejected", subject_type: "mentee", subject_id: m.id, visible_to: [m.id], summary: t(status === "verified" ? "showcase.admin.log.verified" : "showcase.admin.log.rejected", { name: m.organization_name || m.name }) });
    toast.success(t(status === "verified" ? "showcase.admin.toast.verified" : "showcase.admin.toast.rejected", { name: m.organization_name || m.name }));
  };
  const cancelBooking = (b: Booking) => {
    localStore.update("bookings", b.id, { status: "canceled", canceled_at: new Date().toISOString() });
    logActivity({ actor_type: "admin", actor_id: "admin", actor_name: displayName, type: "booking_canceled", subject_type: "booking", subject_id: b.id, visible_to: [b.mentor_id, b.mentee_id], summary: t("showcase.admin.log.canceled", { mentee: menteeName(b.mentee_id), mentor: mentorName(b.mentor_id) }) });
    toast.success(t("showcase.admin.toast.canceled"));
  };
  const exportCsv = () => {
    const headers = [t("showcase.report.col.mentor"), t("showcase.bookings.mentee"), t("bookingRequest.goalLabel"), t("status.pending").length ? t("showcase.admin.col.status") : "status", t("showcase.admin.col.scheduled"), t("showcase.admin.col.created")];
    const rows: CsvValue[][] = bookings.map((b) => [mentorName(b.mentor_id), menteeName(b.mentee_id), b.goal ?? "", t(`status.${b.status}`), b.scheduled_at ?? "", b.created_at]);
    downloadCsv(csvFilename("mentorconnect-bookings", new Date()), toCsv(headers, rows));
    toast.success(t("showcase.admin.toast.exported", { count: rows.length }));
  };

  if (!isAdmin) {
    return (
      <DashboardShell active="admin">
        <DashboardHeader title={t("showcase.admin.title")} />
        <div className="px-4 py-6 sm:px-8 lg:px-12">
          <div className="max-w-[560px] rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-6">
            <p className="text-[16px] font-semibold text-[var(--sc-ink)]">{t("showcase.admin.signInTitle")}</p>
            <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.admin.signInBody")}</p>
            <Link href={ROUTES.login} className={cn(primary, "mt-4 h-10")}>
              {t("nav.signIn")}
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="admin">
      <DashboardHeader
        title={t("showcase.admin.title")}
        pills={(["mentees", "mentors", "bookings"] as Tab[]).map((k) => (
          <Pill key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(`showcase.admin.tabs.${k}`)}
            {k === "mentees" && pendingOrgs.length > 0 && <span className="ms-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#d5534d] px-1.5 text-[11px] font-bold text-white">{pendingOrgs.length}</span>}
          </Pill>
        ))}
        trailing={
          tab === "bookings" ? (
            <button type="button" onClick={exportCsv} className={outline} data-testid="button-export-csv" disabled={bookings.length === 0}>
              <Download className="size-4" aria-hidden="true" />
              {t("showcase.admin.exportCsv")}
            </button>
          ) : undefined
        }
      />
      <div className="px-4 py-6 sm:px-8 lg:px-12">
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: t("showcase.admin.kpi.mentors"), value: `${nf.format(mentors.filter((m) => m.is_available).length)} / ${nf.format(mentors.length)}` },
            { label: t("showcase.admin.kpi.mentees"), value: nf.format(mentees.length) },
            { label: t("showcase.admin.kpi.pending"), value: nf.format(pendingOrgs.length) },
            { label: t("showcase.admin.kpi.bookings"), value: nf.format(bookings.length) },
          ].map((k) => (
            <div key={k.label} className="rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-4">
              <p className="text-[13px] text-[#6c6c84]">{k.label}</p>
              <p className="mt-1 text-[26px] font-bold leading-none text-[var(--sc-ink)] tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-[#6c6c84]">{t("showcase.admin.scopeNote")}</p>

        {tab === "mentors" && (
          <div className="mt-6 overflow-x-auto rounded-[12px] border border-[var(--sc-hairline)]">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[var(--sc-hairline)] bg-[#fcfbf9]">
                <tr>
                  <th className={th}>{t("showcase.report.col.mentor")}</th>
                  <th className={th}>{t("showcase.admin.col.role")}</th>
                  <th className={th}>{t("showcase.admin.col.expertise")}</th>
                  <th className={th}>{t("showcase.admin.col.joined")}</th>
                  <th className={th}>{t("showcase.admin.col.status")}</th>
                  <th className={th}>{t("showcase.admin.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {mentors.map((m) => (
                  <tr key={m.id} data-testid={`admin-mentor-${m.id}`}>
                    <td className={td}>
                      <span className="inline-flex items-center gap-3">
                        {m.photo_url ? <img src={m.photo_url} alt="" className="size-9 rounded-full object-cover" /> : <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[13px] font-bold" aria-hidden="true">{m.name.slice(0, 1)}</span>}
                        <span>
                          <span className="block font-semibold" dir="auto">{m.name}</span>
                          <span className="block text-[12px] text-[#6c6c84]" dir="ltr">{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className={td}>{[m.position, m.company].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={td}>{m.expertise.slice(0, 3).join(", ")}{m.expertise.length > 3 ? ` +${m.expertise.length - 3}` : ""}</td>
                    <td className={td}>{when.format(new Date(m.created_at))}</td>
                    <td className={td}>
                      <Badge tone={m.is_available ? "success" : "neutral"}>{t(m.is_available ? "showcase.admin.listed" : "showcase.admin.unlisted")}</Badge>
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-2">
                        {m.is_available ? (
                          <button type="button" className={outline} onClick={() => listMentor(m, false)} data-testid={`button-unlist-${m.id}`}>
                            <Ban className="size-4" aria-hidden="true" />
                            {t("showcase.admin.unlist")}
                          </button>
                        ) : (
                          <button type="button" className={primary} onClick={() => listMentor(m, true)} data-testid={`button-list-${m.id}`}>
                            <BadgeCheck className="size-4" aria-hidden="true" />
                            {t("showcase.admin.list")}
                          </button>
                        )}
                        <Link href={ROUTES.mentor(m.id)} className={outline}>
                          <ExternalLink className="size-4" aria-hidden="true" />
                          {t("showcase.admin.view")}
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
                {mentors.length === 0 && (
                  <tr>
                    <td className={td} colSpan={6}>
                      <span className="block py-6 text-center text-[#6c6c84]">{t("showcase.admin.empty.mentors")}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "mentees" && (
          <div className="mt-6 overflow-x-auto rounded-[12px] border border-[var(--sc-hairline)]">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="border-b border-[var(--sc-hairline)] bg-[#fcfbf9]">
                <tr>
                  <th className={th}>{t("showcase.bookings.mentee")}</th>
                  <th className={th}>{t("showcase.admin.col.type")}</th>
                  <th className={th}>{t("showcase.admin.col.organisation")}</th>
                  <th className={th}>{t("showcase.admin.col.joined")}</th>
                  <th className={th}>{t("showcase.admin.col.verification")}</th>
                  <th className={th}>{t("showcase.admin.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {mentees.map((m) => {
                  const org = m.user_type === "organization";
                  return (
                    <tr key={m.id} data-testid={`admin-mentee-${m.id}`}>
                      <td className={td}>
                        <span className="block font-semibold" dir="auto">{m.name}</span>
                        <span className="block text-[12px] text-[#6c6c84]" dir="ltr">{m.email}</span>
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1.5">
                          {org ? <Building2 className="size-4 text-[#6c6c84]" aria-hidden="true" /> : <UserRound className="size-4 text-[#6c6c84]" aria-hidden="true" />}
                          {t(org ? "showcase.admin.org" : "showcase.admin.individual")}
                        </span>
                      </td>
                      <td className={td}>{org ? [m.organization_name, m.organization_sector].filter(Boolean).join(" · ") || "—" : "—"}</td>
                      <td className={td}>{when.format(new Date(m.created_at))}</td>
                      <td className={td}>
                        {org ? <Badge tone={verificationTone(m.verification_status)}>{t(`showcase.admin.verification.${m.verification_status ?? "unverified"}`)}</Badge> : <span className="text-[#6c6c84]">—</span>}
                      </td>
                      <td className={td}>
                        {org && m.verification_status !== "verified" && (
                          <span className="flex flex-wrap gap-2">
                            <button type="button" className={primary} onClick={() => decideMentee(m, "verified")} data-testid={`button-verify-${m.id}`}>
                              <BadgeCheck className="size-4" aria-hidden="true" />
                              {t("showcase.admin.approve")}
                            </button>
                            {m.verification_status !== "rejected" && (
                              <button type="button" className={outline} onClick={() => decideMentee(m, "rejected")} data-testid={`button-reject-${m.id}`}>
                                <X className="size-4" aria-hidden="true" />
                                {t("showcase.admin.reject")}
                              </button>
                            )}
                          </span>
                        )}
                        {org && m.verification_status === "verified" && (
                          <button type="button" className={outline} onClick={() => decideMentee(m, "rejected")} data-testid={`button-revoke-${m.id}`}>
                            <Ban className="size-4" aria-hidden="true" />
                            {t("showcase.admin.revoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {mentees.length === 0 && (
                  <tr>
                    <td className={td} colSpan={6}>
                      <span className="block py-6 text-center text-[#6c6c84]">{t("showcase.admin.empty.mentees")}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "bookings" && (
          <div className="mt-6 overflow-x-auto rounded-[12px] border border-[var(--sc-hairline)]">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="border-b border-[var(--sc-hairline)] bg-[#fcfbf9]">
                <tr>
                  <th className={th}>{t("showcase.bookings.mentee")}</th>
                  <th className={th}>{t("showcase.report.col.mentor")}</th>
                  <th className={th}>{t("bookingRequest.goalLabel")}</th>
                  <th className={th}>{t("showcase.admin.col.scheduled")}</th>
                  <th className={th}>{t("showcase.admin.col.status")}</th>
                  <th className={th}>{t("showcase.admin.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {bookings
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((b) => (
                    <tr key={b.id} data-testid={`admin-booking-${b.id}`}>
                      <td className={td}>{menteeName(b.mentee_id)}</td>
                      <td className={td}>{mentorName(b.mentor_id)}</td>
                      <td className={td}>{b.goal ?? "—"}</td>
                      <td className={td}>{b.scheduled_at ? when.format(new Date(b.scheduled_at)) : t("showcase.bookings.timeTbc")}</td>
                      <td className={td}>
                        <StatusBadge status={b.status} />
                      </td>
                      <td className={td}>
                        {!["canceled", "completed", "rejected"].includes(b.status) && (
                          <button type="button" className={outline} onClick={() => cancelBooking(b)} data-testid={`button-admin-cancel-${b.id}`}>
                            <X className="size-4" aria-hidden="true" />
                            {t("showcase.bookings.cancel")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                {bookings.length === 0 && (
                  <tr>
                    <td className={td} colSpan={6}>
                      <span className="block py-6 text-center text-[#6c6c84]">{t("showcase.admin.empty.bookings")}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
