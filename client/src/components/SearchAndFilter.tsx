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

interface SearchAndFilterProps {
  mentors: Mentor[];
  onFilterChange: (filters: { search: string; expertise: string }) => void;
}

export function SearchAndFilter({ mentors, onFilterChange }: SearchAndFilterProps) {
  const [search, setSearch] = useState("");
  const [expertise, setExpertise] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const uniqueExpertise = useMemo(() => {
    const expertiseSet = new Set<string>();
    mentors.forEach((mentor) => {
      mentor.expertise.forEach((exp) => expertiseSet.add(exp));
    });
    return Array.from(expertiseSet).sort();
  }, [mentors]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    onFilterChange({ search: debouncedSearch, expertise });
  }, [debouncedSearch, expertise, onFilterChange]);

  const hasActiveFilters = search || expertise;

  const handleClearFilters = () => {
    setSearch("");
    setExpertise("");
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-mentors"
          type="text"
          placeholder="Search mentors by name, title, or bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={expertise} onValueChange={setExpertise}>
        <SelectTrigger data-testid="select-expertise-filter" className="w-full md:w-64">
          <SelectValue placeholder="Filter by expertise" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Expertise</SelectItem>
          {uniqueExpertise.map((exp) => (
            <SelectItem key={exp} value={exp}>
              {exp}
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
          <X className="w-4 h-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
