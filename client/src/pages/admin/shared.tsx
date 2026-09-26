import { useCallback, useEffect, useRef, useState, type LiHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { formatDate as formatDateIntl, formatDateTime as formatDateTimeIntl, UNAVAILABLE } from "@/lib/format";
import type { VerificationStatus } from "@/lib/database";

export { StatusBadge as BookingStatusBadge } from "@/components/StatusBadge";

// ==================== ROW HIGHLIGHT (anchored feedback) ====================

const HIGHLIGHT_MS = 2000;

/**
 * Anchored feedback for table mutations: call `highlight(id)` after a write
 * and the matching row (`{...rowProps(id)}`) tints for ~2s and scrolls into
 * view. Scrolling waits a frame so a row that react-query just re-rendered
 * (or newly inserted) is in the DOM.
 */
export function useRowHighlight() {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const highlight = useCallback((id: string) => {
    setHighlightedId(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const rowProps = useCallback(
    (id: string) => ({
      "data-row-id": id,
      "data-highlight": highlightedId === id ? "true" : undefined,
      className: "transition-colors duration-slow data-[highlight=true]:bg-accent",
    }),
    [highlightedId],
  );

  return { highlightedId, highlight, rowProps };
}

// ==================== FORMATTING ====================

/** Locale-aware date formatters bound to the active language (lib/format.ts under the hood). */
export function useFormatters() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const formatDate = useCallback((iso?: string | null) => (iso ? formatDateIntl(iso, lang) : UNAVAILABLE), [lang]);
  const formatDateTime = useCallback((iso?: string | null) => (iso ? formatDateTimeIntl(iso, lang) : UNAVAILABLE), [lang]);
  return { formatDate, formatDateTime };
}

// ==================== STATUS BADGES ====================

const VERIFICATION_TONE: Record<VerificationStatus, "success" | "warning" | "danger" | "neutral"> = {
  verified: "success",
  pending: "warning",
  rejected: "danger",
  unverified: "neutral",
};

export function VerificationBadge({ status }: { status?: VerificationStatus | null }) {
  const { t } = useTranslation();
  const value: VerificationStatus = status ?? "unverified";
  return <Badge tone={VERIFICATION_TONE[value]}>{t(`admin.verification.${value}`)}</Badge>;
}

export function ActiveBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? activeLabel : inactiveLabel}</Badge>;
}

export function RoleBadge({ role }: { role: "mentor" | "admin" }) {
  const { t } = useTranslation();
  return <Badge tone={role === "admin" ? "info" : "neutral"}>{t(`admin.role.${role}`)}</Badge>;
}

// ==================== LAYOUT PIECES ====================

/**
 * Admin lists are tables from Tailwind `lg` (1024px) up and cards below it: a phone or tablet
 * gets every field and action of a row without scrolling a table sideways. One composition is
 * mounted at a time (useMediaQuery), so rows keep one set of test ids and tab stops.
 */
export const useAdminTable = useIsDesktop;

/** The card list below `lg`: loading skeletons, an empty line, or the cards. */
export function AdminCardList({
  loading,
  emptyText,
  count,
  children,
  testId,
}: {
  loading: boolean;
  emptyText: string;
  count: number;
  children: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t("common.loading")}</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (count === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-body-sm text-muted-foreground text-pretty" data-testid={testId ? `${testId}-empty` : undefined}>
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid={testId}>
      {children}
    </ul>
  );
}

/** One row of an admin list as a card (a list item; its controls are real buttons). */
export function AdminCard({ className, children, ...rest }: LiHTMLAttributes<HTMLLIElement> & { [dataAttr: `data-${string}`]: string | undefined }) {
  return (
    <li className={cn("rounded-lg border border-border bg-card p-4 text-card-foreground", className)} {...rest}>
      {children}
    </li>
  );
}

/** Label/value pairs inside an admin card: a two-column list, so every value starts on one line. */
export function CardFields({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm", className)}>{children}</dl>;
}

/** One pair of a `CardFields` list. */
export function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children || UNAVAILABLE}</dd>
    </>
  );
}

/**
 * Search input. `dir="auto"` only once there is a value (as SearchIntent
 * does, F-46): Chromium resolves an EMPTY dir=auto input as LTR, which clips
 * the start of an Arabic placeholder; empty, it inherits the page direction.
 */
export function SearchBox({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        dir={value ? "auto" : undefined}
        className="ps-9"
        data-testid={testId}
      />
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-body-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

/** Skeleton rows with the table's geometry; the caller marks the table `aria-busy` while these show. */
export function LoadingRows({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={colSpan}>
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Error state for an admin queue (P2-18): what failed and a retry, never a silent zero. */
export function QueueError({ queue, onRetry }: { queue: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      role="alert"
      icon={TriangleAlert}
      title={t("admin.loadError", { queue })}
      description={t("admin.loadErrorBody")}
      className="py-10"
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t("common.tryAgain")}
        </Button>
      }
    />
  );
}

/** Label/value pair for detail sheets. */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-caption text-muted-foreground">{label}</p>
      <div className="break-words text-body-sm text-foreground">{children || UNAVAILABLE}</div>
    </div>
  );
}

/**
 * Translated message for a failed admin write: known PostgREST codes get
 * specific copy, everything else the generic line (raw Supabase messages are
 * English and never shown to the person).
 */
export function errorMessage(error: unknown, t: TFunction): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "42501") return t("errors.forbidden");
  if (code === "P0001") return t("errors.rateLimited");
  return t("errors.somethingWentWrong");
}
