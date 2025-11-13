import { Link } from "wouter";
import { Mentor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "lucide-react";

interface MentorCardProps {
  mentor: Mentor;
}

export function MentorCard({ mentor }: MentorCardProps) {
  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="p-8 hover-elevate transition-transform duration-200 hover:-translate-y-1" data-testid={`card-mentor-${mentor.id}`}>
      <div className="flex flex-col items-center text-center gap-4">
        <Avatar className="w-24 h-24">
          <AvatarImage src={mentor.avatarUrl || undefined} alt={mentor.name} />
          <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-2 w-full">
          <h3 className="text-xl font-semibold" data-testid={`text-mentor-name-${mentor.id}`}>
            {mentor.name}
          </h3>
          <p className="text-sm text-muted-foreground font-medium">
            {mentor.title}
          </p>
          <p className="text-sm text-muted-foreground/80 line-clamp-2 min-h-[2.5rem]">
            {mentor.bio}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center w-full">
          {mentor.expertise.slice(0, 3).map((skill) => (
            <Badge
              key={skill}
              variant="secondary"
              className="text-xs"
              data-testid={`badge-expertise-${skill}`}
            >
              {skill}
            </Badge>
          ))}
        </div>

        <Link href={`/mentor/${mentor.id}`} className="w-full" data-testid={`link-mentor-${mentor.id}`}>
          <Button className="w-full" data-testid={`button-book-${mentor.id}`}>
            <Calendar className="w-4 h-4 mr-2" />
            Book Session
          </Button>
        </Link>
      </div>
    </Card>
  );
}
