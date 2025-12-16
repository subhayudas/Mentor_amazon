import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Calendar, Plus, Trash2, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { MentorAvailability as AvailabilityType } from "@shared/schema";

interface AvailabilityProps {
  mentorId: string;
}

const DAYS_OF_WEEK = [
  { value: 0, key: 'sunday' },
  { value: 1, key: 'monday' },
  { value: 2, key: 'tuesday' },
  { value: 3, key: 'wednesday' },
  { value: 4, key: 'thursday' },
  { value: 5, key: 'friday' },
  { value: 6, key: 'saturday' },
];

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return { value: `${hour}:00`, label: `${hour}:00` };
});

interface LocalSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export default function Availability({ mentorId }: AvailabilityProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();
  const [slots, setSlots] = useState<LocalSlot[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: availability, isLoading } = useQuery<AvailabilityType[]>({
    queryKey: ['/api/mentor', mentorId, 'availability'],
    enabled: !!mentorId,
  });

  useState(() => {
    if (availability) {
      setSlots(availability.map(a => ({
        id: a.id,
        day_of_week: a.day_of_week,
        start_time: a.start_time,
        end_time: a.end_time,
        is_active: a.is_active,
      })));
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (slotsToSave: LocalSlot[]) => {
      return apiRequest("PUT", `/api/mentor/${mentorId}/availability`, {
        slots: slotsToSave.map(s => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          is_active: s.is_active,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'availability'] });
      setHasChanges(false);
      toast({
        title: t('common.success'),
        description: t('mentorPortal.availabilitySaved'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.availabilitySaveError'),
        variant: "destructive",
      });
    },
  });

  const addSlot = (dayOfWeek: number) => {
    const newSlot: LocalSlot = {
      id: `new-${Date.now()}`,
      day_of_week: dayOfWeek,
      start_time: "09:00",
      end_time: "17:00",
      is_active: true,
    };
    setSlots([...slots, newSlot]);
    setHasChanges(true);
  };

  const updateSlot = (id: string, updates: Partial<LocalSlot>) => {
    setSlots(slots.map(s => s.id === id ? { ...s, ...updates } : s));
    setHasChanges(true);
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter(s => s.id !== id));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(slots);
  };

  const currentSlots = slots.length > 0 ? slots : (availability ?? []).map(a => ({
    id: a.id,
    day_of_week: a.day_of_week,
    start_time: a.start_time,
    end_time: a.end_time,
    is_active: a.is_active,
  }));

  const getSlotsForDay = (dayOfWeek: number) => {
    return currentSlots.filter(s => s.day_of_week === dayOfWeek);
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-availability-title">
            {t('mentorPortal.availability')}
          </h1>
          <p className="text-muted-foreground">
            {t('mentorPortal.availabilitySubtitle')}
          </p>
        </div>

        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-availability"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? t('common.loading') : t('mentorPortal.saveChanges')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {DAYS_OF_WEEK.map((day) => {
            const daySlots = getSlotsForDay(day.value);
            return (
              <Card key={day.value}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-base font-medium">
                      {t(`mentorPortal.days.${day.key}`)}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addSlot(day.value)}
                      data-testid={`button-add-slot-${day.value}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {t('mentorPortal.addSlot')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {daySlots.length > 0 ? (
                    <div className="space-y-3">
                      {daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center gap-4 p-3 border rounded-lg flex-wrap"
                          data-testid={`slot-${slot.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={slot.is_active}
                              onCheckedChange={(checked) => 
                                updateSlot(slot.id, { is_active: checked })
                              }
                              data-testid={`switch-slot-${slot.id}`}
                            />
                            <Label className="text-sm">
                              {slot.is_active ? t('mentorPortal.active') : t('mentorPortal.inactive')}
                            </Label>
                          </div>

                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <Select
                              value={slot.start_time}
                              onValueChange={(value) => 
                                updateSlot(slot.id, { start_time: value })
                              }
                            >
                              <SelectTrigger className="w-24" data-testid={`select-start-${slot.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map((time) => (
                                  <SelectItem key={time.value} value={time.value}>
                                    {time.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-muted-foreground">-</span>
                            <Select
                              value={slot.end_time}
                              onValueChange={(value) => 
                                updateSlot(slot.id, { end_time: value })
                              }
                            >
                              <SelectTrigger className="w-24" data-testid={`select-end-${slot.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map((time) => (
                                  <SelectItem key={time.value} value={time.value}>
                                    {time.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeSlot(slot.id)}
                            data-testid={`button-remove-slot-${slot.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t('mentorPortal.noSlotsConfigured')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
