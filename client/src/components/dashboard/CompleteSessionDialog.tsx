import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipRadio, ChipRadioGroup } from "@/components/discovery/FilterChip";
import { localizeCountry, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES, REPORTING_COUNTRIES, SESSION_MINUTE_PRESETS } from "@/lib/reporting";
import { cn } from "@/lib/utils";
import { ARIA_DISABLED_CLASS } from "@/pages/mentee/shared";

/** Radix Select cannot hold an empty-string value, so "no country" is this sentinel. */
const NO_COUNTRY = "__none";
/** The "Other…" duration chip; it reveals the free number field. */
const OTHER_DURATION = "__other";

export interface CompleteSessionInput {
  minutes: number;
  /** Reporting country; omitted = the booking keeps its country or inherits the mentor's. */
  country?: string;
}

/**
 * "Complete session" (extracted from the mentor portal's MySessions, same
 * copy and behaviour): one control for the duration — preset chips plus an
 * "Other" chip that reveals a number field (5–600 minutes) — and an optional
 * reporting country. The duration is mandatory because completion is the only
 * write that feeds volunteer hours. The caller performs the write.
 */
export function CompleteSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  defaultCountry = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CompleteSessionInput) => void;
  pending?: boolean;
  defaultCountry?: string;
}) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const [minutesInput, setMinutesInput] = useState("30");
  const [otherDuration, setOtherDuration] = useState(false);
  const [sessionCountry, setSessionCountry] = useState(defaultCountry);
  const minutesRef = useRef<HTMLInputElement | null>(null);

  // Every opening starts from the defaults for the booking it was opened for.
  useEffect(() => {
    if (!open) return;
    setMinutesInput("30");
    setOtherDuration(false);
    setSessionCountry(defaultCountry);
  }, [open, defaultCountry]);

  useEffect(() => {
    if (!otherDuration) return;
    const frame = window.requestAnimationFrame(() => minutesRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [otherDuration]);

  const parsedMinutes = Number.parseInt(minutesInput, 10);
  const minutesValid = Number.isInteger(parsedMinutes) && parsedMinutes >= MIN_SESSION_MINUTES && parsedMinutes <= MAX_SESSION_MINUTES;
  const durationChoice = !otherDuration && SESSION_MINUTE_PRESETS.some((preset) => preset === parsedMinutes) ? String(parsedMinutes) : OTHER_DURATION;
  const countryChoices = sessionCountry && !REPORTING_COUNTRIES.includes(sessionCountry) ? [sessionCountry, ...REPORTING_COUNTRIES] : REPORTING_COUNTRIES;

  const confirm = () => {
    if (!minutesValid || pending) return;
    onConfirm({ minutes: parsedMinutes, country: sessionCountry || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-complete-session">
        <DialogHeader>
          <DialogTitle>{t("mentorPortal.completeSessionTitle")}</DialogTitle>
          <DialogDescription>{t("mentorPortal.completeSessionDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label id={`${ids}-duration-label`}>{t("mentorPortal.sessionDuration")}</Label>
            <ChipRadioGroup
              aria-labelledby={`${ids}-duration-label`}
              value={durationChoice}
              onValueChange={(value) => {
                if (value === OTHER_DURATION) {
                  setOtherDuration(true);
                  return;
                }
                setOtherDuration(false);
                setMinutesInput(value);
              }}
            >
              {SESSION_MINUTE_PRESETS.map((preset) => (
                <ChipRadio key={preset} value={String(preset)} data-testid={`button-minutes-${preset}`}>
                  {t("mentorPortal.durationMinutes", { count: preset })}
                </ChipRadio>
              ))}
              <ChipRadio value={OTHER_DURATION} data-testid="button-minutes-other">
                {t("mentorPortal.otherDuration")}
              </ChipRadio>
            </ChipRadioGroup>
            {otherDuration && (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${ids}-minutes`} className="sr-only">
                    {t("mentorPortal.sessionDuration")}
                  </Label>
                  <Input
                    ref={minutesRef}
                    id={`${ids}-minutes`}
                    type="number"
                    inputMode="numeric"
                    min={MIN_SESSION_MINUTES}
                    max={MAX_SESSION_MINUTES}
                    value={minutesInput}
                    onChange={(event) => setMinutesInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") confirm();
                    }}
                    aria-invalid={!minutesValid}
                    aria-describedby={`${ids}-minutes-hint`}
                    className="w-28"
                    data-testid="input-session-minutes"
                  />
                  <span className="text-body-sm text-muted-foreground">{t("mentorPortal.minutesLabel")}</span>
                </div>
                <p id={`${ids}-minutes-hint`} className={cn("text-caption", minutesValid ? "text-muted-foreground" : "text-destructive")}>
                  {minutesValid
                    ? t("mentorPortal.minutesHint", { min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES })
                    : t("mentorPortal.invalidDuration", { min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES })}
                </p>
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-country`}>{t("mentorPortal.sessionCountry")}</Label>
            <Select value={sessionCountry || NO_COUNTRY} onValueChange={(value) => setSessionCountry(value === NO_COUNTRY ? "" : value)}>
              <SelectTrigger id={`${ids}-country`} data-testid="select-session-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUNTRY}>{t("mentorPortal.sessionCountryNone")}</SelectItem>
                {countryChoices.map((country) => (
                  <SelectItem key={country} value={country}>
                    {localizeCountry(country, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">{t("mentorPortal.sessionCountryHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending} data-testid="button-cancel-complete">
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            className={ARIA_DISABLED_CLASS}
            onClick={confirm}
            aria-disabled={!minutesValid || undefined}
            aria-describedby={!minutesValid ? `${ids}-minutes-hint` : undefined}
            loading={pending}
            data-testid="button-confirm-complete"
          >
            <CheckCircle2 aria-hidden="true" />
            {t("mentorPortal.confirmComplete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
