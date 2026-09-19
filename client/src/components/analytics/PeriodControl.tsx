import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIODS, type Period } from "@/lib/reporting";
import { useMinWidth } from "./useMinWidth";

interface PeriodControlProps {
  value: Period;
  onChange: (period: Period) => void;
}

/**
 * Period picker (spec §9, P1-30): a single-select segmented control on `sm+`
 * (Radix ToggleGroup → radio semantics, arrow keys, direction-aware) and a
 * labelled Select below `sm`, where four Arabic labels cannot sit side by
 * side. Exactly one of the two is in the DOM at a time.
 */
export function PeriodControl({ value, onChange }: PeriodControlProps) {
  const { t } = useTranslation();
  const id = useId();
  const wide = useMinWidth(640);
  const label = t("analyticsV2.period.label");

  if (!wide) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={id} className="text-caption text-muted-foreground">
          {label}
        </Label>
        <Select value={value} onValueChange={(next) => onChange(next as Period)}>
          <SelectTrigger id={id} data-testid="select-date-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period} value={period}>
                {t(`analyticsV2.period.${period}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as Period);
      }}
      aria-label={label}
      className="inline-flex justify-start gap-1 rounded-lg bg-muted p-1"
      data-testid="select-date-range"
    >
      {PERIODS.map((period) => (
        <ToggleGroupItem
          key={period}
          value={period}
          size="sm"
          className="h-8 min-w-0 rounded-md px-3 text-body-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
        >
          {t(`analyticsV2.period.${period}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
