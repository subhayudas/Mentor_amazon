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
import { Users, Calendar, Globe, TrendingUp, HelpCircle, ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";
import heroImage from "@assets/image_1765099874695.png";

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
      <section 
        className="relative overflow-hidden min-h-[420px] md:min-h-[480px]"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundSize: '180% auto',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
        }}
        data-testid="hero-section"
      >
        {/* Cream overlay for text readability - matching Composio style */}
        <div 
          className="absolute inset-0 z-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(245, 243, 240, 0.95) 0%, rgba(245, 243, 240, 0.85) 40%, rgba(245, 243, 240, 0.4) 70%, transparent 100%)',
          }}
        />
        <div 
          className="absolute inset-0 z-0 dark:block hidden"
          style={{
            background: 'linear-gradient(to bottom, rgba(28, 25, 23, 0.95) 0%, rgba(28, 25, 23, 0.85) 40%, rgba(28, 25, 23, 0.4) 70%, transparent 100%)',
          }}
        />
        
        {/* Text Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 pt-12 md:pt-16 pb-48 md:pb-56 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-900 dark:text-stone-100 leading-tight mb-3" data-testid="hero-headline">
            {t('hero.headline')}
          </h1>
          <p className="text-lg md:text-xl font-medium text-[#FF9900] mb-3" data-testid="hero-tagline">
            <em>{t('hero.tagline')}</em>
          </p>
          <p className="text-stone-600 dark:text-stone-400 text-sm md:text-base leading-relaxed max-w-xl mx-auto mb-6" data-testid="hero-narrative">
            {t('hero.shortNarrative')}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="#mentors">
              <Button size="lg" className="bg-[#232F3E] text-white hover:bg-[#232F3E]/90" data-testid="button-browse-mentors">
                {t('nav.browseMentors')}
              </Button>
            </a>
            <Link href="/mentor-onboarding">
              <Button size="lg" variant="outline" className="border-stone-800 text-stone-800 dark:border-stone-200 dark:text-stone-200 hover:bg-stone-800/5" data-testid="button-become-mentor">
                <ArrowRight className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2 rtl:rotate-180" />
                {t('nav.becomeMentor')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="mentors" className="py-8 md:py-12 bg-gradient-to-b from-background via-muted/30 to-background">
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

      <section className="py-8 md:py-10 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card className="p-4 md:p-6 text-center bg-white/80 dark:bg-card/80 backdrop-blur-sm border-orange-200/50 dark:border-orange-800/30" data-testid="stat-mentors">
              <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-3">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-orange-600">{mentors?.length || "50"}+</div>
              <div className="text-xs md:text-sm text-muted-foreground">{t('stats.activeMentors')}</div>
            </Card>
            
            <Card className="p-4 md:p-6 text-center bg-white/80 dark:bg-card/80 backdrop-blur-sm border-orange-200/50 dark:border-orange-800/30" data-testid="stat-sessions">
              <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-3">
                <Calendar className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-orange-600">500+</div>
              <div className="text-xs md:text-sm text-muted-foreground">{t('stats.sessionsBooked')}</div>
            </Card>
            
            <Card className="p-4 md:p-6 text-center bg-white/80 dark:bg-card/80 backdrop-blur-sm border-orange-200/50 dark:border-orange-800/30" data-testid="stat-countries">
              <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-3">
                <Globe className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-orange-600">12+</div>
              <div className="text-xs md:text-sm text-muted-foreground">{t('stats.countries')}</div>
            </Card>
            
            <Card className="p-4 md:p-6 text-center bg-white/80 dark:bg-card/80 backdrop-blur-sm border-orange-200/50 dark:border-orange-800/30" data-testid="stat-satisfaction">
              <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-3">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-orange-600">98%</div>
              <div className="text-xs md:text-sm text-muted-foreground">{t('stats.satisfaction')}</div>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 md:px-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <HelpCircle className="w-6 h-6 text-orange-500" />
              <h2 className="text-2xl md:text-3xl font-bold">{t('faq.title')}</h2>
            </div>
            <p className="text-muted-foreground">{t('faq.subtitle')}</p>
          </div>
          
          <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
            <AccordionItem value="spam">
              <AccordionTrigger className="text-left" data-testid="faq-spam-trigger">
                {t('faq.spamQuestion')}
              </AccordionTrigger>
              <AccordionContent data-testid="faq-spam-answer">
                {t('faq.spamAnswer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="commitment">
              <AccordionTrigger className="text-left" data-testid="faq-commitment-trigger">
                {t('faq.commitmentQuestion')}
              </AccordionTrigger>
              <AccordionContent data-testid="faq-commitment-answer">
                {t('faq.commitmentAnswer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="matching">
              <AccordionTrigger className="text-left" data-testid="faq-matching-trigger">
                {t('faq.matchingQuestion')}
              </AccordionTrigger>
              <AccordionContent data-testid="faq-matching-answer">
                {t('faq.matchingAnswer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="cancel">
              <AccordionTrigger className="text-left" data-testid="faq-cancel-trigger">
                {t('faq.cancelQuestion')}
              </AccordionTrigger>
              <AccordionContent data-testid="faq-cancel-answer">
                {t('faq.cancelAnswer')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </div>
  );
}
