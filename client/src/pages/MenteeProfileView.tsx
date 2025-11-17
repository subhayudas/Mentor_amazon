import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Mentee, Booking, Mentor } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Globe, Languages, Target, Calendar, Users } from "lucide-react";
import { format } from "date-fns";

export default function MenteeProfileView() {
  const [, params] = useRoute("/profile/mentee/:id");
  const menteeId = params?.id;

  const { data: mentee, isLoading: menteeLoading } = useQuery<Mentee>({
    queryKey: ["/api/mentees", menteeId],
    enabled: !!menteeId,
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    enabled: !!menteeId,
  });

  const { data: mentors } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
  });

  const isLoading = menteeLoading || bookingsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Card>
            <CardHeader>
              <Skeleton className="h-32 w-32 rounded-full mx-auto" />
              <Skeleton className="h-8 w-48 mx-auto mt-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!mentee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Mentee Not Found</CardTitle>
            <CardDescription>The mentee profile you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Browse Mentors
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const menteeBookings = bookings?.filter((b) => b.mentee_id === mentee.id) || [];
  const initials = mentee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Mentors
            </Button>
          </Link>
        </div>

        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="text-center pb-8">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
                <AvatarImage src={mentee.photo_url || undefined} alt={mentee.name} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-3xl font-bold" data-testid="text-mentee-name">{mentee.name}</CardTitle>
                <CardDescription className="text-lg mt-2 capitalize" data-testid="text-mentee-type">
                  {mentee.user_type === "individual" ? "Individual Member" : `${mentee.organization_name || "Organization"} Member`}
                </CardDescription>
              </div>
              <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-profile-status">
                ✓ Profile Active
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Areas of Interest
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {mentee.areas_exploring.map((area, index) => (
                  <Badge key={index} variant="secondary" data-testid={`badge-area-${index}`}>
                    {area}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Booking Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Bookings</span>
                  <span className="font-semibold" data-testid="text-total-bookings">{menteeBookings.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-semibold text-green-600" data-testid="text-completed-bookings">
                    {menteeBookings.filter((b) => b.status === "completed").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Upcoming</span>
                  <span className="font-semibold text-blue-600" data-testid="text-upcoming-bookings">
                    {menteeBookings.filter((b) => b.status === "scheduled").length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contact & Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <span data-testid="text-mentee-email">{mentee.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <span data-testid="text-mentee-timezone">{mentee.timezone}</span>
            </div>
            <div className="flex items-center gap-3">
              <Languages className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-wrap gap-2">
                {mentee.languages_spoken.map((lang, index) => (
                  <Badge key={index} variant="outline" data-testid={`badge-language-${index}`}>
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
            {mentee.user_type === "organization" && mentee.organization_name && (
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <span data-testid="text-organization-name">{mentee.organization_name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {menteeBookings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Your latest mentorship sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {menteeBookings.slice(0, 5).map((booking) => {
                  const mentor = mentors?.find((m) => m.id === booking.mentor_id);
                  return (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`booking-${booking.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {mentor && (
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={mentor.photo_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {mentor.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div>
                          <p className="font-medium">{mentor?.name || "Unknown Mentor"}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(booking.clicked_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          booking.status === "completed"
                            ? "secondary"
                            : booking.status === "scheduled"
                            ? "default"
                            : "outline"
                        }
                      >
                        {booking.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4">
          <Link href="/" className="flex-1">
            <Button className="w-full" variant="default" data-testid="button-browse-mentors">
              Browse Mentors
            </Button>
          </Link>
          <Link href="/mentee-registration" className="flex-1">
            <Button className="w-full" variant="outline" data-testid="button-edit-profile">
              Edit Profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
