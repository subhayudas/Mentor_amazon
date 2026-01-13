import { Link } from "wouter";
import { Mentor } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight, Clock, Star, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MentorCardProps {
  mentor: Mentor;
  accentColor?: 'pink' | 'mint' | 'purple' | 'coral' | 'blue';
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

const accentStyles = {
  pink: { bg: 'linear-gradient(90deg, #FFB6C1, #FFC0CB)', text: '#E75480' },
  mint: { bg: 'linear-gradient(90deg, #98D8C8, #7FCDBB)', text: '#059669' },
  purple: { bg: 'linear-gradient(90deg, #C9B6E4, #D4BBFF)', text: '#7C3AED' },
  coral: { bg: 'linear-gradient(90deg, #FFB399, #FFA07A)', text: '#EA580C' },
  blue: { bg: 'linear-gradient(90deg, #87CEEB, #ADD8E6)', text: '#0284C7' },
};

export function MentorCard({ mentor, accentColor = 'coral' }: MentorCardProps) {
  const { i18n, t } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const displayName = isArabic && mentor.name_ar ? mentor.name_ar : mentor.name;
  const displayPosition = isArabic && mentor.position_ar ? mentor.position_ar : mentor.position;
  const displayCompany = isArabic && mentor.company_ar ? mentor.company_ar : mentor.company;
  const displayExpertise = isArabic && mentor.expertise_ar ? mentor.expertise_ar : mentor.expertise;

  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const averageRating = mentor.average_rating ? parseFloat(mentor.average_rating.toString()) : 0;
  const totalRatings = mentor.total_ratings || 0;
  const accent = accentStyles[accentColor];

  return (
    <div
      className="mentor-card group"
      data-testid={`card-mentor-${mentor.id}`}
    >
      {/* Pastel accent bar */}
      <div
        className="mentor-card-accent"
        style={{ background: accent.bg }}
      />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="w-16 h-16 rounded-2xl ring-2 ring-white shadow-sm">
            <AvatarImage
              src={mentor.photo_url || undefined}
              alt={mentor.name}
              className="object-cover"
            />
            <AvatarFallback
              className="rounded-2xl text-lg font-bold text-white"
              style={{ background: accent.bg }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-semibold truncate mb-1"
              style={{ color: 'var(--navy-deep)', fontFamily: 'var(--font-sans)' }}
              data-testid={`text-mentor-name-${mentor.id}`}
            >
              {displayName}
            </h3>
            <p className="text-sm truncate" style={{ color: 'var(--slate)' }}>
              {displayPosition}
            </p>
            {displayCompany && (
              <p className="text-sm font-medium truncate" style={{ color: accent.text }}>
                {displayCompany}
              </p>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm" style={{ color: 'var(--mist)' }}>
          {totalRatings > 0 && (
            <div className="flex items-center gap-1" data-testid={`rating-${mentor.id}`}>
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-medium" style={{ color: 'var(--charcoal)' }}>
                {averageRating.toFixed(1)}
              </span>
              <span>({totalRatings})</span>
            </div>
          )}
          {mentor.timezone && (
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{timezoneToUTC(mentor.timezone)}</span>
            </div>
          )}
          {mentor.country && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">{mentor.country}</span>
            </div>
          )}
        </div>

        {/* Expertise tags */}
        <div className="flex flex-wrap gap-2 mb-5">
          {displayExpertise.slice(0, 3).map((skill, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="text-xs font-medium px-2.5 py-1 rounded-full border-0"
              style={{
                background: `${accent.text}15`,
                color: accent.text,
              }}
              data-testid={`badge-expertise-${index}`}
            >
              {skill}
            </Badge>
          ))}
          {displayExpertise.length > 3 && (
            <Badge
              variant="outline"
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ color: 'var(--slate)' }}
            >
              +{displayExpertise.length - 3}
            </Badge>
          )}
        </div>

        {/* Languages */}
        {mentor.languages_spoken && mentor.languages_spoken.length > 0 && (
          <p className="text-xs mb-4" style={{ color: 'var(--mist)' }}>
            Speaks: {mentor.languages_spoken.slice(0, 3).join(", ")}
            {mentor.languages_spoken.length > 3 && ` +${mentor.languages_spoken.length - 3}`}
          </p>
        )}

        {/* CTA */}
        <Link href={`/mentor/${mentor.id}`} className="block" data-testid={`link-mentor-${mentor.id}`}>
          <button
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all duration-200 group-hover:shadow-sm"
            style={{
              background: 'var(--navy-deep)',
              color: 'white'
            }}
            data-testid={`button-book-${mentor.id}`}
          >
            <span>{t('mentors.bookSession')}</span>
            <ArrowRight className={`w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 ${isArabic ? 'rotate-180' : ''}`} />
          </button>
        </Link>
      </div>
    </div>
  );
}
