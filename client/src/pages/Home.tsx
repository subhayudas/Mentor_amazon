import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Mentor } from "@shared/schema";
import { MentorCard } from "@/components/MentorCard";
import { SearchAndFilter } from "@/components/SearchAndFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, Zap, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import amazonOfficeHero from "@assets/image_1764748916255.png";

export default function Home() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ search: "", expertise: "", industry: "", language: "" });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.expertise && filters.expertise !== "all") params.append("expertise", filters.expertise);
    if (filters.industry && filters.industry !== "all") params.append("industry", filters.industry);
    if (filters.language && filters.language !== "all") params.append("language", filters.language);
    return params.toString();
  };

  const queryParams = buildQueryParams();
  const apiUrl = queryParams ? `/api/mentors?${queryParams}` : "/api/mentors";

  const { data: mentors, isLoading } = useQuery<Mentor[]>({
    queryKey: [apiUrl],
  });

  const allMentors = mentors;

  const handleFilterChange = useCallback((newFilters: { search: string; expertise: string; industry: string; language: string }) => {
    setFilters(newFilters);
  }, []);

  const activeFilterCount = [
    filters.search,
    filters.expertise && filters.expertise !== "all",
    filters.industry && filters.industry !== "all",
    filters.language && filters.language !== "all"
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="max-w-5xl mx-auto relative">
            <div className="relative h-48 md:h-64 lg:h-72 overflow-hidden rounded-xl shadow-xl">
              <img 
                src={amazonOfficeHero} 
                alt="Amazon Office - Mentorship and Collaboration"
                className="w-full h-full object-cover object-center"
                data-testid="hero-illustration"
              />
            </div>
            
            <div className="absolute top-0 left-0 right-0 pt-3 md:pt-4 px-4 md:px-8 text-center">
              <Badge variant="outline" className="bg-orange-500 text-white border-orange-500/20 text-xs md:text-sm">
                {t('hero.badge')}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm text-muted-foreground pt-4 mt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              <span>{t('hero.trustedMentorship')}</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-orange-500" />
              <span>{t('hero.expertGuidance')}</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <span>{t('hero.flexibleScheduling')}</span>
            </div>
          </div>
        </div>
      </section>

      <section id="mentors" className="py-12 md:py-20 bg-gradient-to-b from-background via-muted/30 to-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-center md:text-left">
                <h2 className="text-3xl font-bold mb-2">
                  {t('mentors.featured')}
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-3 align-middle">
                      {activeFilterCount} {t('mentors.filtersActive', { count: activeFilterCount })}
                    </Badge>
                  )}
                </h2>
                <p className="text-muted-foreground">
                  {t('mentors.browseDescription')}
                </p>
              </div>
            </div>

            {allMentors && (
              <SearchAndFilter 
                mentors={allMentors} 
                onFilterChange={handleFilterChange}
              />
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="p-8">
                    <div className="flex flex-col items-center gap-4">
                      <Skeleton className="w-24 h-24 rounded-full" />
                      <div className="space-y-2 w-full">
                        <Skeleton className="h-6 w-3/4 mx-auto" />
                        <Skeleton className="h-4 w-1/2 mx-auto" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6 mx-auto" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : mentors && mentors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" data-testid="mentor-grid">
                {mentors.map((mentor) => (
                  <MentorCard key={mentor.id} mentor={mentor} />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground" data-testid="text-no-results">
                  {activeFilterCount > 0 
                    ? t('mentors.noResultsFilter')
                    : t('mentors.noResults')}
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
