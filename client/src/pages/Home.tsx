import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mentor } from "@shared/schema";
import { MentorCard } from "@/components/MentorCard";
import { SearchAndFilter } from "@/components/SearchAndFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Target, Zap } from "lucide-react";

export default function Home() {
  const [filters, setFilters] = useState({ search: "", expertise: "" });

  const { data: allMentors } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.expertise && filters.expertise !== "all") params.append("expertise", filters.expertise);
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };

  const { data: mentors, isLoading } = useQuery<Mentor[]>({
    queryKey: ["/api/mentors", filters.search, filters.expertise],
    queryFn: async () => {
      const queryString = buildQueryString();
      const response = await fetch(`/api/mentors${queryString}`);
      if (!response.ok) throw new Error("Failed to fetch mentors");
      return response.json();
    },
  });

  const handleFilterChange = useCallback((newFilters: { search: string; expertise: string }) => {
    setFilters(newFilters);
  }, []);

  const activeFilterCount = [
    filters.search,
    filters.expertise && filters.expertise !== "all"
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen">
      <section className="relative py-16 md:py-24 bg-gradient-to-br from-muted via-background to-muted/50">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-secondary">
              Connect with{" "}
              <span className="text-primary">
                Expert Mentors
              </span>
              {" "}at Amazon Egypt
            </h1>
            <p className="text-lg md:text-xl text-foreground max-w-2xl mx-auto">
              Access personalized guidance from Amazon's experienced professionals. Book one-on-one mentorship sessions and accelerate your career growth.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Trusted mentorship</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span>Expert guidance</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span>Flexible scheduling</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-center md:text-left">
                <h2 className="text-3xl font-bold mb-2">
                  Featured Mentors
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-3 align-middle">
                      {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"} active
                    </Badge>
                  )}
                </h2>
                <p className="text-muted-foreground">
                  Browse our curated list of experienced professionals
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
                    ? "No mentors found matching your filters. Try adjusting your search criteria."
                    : "No mentors available at the moment."}
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
