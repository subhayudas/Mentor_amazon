import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MONDAY_FIRST, weekdayLabels } from "@/lib/availability";
import type { MentorAvailability as AvailabilityRow } from "@/lib/database";
import { bidi, formatTime } from "@/lib/format";
import { useLeaveGuard } from "@/lib/leaveGuard";
import { queryClient } from "@/lib/queryClient";
import { mentorService } from "@/lib/services";
import { ARIA_DISABLED_CLASS, BookingsError } from "@/pages/mentee/shared";

interface LocalSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

/** "HH:00" values for the selects; labels come from Intl so Arabic gets its own hour cycle. */
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const HOUR_DATE = (hhmm: string) => new Date(Date.UTC(2024, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))));

const toLocal = (rows: AvailabilityRow[]): LocalSlot[] =>
  rows.map((a) => ({ id: a.id, day_of_week: a.day_of_week, start_time: a.start_time, end_time: a.end_time, is_active: a.is_active }));

const serialize = (slots: LocalSlot[]) =>
  JSON.stringify(
    [...slots]
      .map(({ id, ...rest }) => ({ ...rest, id: id.startsWith("new-") ? "" : id }))
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)),
  );

/**
 * Weekly typical-availability editor (P1-25, fixes matrix row 25). Server
 * rows are copied into local state with an effect whenever they load and the
 * editor is clean, so Save no longer wipes the other days. Each window must
 * end after it starts (inline error, Save blocked with a visible reason);
 * unsaved edits are guarded on navigation. Times are the mentor's profile
 * zone; the note says so and that the calendar link is the real schedule.
 *
 * Layout (F-41): ONE bordered list, one hairline-divided row per day — day
 * name at the start, its windows inline (toggle · from · to · remove, no
 * border of their own), a ghost "Add" at the trailing edge. Seven cards with
 * nested bordered rows and seven outline buttons were containers for
 * containers.
 */
