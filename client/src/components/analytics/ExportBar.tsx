import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ExportBarProps {
  onExportView: () => void;
  /** Receives ISO dates (yyyy-mm-dd). */
  onExportRange: (from: string, to: string) => void;
  defaultFrom: string;
  defaultTo: string;
  /** In-flight: the rows are still loading, so there is nothing to export yet. */
  disabled?: boolean;
}

/**
 * "Export current view" + a popover with two date inputs for "Export date
 * range" (admins only — the CSV carries mentee e-mails). The confirm button
 * stays focusable with `aria-disabled` and a visible reason while the range
 * is invalid (P1-18).
 */
export function ExportBar({ onExportView, onExportRange, defaultFrom, defaultTo, disabled }: ExportBarProps) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  // Re-seed the inputs from the page's current selection each time the popover opens.
  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
  }, [open, defaultFrom, defaultTo]);

  const rangeValid = Boolean(from) && Boolean(to) && from <= to;

  const handleRangeExport = () => {
    if (!rangeValid) return;
    onExportRange(from, to);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="export-bar">
      <Button type="button" variant="outline" size="sm" onClick={onExportView} disabled={disabled} data-testid="button-export-view">
        <Download aria-hidden="true" strokeWidth={1.5} />
        {t("analytics.exportView")}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} data-testid="button-export-range">
            <CalendarRange aria-hidden="true" strokeWidth={1.5} />
            {t("analytics.exportRange")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-xs space-y-3" data-testid="popover-export-range">
          <p className="text-caption text-muted-foreground">{t("analytics.exportRangeHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-from`} className="text-caption text-muted-foreground">{t("analytics.exportFrom")}</Label>
              <Input
                id={`${id}-from`}
                type="date"
                dir="ltr"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                data-testid="input-export-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-to`} className="text-caption text-muted-foreground">{t("analytics.exportTo")}</Label>
              <Input
                id={`${id}-to`}
                type="date"
                dir="ltr"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                data-testid="input-export-to"
              />
            </div>
          </div>
          {!rangeValid && (
            <p id={`${id}-help`} className="text-caption text-muted-foreground">
              {t("analyticsV2.export.rangeHelp")}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleRangeExport}
            aria-disabled={!rangeValid || undefined}
            aria-describedby={!rangeValid ? `${id}-help` : undefined}
            data-testid="button-export-range-confirm"
          >
            <Download aria-hidden="true" strokeWidth={1.5} />
            {t("analytics.exportRangeConfirm")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
