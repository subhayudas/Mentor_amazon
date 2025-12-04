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
import { Sparkles, Target, Zap, ArrowRight, HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="max-w-5xl mx-auto relative">
            <img 
              src={amazonOfficeHero} 
              alt="Amazon Office - Mentorship and Collaboration"
              className="w-full h-auto rounded-xl shadow-xl"
              data-testid="hero-illustration"
            />
            
            <div className="absolute top-0 left-0 right-0 pt-4 md:pt-6 lg:pt-8 px-4 md:px-8 text-center">
              <div className="space-y-1 md:space-y-2">
                <Badge variant="outline" className="bg-orange-500 text-white border-orange-500/20 text-xs md:text-sm">
                  {t('hero.badge')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto text-center pt-8 space-y-4">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight" data-testid="hero-headline">
              {t('hero.headline')}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed" data-testid="hero-narrative">
              {t('hero.narrative')}
            </p>
            <blockquote className="border-l-4 border-orange-500 pl-4 py-2 my-6 text-left italic text-muted-foreground" data-testid="hero-quote">
              <p className="text-base md:text-lg">"{t('hero.impactQuote')}"</p>
              <footer className="text-sm mt-2 font-medium text-foreground">{t('hero.quoteAuthor')}</footer>
            </blockquote>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm text-muted-foreground pt-4 mt-4">
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
