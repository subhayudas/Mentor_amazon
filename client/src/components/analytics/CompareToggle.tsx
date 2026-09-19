import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface CompareToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** All time has no same-length previous window (P2-16). */
  unavailable: boolean;
  /** Phone caption row (F-11): caption-size label so the switch shares one line with "Updated …". */
  compact?: boolean;
  className?: string;
}

/**
 * "Compare with the previous period" switch. When the period is All time the
 * control stays focusable with `aria-disabled` and a visible reason (P1-18),
 * never a silently greyed-out toggle.
 */
export function CompareToggle({ checked, onChange, unavailable, compact = false, className }: CompareToggleProps) {
  const { t } = useTranslation();
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={checked && !unavailable}
          aria-disabled={unavailable || undefined}
          aria-describedby={unavailable ? helpId : undefined}
          onCheckedChange={(next) => {
            if (!unavailable) onChange(next);
          }}
          className="aria-disabled:cursor-not-allowed aria-disabled:data-[state=unchecked]:bg-border"
        />
        <Label htmlFor={id} className={cn("font-normal text-foreground", compact ? "text-caption" : "text-body-sm")}>
          {t("analyticsV2.compare.label")}
        </Label>
      </div>
      {unavailable && (
        <p id={helpId} className="text-caption text-muted-foreground">
          {t("analyticsV2.compare.unavailable")}
        </p>
      )}
    </div>
  );
}
