import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isRTL } from "@/lib/i18n";
import type { Booking, Mentor, Mentee } from "@/lib/database";
import { bookingService, mentorService, menteeService } from "@/lib/services";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Label as ChartLabel,
} from "recharts";
import {
  Calendar, CheckCircle2, Clock, BarChart3, Activity, Filter, Globe, Users, AlertTriangle,
  LayoutDashboard, CalendarDays, Timer, TrendingUp, UserRound,
} from "lucide-react";
import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  isAfter,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  endOfDay,
  parseISO,
} from "date-fns";
import { MOCK_BOOKINGS, MOCK_MENTORS, MOCK_MENTEES } from "@/data/mockAnalytics";
import { toCsv, downloadCsv, csvFilename, isoDate, type CsvValue } from "@/lib/csv";
import {
  NOT_SPECIFIED,
  bookingCountry,
  countryOptions,
  groupByCountry,
  toBookingRows,
  volunteerHours,
  minutesToHours,
  type BookingRow,
  type StatusGroup,
} from "@/lib/reporting";
import {
  ANIMATION_MS,
  AXIS_TICK,
  BAR_RADIUS,
  BAR_RADIUS_HORIZONTAL,
  BAR_RADIUS_HORIZONTAL_RTL,
  BRAND,
  BrandTooltip,
  CATEGORICAL,
  CURSOR_FILL,
  GRID_PROPS,
  LEGEND_STYLE,
  STATUS_COLORS,
  legendText,
  segmentFill,
} from "@/components/analytics/ChartTheme";
import { StatTile } from "@/components/analytics/StatTile";
import { ExportBar } from "@/components/analytics/ExportBar";
import { DrilldownTable } from "@/components/analytics/DrilldownTable";
import { CountryBreakdown } from "@/components/analytics/CountryBreakdown";
import { SegmentLegend, type SegmentLegendItem } from "@/components/analytics/SegmentLegend";
import { BookingsTable } from "@/components/analytics/BookingsTable";

type DateRange = "7" | "30" | "90" | "all";
type GroupBy = "day" | "week" | "month";
type TabKey = "overview" | "countries" | "mentors" | "bookings";

/** What a chart click narrows the details table to. One drill at a time, per tab. */
type DrillKind = "status" | "date" | "mentor" | "country" | "mentorCountry" | "menteeCountry" | "menteeType";
interface Drill {
  kind: DrillKind;
  value: string;
  label: string;
}

interface TimeSeriesData {
  date: string;
  bookings: number;
  scheduled: number;
  completed: number;
  canceled: number;
}

interface StatusDatum {
  key: StatusGroup;
  name: string;
  value: number;
  color: string;
}

interface MentorPerformance {
  id: string;
  name: string;
  country: string;
  bookings: number;
  completed: number;
  volunteerMinutes: number;
  ratingSum: number;
  ratingCount: number;
}

interface CountDatum {
  name: string;
  /** Display form of `name` (the NOT_SPECIFIED sentinel is translated). */
  label: string;
  value: number;
}

/** Recharts hands click handlers the mark's datum under `payload`. */
interface PieEntry {
  payload?: { key: string; name: string };
}

const MOCK_DATA_THRESHOLD = 5;
const BOOKINGS_TAB_LIMIT = 100;

function groupingFor(dateRange: DateRange): GroupBy {
  if (dateRange === "90") return "week";
  if (dateRange === "all") return "month";
  return "day";
}

function bucketKey(date: Date, groupBy: GroupBy): string {
  if (groupBy === "day") return format(startOfDay(date), "MMM d");
  if (groupBy === "week") return format(startOfWeek(date), "MMM d");
  return format(startOfMonth(date), "MMM yyyy");
}

function oldestClickedAt(bookings: Booking[]): Date {
  return bookings.reduce((oldest, booking) => {
    const bookingDate = booking.clicked_at ? new Date(booking.clicked_at) : new Date();
    return bookingDate < oldest ? bookingDate : oldest;
  }, new Date());
}

function rangeStart(dateRange: DateRange, bookings: Booking[]): Date {
  const now = new Date();
  switch (dateRange) {
    case "7":
      return subDays(now, 7);
    case "90":
      return subDays(now, 90);
    case "all":
      return startOfMonth(oldestClickedAt(bookings));
    default:
      return subDays(now, 30);
  }
}

