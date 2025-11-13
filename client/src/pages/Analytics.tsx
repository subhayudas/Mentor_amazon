import { useQuery } from "@tanstack/react-query";
import { Session, Mentor } from "@shared/schema";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Calendar, TrendingUp, Award } from "lucide-react";
import { format } from "date-fns";

export default function Analytics() {
  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: mentors, isLoading: mentorsLoading } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
  });

  const isLoading = sessionsLoading || mentorsLoading;

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
        <div>
          <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track your mentorship program's performance and engagement
          </p>
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
