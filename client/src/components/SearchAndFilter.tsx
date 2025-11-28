import { useState, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mentor } from "@shared/schema";
import { useTranslation } from "react-i18next";

interface SearchAndFilterProps {
  mentors: Mentor[];
  onFilterChange: (filters: { search: string; expertise: string; industry: string; language: string }) => void;
}

export function SearchAndFilter({ mentors, onFilterChange }: SearchAndFilterProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [search, setSearch] = useState("");
  const [expertise, setExpertise] = useState("");
  const [industry, setIndustry] = useState("");
  const [language, setLanguage] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const uniqueExpertise = useMemo(() => {
    const expertiseSet = new Set<string>();
    mentors.forEach((mentor) => {
      const expertise = isArabic && mentor.expertise_ar ? mentor.expertise_ar : mentor.expertise;
      expertise.forEach((exp) => expertiseSet.add(exp));
    });
    return Array.from(expertiseSet).sort();
  }, [mentors, isArabic]);

  const uniqueIndustries = useMemo(() => {
    const industriesSet = new Set<string>();
    mentors.forEach((mentor) => {
      const industries = isArabic && mentor.industries_ar ? mentor.industries_ar : mentor.industries;
      industries?.forEach((ind) => industriesSet.add(ind));
    });
    return Array.from(industriesSet).sort();
  }, [mentors, isArabic]);

  const uniqueLanguages = useMemo(() => {
    const languagesSet = new Set<string>();
    mentors.forEach((mentor) => {
      mentor.languages_spoken?.forEach((lang) => languagesSet.add(lang));
    });
    return Array.from(languagesSet).sort();
  }, [mentors]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    onFilterChange({ search: debouncedSearch, expertise, industry, language });
  }, [debouncedSearch, expertise, industry, language, onFilterChange]);

  const hasActiveFilters = search || expertise || industry || language;

  const handleClearFilters = () => {
    setSearch("");
    setExpertise("");
    setIndustry("");
    setLanguage("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className={`absolute ${isArabic ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            data-testid="input-search-mentors"
            type="text"
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={isArabic ? 'pr-9' : 'pl-9'}
          />
        </div>

        <Select value={expertise} onValueChange={setExpertise}>
          <SelectTrigger data-testid="select-expertise-filter" className="w-full md:w-48">
            <SelectValue placeholder={t('filters.expertise')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allExpertise')}</SelectItem>
            {uniqueExpertise.map((exp) => (
              <SelectItem key={exp} value={exp}>
                {exp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger data-testid="select-industry-filter" className="w-full md:w-48">
            <SelectValue placeholder={t('filters.industry')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allIndustries')}</SelectItem>
            {uniqueIndustries.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger data-testid="select-language-filter" className="w-full md:w-48">
            <SelectValue placeholder={t('filters.language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allLanguages')}</SelectItem>
            {uniqueLanguages.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            data-testid="button-clear-filters"
            variant="outline"
            onClick={handleClearFilters}
            className="w-full md:w-auto"
          >
            <X className={`w-4 h-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
            {t('common.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
