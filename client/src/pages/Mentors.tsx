import * as React from "react";
import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActiveFilters, type ActiveFilter } from "@/components/discovery/ActiveFilters";
import { ExampleChipsSkeleton } from "@/components/discovery/ExampleChips";
import { FilterChip } from "@/components/discovery/FilterChip";
import { FilterDrawer } from "@/components/discovery/FilterDrawer";
import { EMPTY_FILTERS, pickFilters, type FilterFacets, type FilterValue } from "@/components/discovery/FilterGroups";
import { FilterRail } from "@/components/discovery/FilterRail";
import { MentorGrid } from "@/components/discovery/MentorGrid";
import { SearchIntent } from "@/components/discovery/SearchIntent";
import { ZeroResults } from "@/components/discovery/ZeroResults";
import { useIsDesktop, useIsPhone } from "@/hooks/useMediaQuery";
import { useMentors } from "@/components/discovery/useMentors";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EXAMPLE_CHIP_LIMIT,
  SORT_THRESHOLD,
  applyDiscovery,
  facetCounts,
  type FacetOption,
} from "@/lib/discovery";
import { viewerTimeZone } from "@/lib/format";
import {
  DISCOVERY_SORTS,
  activeFilterCount,
  remember,
  serializeDiscovery,
  useDebouncedUrlWrite,
  useDiscoveryUrlState,
  useRawSearch,
  type DiscoverySort,
  type DiscoveryState,
} from "@/lib/urlState";

/**
 * `/mentors` — full discovery (spec §5 as amended by P0-5, P0-8, P1-2, P1-12,
 * P1-29, P2-7, P2-10).
 *
 * Data: ONE `['mentors']` query shared with the landing; everything else is a
 * pure `applyDiscovery` over it in `useMemo`.
 *
 * State: the URL is the source of truth for filters and sort (each click is
 * one `push`); the search text lives in component state and filters on every
 * keystroke while the URL's `q` follows through a 300 ms `replace` debounce
 * (flushed on Enter). URL changes from outside (back/forward, a chip link)
 * re-hydrate the text unless they are the echo of our own write. The result
 * count in the live region is computed from the URL state, so it updates
 * after the debounce rather than per keystroke.
 */
const SEARCH_INPUT_PROPS = { "data-testid": "input-search-mentors" } as React.InputHTMLAttributes<HTMLInputElement>;

const CLEARED_FILTERS: Partial<DiscoveryState> = { ...EMPTY_FILTERS };

