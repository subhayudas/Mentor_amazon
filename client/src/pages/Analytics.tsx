import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Session, Mentor } from "@shared/schema";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "recharts";
import { Users, Calendar, TrendingUp, Award, BarChart3, Activity } from "lucide-react";
import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  isAfter,
  isBefore,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
} from "date-fns";

type DateRange = "7" | "30" | "90" | "all";

interface TimeSeriesData {
  date: string;
  sessions: number;
  cumulative?: number;
}

interface MentorPerformanceData {
  name: string;
  sessions: number;
}

function aggregateSessionsByDate(
  sessions: Session[],
  dateRange: DateRange
): { timeSeries: TimeSeriesData[]; cumulative: TimeSeriesData[] } {
  if (!sessions || sessions.length === 0) {
    return { timeSeries: [], cumulative: [] };
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
      const oldestSession = sessions.reduce((oldest, session) => {
        const sessionDate = new Date(session.bookedAt);
        return sessionDate < oldest ? sessionDate : oldest;
      }, new Date());
      startDate = startOfMonth(oldestSession);
      groupBy = "month";
      break;
    default:
      startDate = subDays(now, 30);
      groupBy = "day";
  }

  const filteredSessions = sessions.filter((session) => {
    const sessionDate = new Date(session.bookedAt);
    return isAfter(sessionDate, startDate) || sessionDate.getTime() === startDate.getTime();
  });

  const sessionCounts: Record<string, number> = {};

  filteredSessions.forEach((session) => {
    const sessionDate = new Date(session.bookedAt);
    let key: string;

    if (groupBy === "day") {
      key = format(startOfDay(sessionDate), "MMM d");
    } else if (groupBy === "week") {
      key = format(startOfWeek(sessionDate), "MMM d");
    } else {
      key = format(startOfMonth(sessionDate), "MMM yyyy");
    }

    sessionCounts[key] = (sessionCounts[key] || 0) + 1;
  });

  let intervals: Date[];
  if (groupBy === "day") {
    intervals = eachDayOfInterval({ start: startDate, end: now });
  } else if (groupBy === "week") {
    intervals = eachWeekOfInterval({ start: startDate, end: now });
  } else {
    intervals = eachMonthOfInterval({ start: startDate, end: now });
  }

  const timeSeriesData: TimeSeriesData[] = intervals.map((date) => {
    let key: string;
    if (groupBy === "day") {
      key = format(startOfDay(date), "MMM d");
    } else if (groupBy === "week") {
      key = format(startOfWeek(date), "MMM d");
    } else {
      key = format(startOfMonth(date), "MMM yyyy");
    }

    return {
      date: key,
      sessions: sessionCounts[key] || 0,
    };
  });

  let cumulativeTotal = 0;
  const cumulativeData: TimeSeriesData[] = timeSeriesData.map((item) => {
    cumulativeTotal += item.sessions;
    return {
      date: item.date,
      sessions: item.sessions,
      cumulative: cumulativeTotal,
    };
  });

  return { timeSeries: timeSeriesData, cumulative: cumulativeData };
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: mentors, isLoading: mentorsLoading } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
  });

  const isLoading = sessionsLoading || mentorsLoading;

  const { timeSeries, cumulative } = useMemo(() => {
    if (!sessions) return { timeSeries: [], cumulative: [] };
    return aggregateSessionsByDate(sessions, dateRange);
  }, [sessions, dateRange]);

  const mentorPerformanceData = useMemo(() => {
    if (!sessions || !mentors) return [];

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

    const filteredSessions = sessions.filter((session) => {
      const sessionDate = new Date(session.bookedAt);
      return isAfter(sessionDate, startDate) || sessionDate.getTime() === startDate.getTime();
    });

    const mentorCounts: Record<string, number> = {};
    filteredSessions.forEach((session) => {
      mentorCounts[session.mentorId] = (mentorCounts[session.mentorId] || 0) + 1;
    });

    return mentors
      .map((mentor) => ({
        name: mentor.name,
        sessions: mentorCounts[mentor.id] || 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions, mentors, dateRange]);

  const totalSessions = sessions?.length || 0;
  const activeMentors = mentors?.length || 0;

  const currentMonth = new Date().getMonth();
  const sessionsThisMonth =
    sessions?.filter((s) => new Date(s.bookedAt).getMonth() === currentMonth).length || 0;

  const mentorSessionCounts =
    sessions?.reduce(
      (acc, session) => {
        acc[session.mentorId] = (acc[session.mentorId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) || {};

  const topMentorId = Object.entries(mentorSessionCounts).sort(
    ([, a], [, b]) => b - a
  )[0]?.[0];

  const recentSessions = sessions
    ?.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime())
    .slice(0, 10) || [];

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Track your mentorship program's performance and engagement
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Date Range:</span>
            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
              <SelectTrigger className="w-[180px]" data-testid="select-date-range">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-8">
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Sessions"
              value={totalSessions}
              icon={Calendar}
              testId="metric-total-sessions"
            />
            <MetricCard
              title="Active Mentors"
              value={activeMentors}
              icon={Users}
              testId="metric-active-mentors"
            />
            <MetricCard
              title="Sessions This Month"
              value={sessionsThisMonth}
              icon={TrendingUp}
              testId="metric-sessions-month"
            />
            <MetricCard
              title="Top Mentor Sessions"
              value={topMentorId ? mentorSessionCounts[topMentorId] : 0}
              icon={Award}
              testId="metric-top-mentor"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Sessions Over Time</h2>
            </div>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-[350px] w-full" />
              </Card>
            ) : timeSeries.length > 0 ? (
              <Card className="p-8" data-testid="chart-sessions-over-time">
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
                      dataKey="sessions"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Sessions"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No session data available for this period</p>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Cumulative Sessions</h2>
            </div>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-[350px] w-full" />
              </Card>
            ) : cumulative.length > 0 ? (
              <Card className="p-8">
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={cumulative}>
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
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="hsl(var(--chart-1))"
                      fill="hsl(var(--chart-1))"
                      fillOpacity={0.6}
                      strokeWidth={2}
                      name="Total Sessions"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No session data available for this period</p>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold">Mentor Performance</h2>
          </div>
          {isLoading ? (
            <Card className="p-8">
              <Skeleton className="h-[400px] w-full" />
            </Card>
          ) : mentorPerformanceData.length > 0 ? (
            <Card className="p-8" data-testid="chart-mentor-performance">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={mentorPerformanceData}>
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
                    dataKey="sessions"
                    fill="hsl(var(--chart-2))"
                    radius={[8, 8, 0, 0]}
                    name="Sessions"
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

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold mb-4">Sessions by Mentor</h2>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-64 w-full" />
              </Card>
            ) : mentors && mentors.length > 0 ? (
              <Card className="p-8">
                <div className="space-y-4">
                  {mentors.map((mentor) => {
                    const sessionCount = mentorSessionCounts[mentor.id] || 0;
                    const maxSessions = Math.max(...Object.values(mentorSessionCounts), 1);
                    const percentage = (sessionCount / maxSessions) * 100;

                    return (
                      <div key={mentor.id} className="space-y-2" data-testid={`mentor-stats-${mentor.id}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{mentor.name}</span>
                          <span className="text-muted-foreground" data-testid={`text-sessions-${mentor.id}`}>
                            {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No mentor data available</p>
              </Card>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Recent Sessions</h2>
            {isLoading ? (
              <Card className="p-8">
                <Skeleton className="h-96 w-full" />
              </Card>
            ) : recentSessions.length > 0 ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mentor</TableHead>
                      <TableHead>Mentee</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Booked Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSessions.map((session) => {
                      const mentor = mentors?.find((m) => m.id === session.mentorId);
                      return (
                        <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                          <TableCell className="font-medium" data-testid={`text-mentor-${session.id}`}>
                            {mentor?.name || "Unknown"}
                          </TableCell>
                          <TableCell data-testid={`text-mentee-${session.id}`}>
                            {session.menteeName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {session.menteeEmail}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(session.bookedAt), "MMM d, yyyy 'at' h:mm a")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No sessions booked yet</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
