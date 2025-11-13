import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Session, Mentor } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Clock, User } from "lucide-react";
import { format, parseISO, isFuture } from "date-fns";

export default function MyBookings() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || localStorage.getItem("menteeEmail") || "";
  });
  const [inputEmail, setInputEmail] = useState(email);

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/mentees", email, "sessions"],
    enabled: !!email,
  });

  const mentorIds = sessions?.map(s => s.mentorId) || [];
  const uniqueMentorIds = Array.from(new Set(mentorIds));

  const mentorQueries = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
    enabled: uniqueMentorIds.length > 0,
  });

  const mentors = mentorQueries.data || [];
  const mentorMap = new Map(mentors.map(m => [m.id, m]));

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail(inputEmail);
    localStorage.setItem("menteeEmail", inputEmail);
    setLocation(`/my-bookings?email=${inputEmail}`);
  };

  if (!email) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-md mx-auto px-4">
          <Card className="p-8">
            <CardHeader>
              <CardTitle>View Your Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Enter your email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    data-testid="input-mentee-email"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-view-bookings">
                  View My Bookings
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (sessionsLoading || mentorQueries.isLoading) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-8">
            <div>
              <Skeleton className="h-8 w-32 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const upcomingSessions = sessions?.filter(s => isFuture(parseISO(s.bookedAt))) || [];
  const pastSessions = sessions?.filter(s => !isFuture(parseISO(s.bookedAt))) || [];

  const SessionCard = ({ session }: { session: Session }) => {
    const mentor = mentorMap.get(session.mentorId);
    if (!mentor) return null;

    const initials = mentor.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

    return (
      <Card className="p-8 hover-elevate transition-transform duration-200" data-testid={`card-session-${session.id}`}>
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={mentor.avatarUrl || undefined} alt={mentor.name} />
            <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <h3 className="text-lg font-semibold">{mentor.name}</h3>
            <p className="text-sm text-muted-foreground">{mentor.title}</p>
            
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{format(parseISO(session.bookedAt), "MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{format(parseISO(session.bookedAt), "h:mm a")}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Bookings</h1>
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem("menteeEmail");
              setEmail("");
              setInputEmail("");
              setLocation("/my-bookings");
            }}
            data-testid="button-change-email"
          >
            <User className="w-4 h-4 mr-2" />
            Change Email
          </Button>
        </div>

        <div className="space-y-12">
          <div data-testid="section-upcoming">
            <h2 className="text-2xl font-bold mb-4">Upcoming Sessions</h2>
            {upcomingSessions.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No upcoming sessions scheduled</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>

          <div data-testid="section-past">
            <h2 className="text-2xl font-bold mb-4">Past Sessions</h2>
            {pastSessions.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No past sessions</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pastSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
