import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarDays, Globe, Inbox, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import type { Booking, Mentee, Mentor } from "@/lib/database";
import { bookingService, menteeService, mentorService } from "@/lib/services";
import { formatTime } from "@/lib/format";
import { csvFilename, downloadCsv, isoDate, toCsv, type CsvValue } from "@/lib/csv";
import { ROUTES } from "@/lib/routes";
import {
  NOT_SPECIFIED,
  bookingCountry,
  bucketFor,
  bucketKey,
  completionDate,
  countryBreakdown,
  countryOptions,
  expertiseLabels,
  inWindow,
  localizeCountry,
  localizeLanguage,
  localizedName,
  mentorPerformance,
  outcomeCounts,
  periodWindow,
  previousWindow,
  requestedAt,
  summarize,
  timeSeries,
  toBookingRows,
  type BookingRow,
  type Period,
} from "@/lib/reporting";
import { MOCK_BOOKINGS, MOCK_MENTEES, MOCK_MENTORS } from "@/data/mockAnalytics";
import { bookingStatusLabel, type BookingStatus } from "@/components/StatusBadge";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ActiveFilters, type ActiveFilter } from "@/components/discovery/ActiveFilters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingsTable } from "@/components/analytics/BookingsTable";
import { CompareToggle } from "@/components/analytics/CompareToggle";
import { CountryBreakdown, CountryBreakdownSkeleton } from "@/components/analytics/CountryBreakdown";
import { CountryTable } from "@/components/analytics/CountryTable";
import { DrilldownTable } from "@/components/analytics/DrilldownTable";
import { ExportBar } from "@/components/analytics/ExportBar";
import { ALL, EMPTY_FILTERS, FiltersPopover, type AnalyticsFilters, type FilterKey, type FilterOption } from "@/components/analytics/FiltersPopover";
import { KpiTiles, KpiTilesSkeleton } from "@/components/analytics/KpiTiles";
import { MentorTable } from "@/components/analytics/MentorTable";
import { OutcomesBar, OutcomesBarSkeleton } from "@/components/analytics/OutcomesBar";
import { PeriodControl } from "@/components/analytics/PeriodControl";
import { SummarySentence, SummarySentenceSkeleton } from "@/components/analytics/SummarySentence";
import { TrendChart, TrendChartSkeleton, type BucketSelection } from "@/components/analytics/TrendChart";
import type { Scope } from "@/components/analytics/labels";

type TabKey = "overview" | "countries" | "mentors" | "bookings";

/** What a chart click narrows the details table to. One drill at a time. */
type DrillKind = "bucket" | "status" | "mentor" | "country";
interface Drill {
  kind: DrillKind;
  value: string;
  label: string;
}

/** Below this many real bookings an admin sees the seeded demo set, always behind the banner (TESTING g1). */
const MOCK_DATA_THRESHOLD = 5;
const BOOKINGS_TAB_LIMIT = 100;
const CSV_STEM = "mentorconnect-bookings";

const FILTER_LABEL_KEY: Record<FilterKey, string> = {
  mentor: "analytics.mentor",
  menteeType: "analytics.menteeType",
  language: "analytics.language",
  expertise: "analytics.expertise",
  country: "analytics.country",
};

/**
 * `/analytics` (spec §9/§9b as amended). Question first: is the programme
 * delivering sessions, where, and is it improving? Admins read every row
 * ("Programme analytics"); mentors and mentees read only the rows RLS lets
 * them see, so their page is "Your sessions" in the second person with the
 * trend and outcomes only (P1-26). Demo data appears only after a
 * SUCCESSFUL admin fetch below the threshold; a failed fetch is an error
 * state with retry, never demo numbers (findings C3).
 */