function aggregateBookingsByDate(bookings: Booking[], dateRange: DateRange): TimeSeriesData[] {
  if (bookings.length === 0) return [];

  const now = new Date();
  const groupBy = groupingFor(dateRange);
  const startDate = rangeStart(dateRange, bookings);

  const bookingsByDate: Record<string, TimeSeriesData> = {};
  bookings.forEach((booking) => {
    if (!booking.clicked_at) return;
    const bookingDate = new Date(booking.clicked_at);
    if (!(isAfter(bookingDate, startDate) || bookingDate.getTime() === startDate.getTime())) return;

    const key = bucketKey(bookingDate, groupBy);
    if (!bookingsByDate[key]) {
      bookingsByDate[key] = { date: key, bookings: 0, scheduled: 0, completed: 0, canceled: 0 };
    }
    bookingsByDate[key].bookings += 1;
    if (booking.status === "confirmed") bookingsByDate[key].scheduled += 1;
    if (booking.status === "completed") bookingsByDate[key].completed += 1;
    if (booking.status === "canceled") bookingsByDate[key].canceled += 1;
  });

  let intervals: Date[];
  if (groupBy === "day") {
    intervals = eachDayOfInterval({ start: startDate, end: now });
  } else if (groupBy === "week") {
    intervals = eachWeekOfInterval({ start: startDate, end: now });
  } else {
    intervals = eachMonthOfInterval({ start: startDate, end: now });
  }

  return intervals.map((date) => {
    const key = bucketKey(date, groupBy);
    return bookingsByDate[key] ?? { date: key, bookings: 0, scheduled: 0, completed: 0, canceled: 0 };
  });
}

function rowMatchesDrill(row: BookingRow, drill: Drill, groupBy: GroupBy): boolean {
  switch (drill.kind) {
    case "status":
      return row.statusGroup === drill.value;
    case "date":
      return Boolean(row.clickedAt) && bucketKey(new Date(row.clickedAt!), groupBy) === drill.value;
    case "mentor":
      return row.mentorId === drill.value;
    case "country":
      return row.country === drill.value;
    case "mentorCountry":
      return row.mentorCountry === drill.value;
    case "menteeCountry":
      return row.menteeCountry === drill.value;
    case "menteeType":
      return row.menteeType === drill.value;
    default:
      return false;
  }
}