export default function Availability({ mentorId, mentorTimeZone }: { mentorId: string; mentorTimeZone: string }) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const [slots, setSlots] = useState<LocalSlot[]>([]);
  const [baseline, setBaseline] = useState<string>("[]");

  const availabilityQuery = useQuery<AvailabilityRow[]>({
    queryKey: ["mentor", mentorId, "availability"],
    queryFn: () => mentorService.getAvailability(mentorId),
  });

  const dirty = serialize(slots) !== baseline;
  useLeaveGuard(dirty);

  // Hydrate from the server whenever fresh rows arrive and nothing is being edited.
  useEffect(() => {
    if (!availabilityQuery.data) return;
    const next = toLocal(availabilityQuery.data);
    const nextKey = serialize(next);
    setSlots((current) => (serialize(current) === baseline ? next : current));
    setBaseline(nextKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (toSave: LocalSlot[]) =>
      mentorService.setAvailability(
        mentorId,
        toSave.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, is_active: s.is_active })),
      ),
    onSuccess: () => {
      setBaseline(serialize(slots));
      queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "availability"] });
      queryClient.invalidateQueries({ queryKey: ["availability", "public"] });
      toast.success(t("dashboardV2.availability.saved"));
    },
    onError: () => toast.error(t("dashboardV2.availability.saveError")),
  });

  const invalidIds = useMemo(() => new Set(slots.filter((s) => s.end_time <= s.start_time).map((s) => s.id)), [slots]);
  const canSave = dirty && invalidIds.size === 0 && !saveMutation.isPending;

  const addSlot = (day: number) =>
    setSlots((current) => [...current, { id: `new-${Date.now()}-${current.length}`, day_of_week: day, start_time: "09:00", end_time: "17:00", is_active: true }]);
  const updateSlot = (id: string, patch: Partial<LocalSlot>) => setSlots((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSlot = (id: string) => setSlots((current) => current.filter((s) => s.id !== id));

  const dayNames = useMemo(() => weekdayLabels(i18n.language, "long"), [i18n.language]);
  const hourLabel = (hhmm: string) => formatTime(HOUR_DATE(hhmm), i18n.language, "UTC");

  const saveHint = !dirty
    ? t("dashboardV2.availability.noChanges")
    : invalidIds.size > 0
      ? t("dashboardV2.availability.fixInvalid")
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="max-w-prose text-body-sm text-muted-foreground text-pretty" data-testid="text-availability-note">
          {t("dashboardV2.availability.note", { tz: bidi(mentorTimeZone) })}
        </p>
        <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
          <Button
            variant="secondary"
            className={ARIA_DISABLED_CLASS}
            onClick={() => canSave && saveMutation.mutate(slots)}
            aria-disabled={!canSave || undefined}
            aria-describedby={saveHint ? `${ids}-save-hint` : undefined}
            loading={saveMutation.isPending}
            data-testid="button-save-availability"
          >
            <Save aria-hidden="true" />
            {t("dashboardV2.availability.save")}
          </Button>
          {saveHint && !saveMutation.isPending && (
            <span id={`${ids}-save-hint`} className="text-caption text-muted-foreground">
              {saveHint}
            </span>
          )}
        </div>
      </div>

      {availabilityQuery.isLoading ? (
        <div role="status" aria-busy="true" className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          <span className="sr-only">{t("common.loading")}</span>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3" aria-hidden="true">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : availabilityQuery.isError ? (
        <BookingsError onRetry={() => availabilityQuery.refetch()} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4" data-testid="list-availability-days">
          {MONDAY_FIRST.map((day, index) => {
            const daySlots = slots.filter((s) => s.day_of_week === day);
            const headingId = `${ids}-day-${day}`;
            return (
              <li key={day} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-3 md:grid-cols-[8rem_minmax(0,1fr)_auto]" data-testid={`day-${day}`}>
                <h2 id={headingId} className="min-h-9 self-start text-body font-medium leading-9 text-foreground">
                  {dayNames[index]}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-start-2 self-start text-secondary md:col-start-3"
                  onClick={() => addSlot(day)}
                  aria-label={t("dashboardV2.availability.addWindowFor", { day: dayNames[index] })}
                  data-testid={`button-add-slot-${day}`}
                >
                  <Plus aria-hidden="true" />
                  {t("dashboardV2.availability.add")}
                </Button>
                <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
                  {daySlots.length === 0 ? (
                    <p className="min-h-9 leading-9 text-body-sm text-muted-foreground">{t("dashboardV2.availability.noWindows")}</p>
                  ) : (
                    <ul className="space-y-2" aria-labelledby={headingId}>
                      {daySlots.map((slot) => {
                        const invalid = invalidIds.has(slot.id);
                        return (
                          <li key={slot.id} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid={`slot-${slot.id}`}>
                            <div className="flex min-w-24 items-center gap-2">
                              <Switch
                                id={`${ids}-active-${slot.id}`}
                                checked={slot.is_active}
                                onCheckedChange={(checked) => updateSlot(slot.id, { is_active: checked })}
                                data-testid={`switch-slot-${slot.id}`}
                              />
                              <Label htmlFor={`${ids}-active-${slot.id}`} className="text-body-sm">
                                {slot.is_active ? t("dashboardV2.availability.active") : t("dashboardV2.availability.paused")}
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`${ids}-start-${slot.id}`} className="sr-only">
                                {t("dashboardV2.availability.from")}
                              </Label>
                              <Select value={slot.start_time} onValueChange={(value) => updateSlot(slot.id, { start_time: value })}>
                                <SelectTrigger id={`${ids}-start-${slot.id}`} className="h-9 w-28" aria-invalid={invalid} data-testid={`select-start-${slot.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {HOURS.map((h) => (
                                    <SelectItem key={h} value={h}>
                                      {hourLabel(h)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-body-sm text-muted-foreground">{t("dashboardV2.availability.to")}</span>
                              <Label htmlFor={`${ids}-end-${slot.id}`} className="sr-only">
                                {t("dashboardV2.availability.until")}
                              </Label>
                              <Select value={slot.end_time} onValueChange={(value) => updateSlot(slot.id, { end_time: value })}>
                                <SelectTrigger id={`${ids}-end-${slot.id}`} className="h-9 w-28" aria-invalid={invalid} data-testid={`select-end-${slot.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {HOURS.map((h) => (
                                    <SelectItem key={h} value={h}>
                                      {hourLabel(h)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSlot(slot.id)}
                              aria-label={t("dashboardV2.availability.remove", { day: dayNames[index] })}
                              data-testid={`button-remove-slot-${slot.id}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                            {invalid && (
                              <p role="alert" className="basis-full text-caption text-destructive">
                                {t("dashboardV2.availability.invalidRange")}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