export default function Analytics() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const scope: Scope = user?.user_type === "admin" ? "admin" : user?.user_type === "mentor" ? "mentor" : "mentee";
  const isAdmin = scope === "admin";

  const [period, setPeriod] = useState<Period>("30");
  const [compare, setCompare] = useState(true);
  const [filters, setFilters] = useState<AnalyticsFilters>(EMPTY_FILTERS);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [drill, setDrill] = useState<Drill | null>(null);
  const drillReturnRef = useRef<HTMLElement | null>(null);

  const bookingsQuery = useQuery<Booking[]>({ queryKey: ["analytics", "bookings"], queryFn: () => bookingService.getAll() });
  const mentorsQuery = useQuery<Mentor[]>({ queryKey: ["analytics", "mentors"], queryFn: () => mentorService.getAll() });
  const menteesQuery = useQuery<Mentee[]>({ queryKey: ["analytics", "mentees"], queryFn: () => menteeService.getAll() });

  const isLoading = bookingsQuery.isLoading || mentorsQuery.isLoading || menteesQuery.isLoading;
  const isError = bookingsQuery.isError || mentorsQuery.isError || menteesQuery.isError;
  const isFetching = bookingsQuery.isFetching || mentorsQuery.isFetching || menteesQuery.isFetching;
  const bookings = bookingsQuery.data;
  // Freshness = the newest of the three queries (P2-16).
  const updatedAt = Math.max(bookingsQuery.dataUpdatedAt, mentorsQuery.dataUpdatedAt, menteesQuery.dataUpdatedAt);

  const retry = () => {
    void bookingsQuery.refetch();
    void mentorsQuery.refetch();
    void menteesQuery.refetch();
  };

  // Demo mode: a successful admin fetch with too few real rows to read anything from (never on error, never for a personal view).
  const useMockData = isAdmin && !isLoading && !isError && Array.isArray(bookings) && bookings.length < MOCK_DATA_THRESHOLD;

  const sourceBookings = useMemo<Booking[]>(() => (useMockData ? MOCK_BOOKINGS : bookings ?? []), [useMockData, bookings]);
  const sourceMentors = useMemo<Mentor[]>(() => (useMockData ? MOCK_MENTORS : mentorsQuery.data ?? []), [useMockData, mentorsQuery.data]);
  const sourceMentees = useMemo<Mentee[]>(() => (useMockData ? MOCK_MENTEES : menteesQuery.data ?? []), [useMockData, menteesQuery.data]);

  const mentorsById = useMemo(() => new Map(sourceMentors.map((mentor) => [mentor.id, mentor])), [sourceMentors]);
  const menteesById = useMemo(() => new Map(sourceMentees.map((mentee) => [mentee.id, mentee])), [sourceMentees]);

  const displayCountry = useCallback(
    (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang)),
    [t, lang],
  );

  // ---- Filters (admin): the stored English value is the key, the label follows the UI language (spec §10) ----
  const filterOptions = useMemo<Record<FilterKey, FilterOption[]>>(() => {
    const languages = new Set<string>();
    const expertises = new Set<string>();
    sourceMentors.forEach((mentor) => {
      mentor.languages_spoken?.forEach((value) => languages.add(value));
      mentor.expertise?.forEach((value) => expertises.add(value));
    });
    sourceMentees.forEach((mentee) => mentee.languages_spoken?.forEach((value) => languages.add(value)));
    const arabicExpertise = expertiseLabels(sourceMentors);
    const expertiseLabel = (value: string) => (lang.startsWith("ar") ? arabicExpertise.get(value) ?? value : value);
    const countries = countryOptions(sourceBookings, sourceMentors);
    const hasUnspecified = sourceBookings.some((booking) => bookingCountry(booking, mentorsById.get(booking.mentor_id)) === NOT_SPECIFIED);
    const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, lang);
    return {
      mentor: sourceMentors.map((mentor) => ({ value: mentor.id, label: localizedName(mentor, lang) })).sort(byLabel),
      menteeType: [
        { value: "individual", label: t("menteeRegistration.individual") },
        { value: "organization", label: t("menteeRegistration.organization") },
      ],
      language: Array.from(languages)
        .map((value) => ({ value, label: localizeLanguage(value, lang) }))
        .sort(byLabel),
      expertise: Array.from(expertises)
        .map((value) => ({ value, label: expertiseLabel(value) }))
        .sort(byLabel),
      country: (hasUnspecified ? [...countries, NOT_SPECIFIED] : countries).map((value) => ({ value, label: displayCountry(value) })),
    };
  }, [sourceBookings, sourceMentors, sourceMentees, mentorsById, lang, t, displayCountry]);

  const activeFilters = useMemo<ActiveFilter[]>(
    () =>
      (Object.keys(filters) as FilterKey[])
        .filter((key) => filters[key] !== ALL)
        .map((key) => ({
          key,
          label: t("analyticsV2.filters.chip", {
            filter: t(FILTER_LABEL_KEY[key]),
            value: filterOptions[key].find((option) => option.value === filters[key])?.label ?? filters[key],
          }),
        })),
    [filters, filterOptions, t],
  );

  const filteredBookings = useMemo(() => {
    if (!isAdmin) return sourceBookings;
    return sourceBookings.filter((booking) => {
      if (filters.mentor !== ALL && booking.mentor_id !== filters.mentor) return false;
      const mentee = menteesById.get(booking.mentee_id);
      if (filters.menteeType !== ALL && mentee?.user_type !== filters.menteeType) return false;
      const mentor = mentorsById.get(booking.mentor_id);
      if (filters.language !== ALL && !(mentor?.languages_spoken?.includes(filters.language) || mentee?.languages_spoken?.includes(filters.language))) return false;
      if (filters.expertise !== ALL && !mentor?.expertise?.includes(filters.expertise)) return false;
      if (filters.country !== ALL && bookingCountry(booking, mentor) !== filters.country) return false;
      return true;
    });
  }, [isAdmin, sourceBookings, filters, mentorsById, menteesById]);

  // ---- Period windows and cohorts ---------------------------------------
  const window = useMemo(() => periodWindow(period, sourceBookings), [period, sourceBookings]);
  const previous = useMemo(() => previousWindow(period, window), [period, window]);
  const bucket = bucketFor(period);
  const compareOn = compare && previous !== null;

  const requestRows = useMemo(() => filteredBookings.filter((booking) => inWindow(requestedAt(booking), window)), [filteredBookings, window]);
  const completedRows = useMemo(() => filteredBookings.filter((booking) => inWindow(completionDate(booking), window)), [filteredBookings, window]);
  const prevRequestRows = useMemo(() => (previous ? filteredBookings.filter((booking) => inWindow(requestedAt(booking), previous)) : []), [filteredBookings, previous]);
  const prevCompletedRows = useMemo(() => (previous ? filteredBookings.filter((booking) => inWindow(completionDate(booking), previous)) : []), [filteredBookings, previous]);

  /** Everything the period touches: requested or completed inside it (the Bookings tab and every drill). */
  const periodBookings = useMemo(() => {
    const ids = new Set(requestRows.map((booking) => booking.id));
    return [...requestRows, ...completedRows.filter((booking) => !ids.has(booking.id))];
  }, [requestRows, completedRows]);

  // One summarize() call feeds the sentence and the four tiles, so they always reconcile.
  const current = useMemo(() => summarize(requestRows, completedRows, sourceMentors), [requestRows, completedRows, sourceMentors]);
  const previousSummary = useMemo(
    () => (compareOn ? summarize(prevRequestRows, prevCompletedRows, sourceMentors) : null),
    [compareOn, prevRequestRows, prevCompletedRows, sourceMentors],
  );
  const series = useMemo(() => timeSeries(requestRows, completedRows, window, bucket), [requestRows, completedRows, window, bucket]);
  const outcomes = useMemo(() => outcomeCounts(requestRows), [requestRows]);
  const countryRows = useMemo(() => countryBreakdown(requestRows, completedRows, sourceMentors), [requestRows, completedRows, sourceMentors]);
  const mentorRows = useMemo(() => mentorPerformance(requestRows, completedRows, sourceMentors), [requestRows, completedRows, sourceMentors]);

  const rows = useMemo<BookingRow[]>(
    () => toBookingRows(periodBookings, sourceMentors, sourceMentees).sort((a, b) => new Date(b.clickedAt ?? 0).getTime() - new Date(a.clickedAt ?? 0).getTime()),
    [periodBookings, sourceMentors, sourceMentees],
  );

  const bucketOf = useCallback(
    (row: BookingRow) => {
      const requested = bucketKey(new Date(row.clickedAt ?? 0), bucket);
      const completed = row.status === "completed" ? bucketKey(new Date(row.completedAt || row.scheduledAt || row.clickedAt || 0), bucket) : null;
      return { requested, completed };
    },
    [bucket],
  );

  const drillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const { requested, completed } = bucketOf(row);
      const keys = new Set([inWindow(row.clickedAt, window) ? requested : null, completed && inWindow(row.completedAt || row.scheduledAt || row.clickedAt, window) ? completed : null]);
      keys.forEach((key) => {
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    return counts;
  }, [rows, bucketOf, window]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    return rows.filter((row) => {
      switch (drill.kind) {
        case "bucket": {
          const { requested, completed } = bucketOf(row);
          return (inWindow(row.clickedAt, window) && requested === drill.value) || completed === drill.value;
        }
        case "status":
          return row.status === drill.value && inWindow(row.clickedAt, window);
        case "mentor":
          return row.mentorId === drill.value;
        case "country":
          return row.country === drill.value;
        default:
          return false;
      }
    });
  }, [rows, drill, bucketOf, window]);

  // ---- Drill state: one drill at a time; focus goes to the table and comes back on Clear (D7) ----
  const openDrill = useCallback((next: Drill | null) => {
    if (next) drillReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrill(next);
  }, []);
  const clearDrill = useCallback(() => {
    setDrill(null);
    const target = drillReturnRef.current;
    drillReturnRef.current = null;
    if (target && target.isConnected) target.focus();
  }, []);
  const activeDrill = (kind: DrillKind) => (drill?.kind === kind ? drill.value : null);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabKey);
    setDrill(null);
  };
  const changePeriod = (next: Period) => {
    setPeriod(next);
    setDrill(null);
  };
  const changeFilters = (next: AnalyticsFilters) => {
    setFilters(next);
    setDrill(null);
  };

  const selectBucket = (selection: BucketSelection | null) => (selection ? openDrill({ kind: "bucket", value: selection.key, label: selection.label }) : clearDrill());
  const selectStatus = (key: string | null) => (key ? openDrill({ kind: "status", value: key, label: bookingStatusLabel(key as BookingStatus, t) }) : clearDrill());
  const selectCountry = (country: string | null) => (country ? openDrill({ kind: "country", value: country, label: displayCountry(country) }) : clearDrill());
  const selectMentor = (mentor: { id: string; label: string } | null) => (mentor ? openDrill({ kind: "mentor", value: mentor.id, label: mentor.label }) : clearDrill());

  const showMentee = scope !== "mentee";
  const showMentor = scope !== "mentor";
  const renderDrill = (kind: DrillKind, testId: string) =>
    drill?.kind === kind ? (
      // A mentor drill already names the mentor in its heading; the column would repeat it on every row.
      <DrilldownTable segmentLabel={drill.label} rows={drillRows} onClear={clearDrill} testId={testId} showMentee={showMentee} showMentor={showMentor && kind !== "mentor"} />
    ) : null;

  // ---- CSV export (admins; the file carries mentee e-mails) -----------------
  const exportRows = useCallback(
    (rowsToExport: BookingRow[], filename: string) => {
      const headers = [
        t("analytics.csv.bookingId"),
        t("analytics.csv.mentor"),
        t("analytics.csv.mentorCountry"),
        t("analytics.csv.mentee"),
        t("analytics.csv.menteeEmail"),
        t("analytics.csv.menteeType"),
        t("analytics.csv.organization"),
        t("analytics.csv.status"),
        t("analytics.csv.clickedAt"),
        t("analytics.csv.scheduledAt"),
        t("analytics.csv.completedAt"),
        t("analytics.csv.durationMinutes"),
        t("analytics.csv.country"),
        t("analytics.csv.menteeRating"),
        t("analytics.csv.mentorRating"),
        t("analytics.csv.statusLabel"),
        t("analytics.csv.menteeTypeLabel"),
      ];
      const data: CsvValue[][] = rowsToExport.map((row) => [
        row.id,
        row.mentorName,
        displayCountry(row.mentorCountry),
        row.menteeName,
        row.menteeEmail,
        row.menteeType,
        row.menteeOrganization,
        row.status,
        row.clickedAt ?? "",
        row.scheduledAt ?? "",
        row.completedAt ?? "",
        row.durationMinutes ?? "",
        displayCountry(row.country),
        row.menteeRating ?? "",
        row.mentorRating ?? "",
        bookingStatusLabel(row.status, t),
        row.menteeType === "organization" ? t("menteeRegistration.organization") : row.menteeType === "individual" ? t("menteeRegistration.individual") : "",
      ]);
      // The "# DEMO DATA" comment line is part of the TESTING g1 file contract, so it stays English.
      downloadCsv(filename, toCsv(headers, data, { commentLines: useMockData ? ["DEMO DATA"] : [] }));
    },
    [t, displayCountry, useMockData],
  );

  const handleExportView = () => exportRows(rows, csvFilename(CSV_STEM, new Date(), undefined, useMockData));
  const handleExportRange = (from: string, to: string) => {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const range = { start: new Date(fy, fm - 1, fd), end: new Date(ty, tm - 1, td + 1) };
    const inRange = sourceBookings.filter((booking) => inWindow(requestedAt(booking), range));
    const rangeRows = toBookingRows(inRange, sourceMentors, sourceMentees).sort((a, b) => new Date(b.clickedAt ?? 0).getTime() - new Date(a.clickedAt ?? 0).getTime());
    exportRows(rangeRows, csvFilename(CSV_STEM, range.start, new Date(ty, tm - 1, td), useMockData));
  };

  // ---- Render -------------------------------------------------------------
  const title = t(isAdmin ? "analyticsV2.title.admin" : "analyticsV2.title.own");
  // A personal view with no rows at all (any period) points forward instead of showing empty frames.
  const nothingYet = !isAdmin && !isLoading && !isError && sourceBookings.length === 0;

  const tabs: Array<{ key: TabKey; icon: LucideIcon; label: string; adminOnly?: boolean }> = [
    { key: "overview", icon: LayoutDashboard, label: t("analytics.tabs.overview") },
    { key: "countries", icon: Globe, label: t("analytics.tabs.countries"), adminOnly: true },
    { key: "mentors", icon: Users, label: t("analytics.tabs.mentors"), adminOnly: true },
    { key: "bookings", icon: CalendarDays, label: t("analytics.tabs.bookings") },
  ];
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <Container className="pb-16">
      <PageHeader
        title={title}
        description={t(isAdmin ? "analyticsV2.scope.admin" : "analyticsV2.scope.own")}
        actions={
          <>
            {useMockData && (
              <Badge tone="warning" data-testid="badge-demo-data">
                {t("analyticsV2.demoBadge")}
              </Badge>
            )}
            {isAdmin && !isError && (
              <ExportBar
                onExportView={handleExportView}
                onExportRange={handleExportRange}
                defaultFrom={isoDate(window.start)}
                defaultTo={isoDate(new Date())}
                disabled={isLoading}
              />
            )}
          </>
        }
      >
        {!nothingYet && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <PeriodControl value={period} onChange={changePeriod} />
              <CompareToggle checked={compare} onChange={setCompare} unavailable={period === "all"} />
              {isAdmin && !isError && <FiltersPopover value={filters} onChange={changeFilters} options={filterOptions} activeCount={activeFilters.length} />}
              {updatedAt > 0 && !isError && (
                <p className="ms-auto self-center text-caption text-muted-foreground" data-testid="analytics-updated">
                  {t("analyticsV2.updated", { time: formatTime(updatedAt, lang) })}
                </p>
              )}
            </div>
            {isAdmin && (
              <ActiveFilters
                filters={activeFilters}
                onRemove={(key) => changeFilters({ ...filters, [key]: ALL })}
                onClearAll={() => changeFilters(EMPTY_FILTERS)}
              />
            )}
          </div>
        )}
      </PageHeader>

      {useMockData && (
        <Alert variant="warning" role="status" className="mb-6" data-testid="banner-demo-data">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{t("analytics.demoBannerTitle")}</AlertTitle>
          <AlertDescription>{t("analytics.demoBannerBody", { count: bookings?.length ?? 0, threshold: MOCK_DATA_THRESHOLD })}</AlertDescription>
        </Alert>
      )}

      {nothingYet ? (
        <div className="rounded-lg border border-border bg-card" data-testid="analytics-nothing-yet">
          <EmptyState
            icon={Inbox}
            title={t(scope === "mentor" ? "analyticsV2.nothingYet.mentorTitle" : "analyticsV2.nothingYet.menteeTitle")}
            description={t(scope === "mentor" ? "analyticsV2.nothingYet.mentorBody" : "analyticsV2.nothingYet.menteeBody")}
            role="status"
            action={
              scope === "mentee" ? (
                <Button variant="secondary" asChild>
                  <Link href={ROUTES.mentors}>{t("analyticsV2.nothingYet.browse")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : isError && !isLoading ? (
        <div className="rounded-lg border border-border bg-card" data-testid="analytics-error">
          <EmptyState
            icon={AlertTriangle}
            title={t("analyticsV2.error.title")}
            description={t("analyticsV2.error.body")}
            role="status"
            action={
              <Button type="button" variant="secondary" onClick={retry} loading={isFetching} data-testid="button-analytics-retry">
                {t("common.tryAgain")}
              </Button>
            }
          />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList
            className="max-md:sticky max-md:top-14 max-md:z-30 max-md:bg-background [@media(max-height:520px)]:static md:w-auto md:max-w-2xl"
            data-testid="analytics-tabs"
          >
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="px-2 sm:px-3 [&_svg]:hidden sm:[&_svg]:block" data-testid={`tab-${tab.key}`}>
                <tab.icon aria-hidden="true" strokeWidth={1.75} />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ---------------- Overview: summary → tiles → trend → breakdowns ---------------- */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {isLoading ? (
              <div role="status" aria-busy="true" className="space-y-6">
                <span className="sr-only">{t("analyticsV2.loading")}</span>
                <SummarySentenceSkeleton />
                {isAdmin && <KpiTilesSkeleton />}
                <TrendChartSkeleton />
                <div className={isAdmin ? "grid grid-cols-1 items-start gap-6 lg:grid-cols-2" : ""}>
                  <OutcomesBarSkeleton />
                  {isAdmin && <CountryBreakdownSkeleton />}
                </div>
              </div>
            ) : (
              <>
                <SummarySentence scope={scope} period={period} current={current} previous={previousSummary} />
                {/* Tiles are the admin's decision numbers; a personal view keeps the sentence, the trend and the outcomes only (P1-26). */}
                {isAdmin && <KpiTiles current={current} previous={previousSummary} period={period} />}
                <div className="space-y-3">
                  <TrendChart series={series} bucket={bucket} period={period} drillCounts={drillCounts} activeKey={activeDrill("bucket")} onSelect={selectBucket} />
                  {renderDrill("bucket", "drilldown-date")}
                </div>
                <div className={isAdmin ? "grid grid-cols-1 items-start gap-6 lg:grid-cols-2" : ""}>
                  <OutcomesBar counts={outcomes} period={period} activeKey={activeDrill("status")} onSelect={selectStatus} />
                  {isAdmin && (
                    <CountryBreakdown
                      rows={countryRows}
                      period={period}
                      activeCountry={activeDrill("country")}
                      onSelect={selectCountry}
                      onSeeAll={() => handleTabChange("countries")}
                    />
                  )}
                </div>
                {renderDrill("status", "drilldown-status")}
                {renderDrill("country", "drilldown-country")}
              </>
            )}
          </TabsContent>

          {/* ---------------- Countries (admin) ---------------- */}
          {isAdmin && (
            <TabsContent value="countries" className="mt-6 space-y-3">
              {isLoading ? (
                <TableSkeleton label={t("analyticsV2.loading")} />
              ) : (
                <>
                  <CountryTable rows={countryRows} activeCountry={activeDrill("country")} onSelect={selectCountry} />
                  {renderDrill("country", "drilldown-country")}
                </>
              )}
            </TabsContent>
          )}

          {/* ---------------- Mentors (admin): the ranked table ---------------- */}
          {isAdmin && (
            <TabsContent value="mentors" className="mt-6 space-y-3">
              {isLoading ? (
                <TableSkeleton label={t("analyticsV2.loading")} />
              ) : (
                <>
                  <MentorTable rows={mentorRows} activeMentor={activeDrill("mentor")} onSelect={selectMentor} />
                  {renderDrill("mentor", "drilldown-mentor")}
                </>
              )}
            </TabsContent>
          )}

          {/* ---------------- Bookings ---------------- */}
          <TabsContent value="bookings" className="mt-6">
            {isLoading ? (
              <TableSkeleton label={t("analyticsV2.loading")} />
            ) : (
              <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="table-bookings" aria-labelledby="bookings-table-title">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h2 id="bookings-table-title" className="text-h3 text-foreground">{t("analyticsV2.bookings.title")}</h2>
                    <p className="mt-0.5 text-caption text-muted-foreground text-pretty">{t("analyticsV2.bookings.definition")}</p>
                  </div>
                  <p className="text-caption text-muted-foreground tabular-nums">
                    {rows.length > BOOKINGS_TAB_LIMIT
                      ? t("analytics.showingRows", { shown: BOOKINGS_TAB_LIMIT, total: rows.length })
                      : t("analytics.rowCount", { count: rows.length })}
                  </p>
                </div>
                <BookingsTable
                  rows={rows}
                  limit={BOOKINGS_TAB_LIMIT}
                  emptyText={t("analyticsV2.bookings.empty")}
                  testId="bookings-table"
                  showMentee={showMentee}
                  showMentor={showMentor}
                />
              </section>
            )}
          </TabsContent>
        </Tabs>
      )}
    </Container>
  );
}

/** Header row plus eight table rows — the final geometry of the dense tables. */
function TableSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="overflow-hidden rounded-lg border border-border bg-card">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ms-auto h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
