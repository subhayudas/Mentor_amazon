import { Link } from "wouter";
import { Mentor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Clock, Star, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MentorCardProps {
  mentor: Mentor;
}

const timezoneToUTC = (ianaTimeZone: string): string => {
  try {
    const date = new Date();
    const toTimeZone = (z: string) => new Date(
      date.toLocaleString('sv', { timeZone: z }).replace(' ', 'T')
    );
    
    const offsetMinutes = (toTimeZone(ianaTimeZone).getTime() - toTimeZone('UTC').getTime()) / 60000;
    
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    
    return minutes === 0 
      ? `UTC${sign}${hours}`
      : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
  } catch {
    return ianaTimeZone.split('/').pop() || ianaTimeZone;
  }
};

export function MentorCard({ mentor }: MentorCardProps) {
  const { i18n, t } = useTranslation();
  const isArabic = i18n.language === 'ar';
  
  const displayName = isArabic && mentor.name_ar ? mentor.name_ar : mentor.name;
  const displayPosition = isArabic && mentor.position_ar ? mentor.position_ar : mentor.position;
  const displayCompany = isArabic && mentor.company_ar ? mentor.company_ar : mentor.company;
  const displayExpertise = isArabic && mentor.expertise_ar ? mentor.expertise_ar : mentor.expertise;
  const displayIndustries = isArabic && mentor.industries_ar ? mentor.industries_ar : mentor.industries;
  
  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const averageRating = mentor.average_rating ? parseFloat(mentor.average_rating.toString()) : 0;
  const totalRatings = mentor.total_ratings || 0;

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`w-3 h-3 ${
          index < Math.round(rating)
            ? "fill-primary text-primary"
            : "fill-muted text-muted"
        }`}
      />
    ));
  };

  return (
    <Card className="p-6 hover:shadow-md transition-shadow" data-testid={`card-mentor-${mentor.id}`}>
      <div className="flex flex-col items-center text-center gap-4">
        <Avatar className="w-24 h-24">
          <AvatarImage src={mentor.photo_url || undefined} alt={mentor.name} />
          <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-2 w-full">
          <h3 className="text-xl font-bold text-secondary" data-testid={`text-mentor-name-${mentor.id}`}>
            {displayName}
          </h3>
          <p className="text-sm text-muted-foreground font-medium">
            {displayPosition}{displayCompany && ` @ ${displayCompany}`}
          </p>
          
          {mentor.timezone && (
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{timezoneToUTC(mentor.timezone)}</span>
            </div>
          )}
        </div>

        {displayIndustries && displayIndustries.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center w-full">
            {displayIndustries.slice(0, 2).map((industry, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs bg-muted"
                data-testid={`badge-industry-${index}`}
              >
                {industry}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-center w-full">
          {displayExpertise.slice(0, 4).map((skill, index) => (
            <Badge
              key={index}
              className="text-xs bg-primary/10 text-primary border-primary/20"
              data-testid={`badge-expertise-${index}`}
            >
              {skill}
            </Badge>
          ))}
        </div>

        {totalRatings > 0 && (
          <div className="flex items-center gap-2" data-testid={`rating-${mentor.id}`}>
            <div className="flex gap-0.5">{renderStars(averageRating)}</div>
            <span className="text-sm font-medium">
              ({averageRating.toFixed(1)}/5 - {totalRatings} {totalRatings === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}

        {mentor.languages_spoken && mentor.languages_spoken.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-3 h-3" />
            <span>{mentor.languages_spoken.join(", ")}</span>
          </div>
        )}

        <Link href={`/mentor/${mentor.id}`} className="w-full" data-testid={`link-mentor-${mentor.id}`}>
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" 
            data-testid={`button-book-${mentor.id}`}
          >
            <Calendar className={`w-4 h-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
            {t('mentors.bookSession')}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
