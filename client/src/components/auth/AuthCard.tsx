import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Auth page chrome shared by sign-in, sign-up, forgot and reset password:
 * a centred white card with the page `h1` (`id="page-title"`, focus target of
 * the route-change effect) and an optional description. No arbitrary hex,
 * no orange text; the one orange fill on these pages is the page's primary
 * action passed by the caller.
 */
export function AuthPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("container-page flex min-h-[calc(100dvh-3.5rem)] items-start justify-center py-10 md:items-center md:py-12", className)}>
      {children}
    </div>
  );
}

export function AuthCard({
  title,
  description,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className={cn("w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground md:p-8", className)} {...props}>
      <div className="mb-6 text-center">
        <h1 id="page-title" tabIndex={-1} className="text-h2-sm text-foreground md:text-h2">
          {title}
        </h1>
        {description && <p className="mt-2 text-body-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Input with a decorative leading icon at the inline-start (logical, so it mirrors in Arabic). */
export const IconInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input> & { icon: LucideIcon; trailing?: React.ReactNode }>(
  function IconInput({ icon: Icon, trailing, className, ...props }, ref) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <Input ref={ref} className={cn("ps-10", trailing && "pe-11", className)} {...props} />
        {trailing && <div className="absolute end-1 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    );
  },
);

/** Four-step password strength from the same rules the zod schema enforces. */
export function passwordStrength(password: string): { score: number; label: "weak" | "fair" | "good" | "strong" } {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[a-z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (score <= 25) return { score, label: "weak" };
  if (score <= 50) return { score, label: "fair" };
  if (score <= 75) return { score, label: "good" };
  return { score, label: "strong" };
}

export const STRENGTH_CLASS: Record<"weak" | "fair" | "good" | "strong", string> = {
  weak: "[&>div]:bg-destructive",
  fair: "[&>div]:bg-warning-icon",
  good: "[&>div]:bg-secondary",
  strong: "[&>div]:bg-success",
};
