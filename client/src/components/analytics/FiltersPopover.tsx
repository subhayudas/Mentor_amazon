import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface AnalyticsFilters {
  mentor: string;
  menteeType: string;
  language: string;
  expertise: string;
  country: string;
}

export const ALL = "all";
export const EMPTY_FILTERS: AnalyticsFilters = { mentor: ALL, menteeType: ALL, language: ALL, expertise: ALL, country: ALL };
export type FilterKey = keyof AnalyticsFilters;

interface FiltersPopoverProps {
  value: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  options: Record<FilterKey, FilterOption[]>;
  activeCount: number;
}

const FIELDS: Array<{ key: FilterKey; labelKey: string; allKey: string; testId: string }> = [
  { key: "mentor", labelKey: "analytics.mentor", allKey: "analytics.allMentors", testId: "select-mentor" },
  { key: "menteeType", labelKey: "analytics.menteeType", allKey: "analytics.allTypes", testId: "select-mentee-type" },
  { key: "language", labelKey: "analytics.language", allKey: "analytics.allLanguages", testId: "select-language" },
  { key: "expertise", labelKey: "analytics.expertise", allKey: "analytics.allExpertise", testId: "select-expertise" },
  { key: "country", labelKey: "analytics.country", allKey: "analytics.allCountries", testId: "select-country" },
];

/**
 * The five dimension filters behind one "Filters (n)" button (spec §9 tabs
 * bullet). Active filters are shown as removable chips by the page, so the
 * Selects never need to be visible to see what is applied.
 */
export function FiltersPopover({ value, onChange, options, activeCount }: FiltersPopoverProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="button-filters">
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />
          {activeCount > 0 ? t("analyticsV2.filters.buttonCount", { count: activeCount }) : t("analyticsV2.filters.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-xs space-y-3" data-testid="popover-filters">
        <p className="text-body-sm font-medium text-foreground">{t("analyticsV2.filters.title")}</p>
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`${id}-${field.key}`} className="text-caption text-muted-foreground">
              {t(field.labelKey)}
            </Label>
            <Select value={value[field.key]} onValueChange={(next) => onChange({ ...value, [field.key]: next })}>
              <SelectTrigger id={`${id}-${field.key}`} data-testid={field.testId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t(field.allKey)}</SelectItem>
                {options[field.key].map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {activeCount > 0 && (
          <Button type="button" variant="link" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            {t("analyticsV2.filters.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
