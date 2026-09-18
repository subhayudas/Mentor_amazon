import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Booking, VerificationStatus } from "@/lib/database";

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
      className: "transition-colors duration-700 data-[highlight=true]:bg-amber-100",
    }),
    [highlightedId],
  );

  return { highlightedId, highlight, rowProps };
}

// ==================== FORMATTING ====================

export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-AE" : "en-GB";

  const formatDate = useCallback(
    (iso?: string | null) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
    },
    [locale],
  );

  const formatDateTime = useCallback(
    (iso?: string | null) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    [locale],
  );

  return { formatDate, formatDateTime };
}

// ==================== STATUS BADGES ====================

const TONE: Record<"success" | "warning" | "danger" | "neutral" | "info", string> = {
  success: "border-transparent bg-[#E6F4F1] text-[#067D62]",
  warning: "border-transparent bg-amber-100 text-amber-800",
  danger: "border-transparent bg-[#FDECEC] text-[#C40000]",
  neutral: "border-transparent bg-muted text-muted-foreground",
  info: "border-transparent bg-sky-100 text-sky-800",
};

const BOOKING_TONE: Record<Booking["status"], keyof typeof TONE> = {
  pending: "warning",
  accepted: "info",
  confirmed: "info",
  completed: "success",
  rejected: "danger",
  canceled: "neutral",
};

export function BookingStatusBadge({ status }: { status: Booking["status"] }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("font-medium", TONE[BOOKING_TONE[status] ?? "neutral"])}>
      {t(`admin.bookingStatus.${status}`)}
    </Badge>
  );
}

const VERIFICATION_TONE: Record<VerificationStatus, keyof typeof TONE> = {
  verified: "success",
  pending: "warning",
  rejected: "danger",
  unverified: "neutral",
};

export function VerificationBadge({ status }: { status?: VerificationStatus | null }) {
  const { t } = useTranslation();
  const value: VerificationStatus = status ?? "unverified";
  return (
    <Badge variant="outline" className={cn("font-medium", TONE[VERIFICATION_TONE[value]])}>
      {t(`admin.verification.${value}`)}
    </Badge>
  );
}

export function ActiveBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", active ? TONE.success : TONE.neutral)}>
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: "mentor" | "admin" }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("font-medium", role === "admin" ? TONE.info : TONE.neutral)}>
      {t(`admin.role.${role}`)}
    </Badge>
  );
}

// ==================== LAYOUT PIECES ====================

interface StatTileProps {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  testId?: string;
}

/** Compact sibling of MetricCard: same card + icon chip, smaller type, plus a one-line breakdown. */
export function StatTile({ title, value, hint, icon: Icon, testId }: StatTileProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
          <p className="text-3xl font-bold leading-none text-foreground" data-testid={testId}>{value}</p>
          {hint && <p className="text-xs text-muted-foreground pt-1 truncate">{hint}</p>}
        </div>
        <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

export function SearchBox({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ps-9"
        data-testid={testId}
      />
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

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

/** Label/value pair for detail sheets. */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground break-words">{children || "—"}</div>
    </div>
  );
}

/** Extracts a readable message from Supabase/PostgREST errors and plain Errors. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}
