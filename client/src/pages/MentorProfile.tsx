import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { InlineWidget } from "react-calendly";
import { Mentor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { RecordSessionDialog } from "@/components/RecordSessionDialog";
import { FavoriteButton } from "@/components/FavoriteButton";

export default function MentorProfile() {
  const [, params] = useRoute("/mentor/:id");
  const mentorId = params?.id;

  const { data: mentor, isLoading } = useQuery<Mentor>({
    queryKey: ["/api/mentors", mentorId],
    enabled: !!mentorId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2">
              <Card className="p-8">
                <div className="space-y-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <Skeleton className="w-32 h-32 rounded-full" />
                    <div className="space-y-2 w-full">
                      <Skeleton className="h-8 w-3/4 mx-auto" />
                      <Skeleton className="h-5 w-1/2 mx-auto" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            <div className="lg:col-span-3">
              <Skeleton className="h-[700px] w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Mentor not found</p>
          </Card>
        </div>
      </div>
    );
  }

  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Link href="/" data-testid="link-back">
          <Button variant="ghost" className="mb-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Mentors
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <Card className="p-8 sticky top-24">
              <div className="space-y-8">
                <div className="flex flex-col items-center text-center gap-4">
                  <Avatar className="w-32 h-32">
                    <AvatarImage src={mentor.avatarUrl || undefined} alt={mentor.name} />
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold" data-testid="text-mentor-name">
                      {mentor.name}
                    </h1>
                    <p className="text-lg text-muted-foreground font-medium" data-testid="text-mentor-title">
                      {mentor.title}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      About
                    </h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-mentor-bio">
                      {mentor.bio}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Expertise
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {mentor.expertise.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <FavoriteButton 
                    mentorId={mentor.id} 
                    mentorName={mentor.name}
                    variant="outline"
                    size="default"
                    showLabel
                  />
                  <p className="text-sm text-muted-foreground text-center">
                    After booking your session via Calendly, record it here for tracking
                  </p>
                  <RecordSessionDialog mentorId={mentor.id} mentorName={mentor.name} />
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card className="p-4">
              <h2 className="text-2xl font-bold mb-4 px-4">Book a Session</h2>
              <div className="rounded-lg overflow-hidden" data-testid="calendly-widget">
                <InlineWidget
                  url={mentor.calendlyUrl}
                  styles={{
                    height: "700px",
                    minWidth: "100%",
                  }}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
