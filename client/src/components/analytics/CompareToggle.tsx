import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface CompareToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** All time has no same-length previous window (P2-16). */
  unavailable: boolean;
}

/**
 * "Compare with the previous period" switch. When the period is All time the
 * control stays focusable with `aria-disabled` and a visible reason (P1-18),
 * never a silently greyed-out toggle.
 */
export function CompareToggle({ checked, onChange, unavailable }: CompareToggleProps) {
  const { t } = useTranslation();
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-1">
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
        <Label htmlFor={id} className="text-body-sm font-normal text-foreground">
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
