import { useEffect, useState } from "react";
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
  disabled?: boolean;
}

/** "Export current view" + a popover with two date inputs for "Export date range". */
export function ExportBar({ onExportView, onExportRange, defaultFrom, defaultTo, disabled }: ExportBarProps) {
  const { t } = useTranslation();
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
      <Button
        variant="outline"
        size="sm"
        onClick={onExportView}
        disabled={disabled}
        data-testid="button-export-view"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {t("analytics.exportView")}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled} data-testid="button-export-range">
            <CalendarRange className="h-4 w-4" aria-hidden="true" />
            {t("analytics.exportRange")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3" data-testid="popover-export-range">
          <p className="text-xs text-muted-foreground">{t("analytics.exportRangeHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="export-from" className="text-xs">{t("analytics.exportFrom")}</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                data-testid="input-export-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="export-to" className="text-xs">{t("analytics.exportTo")}</Label>
              <Input
                id="export-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                data-testid="input-export-to"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={handleRangeExport}
            disabled={!rangeValid}
            data-testid="button-export-range-confirm"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("analytics.exportRangeConfirm")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
