import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Mentor } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Briefcase, Globe, Calendar, MapPin, Languages, Award } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function MentorProfileView() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [, params] = useRoute("/profile/mentor/:id");
  const mentorId = params?.id;

  const { data: mentor, isLoading } = useQuery<Mentor>({
    queryKey: ["/api/mentors", mentorId],
    enabled: !!mentorId,
  });

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

  if (!mentor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t('errors.notFound')}</CardTitle>
            <CardDescription>{isArabic ? 'الملف الشخصي للمرشد غير موجود.' : "The mentor profile you're looking for doesn't exist."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="w-full">
                <ArrowLeft className={`w-4 h-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                {t('mentors.title')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = isArabic && mentor.name_ar ? mentor.name_ar : mentor.name;
  const displayPosition = isArabic && mentor.position_ar ? mentor.position_ar : mentor.position;
  const displayCompany = isArabic && mentor.company_ar ? mentor.company_ar : mentor.company;
  const displayBio = isArabic && mentor.bio_ar ? mentor.bio_ar : mentor.bio;
  const displayExpertise = isArabic && mentor.expertise_ar ? mentor.expertise_ar : mentor.expertise;
  const displayIndustries = isArabic && mentor.industries_ar ? mentor.industries_ar : mentor.industries;

  const initials = mentor.name
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
              <ArrowLeft className={`w-4 h-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
              {isArabic ? 'العودة إلى المرشدين' : 'Back to Mentors'}
            </Button>
          </Link>
        </div>

        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="text-center pb-8">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
                <AvatarImage src={mentor.photo_url || undefined} alt={displayName} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-3xl font-bold" data-testid="text-mentor-name">{displayName}</CardTitle>
                <CardDescription className="text-lg mt-2" data-testid="text-mentor-position">
                  {displayPosition} @ {displayCompany}
                </CardDescription>
              </div>
              <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-profile-status">
                {isArabic ? 'الملف نشط' : 'Profile Active'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                {t('profile.expertise')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {displayExpertise.map((skill, index) => (
                  <Badge key={index} variant="secondary" data-testid={`badge-expertise-${index}`}>
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                {t('profile.industries')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {displayIndustries.map((industry, index) => (
                  <Badge key={index} variant="outline" data-testid={`badge-industry-${index}`}>
                    {industry}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isArabic ? 'نبذة مهنية' : 'Professional Bio'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed" data-testid="text-mentor-bio">
              {displayBio}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isArabic ? 'التواصل والتوفر' : 'Contact & Availability'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <span data-testid="text-mentor-email">{mentor.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <span data-testid="text-mentor-timezone">{mentor.timezone}</span>
            </div>
            <div className="flex items-center gap-3">
              <Languages className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-wrap gap-2">
                {mentor.languages_spoken.map((lang, index) => (
                  <Badge key={index} variant="outline" data-testid={`badge-language-${index}`}>
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
            {mentor.calendly_link && (
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <a 
                  href={mentor.calendly_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  data-testid="link-calendly"
                >
                  View Calendly Schedule
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Link href={`/mentor/${mentor.id}`} className="flex-1">
            <Button className="w-full" variant="default" data-testid="button-view-public-profile">
              View Public Profile
            </Button>
          </Link>
          <Link href="/mentor-onboarding" className="flex-1">
            <Button className="w-full" variant="outline" data-testid="button-edit-profile">
              Edit Profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
