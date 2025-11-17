import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Booking, Mentor, Mentee } from "@shared/schema";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AreaChart,
  Area,
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
} from "recharts";
import { 
  Users, Calendar, TrendingUp, CheckCircle2, XCircle, 
  Clock, BarChart3, Activity, Filter, PieChart as PieChartIcon, Globe, User
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
} from "date-fns";
import { MOCK_ANALYTICS_DATA } from "@/data/mockAnalytics";

type DateRange = "7" | "30" | "90" | "all";
type BookingStatus = "clicked" | "scheduled" | "completed" | "canceled" | "all";

interface TimeSeriesData {
  date: string;
  bookings: number;
  scheduled?: number;
  completed?: number;
  canceled?: number;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

const STATUS_COLORS = {
  clicked: "hsl(var(--chart-1))",
  scheduled: "hsl(var(--chart-2))",
  completed: "hsl(var(--chart-3))",
  canceled: "hsl(var(--chart-4))",
};

function aggregateBookingsByDate(
  bookings: Booking[],
  dateRange: DateRange
): TimeSeriesData[] {
  if (!bookings || bookings.length === 0) {
    return [];
  }

  const now = new Date();
  let startDate: Date;
  let groupBy: "day" | "week" | "month";

  switch (dateRange) {
    case "7":
      startDate = subDays(now, 7);
      groupBy = "day";
      break;
    case "30":
      startDate = subDays(now, 30);
      groupBy = "day";
      break;
    case "90":
      startDate = subDays(now, 90);
      groupBy = "week";
      break;
    case "all":
      const oldestBooking = bookings.reduce((oldest, booking) => {
        const bookingDate = new Date(booking.clicked_at);
        return bookingDate < oldest ? bookingDate : oldest;
      }, new Date());
      startDate = startOfMonth(oldestBooking);
      groupBy = "month";
      break;
    default:
      startDate = subDays(now, 30);
      groupBy = "day";
  }

  const filteredBookings = bookings.filter((booking) => {
    const bookingDate = new Date(booking.clicked_at);
    return isAfter(bookingDate, startDate) || bookingDate.getTime() === startDate.getTime();
  });

  const bookingsByDate: Record<string, { total: number; scheduled: number; completed: number; canceled: number }> = {};

  filteredBookings.forEach((booking) => {
    const bookingDate = new Date(booking.clicked_at);
    let key: string;

    if (groupBy === "day") {
      key = format(startOfDay(bookingDate), "MMM d");
    } else if (groupBy === "week") {
      key = format(startOfWeek(bookingDate), "MMM d");
    } else {
      key = format(startOfMonth(bookingDate), "MMM yyyy");
    }

    if (!bookingsByDate[key]) {
      bookingsByDate[key] = { total: 0, scheduled: 0, completed: 0, canceled: 0 };
    }

    bookingsByDate[key].total += 1;
    if (booking.status === "scheduled") bookingsByDate[key].scheduled += 1;
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
    let key: string;
    if (groupBy === "day") {
      key = format(startOfDay(date), "MMM d");
    } else if (groupBy === "week") {
      key = format(startOfWeek(date), "MMM d");
    } else {
      key = format(startOfMonth(date), "MMM yyyy");
    }

    const data = bookingsByDate[key] || { total: 0, scheduled: 0, completed: 0, canceled: 0 };
    return {
      date: key,
      bookings: data.total,
      scheduled: data.scheduled,
      completed: data.completed,
      canceled: data.canceled,
    };
  });
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("30");
  const [selectedMentor, setSelectedMentor] = useState<string>("all");
  const [selectedMenteeType, setSelectedMenteeType] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedExpertise, setSelectedExpertise] = useState<string>("all");

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const { data: mentors, isLoading: mentorsLoading } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
  });

  const { data: mentees, isLoading: menteesLoading } = useQuery<Mentee[]>({
    queryKey: ["/api/mentees"],
  });

  const isLoading = bookingsLoading || mentorsLoading || menteesLoading;

  const useMockData = !bookings || bookings.length < 5;

  const filterOptions = useMemo(() => {
    if (!bookings || !mentors || !mentees) {
      return { languages: [], expertises: [] };
    }

    const languagesSet = new Set<string>();
    const expertisesSet = new Set<string>();

    mentors.forEach((mentor) => {
      mentor.languages_spoken?.forEach((lang) => languagesSet.add(lang));
      mentor.expertise?.forEach((exp) => expertisesSet.add(exp));
    });

    mentees.forEach((mentee) => {
      mentee.languages_spoken?.forEach((lang) => languagesSet.add(lang));
    });

    return {
      languages: Array.from(languagesSet).sort(),
      expertises: Array.from(expertisesSet).sort(),
    };
  }, [bookings, mentors, mentees]);

  const filteredBookings = useMemo(() => {
    if (!bookings || !mentors || !mentees) return [];

    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case "7":
        startDate = subDays(now, 7);
        break;
      case "30":
        startDate = subDays(now, 30);
        break;
      case "90":
        startDate = subDays(now, 90);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate = subDays(now, 30);
    }

    return bookings.filter((booking) => {
      const bookingDate = new Date(booking.clicked_at);
      if (!(isAfter(bookingDate, startDate) || bookingDate.getTime() === startDate.getTime())) {
        return false;
      }

      if (selectedMentor !== "all" && booking.mentor_id !== selectedMentor) return false;

      const mentee = mentees.find((m) => m.id === booking.mentee_id);
      if (selectedMenteeType !== "all" && mentee?.user_type !== selectedMenteeType) return false;

      const mentor = mentors.find((m) => m.id === booking.mentor_id);
      if (selectedLanguage !== "all") {
        const hasLanguage =
          mentor?.languages_spoken?.includes(selectedLanguage) ||
          mentee?.languages_spoken?.includes(selectedLanguage);
        if (!hasLanguage) return false;
      }

      if (selectedExpertise !== "all" && !mentor?.expertise?.includes(selectedExpertise)) {
        return false;
      }

      return true;
    });
  }, [bookings, mentors, mentees, selectedMentor, selectedMenteeType, selectedLanguage, selectedExpertise, dateRange]);

  const timeSeries = useMemo(() => {
    if (useMockData) {
      return MOCK_ANALYTICS_DATA.bookings_over_time.map(item => ({
        date: item.week,
        bookings: item.bookings,
        scheduled: item.bookings - item.completed - item.canceled,
        completed: item.completed,
        canceled: item.canceled,
      }));
    }
    return aggregateBookingsByDate(filteredBookings, dateRange);
  }, [useMockData, filteredBookings, dateRange]);

  const statusBreakdown = useMemo(() => {
    if (useMockData) {
      const scheduled = MOCK_ANALYTICS_DATA.kpis.upcoming_meetings;
      const completed = MOCK_ANALYTICS_DATA.kpis.completed_meetings;
      const canceled = MOCK_ANALYTICS_DATA.kpis.canceled_meetings;
      const clicked = MOCK_ANALYTICS_DATA.kpis.total_bookings - scheduled - completed - canceled;
      
      return [
        { name: "Clicked", value: clicked, color: STATUS_COLORS.clicked },
        { name: "Scheduled", value: scheduled, color: STATUS_COLORS.scheduled },
        { name: "Completed", value: completed, color: STATUS_COLORS.completed },
        { name: "Canceled", value: canceled, color: STATUS_COLORS.canceled },
      ].filter((item) => item.value > 0);
    }
    
    if (!filteredBookings) return [];
    
    const counts = {
      clicked: 0,
      scheduled: 0,
      completed: 0,
      canceled: 0,
    };

    filteredBookings.forEach((booking) => {
      counts[booking.status] = (counts[booking.status] || 0) + 1;
    });

    return [
      { name: "Clicked", value: counts.clicked, color: STATUS_COLORS.clicked },
      { name: "Scheduled", value: counts.scheduled, color: STATUS_COLORS.scheduled },
      { name: "Completed", value: counts.completed, color: STATUS_COLORS.completed },
      { name: "Canceled", value: counts.canceled, color: STATUS_COLORS.canceled },
    ].filter((item) => item.value > 0);
  }, [useMockData, filteredBookings]);

  const mentorPerformance = useMemo(() => {
    if (useMockData) {
      return MOCK_ANALYTICS_DATA.top_mentors.map(mentor => ({
        name: mentor.mentor_name,
        bookings: mentor.booking_count,
        completed: Math.floor(mentor.booking_count * 0.75),
      }));
    }

    if (!filteredBookings || !mentors) return [];

    const mentorCounts: Record<string, { bookings: number; completed: number }> = {};
    filteredBookings.forEach((booking) => {
      if (!mentorCounts[booking.mentor_id]) {
        mentorCounts[booking.mentor_id] = { bookings: 0, completed: 0 };
      }
      mentorCounts[booking.mentor_id].bookings += 1;
      if (booking.status === "completed") {
        mentorCounts[booking.mentor_id].completed += 1;
      }
    });

    return mentors
      .map((mentor) => ({
        name: mentor.name,
        bookings: mentorCounts[mentor.id]?.bookings || 0,
        completed: mentorCounts[mentor.id]?.completed || 0,
      }))
      .filter((m) => m.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 10);
  }, [useMockData, filteredBookings, mentors]);

  const totalBookings = useMockData ? MOCK_ANALYTICS_DATA.kpis.total_bookings : filteredBookings.length;
  const scheduledCount = useMockData ? MOCK_ANALYTICS_DATA.kpis.upcoming_meetings : filteredBookings.filter((b) => b.status === "scheduled").length;
  const completedCount = useMockData ? MOCK_ANALYTICS_DATA.kpis.completed_meetings : filteredBookings.filter((b) => b.status === "completed").length;
  const canceledCount = useMockData ? MOCK_ANALYTICS_DATA.kpis.canceled_meetings : filteredBookings.filter((b) => b.status === "canceled").length;
  const uniqueMentees = useMockData ? MOCK_ANALYTICS_DATA.kpis.unique_mentees : new Set(filteredBookings.map((b) => b.mentee_id)).size;

  const recentBookings = useMockData ? MOCK_ANALYTICS_DATA.recent_bookings : filteredBookings
    .sort((a, b) => new Date(b.clicked_at).getTime() - new Date(a.clicked_at).getTime())
    .slice(0, 10);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline", label: string }> = {
      clicked: { variant: "outline", label: "Clicked" },
      scheduled: { variant: "default", label: "Scheduled" },
      completed: { variant: "secondary", label: "Completed" },
      canceled: { variant: "outline", label: "Canceled" },
    };
    const config = variants[status] || variants.clicked;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold">Analytics Dashboard</h1>
            {useMockData && (
              <Badge variant="outline" className="text-sm" data-testid="badge-demo-data">
                Demo Data
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Comprehensive insights into your mentorship program's performance
          </p>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
                <SelectTrigger data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mentor</label>
              <Select value={selectedMentor} onValueChange={setSelectedMentor}>
                <SelectTrigger data-testid="select-mentor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Mentors</SelectItem>
                  {mentors?.map((mentor) => (
                    <SelectItem key={mentor.id} value={mentor.id}>
                      {mentor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mentee Type</label>
              <Select value={selectedMenteeType} onValueChange={setSelectedMenteeType}>
                <SelectTrigger data-testid="select-mentee-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {filterOptions.languages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Expertise</label>
              <Select value={selectedExpertise} onValueChange={setSelectedExpertise}>
                <SelectTrigger data-testid="select-expertise">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Expertise</SelectItem>
                  {filterOptions.expertises.map((exp) => (
                    <SelectItem key={exp} value={exp}>
                      {exp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="p-8">
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="Total Bookings"
              value={totalBookings}
              icon={Calendar}
              testId="metric-total-bookings"
            />
            <MetricCard
              title="Scheduled"
              value={scheduledCount}
              icon={Clock}
              testId="metric-scheduled"
            />
            <MetricCard
              title="Completed"
              value={completedCount}
              icon={CheckCircle2}
              testId="metric-completed"
            />
            <MetricCard
              title="Canceled"
              value={canceledCount}
              icon={XCircle}
              testId="metric-canceled"
            />
            <MetricCard
              title="Unique Mentees"
              value={uniqueMentees}
              icon={Users}
              testId="metric-unique-mentees"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Bookings Over Time</h2>
            </div>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-[350px] w-full" />
              </Card>
            ) : timeSeries.length > 0 ? (
              <Card className="p-8" data-testid="chart-bookings-over-time">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="bookings"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Total Bookings"
                    />
                    <Line
                      type="monotone"
                      dataKey="scheduled"
                      stroke={STATUS_COLORS.scheduled}
                      strokeWidth={2}
                      dot={{ fill: STATUS_COLORS.scheduled, r: 3 }}
                      name="Scheduled"
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke={STATUS_COLORS.completed}
                      strokeWidth={2}
                      dot={{ fill: STATUS_COLORS.completed, r: 3 }}
                      name="Completed"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No booking data available for this period</p>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Status Breakdown</h2>
            </div>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-[350px] w-full" />
              </Card>
            ) : statusBreakdown.length > 0 ? (
              <Card className="p-8" data-testid="chart-status-breakdown">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No booking data available</p>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold">Top Mentor Performance</h2>
          </div>
          {isLoading ? (
            <Card className="p-8">
              <Skeleton className="h-[400px] w-full" />
            </Card>
          ) : mentorPerformance.length > 0 ? (
            <Card className="p-8" data-testid="chart-mentor-performance">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={mentorPerformance}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="bookings"
                    fill="hsl(var(--chart-2))"
                    radius={[8, 8, 0, 0]}
                    name="Total Bookings"
                  />
                  <Bar
                    dataKey="completed"
                    fill={STATUS_COLORS.completed}
                    radius={[8, 8, 0, 0]}
                    name="Completed"
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No mentor performance data available</p>
            </Card>
          )}
        </div>

        {useMockData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-bold">Specialization Distribution</h2>
              </div>
              <Card className="p-8" data-testid="chart-specialization-distribution">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={MOCK_ANALYTICS_DATA.specialization_distribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {MOCK_ANALYTICS_DATA.specialization_distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-bold">Language Distribution</h2>
              </div>
              <Card className="p-8" data-testid="chart-language-distribution">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={MOCK_ANALYTICS_DATA.language_distribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {MOCK_ANALYTICS_DATA.language_distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-bold">Mentee Type Distribution</h2>
              </div>
              <Card className="p-8" data-testid="chart-mentee-type-distribution">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={MOCK_ANALYTICS_DATA.mentee_type_distribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {MOCK_ANALYTICS_DATA.mentee_type_distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold mb-4">Recent Bookings</h2>
          {isLoading ? (
            <Card className="p-8">
              <Skeleton className="h-96 w-full" />
            </Card>
          ) : recentBookings.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mentor</TableHead>
                    <TableHead>Mentee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Clicked At</TableHead>
                    <TableHead>Scheduled At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBookings.map((booking: any) => {
                    if (useMockData) {
                      return (
                        <TableRow key={booking.id} data-testid={`row-booking-${booking.id}`}>
                          <TableCell className="font-medium" data-testid={`text-mentor-${booking.id}`}>
                            {booking.mentor_name}
                          </TableCell>
                          <TableCell data-testid={`text-mentee-${booking.id}`}>
                            <div>
                              <div>{booking.mentee_name}</div>
                              <div className="text-xs text-muted-foreground">{booking.expertise}</div>
                            </div>
                          </TableCell>
                          <TableCell data-testid={`status-${booking.id}`}>
                            {getStatusBadge(booking.status)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(booking.booked_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {booking.status === "scheduled" 
                              ? format(new Date(booking.booked_at), "MMM d, h:mm a")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    const mentor = mentors?.find((m) => m.id === booking.mentor_id);
                    const mentee = mentees?.find((m) => m.id === booking.mentee_id);
                    return (
                      <TableRow key={booking.id} data-testid={`row-booking-${booking.id}`}>
                        <TableCell className="font-medium" data-testid={`text-mentor-${booking.id}`}>
                          {mentor?.name || "Unknown"}
                        </TableCell>
                        <TableCell data-testid={`text-mentee-${booking.id}`}>
                          <div>
                            <div>{mentee?.name || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">{mentee?.email}</div>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`status-${booking.id}`}>
                          {getStatusBadge(booking.status)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(booking.clicked_at), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {booking.scheduled_at 
                            ? format(new Date(booking.scheduled_at), "MMM d, h:mm a")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No bookings yet</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