function labelFor(options: FacetOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Rail geometry while the catalogue loads: two groups of option rows. Decorative; the grid announces loading. */
function FilterRailSkeleton() {
  return (
    <div aria-hidden="true" className="hidden w-64 shrink-0 lg:block">
      <Skeleton className="mb-6 h-7 w-20" />
      {[5, 4].map((rows, g) => (
        <div key={g} className="mb-6">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Mentors() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const sortId = React.useId();

  const [urlState, write] = useDiscoveryUrlState();
  const raw = useRawSearch();
  const { schedule, flush, cancel, lastWrittenRef } = useDebouncedUrlWrite(write);
  const [query, setQuery] = React.useState(urlState.q);
  const resultsHeadingRef = React.useRef<HTMLHeadingElement>(null);

  // P1-12: profile back links return to these filters.
  React.useEffect(() => {
    remember(raw);
  }, [raw]);

  // P0-8: re-hydrate the search text from the URL on popstate / external
  // navigation, never from the echo of our own debounced write.
  React.useEffect(() => {
    const incoming = raw.replace(/^\?/, "");
    if (lastWrittenRef.current != null && lastWrittenRef.current === incoming) return;
    cancel();
    setQuery(urlState.q);
  }, [raw, urlState.q, cancel, lastWrittenRef]);

  const mentorsQuery = useMentors();
  const mentors = mentorsQuery.data;
  const viewerTz = React.useMemo(() => viewerTimeZone(), []);
  const ctx = React.useMemo(() => ({ lang, viewerTz }), [lang, viewerTz]);

  const liveState = React.useMemo<DiscoveryState>(() => ({ ...urlState, q: query }), [urlState, query]);
  const results = React.useMemo(() => (mentors ? applyDiscovery(mentors, liveState, ctx) : []), [mentors, liveState, ctx]);
  const announcedCount = React.useMemo(
    () => (mentors ? applyDiscovery(mentors, urlState, ctx).length : null),
    [mentors, urlState, ctx],
  );

  const facets = React.useMemo<FilterFacets>(
    () => ({
      expertise: facetCounts(mentors ?? [], "expertise", lang),
      language: facetCounts(mentors ?? [], "languages_spoken", lang),
      industry: facetCounts(mentors ?? [], "industries", lang),
    }),
    [mentors, lang],
  );
  const exampleTags = facets.expertise.slice(0, EXAMPLE_CHIP_LIMIT);
  const total = mentors?.length ?? 0;
  const filterCount = activeFilterCount(urlState);
  const showSort = total > SORT_THRESHOLD;

  const pushState = React.useCallback(
    (patch: Partial<DiscoveryState>) => {
      cancel();
      const next: DiscoveryState = { ...urlState, q: query, ...patch };
      lastWrittenRef.current = serializeDiscovery(next).toString();
      write(next, "push");
    },
    [cancel, urlState, query, write, lastWrittenRef],
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    schedule({ ...urlState, q: value });
  };
  const onSubmit = () => {
    flush();
    resultsHeadingRef.current?.focus();
  };
  const onClearQuery = () => {
    schedule({ ...urlState, q: "" });
    flush();
  };
  const toggleExpertise = (tag: string, on: boolean) => {
    const next = on ? [...urlState.expertise, tag] : urlState.expertise.filter((v) => v !== tag);
    pushState({ expertise: next });
  };
  const clearFilters = () => pushState(CLEARED_FILTERS);
  const searchAll = () => {
    cancel();
    setQuery("");
    pushState({ q: "" });
  };
  const applyDrawer = (next: FilterValue) => pushState(next);
  const countFor = React.useCallback(
    (draft: FilterValue) => (mentors ? applyDiscovery(mentors, { ...urlState, q: query, ...draft }, ctx).length : 0),
    [mentors, urlState, query, ctx],
  );

  const activeFilters: ActiveFilter[] = [
    ...urlState.expertise.map((v) => ({ key: `expertise:${v}`, label: labelFor(facets.expertise, v) })),
    ...urlState.language.map((v) => ({ key: `language:${v}`, label: labelFor(facets.language, v) })),
    ...urlState.industry.map((v) => ({ key: `industry:${v}`, label: labelFor(facets.industry, v) })),
    ...(urlState.available ? [{ key: "available", label: t("discovery.filters.accepting") }] : []),
    ...(urlState.near ? [{ key: "near", label: t("discovery.filters.near") }] : []),
  ];
  const removeFilter = (key: string) => {
    const i = key.indexOf(":");
    const group = i === -1 ? key : key.slice(0, i);
    const value = i === -1 ? "" : key.slice(i + 1);
    switch (group) {
      case "expertise":
        return pushState({ expertise: urlState.expertise.filter((v) => v !== value) });
      case "language":
        return pushState({ language: urlState.language.filter((v) => v !== value) });
      case "industry":
        return pushState({ industry: urlState.industry.filter((v) => v !== value) });
      case "available":
        return pushState({ available: false });
      case "near":
        return pushState({ near: false });
      default:
        return undefined;
    }
  };

  const countText =
    announcedCount == null
      ? ""
      : announcedCount === total
        ? t("discovery.resultCount", { count: announcedCount })
        : t("discovery.resultCountOf", { count: announcedCount, total });

  const exampleChips =
    exampleTags.length > 0 ? (
      <div role="group" aria-label={t("discovery.examples")} className="contents">
        {exampleTags.map((tag, i) => (
          <FilterChip
            key={tag.value}
            selected={urlState.expertise.includes(tag.value)}
            onToggle={(on) => toggleExpertise(tag.value, on)}
            // Fixed height so the loaded row equals the skeleton row in both scripts (F-06).
            className="h-8 shrink-0 snap-start py-0 coarse:h-10"
            data-testid={`chip-example-${i}`}
          >
            {tag.label}
          </FilterChip>
        ))}
      </div>
    ) : mentorsQuery.isLoading ? (
      <ExampleChipsSkeleton />
    ) : undefined;

  return (
    <Container className="pb-16">
      <PageHeader title={t("discovery.title")} description={t("discovery.description")} className="pb-6 md:pb-8">
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-body-sm text-muted-foreground tabular-nums" data-testid="text-result-count">
          {countText}
        </p>
      </PageHeader>

      <div className="max-w-[720px]">
        <SearchIntent
          id="search-mentors"
          size="md"
          value={query}
          onChange={onQueryChange}
          onSubmit={onSubmit}
          onClear={onClearQuery}
          label={t("discovery.searchLabel")}
          placeholder={isPhone ? t("discovery.searchPlaceholderShort") : t("discovery.searchPlaceholder")}
          chips={exampleChips}
          inputProps={SEARCH_INPUT_PROPS}
        />
      </div>

      <div className="mt-8 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        {/* Filters exist only once there is a catalogue to filter: a rail skeleton while
            loading (desktop), nothing on error (the results column carries the retry). */}
        {!mentors ? (
          mentorsQuery.isLoading ? (
            isDesktop ? (
              <FilterRailSkeleton />
            ) : (
              <div className="mb-4" aria-hidden="true">
                <Skeleton className="h-11 w-full rounded-md sm:w-32" />
              </div>
            )
          ) : (
            <div className="hidden lg:block" aria-hidden="true" />
          )
        ) : isDesktop ? (
          <FilterRail
            facets={facets}
            value={pickFilters(urlState)}
            activeCount={filterCount}
            onChange={(patch) => pushState(patch)}
            onClearAll={clearFilters}
          />
        ) : (
          <div className="mb-4">
            <FilterDrawer
              facets={facets}
              value={pickFilters(urlState)}
              activeCount={filterCount}
              countFor={countFor}
              onApply={applyDrawer}
              className="w-full sm:w-auto"
            />
          </div>
        )}

        <div className="min-w-0">
          {(activeFilters.length > 0 || showSort) && (
            <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-3">
              <ActiveFilters
                filters={activeFilters}
                onRemove={removeFilter}
                onClearAll={clearFilters}
                focusFallbackRef={resultsHeadingRef}
                hideClearAll={isDesktop}
                className="min-w-0"
              />
              {showSort && (
                <div className="ms-auto flex items-center gap-2">
                  <Label htmlFor={sortId} className="text-body-sm text-muted-foreground">
                    {t("discovery.sort.label")}
                  </Label>
                  <Select value={urlState.sort} onValueChange={(value) => pushState({ sort: value as DiscoverySort })}>
                    <SelectTrigger id={sortId} className="w-auto min-w-44" data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCOVERY_SORTS.map((sort) => (
                        <SelectItem key={sort} value={sort}>
                          {t(`discovery.sort.${sort}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <h2
            ref={resultsHeadingRef}
            tabIndex={-1}
            className="sr-only text-h3 text-foreground focus:not-sr-only focus:mb-3 focus:block"
          >
            {t("discovery.resultsHeading")}
          </h2>

          <MentorGrid
            mentors={results}
            total={total}
            isLoading={mentorsQuery.isLoading}
            isError={mentorsQuery.isError && !mentors}
            isFetching={mentorsQuery.isFetching}
            onRetry={() => void mentorsQuery.refetch()}
            zeroResults={
              <ZeroResults
                query={query}
                hasFilters={filterCount > 0}
                onClearFilters={clearFilters}
                onSearchAll={searchAll}
              />
            }
          />
        </div>
      </div>
    </Container>
  );
}
