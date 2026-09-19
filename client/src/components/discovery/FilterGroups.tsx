import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { FacetOption } from "@/lib/discovery";
import type { DiscoveryState } from "@/lib/discoveryState";
import { bidi, formatNumber, viewerTimeZone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The filter groups shared by the desktop rail and the mobile drawer (P2-10):
 * Expertise, Language and "Accepting requests" by default; Industry and
 * "Within 3 hours of my time zone" under a collapsed "More filters" that
 * opens itself when one of those is active. Options are checkboxes (real
 * `<label for>` rows, 36px tall, 44px on touch) with the count of mentors a
 * click will deliver (faceted against every other constraint, F-26); an
 * option the current selection rules out is dimmed, never hidden, and stays
 * checkable so a visitor can swap one constraint for another. Labels arrive
 * localized from `lib/discovery.ts`; the values written to the URL are the
 * stored EN keys.
 *
 * The legacy test ids survive on the group containers:
 * `select-expertise-filter`, `select-language-filter`, `select-industry-filter`.
 */
export interface FilterFacets {
  expertise: FacetOption[];
  language: FacetOption[];
  industry: FacetOption[];
}

export type FilterValue = Pick<DiscoveryState, "expertise" | "industry" | "language" | "available" | "near">;

export const EMPTY_FILTERS: FilterValue = { expertise: [], industry: [], language: [], available: false, near: false };

export function pickFilters(state: DiscoveryState): FilterValue {
  return {
    expertise: state.expertise,
    industry: state.industry,
    language: state.language,
    available: state.available,
    near: state.near,
  };
}

export interface FilterGroupsProps {
  facets: FilterFacets;
  value: FilterValue;
  onChange: (patch: Partial<FilterValue>) => void;
  /** Unique prefix for the checkbox ids (rail and drawer never mount together, but be safe). */
  idPrefix: string;
  className?: string;
}

const INITIAL_VISIBLE = 8;
// Built with the constructor so the `u` flag compiles under the repo's tsc target.
const NON_ALNUM = new RegExp("[^\\p{L}\\p{N}]+", "gu");

function toggleValue(list: string[], value: string, on: boolean): string[] {
  if (on) return list.includes(value) ? list : [...list, value];
  return list.filter((v) => v !== value);
}

interface CheckRowProps {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function CheckRow({ id, label, count, checked, onCheckedChange }: CheckRowProps) {
  const { t, i18n } = useTranslation();
  // Zero under the other constraints: dimmed (text only — the checkbox keeps
  // its contrast and stays operable), never disabled or hidden.
  const dimmed = count === 0 && !checked;
  return (
    <label
      htmlFor={id}
      data-dimmed={dimmed || undefined}
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md py-1 pe-1 text-body-sm transition-colors duration-fast coarse:min-h-11",
        dimmed ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      <span className="min-w-0 flex-1">{label}</span>
      {count != null && (
        <>
          <span className="shrink-0 text-caption tabular-nums text-muted-foreground" aria-hidden="true">
            {formatNumber(count, i18n.language)}
          </span>
          <span className="sr-only">, {t("discovery.filters.optionCount", { count })}</span>
        </>
      )}
    </label>
  );
}

interface CheckboxGroupProps {
  title: string;
  testId: string;
  idPrefix: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string, on: boolean) => void;
}

function CheckboxGroup({ title, testId, idPrefix, options, selected, onToggle }: CheckboxGroupProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const overflow = Math.max(0, options.length - INITIAL_VISIBLE);
  // Selected options always stay visible even when the list is collapsed.
  const shown = expanded
    ? options
    : options.filter((o, i) => i < INITIAL_VISIBLE || selected.includes(o.value));
  const hidden = options.length - shown.length;

  if (options.length === 0) return null;

  return (
    <fieldset data-testid={testId} className="min-w-0 border-0 p-0">
      <legend className="mb-1 text-body-sm font-medium text-foreground">{title}</legend>
      <ul className="flex flex-col">
        {shown.map((option) => {
          const id = `${idPrefix}-${testId}-${option.value.replace(NON_ALNUM, "-")}`;
          return (
            <li key={option.value}>
              <CheckRow
                id={id}
                label={option.label}
                count={option.count}
                checked={selected.includes(option.value)}
                onCheckedChange={(on) => onToggle(option.value, on)}
              />
            </li>
          );
        })}
      </ul>
      {overflow > 0 && (hidden > 0 || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-md text-body-sm font-medium text-secondary transition-colors duration-fast hover:underline"
        >
          {expanded ? t("discovery.filters.showLess") : t("discovery.filters.showMore", { count: hidden })}
          <ChevronDown
            className={cn("size-4 transition-transform duration-base ease-out motion-reduce:transition-none", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}
    </fieldset>
  );
}

export function FilterGroups({ facets, value, onChange, idPrefix, className }: FilterGroupsProps) {
  const { t } = useTranslation();
  const moreActive = value.industry.length > 0 || value.near;
  const [moreOpen, setMoreOpen] = React.useState(moreActive);
  React.useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);
  const viewerTz = React.useMemo(() => viewerTimeZone(), []);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <CheckboxGroup
        title={t("discovery.filters.expertise")}
        testId="select-expertise-filter"
        idPrefix={idPrefix}
        options={facets.expertise}
        selected={value.expertise}
        onToggle={(tag, on) => onChange({ expertise: toggleValue(value.expertise, tag, on) })}
      />
      <CheckboxGroup
        title={t("discovery.filters.language")}
        testId="select-language-filter"
        idPrefix={idPrefix}
        options={facets.language}
        selected={value.language}
        onToggle={(lang, on) => onChange({ language: toggleValue(value.language, lang, on) })}
      />
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 text-body-sm font-medium text-foreground">{t("discovery.filters.availability")}</legend>
        <CheckRow
          id={`${idPrefix}-available`}
          label={t("discovery.filters.accepting")}
          checked={value.available}
          onCheckedChange={(on) => onChange({ available: on })}
        />
      </fieldset>

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="border-t border-border pt-4">
        <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md text-body-sm font-medium text-foreground transition-colors duration-fast hover:text-secondary">
          {moreOpen ? t("discovery.filters.less") : t("discovery.filters.more")}
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform duration-base ease-out motion-reduce:transition-none", moreOpen && "rotate-180")}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-6 pt-3">
          <CheckboxGroup
            title={t("discovery.filters.industry")}
            testId="select-industry-filter"
            idPrefix={idPrefix}
            options={facets.industry}
            selected={value.industry}
            onToggle={(tag, on) => onChange({ industry: toggleValue(value.industry, tag, on) })}
          />
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-1 text-body-sm font-medium text-foreground">{t("discovery.filters.timezone")}</legend>
            <CheckRow
              id={`${idPrefix}-near`}
              label={t("discovery.filters.near")}
              checked={value.near}
              onCheckedChange={(on) => onChange({ near: on })}
            />
            <p className="ps-[1.625rem] text-caption text-muted-foreground">{t("discovery.filters.yourTimeZone", { tz: bidi(viewerTz) })}</p>
          </fieldset>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