export default function Analytics() {
  const { t } = useTranslation();
  const rtl = isRTL();
  const [dateRange, setDateRange] = useState<DateRange>("30");
  const [selectedMentor, setSelectedMentor] = useState<string>("all");
  const [selectedMenteeType, setSelectedMenteeType] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedExpertise, setSelectedExpertise] = useState<string>("all");
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [drill, setDrill] = useState<Drill | null>(null);

  // These previously used legacy "/api/*" query keys with no queryFn, so the
  // page never received real rows and silently rendered the mock dataset.
  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["analytics", "bookings"],
    queryFn: () => bookingService.getAll(),
  });

  const { data: mentors, isLoading: mentorsLoading } = useQuery<Mentor[]>({
    queryKey: ["analytics", "mentors"],
    queryFn: () => mentorService.getAll(),
  });

  const { data: mentees, isLoading: menteesLoading } = useQuery<Mentee[]>({
    queryKey: ["analytics", "mentees"],
    queryFn: () => menteeService.getAll(),
  });

  const isLoading = bookingsLoading || mentorsLoading || menteesLoading;

  // Mock analytics are only ever shown behind an explicit, prominent banner.
  // Below this threshold the charts are demo data, not programme metrics.
  const useMockData = !isLoading && (!bookings || bookings.length < MOCK_DATA_THRESHOLD);

  // One pipeline for both modes: the demo entities are typed like real rows.
  const sourceBookings = useMemo<Booking[]>(() => (useMockData ? MOCK_BOOKINGS : bookings ?? []), [useMockData, bookings]);
  const sourceMentors = useMemo<Mentor[]>(() => (useMockData ? MOCK_MENTORS : mentors ?? []), [useMockData, mentors]);
  const sourceMentees = useMemo<Mentee[]>(() => (useMockData ? MOCK_MENTEES : mentees ?? []), [useMockData, mentees]);

  const mentorsById = useMemo(() => new Map(sourceMentors.map((mentor) => [mentor.id, mentor])), [sourceMentors]);
  const menteesById = useMemo(() => new Map(sourceMentees.map((mentee) => [mentee.id, mentee])), [sourceMentees]);

  const notSpecifiedLabel = t("analytics.notSpecified");
  const displayCountry = useCallback(
    (country: string) => (country === NOT_SPECIFIED ? notSpecifiedLabel : country),
    [notSpecifiedLabel],
  );

  const filterOptions = useMemo(() => {
    const languagesSet = new Set<string>();
    const expertisesSet = new Set<string>();

    sourceMentors.forEach((mentor) => {
      mentor.languages_spoken?.forEach((lang) => languagesSet.add(lang));
      mentor.expertise?.forEach((exp) => expertisesSet.add(exp));
    });
    sourceMentees.forEach((mentee) => {
      mentee.languages_spoken?.forEach((lang) => languagesSet.add(lang));
    });

    const countries = countryOptions(sourceBookings, sourceMentors);
    const hasUnspecified = sourceBookings.some(
      (booking) => bookingCountry(booking, mentorsById.get(booking.mentor_id)) === NOT_SPECIFIED,
    );

    return {
      languages: Array.from(languagesSet).sort(),
      expertises: Array.from(expertisesSet).sort(),
      countries: hasUnspecified ? [...countries, NOT_SPECIFIED] : countries,
    };
  }, [sourceBookings, sourceMentors, sourceMentees, mentorsById]);

  const filteredBookings = useMemo(() => {
    const startDate = rangeStart(dateRange, sourceBookings);

    return sourceBookings.filter((booking) => {
      if (!booking.clicked_at) return false;
      const bookingDate = new Date(booking.clicked_at);
      if (!(isAfter(bookingDate, startDate) || bookingDate.getTime() === startDate.getTime())) {
        return false;
      }

      if (selectedMentor !== "all" && booking.mentor_id !== selectedMentor) return false;

      const mentee = menteesById.get(booking.mentee_id);
      if (selectedMenteeType !== "all" && mentee?.user_type !== selectedMenteeType) return false;

      const mentor = mentorsById.get(booking.mentor_id);
      if (selectedLanguage !== "all") {
        const hasLanguage =
          mentor?.languages_spoken?.includes(selectedLanguage) ||
          mentee?.languages_spoken?.includes(selectedLanguage);
        if (!hasLanguage) return false;
      }

      if (selectedExpertise !== "all" && !mentor?.expertise?.includes(selectedExpertise)) {
        return false;
      }

      if (selectedCountry !== "all" && bookingCountry(booking, mentor) !== selectedCountry) {
        return false;
      }

      return true;
    });
  }, [sourceBookings, mentorsById, menteesById, selectedMentor, selectedMenteeType, selectedLanguage, selectedExpertise, selectedCountry, dateRange]);

  const rows = useMemo(
    () =>
      toBookingRows(filteredBookings, sourceMentors, sourceMentees).sort(
        (a, b) => new Date(b.clickedAt ?? 0).getTime() - new Date(a.clickedAt ?? 0).getTime(),
      ),
    [filteredBookings, sourceMentors, sourceMentees],
  );

  const groupBy = groupingFor(dateRange);
  const timeSeries = useMemo(() => aggregateBookingsByDate(filteredBookings, dateRange), [filteredBookings, dateRange]);
  const hoursSummary = useMemo(() => volunteerHours(filteredBookings), [filteredBookings]);
  const countryRows = useMemo(() => groupByCountry(filteredBookings, sourceMentors), [filteredBookings, sourceMentors]);

  const statusBreakdown = useMemo<StatusDatum[]>(() => {
    const counts: Record<StatusGroup, number> = { clicked: 0, scheduled: 0, completed: 0, canceled: 0 };
    rows.forEach((row) => {
      counts[row.statusGroup] += 1;
    });
    return (Object.keys(counts) as StatusGroup[])
      .map((key) => ({ key, name: t(`analytics.chartLabels.${key}`), value: counts[key], color: STATUS_COLORS[key] }))
      .filter((item) => item.value > 0);
  }, [rows, t]);

  const menteeTypeBreakdown = useMemo<Array<{ key: string; name: string; value: number; color: string }>>(() => {
    const counts = { individual: 0, organization: 0 };
    rows.forEach((row) => {
      if (row.menteeType === "individual" || row.menteeType === "organization") counts[row.menteeType] += 1;
    });
    return [
      { key: "individual", name: t("menteeRegistration.individual"), value: counts.individual, color: CATEGORICAL[0] },
      { key: "organization", name: t("menteeRegistration.organization"), value: counts.organization, color: CATEGORICAL[1] },
    ].filter((item) => item.value > 0);
  }, [rows, t]);

  const mentorPerformance = useMemo<MentorPerformance[]>(() => {
    const byMentor = new Map<string, MentorPerformance>();
    rows.forEach((row) => {
      let entry = byMentor.get(row.mentorId);
      if (!entry) {
        entry = {
          id: row.mentorId,
          name: row.mentorName || t("analytics.unknown"),
          country: row.mentorCountry,
          bookings: 0,
          completed: 0,
          volunteerMinutes: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
        byMentor.set(row.mentorId, entry);
      }
      entry.bookings += 1;
      if (row.status === "completed") {
        entry.completed += 1;
        entry.volunteerMinutes += row.durationMinutes ?? 0;
      }
      if (typeof row.menteeRating === "number") {
        entry.ratingSum += row.menteeRating;
        entry.ratingCount += 1;
      }
    });
    return Array.from(byMentor.values()).sort((a, b) => b.bookings - a.bookings || b.completed - a.completed);
  }, [rows, t]);

  const topMentors = useMemo(() => mentorPerformance.slice(0, 10), [mentorPerformance]);

  const geographicDistribution = useMemo(() => {
    const countBy = (items: Array<{ country?: string }>): CountDatum[] => {
      const counts: Record<string, number> = {};
      items.forEach((item) => {
        const country = item.country?.trim() || NOT_SPECIFIED;
        counts[country] = (counts[country] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, value]) => ({ name, label: displayCountry(name), value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);
    };
    return { mentorData: countBy(sourceMentors), menteeData: countBy(sourceMentees) };
  }, [sourceMentors, sourceMentees, displayCountry]);

  const drillRows = useMemo(() => (drill ? rows.filter((row) => rowMatchesDrill(row, drill, groupBy)) : []), [rows, drill, groupBy]);

  const toggleDrill = useCallback((next: Drill) => {
    setDrill((current) => (current && current.kind === next.kind && current.value === next.value ? null : next));
  }, []);
  const clearDrill = useCallback(() => setDrill(null), []);
  const activeDrillKey = (kind: DrillKind) => (drill?.kind === kind ? drill.value : null);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabKey);
    setDrill(null);
  };

  // ---- CSV export ---------------------------------------------------------
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
      ]);
      const csv = toCsv(headers, data, { commentLines: useMockData ? ["DEMO DATA"] : [] });
      downloadCsv(filename, csv);
    },
    [t, displayCountry, useMockData],
  );

  const handleExportView = () => {
    exportRows(rows, csvFilename("mentorconnect-bookings", new Date(), undefined, useMockData));
  };

  const handleExportRange = (from: string, to: string) => {
    const start = startOfDay(parseISO(from));
    const end = endOfDay(parseISO(to));
    const inRange = sourceBookings.filter((booking) => {
      if (!booking.clicked_at) return false;
      const clicked = new Date(booking.clicked_at);
      return clicked >= start && clicked <= end;
    });
    const rangeRows = toBookingRows(inRange, sourceMentors, sourceMentees).sort(
      (a, b) => new Date(b.clickedAt ?? 0).getTime() - new Date(a.clickedAt ?? 0).getTime(),
    );
    exportRows(rangeRows, csvFilename("mentorconnect-bookings", start, end, useMockData));
  };

  const exportDefaultFrom = isoDate(rangeStart(dateRange, sourceBookings));
  const exportDefaultTo = isoDate(new Date());

  // ---- Chart click handlers ----------------------------------------------
  const handleTimeSeriesClick = (state: { activeLabel?: string }) => {
    if (state?.activeLabel) toggleDrill({ kind: "date", value: state.activeLabel, label: state.activeLabel });
  };
  const handleStatusClick = (entry: PieEntry) => {
    if (entry?.payload) toggleDrill({ kind: "status", value: entry.payload.key, label: entry.payload.name });
  };
  const handleMenteeTypeClick = (entry: PieEntry) => {
    if (entry?.payload) toggleDrill({ kind: "menteeType", value: entry.payload.key, label: entry.payload.name });
  };
  const handleMentorClick = (entry: { payload?: MentorPerformance }) => {
    if (entry?.payload) toggleDrill({ kind: "mentor", value: entry.payload.id, label: entry.payload.name });
  };
  const handleMentorCountryClick = (entry: { payload?: CountDatum }) => {
    if (entry?.payload) toggleDrill({ kind: "mentorCountry", value: entry.payload.name, label: entry.payload.label });
  };
  const handleMenteeCountryClick = (entry: { payload?: CountDatum }) => {
    if (entry?.payload) toggleDrill({ kind: "menteeCountry", value: entry.payload.name, label: entry.payload.label });
  };
  const handleCountrySelect = (country: string | null) => {
    setDrill(country ? { kind: "country", value: country, label: displayCountry(country) } : null);
  };

  // Keyboard-reachable twins of the chart marks.
  const timeSeriesLegend: SegmentLegendItem[] = timeSeries.map((point) => ({ key: point.date, label: point.date, value: point.bookings, color: BRAND.navy }));
  const statusLegend: SegmentLegendItem[] = statusBreakdown.map((item) => ({ key: item.key, label: item.name, value: item.value, color: item.color }));
  const menteeTypeLegend: SegmentLegendItem[] = menteeTypeBreakdown.map((item) => ({ key: item.key, label: item.name, value: item.value, color: item.color }));
  const mentorLegend: SegmentLegendItem[] = topMentors.map((item) => ({ key: item.id, label: item.name, value: item.bookings, color: BRAND.navy }));
  const mentorCountryLegend: SegmentLegendItem[] = geographicDistribution.mentorData.map((item) => ({ key: item.name, label: item.label, value: item.value, color: BRAND.navy }));
  const menteeCountryLegend: SegmentLegendItem[] = geographicDistribution.menteeData.map((item) => ({ key: item.name, label: item.label, value: item.value, color: BRAND.teal }));

  const selectDrill = (kind: DrillKind, items: SegmentLegendItem[]) => (key: string | null) => {
    if (!key) {
      setDrill(null);
      return;
    }
    const item = items.find((candidate) => candidate.key === key);
    setDrill({ kind, value: key, label: item?.label ?? key });
  };

  const totalBookings = rows.length;
  const scheduledCount = rows.filter((row) => row.status === "confirmed").length;
  const completedCount = hoursSummary.completed;

  const renderDrill = (kind: DrillKind, testId: string) =>
    drill?.kind === kind ? (
      <DrilldownTable segmentLabel={drill.label} rows={drillRows} onClear={clearDrill} testId={testId} />
    ) : null;

  const sectionTitle = (Icon: typeof Activity, title: string) => (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      <h2 className="text-base font-semibold text-[#0F1111]">{title}</h2>
    </div>
  );

  const chartSkeleton = (height: number) => (
    <Card className="p-6">
      <Skeleton style={{ height }} className="w-full" />
    </Card>
  );

  const emptyCard = (text: string) => (
    <Card className="p-10 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </Card>
  );

  const horizontalCountryChart = (
    data: CountDatum[],
    color: string,
    name: string,
    activeKey: string | null,
    onClick: (entry: { payload?: CountDatum }) => void,
    testId: string,
  ) => (
    <Card className="p-4 md:p-6" data-testid={testId}>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={Math.max(200, 36 * data.length + 40)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
            barCategoryGap={6}
          >
            <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} orientation={rtl ? "top" : "bottom"} reversed={rtl} />
            <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={120} orientation={rtl ? "right" : "left"} />
            <Tooltip cursor={CURSOR_FILL} content={<BrandTooltip />} />
            <Bar
              dataKey="value"
              name={name}
              fill={color}
              radius={rtl ? BAR_RADIUS_HORIZONTAL_RTL : BAR_RADIUS_HORIZONTAL}
              maxBarSize={22}
              cursor="pointer"
              animationDuration={ANIMATION_MS}
              onClick={onClick}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={segmentFill(color, entry.name, activeKey)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  const donutChart = (
    data: Array<{ key: string; name: string; value: number; color: string }>,
    activeKey: string | null,
    onClick: (entry: PieEntry) => void,
    testId: string,
    total: number,
    legend: ReactNode,
  ) => (
    <Card className="p-4 md:p-6" data-testid={testId}>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={100}
              paddingAngle={2}
              stroke={BRAND.surface}
              strokeWidth={2}
              cursor="pointer"
              animationDuration={ANIMATION_MS}
              onClick={onClick}
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={segmentFill(entry.color, entry.key, activeKey)} />
              ))}
              <ChartLabel
                value={total.toLocaleString()}
                position="center"
                style={{ fill: BRAND.ink, fontSize: 24, fontWeight: 700 }}
              />
            </Pie>
            <Tooltip content={<BrandTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3">{legend}</div>
    </Card>
  );

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <header className="sticky top-20 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold text-[#0F1111]">{t("analytics.title")}</h1>
            {useMockData && (
              <Badge variant="outline" className="text-sm" data-testid="badge-demo-data">
                {t("analytics.demoData")}
              </Badge>
            )}
            <div className="ms-auto">
              <ExportBar
                onExportView={handleExportView}
                onExportRange={handleExportRange}
                defaultFrom={exportDefaultFrom}
                defaultTo={exportDefaultTo}
                disabled={isLoading}
              />
            </div>
          </div>
        </header>

        <div className="space-y-6 pt-6">
          {useMockData && (
            <Alert
              className="border-[#FF9900] bg-[#FFF5E6] text-[#0F1111]"
              role="status"
              data-testid="banner-demo-data"
            >
              <AlertTriangle className="h-5 w-5 text-[#CC7A00]" />
              <AlertTitle className="font-semibold">{t("analytics.demoBannerTitle")}</AlertTitle>
              <AlertDescription>
                {t("analytics.demoBannerBody", { count: bookings?.length ?? 0, threshold: MOCK_DATA_THRESHOLD })}
              </AlertDescription>
            </Alert>
          )}

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t("analytics.filters")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1">
                <label htmlFor="filter-date-range" className="text-xs font-medium">{t("analytics.dateRange")}</label>
                <Select value={dateRange} onValueChange={(value) => { setDateRange(value as DateRange); setDrill(null); }}>
                  <SelectTrigger id="filter-date-range" data-testid="select-date-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("analytics.last7Days")}</SelectItem>
                    <SelectItem value="30">{t("analytics.last30Days")}</SelectItem>
                    <SelectItem value="90">{t("analytics.last90Days")}</SelectItem>
                    <SelectItem value="all">{t("analytics.allTime")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="filter-mentor" className="text-xs font-medium">{t("analytics.mentor")}</label>
                <Select value={selectedMentor} onValueChange={setSelectedMentor}>
                  <SelectTrigger id="filter-mentor" data-testid="select-mentor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("analytics.allMentors")}</SelectItem>
                    {sourceMentors.map((mentor) => (
                      <SelectItem key={mentor.id} value={mentor.id}>
                        {mentor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="filter-mentee-type" className="text-xs font-medium">{t("analytics.menteeType")}</label>
                <Select value={selectedMenteeType} onValueChange={setSelectedMenteeType}>
                  <SelectTrigger id="filter-mentee-type" data-testid="select-mentee-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("analytics.allTypes")}</SelectItem>
                    <SelectItem value="individual">{t("menteeRegistration.individual")}</SelectItem>
                    <SelectItem value="organization">{t("menteeRegistration.organization")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="filter-language" className="text-xs font-medium">{t("analytics.language")}</label>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger id="filter-language" data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("analytics.allLanguages")}</SelectItem>
                    {filterOptions.languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="filter-expertise" className="text-xs font-medium">{t("analytics.expertise")}</label>
                <Select value={selectedExpertise} onValueChange={setSelectedExpertise}>
                  <SelectTrigger id="filter-expertise" data-testid="select-expertise">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("analytics.allExpertise")}</SelectItem>
                    {filterOptions.expertises.map((exp) => (
                      <SelectItem key={exp} value={exp}>
                        {exp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="filter-country" className="text-xs font-medium">{t("analytics.country")}</label>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger id="filter-country" data-testid="select-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("analytics.allCountries")}</SelectItem>
                    {filterOptions.countries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {displayCountry(country)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Radix defaults the root to dir="ltr" unless told otherwise, which would flip the tab bodies back to LTR in Arabic. */}
          <Tabs value={activeTab} onValueChange={handleTabChange} dir={rtl ? "rtl" : "ltr"}>
            <TabsList className="grid h-auto w-full max-w-2xl grid-cols-2 gap-1 p-1 sm:grid-cols-4" data-testid="analytics-tabs">
              <TabsTrigger value="overview" className="min-w-0 gap-2 px-2 py-2 sm:px-3" data-testid="tab-overview">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {t("analytics.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger value="countries" className="min-w-0 gap-2 px-2 py-2 sm:px-3" data-testid="tab-countries">
                <Globe className="h-4 w-4" aria-hidden="true" />
                {t("analytics.tabs.countries")}
              </TabsTrigger>
              <TabsTrigger value="mentors" className="min-w-0 gap-2 px-2 py-2 sm:px-3" data-testid="tab-mentors">
                <Users className="h-4 w-4" aria-hidden="true" />
                {t("analytics.tabs.mentors")}
              </TabsTrigger>
              <TabsTrigger value="bookings" className="min-w-0 gap-2 px-2 py-2 sm:px-3" data-testid="tab-bookings">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {t("analytics.tabs.bookings")}
              </TabsTrigger>
            </TabsList>

            {/* ---------------- Overview ---------------- */}
            <TabsContent value="overview" className="mt-6 space-y-6">
              {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="p-4">
                      <Skeleton className="h-16 w-full" />
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile title={t("analytics.totalBookings")} value={totalBookings} icon={Calendar} testId="metric-total-bookings" />
                  <StatTile title={t("analytics.scheduled")} value={scheduledCount} icon={Clock} testId="metric-scheduled" />
                  <StatTile title={t("analytics.completed")} value={completedCount} icon={CheckCircle2} testId="metric-completed" />
                  <StatTile
                    title={t("analytics.volunteerHours")}
                    value={hoursSummary.hours.toFixed(1)}
                    unit={t("analytics.hoursUnit")}
                    icon={Timer}
                    secondary={t("analytics.sessionsWithoutDuration", { count: hoursSummary.withoutDuration })}
                    testId="metric-volunteer-hours"
                  />
                </div>
              )}

              <section className="space-y-3">
                {sectionTitle(Activity, t("analytics.bookingsOverTime"))}
                {isLoading ? (
                  chartSkeleton(300)
                ) : timeSeries.length > 0 ? (
                  <>
                    <Card className="p-4 md:p-6" data-testid="chart-bookings-over-time">
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={timeSeries} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} onClick={handleTimeSeriesClick} style={{ cursor: "pointer" }}>
                            <CartesianGrid {...GRID_PROPS} />
                            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} orientation={rtl ? "right" : "left"} />
                            <Tooltip content={<BrandTooltip />} cursor={{ stroke: BRAND.border }} />
                            <Legend iconType="circle" wrapperStyle={LEGEND_STYLE} formatter={legendText} />
                            <Line type="linear" dataKey="bookings" stroke={BRAND.navy} strokeWidth={2} dot={false} activeDot={{ r: 6 }} animationDuration={ANIMATION_MS} name={t("analytics.chartLabels.totalBookings")} />
                            <Line type="linear" dataKey="scheduled" stroke={BRAND.teal} strokeWidth={2} dot={false} activeDot={{ r: 5 }} animationDuration={ANIMATION_MS} name={t("analytics.chartLabels.scheduled")} />
                            <Line type="linear" dataKey="completed" stroke={BRAND.orange} strokeWidth={2} dot={false} activeDot={{ r: 5 }} animationDuration={ANIMATION_MS} name={t("analytics.chartLabels.completed")} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3">
                        <SegmentLegend
                          items={timeSeriesLegend}
                          activeKey={activeDrillKey("date")}
                          onSelect={selectDrill("date", timeSeriesLegend)}
                          label={t("analytics.selectPeriod")}
                          testId="legend-time-series"
                        />
                      </div>
                    </Card>
                    {renderDrill("date", "drilldown-date")}
                  </>
                ) : (
                  emptyCard(t("analytics.noBookingData"))
                )}
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  {sectionTitle(TrendingUp, t("analytics.statusBreakdown"))}
                  {isLoading ? (
                    chartSkeleton(260)
                  ) : statusBreakdown.length > 0 ? (
                    <>
                      {donutChart(
                        statusBreakdown,
                        activeDrillKey("status"),
                        handleStatusClick,
                        "chart-status-breakdown",
                        totalBookings,
                        <SegmentLegend
                          items={statusLegend}
                          activeKey={activeDrillKey("status")}
                          onSelect={selectDrill("status", statusLegend)}
                          label={t("analytics.statusBreakdown")}
                          testId="legend-status"
                        />,
                      )}
                      {renderDrill("status", "drilldown-status")}
                    </>
                  ) : (
                    emptyCard(t("analytics.noDataAvailable"))
                  )}
                </section>

                <section className="space-y-3">
                  {sectionTitle(UserRound, t("analytics.menteeTypeDistribution"))}
                  {isLoading ? (
                    chartSkeleton(260)
                  ) : menteeTypeBreakdown.length > 0 ? (
                    <>
                      {donutChart(
                        menteeTypeBreakdown,
                        activeDrillKey("menteeType"),
                        handleMenteeTypeClick,
                        "chart-mentee-type-distribution",
                        menteeTypeBreakdown.reduce((sum, item) => sum + item.value, 0),
                        <SegmentLegend
                          items={menteeTypeLegend}
                          activeKey={activeDrillKey("menteeType")}
                          onSelect={selectDrill("menteeType", menteeTypeLegend)}
                          label={t("analytics.menteeTypeDistribution")}
                          testId="legend-mentee-type"
                        />,
                      )}
                      {renderDrill("menteeType", "drilldown-mentee-type")}
                    </>
                  ) : (
                    emptyCard(t("analytics.noDataAvailable"))
                  )}
                </section>
              </div>
            </TabsContent>

            {/* ---------------- Countries ---------------- */}
            <TabsContent value="countries" className="mt-6 space-y-6">
              <section className="space-y-3">
                {sectionTitle(Globe, t("analytics.byCountry"))}
                <CountryBreakdown
                  rows={countryRows}
                  activeCountry={activeDrillKey("country")}
                  onSelect={handleCountrySelect}
                  isLoading={isLoading}
                />
                {renderDrill("country", "drilldown-country")}
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  {sectionTitle(Users, t("analytics.mentorsByCountry"))}
                  {isLoading ? (
                    chartSkeleton(240)
                  ) : geographicDistribution.mentorData.length > 0 ? (
                    <>
                      {horizontalCountryChart(geographicDistribution.mentorData, BRAND.navy, t("analytics.chartLabels.mentors"), activeDrillKey("mentorCountry"), handleMentorCountryClick, "chart-mentors-by-country")}
                      <SegmentLegend
                        items={mentorCountryLegend}
                        activeKey={activeDrillKey("mentorCountry")}
                        onSelect={selectDrill("mentorCountry", mentorCountryLegend)}
                        label={t("analytics.mentorsByCountry")}
                        testId="legend-mentor-country"
                      />
                      {renderDrill("mentorCountry", "drilldown-mentor-country")}
                    </>
                  ) : (
                    emptyCard(t("analytics.noMentorGeoData"))
                  )}
                </section>

                <section className="space-y-3">
                  {sectionTitle(UserRound, t("analytics.menteesByCountry"))}
                  {isLoading ? (
                    chartSkeleton(240)
                  ) : geographicDistribution.menteeData.length > 0 ? (
                    <>
                      {horizontalCountryChart(geographicDistribution.menteeData, BRAND.teal, t("analytics.chartLabels.mentees"), activeDrillKey("menteeCountry"), handleMenteeCountryClick, "chart-mentees-by-country")}
                      <SegmentLegend
                        items={menteeCountryLegend}
                        activeKey={activeDrillKey("menteeCountry")}
                        onSelect={selectDrill("menteeCountry", menteeCountryLegend)}
                        label={t("analytics.menteesByCountry")}
                        testId="legend-mentee-country"
                      />
                      {renderDrill("menteeCountry", "drilldown-mentee-country")}
                    </>
                  ) : (
                    emptyCard(t("analytics.noMenteeGeoData"))
                  )}
                </section>
              </div>
            </TabsContent>

            {/* ---------------- Mentors ---------------- */}
            <TabsContent value="mentors" className="mt-6 space-y-6">
              <section className="space-y-3">
                {sectionTitle(BarChart3, t("analytics.topMentorPerformance"))}
                {isLoading ? (
                  chartSkeleton(340)
                ) : topMentors.length > 0 ? (
                  <>
                    <Card className="p-4 md:p-6" data-testid="chart-mentor-performance">
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height={340}>
                          <BarChart data={topMentors} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
                            <CartesianGrid {...GRID_PROPS} />
                            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={80} />
                            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} orientation={rtl ? "right" : "left"} />
                            <Tooltip cursor={CURSOR_FILL} content={<BrandTooltip />} />
                            <Legend iconType="circle" wrapperStyle={LEGEND_STYLE} formatter={legendText} />
                            <Bar dataKey="bookings" name={t("analytics.chartLabels.totalBookings")} fill={BRAND.navy} radius={BAR_RADIUS} maxBarSize={28} cursor="pointer" animationDuration={ANIMATION_MS} onClick={handleMentorClick}>
                              {topMentors.map((entry) => (
                                <Cell key={entry.id} fill={segmentFill(BRAND.navy, entry.id, activeDrillKey("mentor"))} />
                              ))}
                            </Bar>
                            <Bar dataKey="completed" name={t("analytics.chartLabels.completed")} fill={BRAND.orange} radius={BAR_RADIUS} maxBarSize={28} cursor="pointer" animationDuration={ANIMATION_MS} onClick={handleMentorClick}>
                              {topMentors.map((entry) => (
                                <Cell key={entry.id} fill={segmentFill(BRAND.orange, entry.id, activeDrillKey("mentor"))} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3">
                        <SegmentLegend
                          items={mentorLegend}
                          activeKey={activeDrillKey("mentor")}
                          onSelect={selectDrill("mentor", mentorLegend)}
                          label={t("analytics.topMentorPerformance")}
                          testId="legend-mentor"
                        />
                      </div>
                    </Card>
                    {renderDrill("mentor", "drilldown-mentor")}
                  </>
                ) : (
                  emptyCard(t("analytics.noMentorData"))
                )}
              </section>

              {!isLoading && mentorPerformance.length > 0 && (
                <Card className="overflow-hidden" data-testid="table-mentor-performance">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("analytics.tableHeaders.mentor")}</TableHead>
                          <TableHead>{t("analytics.tableHeaders.country")}</TableHead>
                          <TableHead className="text-end">{t("analytics.tableHeaders.bookings")}</TableHead>
                          <TableHead className="text-end">{t("analytics.tableHeaders.completed")}</TableHead>
                          <TableHead className="text-end">{t("analytics.tableHeaders.volunteerHours")}</TableHead>
                          <TableHead className="text-end">{t("analytics.tableHeaders.avgRating")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mentorPerformance.map((mentor) => {
                          const active = activeDrillKey("mentor") === mentor.id;
                          return (
                            <TableRow
                              key={mentor.id}
                              className={active ? "bg-[#FFF5E6] hover:bg-[#FFF5E6]" : undefined}
                              data-state={active ? "selected" : undefined}
                              data-testid={`row-mentor-${mentor.id}`}
                            >
                              <TableCell className="whitespace-nowrap font-medium">
                                <button
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => toggleDrill({ kind: "mentor", value: mentor.id, label: mentor.name })}
                                  className="rounded-sm text-start text-[#0F1111] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {mentor.name}
                                </button>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{displayCountry(mentor.country)}</TableCell>
                              <TableCell className="text-end tabular-nums">{mentor.bookings}</TableCell>
                              <TableCell className="text-end tabular-nums">{mentor.completed}</TableCell>
                              <TableCell className="text-end tabular-nums">{minutesToHours(mentor.volunteerMinutes).toFixed(1)}</TableCell>
                              <TableCell className="text-end tabular-nums">
                                {mentor.ratingCount > 0 ? (mentor.ratingSum / mentor.ratingCount).toFixed(1) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* ---------------- Bookings ---------------- */}
            <TabsContent value="bookings" className="mt-6 space-y-3">
              {isLoading ? (
                chartSkeleton(360)
              ) : (
                <Card className="overflow-hidden" data-testid="table-bookings">
                  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground tabular-nums">
                    {rows.length > BOOKINGS_TAB_LIMIT
                      ? t("analytics.showingRows", { shown: BOOKINGS_TAB_LIMIT, total: rows.length })
                      : t("analytics.rowCount", { count: rows.length })}
                  </div>
                  <BookingsTable rows={rows} limit={BOOKINGS_TAB_LIMIT} emptyText={t("analytics.noBookingsYet")} testId="bookings-table" />
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
